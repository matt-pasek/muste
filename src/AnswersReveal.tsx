import { Button } from '@usva-ui/react/primitives/button'
import { useState } from 'react'
import type { AnswerExercise } from '../server/answers'

export function AnswersReveal({ exercises }: { exercises: AnswerExercise[] }) {
  const [shown, setShown] = useState(false)

  if (!shown) {
    return (
      <div className="enter mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-sm text-muted">Answers from the key, hidden until you want them.</p>
        <Button variant="soft" size="sm" onClick={() => setShown(true)}>Show answers</Button>
      </div>
    )
  }

  return (
    <section className="mt-4 flex flex-col gap-4 border-t border-border pt-4">
      {exercises.map((e) => (
        <div key={`${e.section}#${e.number}`} className="enter flex flex-col gap-2">
          <p className="font-mono text-xs tracking-wider text-accent uppercase">
            Answers · {e.section} · Harjoitus {e.number}
          </p>
          {e.parts.map((part, i) => (
            <div key={i} className="flex flex-col gap-1">
              {part.label && <p className="text-sm font-semibold">{part.label}</p>}
              <ol className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                {part.items.map((item, j) => (
                  <li key={j} className="contents">
                    <span className="text-right font-mono text-muted tabular-nums">{item.n}</span>
                    <span>{item.answer}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      ))}
    </section>
  )
}
