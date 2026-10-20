import { useEffect, useState } from 'react'

export type Async<T> = { status: 'loading' } | { status: 'done'; value: T } | { status: 'error'; message: string }

export function useAsync<T>(run: () => Promise<T>, key: string): Async<T> {
  const [state, setState] = useState<{ key: string; value: Async<T> }>({ key, value: { status: 'loading' } })
  useEffect(() => {
    let cancelled = false
    run().then(
      (value) => !cancelled && setState({ key, value: { status: 'done', value } }),
      (err) => !cancelled && setState({ key, value: { status: 'error', message: err instanceof Error ? err.message : String(err) } }),
    )
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return state.key === key ? state.value : { status: 'loading' }
}
