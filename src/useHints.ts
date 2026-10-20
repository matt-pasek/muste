import { useState } from 'react'

const KEY = 'muste:hints'

function load() {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}

export function useHints() {
  const [hints, setHints] = useState(load)
  const toggle = () => {
    const next = !hints
    setHints(next)
    try {
      localStorage.setItem(KEY, next ? 'on' : 'off')
    } catch {
      return
    }
  }
  return [hints, toggle] as const
}
