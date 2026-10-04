export function parseNumberDraft(raw: string): number | null {
  if (raw === '') return 0
  if (raw.endsWith('.') || raw.endsWith(',')) return null
  const parsed = Number(raw.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}
