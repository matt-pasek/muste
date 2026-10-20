import { SulaSegmented } from '@usva-ui/react/sula/sula-segmented'
import type { CSSProperties, ReactNode } from 'react'
import { EraserIcon, ExplainIcon, PenIcon } from './icons'
import { INKS } from './ink'
import type { Tool } from './PdfPage'

const TOOLS = [
  { value: 'pen', label: 'Pen', icon: <PenIcon /> },
  { value: 'eraser', label: 'Erase', icon: <EraserIcon /> },
  { value: 'box', label: 'Explain', icon: <ExplainIcon /> },
]

type Props = {
  tool: Tool
  onTool: (tool: Tool) => void
  inkColor: string
  onInkColor: (color: string) => void
  menu: ReactNode
}

export function Dock({ tool, onTool, inkColor, onInkColor, menu }: Props) {
  const pen = tool === 'pen'
  return (
    <div className="safe-bottom pointer-events-none fixed inset-x-0 bottom-0 z-dropdown flex justify-center px-4">
      <nav className="fade pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-overlay p-1.5 shadow-floating">
        {menu}
        <span className="mx-1 h-6 w-px bg-border" aria-hidden />
        <SulaSegmented
          aria-label="Tool"
          items={TOOLS}
          value={tool}
          onValueChange={(v) => onTool(v as Tool)}
          bare
        />
        <div className="swatches" data-open={pen || undefined} aria-hidden={!pen}>
          <div role="radiogroup" aria-label="Ink colour" className="flex items-center pr-0.5 pl-1">
            {INKS.map((ink) => (
              <button
                key={ink.color}
                role="radio"
                aria-checked={ink.color === inkColor}
                aria-label={ink.name}
                tabIndex={pen ? 0 : -1}
                className="swatch"
                style={{ '--ink': ink.color } as CSSProperties}
                onClick={() => onInkColor(ink.color)}
              />
            ))}
          </div>
        </div>
      </nav>
    </div>
  )
}
