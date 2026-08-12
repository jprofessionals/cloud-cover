import { describe, it, expect } from 'vitest'
import { scoreWindow } from './scoreWindow'
import type { EclipseCircumstances } from '../eclipse/types'
import type { CloudSample } from '../weather/types'

function circumstances(peakAltitude: number): EclipseCircumstances {
  const point = (iso: string, alt: number) => ({
    time: new Date(iso),
    sunAltitude: alt,
    sunAzimuth: 280,
  })
  return {
    kind: 'partial',
    obscuration: 0.87,
    partialBegin: point('2026-08-12T17:40:00Z', peakAltitude + 6),
    peak: point('2026-08-12T18:30:00Z', peakAltitude),
    partialEnd: point('2026-08-12T19:20:00Z', Math.max(0, peakAltitude - 6)),
  }
}

function samples(low: number, mid = 0, high = 0): CloudSample[] {
  const out: CloudSample[] = []
  for (let t = Date.parse('2026-08-12T17:30:00Z'); t <= Date.parse('2026-08-12T19:30:00Z'); t += 15 * 60_000) {
    out.push({ time: new Date(t), low, mid, high })
  }
  return out
}

describe('scoreWindow', () => {
  it('gir clear ved skyfri himmel', () => {
    const r = scoreWindow(samples(0), circumstances(9))
    expect(r.verdict).toBe('clear')
    expect(r.score).toBeGreaterThanOrEqual(70)
  })

  it('gir clouded ved tett lavt skydekke', () => {
    const r = scoreWindow(samples(95), circumstances(9))
    expect(r.verdict).toBe('clouded')
  })

  it('gir unknown når det ikke finnes prøver i vinduet', () => {
    const r = scoreWindow([], circumstances(9))
    expect(r.verdict).toBe('unknown')
    expect(r.reason).toContain('Ingen skydata')
  })

  it('setter terrengvarsel når sola står under 3 grader ved maks', () => {
    const r = scoreWindow(samples(0), circumstances(2))
    expect(r.terrainWarning).toBe(true)
  })

  it('setter ikke terrengvarsel når sola står høyt nok', () => {
    const r = scoreWindow(samples(0), circumstances(9))
    expect(r.terrainWarning).toBe(false)
  })

  it('vekter maks tyngre enn kontakttidene', () => {
    // Skyfritt ved maks, overskyet i kantene, skal slå det motsatte.
    const clearAtPeak = samples(0).map((s) => ({
      ...s,
      low: Math.abs(s.time.getTime() - Date.parse('2026-08-12T18:30:00Z')) > 30 * 60_000 ? 100 : 0,
    }))
    const cloudyAtPeak = clearAtPeak.map((s) => ({ ...s, low: 100 - s.low }))
    expect(scoreWindow(clearAtPeak, circumstances(9)).score)
      .toBeGreaterThan(scoreWindow(cloudyAtPeak, circumstances(9)).score)
  })

  it('begrunner svaret med det dominerende skylaget', () => {
    const r = scoreWindow(samples(0, 0, 90), circumstances(20))
    expect(r.reason).toContain('høye skyer')
  })
})
