import { CASES, type Case } from '../server/grammar'

export const isCase = (value: unknown): value is Case => typeof value === 'string' && (CASES as readonly string[]).includes(value)

export const caseClass = (value: unknown) => (isCase(value) && value !== 'nominative' ? `case-${value}` : '')

export const caseLabel = (value: Case, number?: string) =>
  number && number !== 'none' ? `${value} ${number === 'plural' ? 'pl.' : 'sg.'}` : value
