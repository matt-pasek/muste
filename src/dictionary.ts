import type { DictEntry, DictForm, DictResult } from '../server/dictionary'
import { loadDict, saveDict } from './db'

export type Row = { label: string; value: string }
export type Block = { title: string; rows: Row[] }
export type Section = { title: string; blocks: Block[] }

export async function lookup(word: string): Promise<DictResult> {
  const cached = await loadDict(word)
  if (cached) return cached
  const res = await fetch(`/api/dict?word=${encodeURIComponent(word)}`)
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
  await saveDict(word, body)
  return body
}

const sameTags = (a: string[], b: string[]) => a.length === b.length && b.every((t) => a.includes(t))

function formsWith(forms: DictForm[], tags: string[]) {
  return [...new Set(forms.filter((f) => sameTags(f.tags, tags)).map((f) => f.form))]
}

const one = (forms: DictForm[], tags: string[]) => formsWith(forms, tags).join(', ')

function combine(values: string[]) {
  const present = values.filter(Boolean)
  if (!present.length) return ''
  const split = present.map((v) => {
    const [head, ...rest] = v.split(' ')
    return { head, tail: rest.join(' ') }
  })
  const tail = split[0].tail
  if (tail && split.every((s) => s.tail === tail)) return `${split.map((s) => s.head).join('/')} ${tail}`
  return present.join(' · ')
}

const rows = (pairs: [string, string][]): Row[] => pairs.filter(([, v]) => v).map(([label, value]) => ({ label, value }))

const NOUN_CASES = [
  'nominative',
  'genitive',
  'partitive',
  'inessive',
  'elative',
  'illative',
  'adessive',
  'ablative',
  'allative',
  'essive',
  'translative',
  'abessive',
  'comitative',
  'instructive',
]

function declension(forms: DictForm[]): Section[] {
  const block = (number: string, title: string): Block => ({
    title,
    rows: rows(NOUN_CASES.map((c) => [c, one(forms, [c, number])])),
  })
  return [{ title: 'Declension', blocks: [block('singular', 'Singular'), block('plural', 'Plural')] }]
}

const PERSONS: [string, string, string][] = [
  ['minä', 'first-person', 'singular'],
  ['sinä', 'second-person', 'singular'],
  ['hän', 'third-person', 'singular'],
  ['me', 'first-person', 'plural'],
  ['te', 'second-person', 'plural'],
  ['he', 'third-person', 'plural'],
]

const COMPOUND = new Set(['perfect', 'pluperfect'])

function tense(forms: DictForm[], mood: string, name: string, title: string): Block {
  const person = (p: string, n: string, negative = false) => one(forms, [mood, name, p, n, ...(negative ? ['negative'] : [])])
  const many = (n: string, negative = false) => combine(PERSONS.filter(([, , m]) => m === n).map(([, p]) => person(p, n, negative)))
  const passive = one(forms, [mood, 'passive', name])
  const passiveNegative = one(forms, [mood, 'negative', 'passive', name])
  const persons: [string, string][] = COMPOUND.has(name)
    ? [['(singular)', many('singular')], ['(plural)', many('plural')]]
    : PERSONS.map(([label, p, n]) => [label, person(p, n)])
  return {
    title,
    rows: rows([
      ...persons,
      ['(passive)', passive],
      ['(negative, singular)', many('singular', true)],
      ['(negative, plural)', many('plural', true)],
      ['(negative, passive)', passiveNegative],
    ]),
  }
}

const MOODS: [string, string, [string, string][]][] = [
  ['indicative', 'Indicative', [['present', 'Present'], ['past', 'Imperfect'], ['perfect', 'Perfect'], ['pluperfect', 'Pluperfect']]],
  ['conditional', 'Conditional', [['present', 'Present'], ['perfect', 'Perfect']]],
  ['imperative', 'Imperative', [['present', 'Present'], ['perfect', 'Perfect']]],
  ['potential', 'Potential', [['present', 'Present'], ['perfect', 'Perfect']]],
]

const NOMINAL: [string, string[]][] = [
  ['1st infinitive', ['infinitive', 'infinitive-i']],
  ['2nd infinitive, inessive', ['inessive', 'second-person']],
  ['2nd infinitive, instructive', ['instructive', 'second-person']],
  ['3rd infinitive, inessive', ['inessive', 'third-person']],
  ['3rd infinitive, elative', ['elative', 'third-person']],
  ['3rd infinitive, illative', ['illative', 'third-person']],
  ['3rd infinitive, adessive', ['adessive', 'third-person']],
  ['3rd infinitive, abessive', ['abessive', 'third-person']],
  ['4th infinitive', ['fourth-person', 'negative', 'noun-from-verb']],
  ['present active participle', ['active', 'participle', 'present']],
  ['present passive participle', ['participle', 'passive', 'present']],
  ['agent participle', ['agent']],
]

function conjugation(forms: DictForm[]): Section[] {
  const moods = MOODS.map(([mood, title, tenses]) => ({
    title,
    blocks: tenses.map(([name, label]) => tense(forms, mood, name, label)).filter((b) => b.rows.length),
  })).filter((s) => s.blocks.length)
  const nominal = rows(NOMINAL.map(([label, tags]) => [label, one(forms, tags)]))
  return nominal.length ? [...moods, { title: 'Nominal forms', blocks: [{ title: '', rows: nominal }] }] : moods
}

export function tables(entry: DictEntry): Section[] {
  if (!entry.forms.length) return []
  return entry.forms.some((f) => f.tags.includes('indicative')) ? conjugation(entry.forms) : declension(entry.forms)
}
