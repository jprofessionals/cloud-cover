import { describe, it, expect } from 'vitest'
import { formatPercent, compassName, formatDate } from './index'

describe('formatPercent', () => {
  it('runder til nærmeste hele prosent', () => {
    expect(formatPercent(0.874)).toBe('87 %')
  })
})

describe('compassName', () => {
  it('gir nord for 0 grader', () => {
    expect(compassName(0)).toBe('nord')
  })
  it('gir vest for 270 grader', () => {
    expect(compassName(270)).toBe('vest')
  })
  it('gir nordvest for 315 grader', () => {
    expect(compassName(315)).toBe('nordvest')
  })
  it('håndterer verdier over 360', () => {
    expect(compassName(361)).toBe('nord')
  })
})

describe('formatDate', () => {
  it('formaterer en kjent dato i en gitt tidssone', () => {
    const date = new Date('2026-08-12T10:00:00Z')
    expect(formatDate(date, 'Europe/Oslo')).toBe('12. august 2026')
  })

  it('viser ulik kalenderdato for samme tidspunkt i to tidssoner som deler døgnskiftet', () => {
    // 18:00 UTC 11. august er 20:00 i Oslo (UTC+2, fortsatt 11. august), men
    // allerede 06:00 12. august i Auckland (UTC+12). Uten timeZone ville
    // begge vist samme dato.
    const date = new Date('2026-08-11T18:00:00Z')
    expect(formatDate(date, 'Europe/Oslo')).toBe('11. august 2026')
    expect(formatDate(date, 'Pacific/Auckland')).toBe('12. august 2026')
  })
})
