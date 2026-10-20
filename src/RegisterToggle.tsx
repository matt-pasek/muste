import { SegmentedControl } from '@usva-ui/react/patterns/segmented-control'
import { useOpenReference } from './reference'
import type { Register } from './useRegister'

export function RegisterToggle({ value, onChange }: { value: Register; onChange: (r: Register) => void }) {
  const open = useOpenReference()
  return (
    <div className="enter flex items-center gap-2">
      <SegmentedControl
        size="sm"
        aria-label="Written or spoken Finnish"
        items={[
          { value: 'kirja', label: 'Kirja' },
          { value: 'puhe', label: 'Puhe' },
        ]}
        value={value}
        onValueChange={(v) => onChange(v as Register)}
      />
      {value === 'puhe' && (
        <button className="ref-link" onClick={() => open({ kind: 'puhekieli' })}>
          How puhekieli works ›
        </button>
      )}
    </div>
  )
}
