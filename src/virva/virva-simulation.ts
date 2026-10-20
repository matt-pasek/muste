import { GPGPU, Mesh, Program, Renderer, Triangle } from "ogl";
import type { VirvaFieldForcing, VirvaTopology } from "./virva-geometry.js";
import type { VirvaColors } from "./virva-optics.js";
import {
  virvaAbsorptionShader,
  virvaOpticsShader,
  virvaVertexShader,
  virvaWaveShader,
} from "./virva-shader.js";

export interface VirvaFieldFrame {
  time: number;
  delta: number;
  forcing: VirvaFieldForcing;
}

export interface VirvaField {
  resize(width: number, height: number, dpr: number): void;
  setColors(colors: VirvaColors): void;
  draw(frame: VirvaFieldFrame): void;
  dispose(): void;
}

export interface CreateVirvaFieldOptions {
  canvas: HTMLCanvasElement;
  colors: VirvaColors;
  onContextLost?: () => void;
}

const SIMULATION_SIZE = 256;

export type VirvaFieldPrecision = "float" | "half";

export function pickVirvaFieldPrecision(support: {
  colorBufferFloat: boolean;
  floatLinear: boolean;
}): VirvaFieldPrecision | null {
  if (!support.colorBufferFloat) return null;
  return support.floatLinear ? "float" : "half";
}

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * The seed is deliberately a 2D field, never a sampled curve. R is the initial
 * membrane height; G/B/A become three independently phased absorption strata.
 */
export function createVirvaInitialState(
  resolution: number,
  seed = 0x71_72_76_61,
): Float32Array {
  const size = Math.max(2, Math.floor(resolution));
  const random = seededRandom(seed);
  const phase = Array.from({ length: 8 }, () => random() * Math.PI * 2);
  const data = new Float32Array(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = (x / (size - 1)) * 2 - 1;
      const py = (y / (size - 1)) * 2 - 1;
      const radial = Math.max(0, 1 - (px * px * 0.88 + py * py));
      const index = (y * size + x) * 4;
      const height =
        (Math.sin(px * 3.1 + (phase[0] ?? 0)) *
          Math.cos(py * 2.4 + (phase[1] ?? 0)) *
          0.048 +
          Math.sin((px + py) * 4.2 + (phase[2] ?? 0)) * 0.027) *
        radial;
      const first =
        0.46 +
        Math.sin(px * 2.1 + py * 1.2 + (phase[3] ?? 0)) * 0.16 +
        Math.cos(py * 3.2 - px * 0.7 + (phase[4] ?? 0)) * 0.08;
      const second =
        0.44 +
        Math.cos(px * 1.4 - py * 2.8 + (phase[5] ?? 0)) * 0.17 +
        Math.sin((px - py) * 2.2 + (phase[1] ?? 0)) * 0.07;
      const third =
        0.42 +
        Math.sin(px * 2.7 + py * 2.0 + (phase[6] ?? 0)) * 0.15 +
        Math.cos((px + py) * 1.8 + (phase[7] ?? 0)) * 0.09;

      data[index] = height;
      data[index + 1] = Math.min(0.92, Math.max(0.06, first));
      data[index + 2] = Math.min(0.92, Math.max(0.06, second));
      data[index + 3] = Math.min(0.92, Math.max(0.06, third));
    }
  }

  return data;
}

export function virvaTopologyIndex(topology: VirvaTopology): number {
  return {
    settle: 0,
    gather: 1,
    fold: 2,
    release: 3,
  }[topology];
}

function heightStateFrom(seed: Float32Array): Float32Array {
  const data = new Float32Array(seed.length);
  for (let index = 0; index < seed.length; index += 4) {
    const height = seed[index] ?? 0;
    data[index] = height;
    data[index + 1] = height;
    data[index + 3] = 1;
  }
  return data;
}

