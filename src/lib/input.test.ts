import { describe, expect, it } from 'vitest'
import { parseNumberDraft } from './input'

describe('parseNumberDraft', () => {
  it('turns an emptied numeric field into zero for live calculations', () => {
    expect(parseNumberDraft('')).toBe(0)
  })

  it('accepts decimal comma and decimal point', () => {
    expect(parseNumberDraft('12,5')).toBe(12.5)
    expect(parseNumberDraft('12.5')).toBe(12.5)
  })
})
