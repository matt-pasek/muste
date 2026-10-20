export type VirvaState = "idle" | "listening" | "thinking" | "responding";

export type VirvaTopology = "settle" | "gather" | "fold" | "release";

export const VIRVA_TOPOLOGY: Record<VirvaState, VirvaTopology> = {
  idle: "settle",
  listening: "gather",
  thinking: "fold",
  responding: "release",
};

export interface VirvaForcing {
  topology: VirvaTopology;
  amplitude: number;
  wavenumber: number;
  dispersion: number;
  damping: number;
  inlet: number;
  vortex: number;
  direction: number;
  waveSpeed: number;
  steepness: number;
  tension: number;
  spill: number;
  heightRelief: number;
  slopeRelief: number;
  phase: number;
}

const ATTACK_SECONDS = 0.06;
const RELEASE_SECONDS = 0.5;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function mix(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

export function normalizeVirvaLevel(level: number | undefined): number {
  return Number.isFinite(level) ? clamp01(level ?? 0) : 0;
}

export function stepVirvaLevel(
  current: number,
  target: number,
  deltaSeconds: number,
): number {
  const from = normalizeVirvaLevel(current);
  const to = normalizeVirvaLevel(target);
  const tau = to > from ? ATTACK_SECONDS : RELEASE_SECONDS;
  const dt = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
  return mix(from, to, 1 - Math.exp(-dt / tau));
}

function listeningWaveSpeed(level: number): number {
  return mix(0.28, 0.5, level);
}

// Mirrors the wave shader's propagation, so the rim is driven at the membrane's own resonance.
function listeningOmega(level: number): number {
  const speed = Math.sqrt(mix(0.12, 0.245, listeningWaveSpeed(level)));
  const wavenumber = mix(7, 11, level);
  return speed * (wavenumber / 128) * 60;
}

function virvaPhaseRate(state: VirvaState, level: number): number {
  if (state === "idle") return 1 / 7 + 1 / 11;
  if (state === "listening") return listeningOmega(level);
  if (state === "thinking") return 1 / 3.1 - 1 / 4.7;
  return mix(0.28, 0.72, level);
}

export function stepVirvaPhase(
  current: number,
  state: VirvaState,
  level: number,
  deltaSeconds: number,
): number {
  const phase = Number.isFinite(current) ? Math.max(0, current) : 0;
  const dt = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
  return phase + virvaPhaseRate(state, normalizeVirvaLevel(level)) * dt;
}

export function createVirvaForcing(
  state: VirvaState,
  level: number,
  time: number,
  phaseOverride?: number,
): VirvaForcing {
  const live = normalizeVirvaLevel(level);
  const seconds = Number.isFinite(time) ? time : 0;
  const phase = Number.isFinite(phaseOverride)
    ? Math.max(0, phaseOverride ?? 0)
    : seconds * virvaPhaseRate(state, live);

  if (state === "idle") {
    return {
      topology: VIRVA_TOPOLOGY.idle,
      amplitude: 0.055,
      wavenumber: 1.15,
      dispersion: 0.004,
      damping: 0.035,
      inlet: 0,
      vortex: 0.08,
      direction: 0,
      waveSpeed: 0.12,
      steepness: 0.08,
      tension: 0.04,
      spill: 0,
      heightRelief: 1,
      slopeRelief: 1,
      phase,
    };
  }

  if (state === "listening") {
    return {
      topology: VIRVA_TOPOLOGY.listening,
      amplitude: mix(0.18, 0.32, live),
      wavenumber: mix(1.4, 3.1, live),
      dispersion: mix(0.01, 0.028, live),
      damping: mix(0.024, 0.018, live),
      inlet: live,
      vortex: 0.12,
      direction: 0,
      waveSpeed: listeningWaveSpeed(live),
      steepness: mix(0.28, 0.52, live),
      tension: mix(0.14, 0.44, live),
      spill: 0,
      heightRelief: 1,
      slopeRelief: mix(1, 2.32, live),
      phase,
    };
  }

  if (state === "thinking") {
    return {
      topology: VIRVA_TOPOLOGY.thinking,
      amplitude: 0.26,
      wavenumber: 4.2,
      dispersion: 0.034,
      damping: 0.016,
      inlet: 0,
      vortex: 0.82,
      direction: 0,
      waveSpeed: 0.48,
      steepness: 0.62,
      tension: 0.5,
      spill: 0,
      heightRelief: 1,
      slopeRelief: 2.22,
      phase,
    };
  }

  return {
    topology: VIRVA_TOPOLOGY.responding,
    amplitude: mix(0.16, 0.28, live),
    wavenumber: mix(1.8, 3.5, live),
    dispersion: mix(0.018, 0.038, live),
    damping: mix(0.024, 0.017, live),
    inlet: 0,
    vortex: mix(0.36, 0.18, live),
    direction: 1,
    waveSpeed: mix(0.38, 0.84, live),
    steepness: mix(0.26, 0.56, live),
    tension: mix(0.24, 0.58, live),
    spill: mix(0.1, 0.62, live),
    heightRelief: 1,
    slopeRelief: mix(1, 1.21, live),
    phase,
  };
}

export const VIRVA_ENTER_SECONDS = 0.42;
export const VIRVA_SETTLE_SECONDS = 0.7;

type VirvaNumericKey = Exclude<keyof VirvaForcing, "topology" | "phase">;

export interface VirvaOutgoing {
  state: VirvaState;
  phase: number;
  snapshot: VirvaForcing;
  progress: number;
}

export interface VirvaMotion {
  state: VirvaState;
  phase: number;
  level: number;
  elapsed: number;
  outgoing: VirvaOutgoing | null;
}

export interface VirvaMotionInput {
  state: VirvaState;
  level: number | undefined;
  delta: number;
}

export interface VirvaFieldForcing extends VirvaForcing {
  fromTopology: VirvaTopology;
  fromPhase: number;
  blend: number;
}

function transitionSeconds(to: VirvaState): number {
  return to === "idle" ? VIRVA_SETTLE_SECONDS : VIRVA_ENTER_SECONDS;
}

export function easeVirvaBlend(progress: number, to: VirvaState): number {
  const t = clamp01(Number.isFinite(progress) ? progress : 1);
  if (to === "idle") return t * t * t * (t * (t * 6 - 15) + 10);
  return 1 - (1 - t) ** 3;
}

export function blendVirvaForcing(
  from: VirvaForcing,
  to: VirvaForcing,
  t: number,
): VirvaForcing {
  const amount = clamp01(Number.isFinite(t) ? t : 1);
  const entries = Object.entries(to).map(([key, value]) =>
    typeof value === "number" && key !== "phase"
      ? [key, from[key as VirvaNumericKey] * (1 - amount) + value * amount]
      : [key, value],
  );
  return Object.fromEntries(entries) as VirvaForcing;
}

export function createVirvaMotion(
  state: VirvaState,
  level: number | undefined,
): VirvaMotion {
  return {
    state,
    phase: 0,
    level: normalizeVirvaLevel(level),
    elapsed: 0,
    outgoing: null,
  };
}

function withoutBlend({
  fromTopology: _topology,
  fromPhase: _phase,
  blend: _blend,
  ...forcing
}: VirvaFieldForcing): VirvaForcing {
  return forcing;
}

function blendOf(motion: VirvaMotion): number {
  if (!motion.outgoing) return 1;
  return easeVirvaBlend(
    motion.outgoing.progress / transitionSeconds(motion.state),
    motion.state,
  );
}

function handOff(motion: VirvaMotion): VirvaOutgoing {
  const outgoing = motion.outgoing;
  const keepsOutgoing = outgoing !== null && blendOf(motion) < 0.5;
  return {
    state: keepsOutgoing ? outgoing.state : motion.state,
    phase: keepsOutgoing ? outgoing.phase : motion.phase,
    snapshot: withoutBlend(virvaMotionForcing(motion)),
    progress: 0,
  };
}

function advance(
  outgoing: VirvaOutgoing | null,
  to: VirvaState,
  level: number,
  delta: number,
): VirvaOutgoing | null {
  if (!outgoing) return null;
  const progress = outgoing.progress + delta;
  if (progress >= transitionSeconds(to)) return null;
  return {
    ...outgoing,
    progress,
    phase: stepVirvaPhase(outgoing.phase, outgoing.state, level, delta),
  };
}

export function stepVirvaMotion(
  motion: VirvaMotion,
  input: VirvaMotionInput,
): VirvaMotion {
  const delta = Number.isFinite(input.delta) ? Math.max(0, input.delta) : 0;
  const level = stepVirvaLevel(
    motion.level,
    normalizeVirvaLevel(input.level),
    delta,
  );
  const elapsed = motion.elapsed + delta;
  if (input.state !== motion.state) {
    return {
      state: input.state,
      phase: 0,
      level,
      elapsed,
      outgoing: handOff(motion),
    };
  }
  return {
    state: motion.state,
    phase: stepVirvaPhase(motion.phase, motion.state, level, delta),
    level,
    elapsed,
    outgoing: advance(motion.outgoing, motion.state, level, delta),
  };
}

export function virvaMotionForcing(motion: VirvaMotion): VirvaFieldForcing {
  const to = createVirvaForcing(
    motion.state,
    motion.level,
    motion.elapsed,
    motion.phase,
  );
  const outgoing = motion.outgoing;
  if (!outgoing) {
    return { ...to, fromTopology: to.topology, fromPhase: to.phase, blend: 1 };
  }
  const blend = blendOf(motion);
  return {
    ...blendVirvaForcing(outgoing.snapshot, to, blend),
    fromTopology: VIRVA_TOPOLOGY[outgoing.state],
    fromPhase: outgoing.phase,
    blend,
  };
}
