import { SegmentedControl } from '@usva-ui/react/patterns/segmented-control'
import { SPEEDS, setSpeed, useSpeed, type Speed } from './speech'

export function SpeedToggle() {
  const speed = useSpeed()
  return (
    <SegmentedControl
      size="sm"
      aria-label="Playback speed"
      items={SPEEDS.map((s) => ({ value: String(s), label: `${s}×` }))}
      value={String(speed)}
      onValueChange={(v) => setSpeed(Number(v) as Speed)}
    />
  )
}
