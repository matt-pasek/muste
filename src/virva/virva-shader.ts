export const virvaVertexShader = `#version 300 es
in vec2 position;
in vec2 uv;
out vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const membraneSdf = `
float sdEllipse(vec2 p, vec2 radius) {
  vec2 q = p / radius;
  return (length(q) - 1.0) * min(radius.x, radius.y);
}

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float membrane(vec2 p) {
  float d = sdEllipse(p - vec2(-0.18, 0.08), vec2(0.68, 0.72));
  d = smin(d, sdEllipse(p - vec2(0.28, 0.02), vec2(0.58, 0.62)), 0.32);
  d = smin(d, sdEllipse(p - vec2(0.02, -0.28), vec2(0.66, 0.48)), 0.28);
  d = smin(d, sdEllipse(p - vec2(-0.30, -0.20), vec2(0.42, 0.46)), 0.24);
  return d;
}
`;

export const virvaWaveShader = `#version 300 es
precision highp float;

uniform sampler2D tMap;
uniform vec2 uTexel;
uniform float uTime;
uniform float uPhase;
uniform float uDelta;
uniform float uTopology;
uniform float uTopologyFrom;
uniform float uPhaseFrom;
uniform float uBlend;
uniform float uAmplitude;
uniform float uWavenumber;
uniform float uDamping;
uniform float uInlet;
uniform float uVortex;
uniform float uWaveSpeed;
uniform float uTension;

in vec2 vUv;
out vec4 outColor;

${membraneSdf}

float heightAt(vec2 uv, float fallback) {
  vec2 p = uv * 2.0 - 1.0;
  if (membrane(p) > 0.03) return fallback;
  return texture(tMap, clamp(uv, uTexel, 1.0 - uTexel)).r;
}

float pool(vec2 p, vec2 centre, vec2 axes, float warp) {
  vec2 q = p - centre;
  q += vec2(
    sin(q.y * 5.1 + uTime * 0.7),
    sin(q.x * 4.3 - uTime * 0.5)
  ) * warp;
  q /= max(axes, vec2(0.02));
  float mass = pow(abs(q.x), 2.4) + pow(abs(q.y), 1.7);
  return exp(-mass * 1.8);
}

float sourceFor(float topology, float statePhase, vec2 p, float body) {
  float source = 0.0;
  if (topology < 0.5) {
    source =
      sin(p.x * 2.1 + uTime * 0.72) *
      cos(p.y * 1.7 - uTime * 0.51) *
      0.34;
    source += pool(
      p,
      vec2(sin(uTime * 0.31), cos(uTime * 0.23)) * 0.32,
      vec2(0.52, 0.34),
      0.06
    ) * 0.22;
  } else if (topology < 1.5) {
    float rimDistance = abs(body + 0.055);
    float rimBand = exp(-rimDistance * rimDistance * 240.0);
    source = rimBand * sin(statePhase) * uInlet * 0.45;
    vec2 focus = vec2(
      sin(uTime * 0.47),
      cos(uTime * 0.39)
    ) * 0.16;
    source += pool(
      p,
      focus,
      vec2(0.46, 0.34),
      0.035
    ) * (0.14 + 0.32 * uInlet);
    float broadDraw =
      sin((p.x * 0.82 + p.y * 0.54 + uTime * 0.31) * 3.14159) *
      cos((p.y * 0.68 - uTime * 0.23) * 3.14159);
    source += broadDraw * (0.05 + 0.05 * uInlet);
  } else if (topology < 2.5) {
    float foldA =
      sin(p.x * 3.4 + sin(p.y * 2.8 + uTime * 0.73)) *
      cos(p.y * 3.0 + sin(p.x * 2.0 - uTime * 0.51));
    float foldB =
      cos((p.x + p.y) * 2.5 - uTime * 0.61) *
      sin((p.x - p.y) * 1.9 + uTime * 0.43);
    source = (foldA * 0.62 + foldB * 0.38) * uVortex;
    source += sin((p.x * p.y * 8.0 + uTime) * uWavenumber) * 0.05;
  } else {
    float releaseEntry = smoothstep(0.0, 0.12, statePhase);
    float phase =
      p.x * uWavenumber * 0.55 +
      sin(p.y * 1.7 + statePhase * 0.8) * 0.28 -
      statePhase * 2.35;
    float front = sin(phase * 3.14159);
    float wake = sin(
      (
        phase * 0.52 -
        p.y * 0.30 +
        0.9
      ) *
      3.14159
    );
    float leading = sign(front) * pow(
      abs(front),
      mix(1.0, 0.52, uTension)
    );
    float aperture = smoothstep(
      0.72,
      -0.15,
      abs(p.y + sin(statePhase * 1.2) * 0.16)
    );
    source =
      (leading * 0.68 + wake * 0.32) *
      aperture *
      smoothstep(-0.9, 0.68, p.x) *
      releaseEntry;
  }
  return source;
}

