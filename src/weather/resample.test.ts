import { describe, it, expect } from 'vitest'
import { resample } from './resample'
import type { CloudSample } from './types'

const hourly: CloudSample[] = [
  { time: new Date('2026-08-12T18:00:00Z'), low: 0, mid: 0, high: 0 },
  { time: new Date('2026-08-12T19:00:00Z'), low: 100, mid: 40, high: 20 },
]

describe('resample', () => {
  it('gir fire steg per time', () => {
    expect(resample(hourly, 15)).toHaveLength(5)
  })

  it('interpolerer lineært mellom timesverdier', () => {
    const out = resample(hourly, 15)
    expect(out[1].time.toISOString()).toBe('2026-08-12T18:15:00.000Z')
    expect(out[1].low).toBeCloseTo(25, 5)
    expect(out[2].low).toBeCloseTo(50, 5)
  })

  it('beholder endepunktene uendret', () => {
    const out = resample(hourly, 15)
    expect(out[0].low).toBe(0)
    expect(out[out.length - 1].low).toBe(100)
  })

  it('returnerer tom liste for tom inndata', () => {
    expect(resample([], 15)).toEqual([])
  })

  it('returnerer den ene prøven uendret når det bare finnes én', () => {
    expect(resample([hourly[0]], 15)).toEqual([hourly[0]])
  })
})