function absorptionStateFrom(seed: Float32Array): Float32Array {
  const data = new Float32Array(seed.length);
  for (let index = 0; index < seed.length; index += 4) {
    data[index] = seed[index + 1] ?? 0.4;
    data[index + 1] = seed[index + 2] ?? 0.4;
    data[index + 2] = seed[index + 3] ?? 0.4;
    data[index + 3] = 1;
  }
  return data;
}

export function createVirvaField(
  options: CreateVirvaFieldOptions,
): VirvaField | null {
  const { canvas, colors, onContextLost } = options;
  let renderer: Renderer;
  try {
    renderer = new Renderer({
      canvas,
      webgl: 2,
      dpr: 1,
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
    });
  } catch {
    return null;
  }

  const gl = renderer.gl;
  const precision = pickVirvaFieldPrecision({
    colorBufferFloat: Boolean(gl.getExtension("EXT_color_buffer_float")),
    floatLinear: Boolean(gl.getExtension("OES_texture_float_linear")),
  });
  if (!("drawBuffers" in gl) || !precision) {
    return null;
  }
  const fieldType = precision === "float" ? gl.FLOAT : gl.HALF_FLOAT;
  gl.clearColor(0, 0, 0, 0);

  const geometry = new Triangle(gl);
  const seed = createVirvaInitialState(SIMULATION_SIZE);
  const heightField = new GPGPU(gl, {
    data: heightStateFrom(seed),
    geometry,
    type: fieldType,
  });
  const absorptionField = new GPGPU(gl, {
    data: absorptionStateFrom(seed),
    geometry,
    type: fieldType,
  });
  for (const texture of [
    heightField.fbo.read.texture,
    heightField.fbo.write.texture,
    absorptionField.fbo.read.texture,
    absorptionField.fbo.write.texture,
  ]) {
    texture.minFilter = gl.LINEAR;
    texture.magFilter = gl.LINEAR;
    // Applied now, while the target is still empty: a deferred needsUpdate makes ogl
    // reallocate the render target on first bind, wiping the field the first pass wrote.
    texture.update();
  }
  const initialHeightTexture = heightField.uniform.value;
  const initialAbsorptionTexture = absorptionField.uniform.value;
  const texel: [number, number] = [1 / heightField.size, 1 / heightField.size];

  const wave = heightField.addPass({
    vertex: virvaVertexShader,
    fragment: virvaWaveShader,
    uniforms: {
      uTexel: { value: texel },
      uTime: { value: 0 },
      uPhase: { value: 0 },
      uDelta: { value: 1 / 60 },
      uTopology: { value: 0 },
      uTopologyFrom: { value: 0 },
      uPhaseFrom: { value: 0 },
      uBlend: { value: 1 },
      uAmplitude: { value: 0.05 },
      uWavenumber: { value: 1 },
      uDamping: { value: 0.03 },
      uInlet: { value: 0 },
      uVortex: { value: 0 },
      uWaveSpeed: { value: 0.1 },
      uTension: { value: 0 },
    },
  });

  const absorption = absorptionField.addPass({
    vertex: virvaVertexShader,
    fragment: virvaAbsorptionShader,
    uniforms: {
      tHeight: heightField.uniform,
      uTexel: { value: texel },
      uTime: { value: 0 },
      uDelta: { value: 1 / 60 },
      uTopology: { value: 0 },
      uTopologyFrom: { value: 0 },
      uBlend: { value: 1 },
      uVortex: { value: 0 },
      uDirection: { value: 0 },
      uWaveSpeed: { value: 0.1 },
    },
  });

  const program = new Program(gl, {
    vertex: virvaVertexShader,
    fragment: virvaOpticsShader,
    transparent: true,
    depthTest: false,
    uniforms: {
      uHeight: heightField.uniform,
      uAbsorption: absorptionField.uniform,
      uTexel: { value: texel },
      uResolution: { value: [1, 1] },
      uTime: { value: 0 },
      uDispersion: { value: 0.01 },
      uSteepness: { value: 0.1 },
      uTension: { value: 0.1 },
      uSpill: { value: 0 },
      uAccent: { value: colors.accent },
      uInfo: { value: colors.info },
      uLive: { value: colors.live },
      uInk: { value: colors.ink },
      uSurface: { value: colors.surface },
      uBackdrop: { value: colors.backdrop },
      uTransmissive: { value: colors.transmissive ? 1 : 0 },
      uHeightRelief: { value: 1 },
      uSlopeRelief: { value: 1 },
    },
  });
  const mesh = new Mesh(gl, { geometry, program });
  const optical = program.uniforms;

  const handleLost = (event: Event) => {
    event.preventDefault();
    onContextLost?.();
  };
  canvas.addEventListener("webglcontextlost", handleLost);

  return {
    resize(width, height, dpr) {
      renderer.dpr = dpr;
      renderer.setSize(width, height);
      optical.uResolution.value = [width * dpr, height * dpr];
    },
    setColors(next) {
      optical.uAccent.value = next.accent;
      optical.uInfo.value = next.info;
      optical.uLive.value = next.live;
      optical.uInk.value = next.ink;
      optical.uSurface.value = next.surface;
      optical.uBackdrop.value = next.backdrop;
      optical.uTransmissive.value = next.transmissive ? 1 : 0;
    },
    draw({ time, delta, forcing }) {
      const topology = virvaTopologyIndex(forcing.topology);
      const fromTopology = virvaTopologyIndex(forcing.fromTopology);
      wave.uniforms.uTime.value = time;
      wave.uniforms.uPhase.value = forcing.phase;
      wave.uniforms.uDelta.value = delta;
      wave.uniforms.uTopology.value = topology;
      wave.uniforms.uTopologyFrom.value = fromTopology;
      wave.uniforms.uPhaseFrom.value = forcing.fromPhase;
      wave.uniforms.uBlend.value = forcing.blend;
      wave.uniforms.uAmplitude.value = forcing.amplitude;
      wave.uniforms.uWavenumber.value = forcing.wavenumber;
      wave.uniforms.uDamping.value = forcing.damping;
      wave.uniforms.uInlet.value = forcing.inlet;
      wave.uniforms.uVortex.value = forcing.vortex;
      wave.uniforms.uWaveSpeed.value = forcing.waveSpeed;
      wave.uniforms.uTension.value = forcing.tension;
      heightField.render();

      absorption.uniforms.uTime.value = time;
      absorption.uniforms.uDelta.value = delta;
      absorption.uniforms.uTopology.value = topology;
      absorption.uniforms.uTopologyFrom.value = fromTopology;
      absorption.uniforms.uBlend.value = forcing.blend;
      absorption.uniforms.uVortex.value = forcing.vortex;
      absorption.uniforms.uDirection.value = forcing.direction;
      absorption.uniforms.uWaveSpeed.value = forcing.waveSpeed;
      absorptionField.render();

      optical.uTime.value = time;
      optical.uDispersion.value = forcing.dispersion;
      optical.uSteepness.value = forcing.steepness;
      optical.uTension.value = forcing.tension;
      optical.uSpill.value = forcing.spill;
      optical.uHeightRelief.value = forcing.heightRelief;
      optical.uSlopeRelief.value = forcing.slopeRelief;
      renderer.autoClear = true;
      renderer.render({ scene: mesh });
    },
    dispose() {
      canvas.removeEventListener("webglcontextlost", handleLost);
      program.remove();
      wave.program.remove();
      absorption.program.remove();
      geometry.remove();

      for (const texture of [
        initialHeightTexture,
        initialAbsorptionTexture,
        heightField.fbo.read.texture,
        heightField.fbo.write.texture,
        absorptionField.fbo.read.texture,
        absorptionField.fbo.write.texture,
      ]) {
        gl.deleteTexture(texture.texture);
      }
      for (const target of [
        heightField.fbo.read,
        heightField.fbo.write,
        absorptionField.fbo.read,
        absorptionField.fbo.write,
      ]) {
        gl.deleteFramebuffer(target.buffer);
      }
    },
  };
}