void main() {
  vec4 previous = texture(tMap, vUv);
  vec2 p = vUv * 2.0 - 1.0;
  float body = membrane(p);
  if (body > 0.035) {
    outColor = vec4(0.0);
    return;
  }

  float h = previous.r;
  float old = previous.g;
  float left = heightAt(vUv - vec2(uTexel.x, 0.0), h);
  float right = heightAt(vUv + vec2(uTexel.x, 0.0), h);
  float down = heightAt(vUv - vec2(0.0, uTexel.y), h);
  float up = heightAt(vUv + vec2(0.0, uTexel.y), h);
  float laplacian = left + right + down + up - 4.0 * h;

  float source;
  if (uBlend >= 1.0) {
    source = sourceFor(uTopology, uPhase, p, body);
  } else {
    source = mix(
      sourceFor(uTopologyFrom, uPhaseFrom, p, body),
      sourceFor(uTopology, uPhase, p, body),
      uBlend
    );
  }

  float stepScale = clamp(uDelta * 60.0, 0.25, 1.25);
  float propagation = mix(0.12, 0.245, clamp(uWaveSpeed, 0.0, 1.0));
  float next = (2.0 - uDamping) * h - (1.0 - uDamping) * old;
  next += laplacian * propagation * stepScale;
  next += source * uAmplitude * 0.024 * stepScale;
  next *= smoothstep(0.04, -0.02, body);
  next = clamp(next, -0.46, 0.46);

  outColor = vec4(next, h, laplacian, 1.0);
}
`;

export const virvaAbsorptionShader = `#version 300 es
precision highp float;

uniform sampler2D tMap;
uniform sampler2D tHeight;
uniform vec2 uTexel;
uniform float uTime;
uniform float uDelta;
uniform float uTopology;
uniform float uTopologyFrom;
uniform float uBlend;
uniform float uVortex;
uniform float uDirection;
uniform float uWaveSpeed;

in vec2 vUv;
out vec4 outColor;

${membraneSdf}

mat2 rotate2d(float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return mat2(c, -s, s, c);
}

vec2 baseFlow(float topology, vec2 p) {
  vec2 velocity = vec2(0.0);
  if (topology < 0.5) {
    velocity = vec2(
      sin(p.y * 2.7 + uTime * 0.21),
      cos(p.x * 2.3 - uTime * 0.17)
    ) * 0.06;
  } else if (topology < 1.5) {
    velocity = -normalize(p + vec2(0.001)) * 0.25;
  } else if (topology < 2.5) {
    vec2 a = p - vec2(-0.28, 0.04);
    vec2 b = p - vec2(0.29, -0.08);
    velocity =
      vec2(-a.y, a.x) / (0.16 + dot(a, a)) -
      vec2(-b.y, b.x) / (0.16 + dot(b, b));
    velocity *= 0.13 * uVortex;
  } else {
    velocity = vec2(
      (0.26 + 0.22 * uWaveSpeed) * mix(1.0, uDirection, 0.35),
      sin(p.x * 4.0 + uTime) * 0.08
    );
  }
  return velocity;
}

void flowsFor(float topology, vec2 p, out vec2 v0, out vec2 v1, out vec2 v2) {
  mat2 turnOne = rotate2d(2.1);
  mat2 turnTwo = rotate2d(4.2);
  if (topology > 2.5) {
    vec2 releaseVelocity = baseFlow(topology, p);
    v0 = releaseVelocity;
    v1 =
      releaseVelocity * 0.86 +
      vec2(0.0, sin(p.x * 2.1 + uTime * 0.36) * 0.014);
    v2 =
      releaseVelocity * 1.12 -
      vec2(0.0, cos(p.x * 1.8 - uTime * 0.29) * 0.016);
  } else {
    v0 = baseFlow(topology, p);
    v1 =
      turnOne * baseFlow(topology, transpose(turnOne) * p * 1.13) * 0.72;
    v2 =
      turnTwo * baseFlow(topology, transpose(turnTwo) * p * 0.87) * 1.31;
  }
}

