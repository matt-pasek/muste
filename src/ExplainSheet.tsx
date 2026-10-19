import type { Explanation } from '../server/explain'

export type SheetState =
  | { status: 'loading' }
  | { status: 'done'; result: Explanation }
  | { status: 'error'; message: string }

export function ExplainSheet({ state, onClose }: { state: SheetState; onClose: () => void }) {
  return (
    <div className="sheet" role="dialog">
      <button className="close" onClick={onClose} aria-label="Close">×</button>
      {state.status === 'loading' && <p className="muted">Reading…</p>}
      {state.status === 'error' && <p className="error">{state.message}</p>}
      {state.status === 'done' && (
        <>
          <p className="fi">{state.result.text}</p>
          <p className="en">{state.result.translation}</p>
          {state.result.sentence !== state.result.text && <p className="muted">{state.result.sentence}</p>}
          <ul className="words">
            {state.result.words.map((w, i) => (
              <li key={i}>
                <div>
                  <strong>{w.form}</strong> <span className="muted">← {w.lemma} · {w.pos} · {w.grammar}</span>
                </div>
                <div>{w.gloss}</div>
                <div className="why">{w.why}</div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
