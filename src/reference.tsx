import { createContext, useContext } from 'react'
import type { Case } from '../server/grammar'

export type CaseWord = { form?: string; lemma?: string; why?: string }

export type Reference =
  | { kind: 'dict'; word: string }
  | { kind: 'case'; topic: Case; word?: CaseWord }
  | { kind: 'puhekieli' }

export const ReferenceContext = createContext<(ref: Reference) => void>(() => {})

export const useOpenReference = () => useContext(ReferenceContext)