vec2 clampUv(vec2 uv) {
  return clamp(uv, uTexel, 1.0 - uTexel);
}

vec4 sampleStrata(vec2 uv, vec4 fallbackValue) {
  vec2 bounded = clampUv(uv);
  vec2 samplePoint = bounded * 2.0 - 1.0;
  if (membrane(samplePoint) > 0.025) return fallbackValue;
  return texture(tMap, bounded);
}

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float body = membrane(p);
  if (body > 0.04) {
    outColor = vec4(0.0);
    return;
  }

  float hL = texture(tHeight, vUv - vec2(uTexel.x, 0.0)).r;
  float hR = texture(tHeight, vUv + vec2(uTexel.x, 0.0)).r;
  float hD = texture(tHeight, vUv - vec2(0.0, uTexel.y)).r;
  float hU = texture(tHeight, vUv + vec2(0.0, uTexel.y)).r;
  vec2 heightGradient = vec2(hR - hL, hU - hD);

  vec2 velocity0;
  vec2 velocity1;
  vec2 velocity2;
  flowsFor(uTopology, p, velocity0, velocity1, velocity2);
  if (uBlend < 1.0) {
    vec2 from0;
    vec2 from1;
    vec2 from2;
    flowsFor(uTopologyFrom, p, from0, from1, from2);
    velocity0 = mix(from0, velocity0, uBlend);
    velocity1 = mix(from1, velocity1, uBlend);
    velocity2 = mix(from2, velocity2, uBlend);
  }
  float stepTime = min(uDelta, 0.034);
  vec4 previous = texture(tMap, vUv);
  float stratum0 = sampleStrata(
    vUv - (velocity0 + heightGradient * 1.2) * stepTime,
    previous
  ).r;
  float stratum1 = sampleStrata(
    vUv - (velocity1 + heightGradient * 1.8) * stepTime,
    previous
  ).g;
  float stratum2 = sampleStrata(
    vUv - (velocity2 + heightGradient * 2.6) * stepTime,
    previous
  ).b;
  vec3 strata = vec3(stratum0, stratum1, stratum2);
  vec3 neighbours =
    sampleStrata(vUv + vec2(uTexel.x, 0.0), previous).rgb +
    sampleStrata(vUv - vec2(uTexel.x, 0.0), previous).rgb +
    sampleStrata(vUv + vec2(0.0, uTexel.y), previous).rgb +
    sampleStrata(vUv - vec2(0.0, uTexel.y), previous).rgb;
  strata = mix(strata, neighbours * 0.25, 0.004);

  vec2 centre0 = 0.45 * vec2(
    cos(uTime * 0.050),
    sin(uTime * 0.037)
  );
  vec2 centre1 = 0.45 * vec2(
    cos(uTime * 0.041 + 2.1),
    sin(uTime * 0.059 + 2.1)
  );
  vec2 centre2 = 0.45 * vec2(
    cos(uTime * 0.033 + 4.2),
    sin(uTime * 0.046 + 4.2)
  );
  vec3 replenish = vec3(
    0.22 + 0.55 * exp(-dot(p - centre0, p - centre0) * 1.4),
    0.22 + 0.55 * exp(-dot(p - centre1, p - centre1) * 1.4),
    0.22 + 0.55 * exp(-dot(p - centre2, p - centre2) * 1.4)
  );
  float replenishRate = 1.0 - exp(-uDelta * 0.42);
  strata = mix(strata, replenish, replenishRate);
  outColor = vec4(clamp(strata, 0.02, 0.96), 1.0);
}
`;

export const virvaOpticsShader = `#version 300 es
precision highp float;

uniform sampler2D uHeight;
uniform sampler2D uAbsorption;
uniform vec2 uTexel;
uniform vec2 uResolution;
uniform float uTime;
uniform float uDispersion;
uniform float uSteepness;
uniform float uTension;
uniform float uSpill;
uniform vec3 uAccent;
uniform vec3 uInfo;
uniform vec3 uLive;
uniform vec3 uInk;
uniform vec3 uSurface;
uniform vec3 uBackdrop;
uniform float uTransmissive;
uniform float uHeightRelief;
uniform float uSlopeRelief;

