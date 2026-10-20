import type { Guide, Topic } from '../server/grammar'
import { loadGuide, saveGuide } from './db'

export async function guide(topic: Topic): Promise<Guide> {
  const cached = await loadGuide(topic)
  if (cached) return cached
  const res = await fetch('/api/grammar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
  await saveGuide(topic, body)
  return body
}
