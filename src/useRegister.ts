import { useState } from 'react'

export type Register = 'kirja' | 'puhe'

const KEY = 'muste:register'

function load(): Register {
  try {
    return localStorage.getItem(KEY) === 'puhe' ? 'puhe' : 'kirja'
  } catch {
    return 'kirja'
  }
}

export function useRegister() {
  const [register, setRegister] = useState<Register>(load)
  const change = (next: Register) => {
    setRegister(next)
    try {
      localStorage.setItem(KEY, next)
    } catch {
      return
    }
  }
  return [register, change] as const
}
