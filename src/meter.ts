const FLOOR = 0.004
const DECAY = 0.995

export function meter(analyser: AnalyserNode) {
  const samples = new Float32Array(analyser.fftSize)
  let peak = FLOOR * 4
  return () => {
    analyser.getFloatTimeDomainData(samples)
    const rms = Math.sqrt(samples.reduce((sum, v) => sum + v * v, 0) / samples.length)
    peak = Math.max(rms, peak * DECAY, FLOOR * 4)
    return rms < FLOOR ? 0 : Math.min(1, rms / peak)
  }
}