in vec2 vUv;
out vec4 outColor;

${membraneSdf}

float energy(float traceH, float detH, float travel) {
  float detJ = 1.0 + travel * traceH + travel * travel * detH;
  float convergence = 1.0 / (0.28 + abs(detJ));
  return max(pow(convergence, 0.72) - 0.38, 0.0);
}

vec2 clampUv(vec2 uv) {
  return clamp(uv, uTexel * 2.0, 1.0 - uTexel * 2.0);
}

vec3 sampleOpticalStrata(vec2 uv, vec3 fallbackValue) {
  vec2 bounded = clampUv(uv);
  if (membrane(bounded * 2.0 - 1.0) > 0.025) return fallbackValue;
  return texture(uAbsorption, bounded).rgb;
}

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float h = texture(uHeight, vUv).r;
  float hL = texture(uHeight, vUv - vec2(uTexel.x, 0.0)).r;
  float hR = texture(uHeight, vUv + vec2(uTexel.x, 0.0)).r;
  float hD = texture(uHeight, vUv - vec2(0.0, uTexel.y)).r;
  float hU = texture(uHeight, vUv + vec2(0.0, uTexel.y)).r;
  vec2 gradient = vec2(hR - hL, hU - hD);

  vec2 wide = uTexel * 2.0;
  float hWideL = texture(uHeight, vUv - vec2(wide.x, 0.0)).r;
  float hWideR = texture(uHeight, vUv + vec2(wide.x, 0.0)).r;
  float hWideD = texture(uHeight, vUv - vec2(0.0, wide.y)).r;
  float hWideU = texture(uHeight, vUv + vec2(0.0, wide.y)).r;
  float hWideLD = texture(uHeight, vUv - wide).r;
  float hWideRU = texture(uHeight, vUv + wide).r;
  float hWideLU = texture(
    uHeight,
    vUv + vec2(-wide.x, wide.y)
  ).r;
  float hWideRD = texture(
    uHeight,
    vUv + vec2(wide.x, -wide.y)
  ).r;

  float opticalPower = mix(1500.0, 5200.0, clamp(uSteepness, 0.0, 1.0));
  float hxx = (hWideR + hWideL - 2.0 * h) * opticalPower * 0.25;
  float hyy = (hWideU + hWideD - 2.0 * h) * opticalPower * 0.25;
  float hxy =
    (hWideRU + hWideLD - hWideLU - hWideRD) *
    opticalPower *
    0.0625;
  float traceH = hxx + hyy;
  float detH = hxx * hyy - hxy * hxy;
  float curvatureGate = smoothstep(0.0005, 0.004, length(gradient));

  float travel = mix(1.2, 1.72, uTension);
  float spectralSpread = uDispersion * 9.0;
  vec3 causticBands = vec3(
    energy(traceH, detH, travel * (1.0 - spectralSpread)),
    energy(traceH, detH, travel),
    energy(traceH, detH, travel * (1.0 + spectralSpread))
  );
  float fold = dot(min(causticBands, vec3(2.8)), vec3(0.333333));
  fold = smoothstep(0.35, 1.6, fold) * curvatureGate;

  float shape = membrane(p + gradient * vec2(-0.12, 0.09)) + h * 0.045;
  float aa = max(fwidth(shape), 0.002);
  float bodyMask = 1.0 - smoothstep(-aa, aa, shape);
  float thickness = sqrt(clamp(1.0 - dot(p * vec2(0.82, 0.92), p * vec2(0.82, 0.92)), 0.0, 1.0));

  vec2 bend = gradient * (8.0 + uTension * 6.0);
  bend /= 1.0 + length(bend) / 0.085;
  vec2 transverse = vec2(-bend.y, bend.x);
  vec3 localStrata = texture(uAbsorption, vUv).rgb;
  float stratum0 = sampleOpticalStrata(
    vUv + bend * 0.50,
    localStrata
  ).r;
  float stratum1 = sampleOpticalStrata(
    vUv + bend + transverse * 0.18,
    localStrata
  ).g;
  float stratum2 = sampleOpticalStrata(
    vUv + bend * 1.70 + transverse * 0.36,
    localStrata
  ).b;
  vec3 strata = vec3(stratum0, stratum1, stratum2);
  vec3 occupancy = strata * strata;
  occupancy /= occupancy + vec3(0.25);
  float meanOccupancy = dot(occupancy, vec3(0.333333));
  float spectralContrast = mix(5.5, 4.0, uTransmissive);
  vec3 logits = exp(
    (occupancy - vec3(meanOccupancy)) *
    spectralContrast
  );
  vec3 weights = logits / max(dot(logits, vec3(1.0)), 0.0001);
  vec3 volumeHue =
    uAccent * weights.r +
    uInfo * weights.g +
    uLive * weights.b;
  float overlapPower = occupancy.r * occupancy.g * occupancy.b;
  float paleFocus =
    overlapPower /
    (overlapPower + 0.12) *
    0.40;
  vec3 paleRole = mix(uInk, uSurface, uTransmissive);
  vec3 volumeColor = mix(volumeHue, paleRole, paleFocus);
  float volumeLuminance = dot(
    volumeColor,
    vec3(0.2126, 0.7152, 0.0722)
  );
  volumeColor = max(
    vec3(volumeLuminance) +
    (volumeColor - vec3(volumeLuminance)) *
    mix(1.45, 1.05, uTransmissive),
    vec3(0.0)
  );

  vec3 normal = normalize(vec3(-gradient * (40.0 / uSlopeRelief), 1.0));
  vec3 skyDirection = normalize(vec3(-0.20, 0.70, 0.68));
  float wrap = clamp(dot(normal, skyDirection) * 0.5 + 0.5, 0.0, 1.0);
  float irradiance =
    mix(0.55, 1.30, smoothstep(-1.0, 1.0, p.y)) *
    (0.45 + 0.55 * wrap);

  vec3 luminousFloor =
    (uAccent + uInfo + uLive) * 0.045 +
    uSurface * 0.05;
  float focusedLight =
    1.0 -
    exp(
      -meanOccupancy *
      irradiance *
      mix(7.0, 3.2, uTransmissive)
    );
  float bodyLight =
    mix(0.22, 0.38, uTransmissive) +
    focusedLight *
    mix(0.78, 0.62, uTransmissive);
  vec3 color =
    luminousFloor +
    volumeColor * bodyLight;
  float topShade = mix(
    0.62,
    1.12,
    smoothstep(0.22, 1.18, irradiance)
  );
  float depthShade = mix(
    0.72,
    1.08,
    smoothstep(0.08, 0.86, thickness)
  );
  float heightShade = mix(
    0.80,
    1.20,
    smoothstep(-0.025 * uSlopeRelief, 0.025 * uSlopeRelief, h)
  );
  color *= topShade * depthShade * heightShade;
  float lensHighlight =
    pow(wrap, 3.0) *
    smoothstep(0.24, 0.86, thickness) *
    0.055;
  color += paleRole * lensHighlight;

  float density = dot(strata, vec3(0.34)) * thickness;
  vec3 backdropTint = mix(
    vec3(0.78),
    vec3(0.72) + uBackdrop * 0.28,
    uTransmissive
  );
  color *= mix(
    vec3(1.0),
    backdropTint,
    smoothstep(0.55, 1.25, density) * 0.30
  );
  color =
    vec3(1.0) -
    (vec3(1.0) - color) *
    (vec3(1.0) - paleRole * fold * 0.11);

  float rimBand = exp(-pow(shape / max(aa * 2.8, 0.012), 2.0));
  float topLight = rimBand * smoothstep(-0.38, 0.78, p.y);
  color += paleRole * topLight * (0.04 + fold * 0.09);

  float spillAperture = exp(-pow((p.y + sin(uTime * 0.7) * 0.14) / 0.38, 2.0));
  float spillDistance = exp(-max(shape, 0.0) * 16.0);
  float spill = uSpill * spillAperture * spillDistance * smoothstep(0.1, 1.1, p.x);
  color += (uInfo + uLive) * 0.12 * spill * (0.35 + fold * 0.65);

  float presence = dot(occupancy, vec3(0.333333));
  float bodyAlpha = mix(
    mix(0.88, 0.58, uTransmissive),
    mix(0.98, 0.84, uTransmissive),
    smoothstep(0.10, 0.55, presence + fold * 0.30)
  );
  float alpha = clamp(bodyMask * bodyAlpha + spill * 0.28, 0.0, 1.0);
  outColor = vec4(color * alpha, alpha);
}
`;
