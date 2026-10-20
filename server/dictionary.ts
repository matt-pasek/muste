import { z } from 'zod'

export type DictForm = { form: string; tags: string[] }

export type DictEntry = {
  word: string
  pos: string
  senses: string[]
  kotus: string | null
  gradation: string | null
  forms: DictForm[]
}

export type DictResult = { word: string; entries: DictEntry[] }

type RawForm = { form?: string; tags?: string[]; source?: string }
type RawEntry = { word: string; pos: string; senses?: { glosses?: string[] }[]; forms?: RawForm[] }

const MAX_SENSES = 8
const DROPPED = /(^|-)possessive$|^error-|^rare$/
const TABLE_SOURCES = new Set(['declension', 'conjugation'])
const META_TAGS = new Set(['table-tags', 'inflection-template', 'class'])

const urlFor = (word: string) => {
  const chars = [...word]
  const first = chars[0]
  const firstTwo = chars.slice(0, 2).join('')
  const seg = (s: string) => encodeURIComponent(s)
  return `https://kaikki.org/dictionary/Finnish/meaning/${seg(first)}/${seg(firstTwo)}/${seg(word)}.jsonl`
}

function trim(raw: RawEntry): DictEntry {
  const forms = raw.forms ?? []
  const classes = forms.filter((f) => f.tags?.includes('class')).map((f) => f.form ?? '')
  return {
    word: raw.word,
    pos: raw.pos,
    senses: (raw.senses ?? []).flatMap((s) => s.glosses?.slice(-1) ?? []).slice(0, MAX_SENSES),
    kotus: classes.find((c) => /^\d/.test(c)) ?? null,
    gradation: classes.find((c) => !/^\d/.test(c) && c !== 'no gradation') ?? null,
    forms: forms
      .filter((f) => f.source && TABLE_SOURCES.has(f.source) && f.form && f.form !== '-' && f.tags)
      .filter((f) => !f.tags!.some((t) => META_TAGS.has(t) || DROPPED.test(t)))
      .map((f) => ({ form: f.form!, tags: f.tags! })),
  }
}

async function fetchJsonl(word: string, init?: RequestInit) {
  const res = await fetch(urlFor(word), init)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Dictionary returned HTTP ${res.status}`)
  return (await res.text())
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RawEntry)
}

export async function lookupWord(word: string, init?: RequestInit): Promise<DictResult> {
  const raw = (await fetchJsonl(word, init)) ?? (word !== word.toLowerCase() ? await fetchJsonl(word.toLowerCase(), init) : null)
  return { word, entries: (raw ?? []).map(trim) }
}

export const validateWord = (value: unknown) => z.string().trim().min(1).max(60).parse(value)
