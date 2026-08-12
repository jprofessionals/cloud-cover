import { describe, it, expect } from 'vitest'
import { findEclipse, findEclipseNear } from './findEclipse'

const OSLO = { lat: 59.91, lon: 10.75 }

describe('findEclipse', () => {
  it('finner formørkelsen 12. august 2026 fra Oslo', () => {
    const result = findEclipseNear(OSLO.lat, OSLO.lon, new Date('2026-08-12T12:00:00Z'))
    expect(result).not.toBeNull()
    expect(result!.kind).toBe('partial')
    expect(result!.peak.time.toISOString().slice(0, 10)).toBe('2026-08-12')
  })

  it('gir kontakttider i riktig rekkefølge', () => {
    const r = findEclipseNear(OSLO.lat, OSLO.lon, new Date('2026-08-12T12:00:00Z'))!
    expect(r.partialBegin.time.getTime()).toBeLessThan(r.peak.time.getTime())
    expect(r.peak.time.getTime()).toBeLessThan(r.partialEnd.time.getTime())
  })

  it('gir dekningsgrad mellom 0 og 1', () => {
    const r = findEclipseNear(OSLO.lat, OSLO.lon, new Date('2026-08-12T12:00:00Z'))!
    expect(r.obscuration).toBeGreaterThan(0)
    expect(r.obscuration).toBeLessThanOrEqual(1)
  })

  it('gir en asimut i vestlig sektor når sola går ned i vest', () => {
    const r = findEclipseNear(OSLO.lat, OSLO.lon, new Date('2026-08-12T12:00:00Z'))!
    expect(r.peak.sunAzimuth).toBeGreaterThan(240)
    expect(r.peak.sunAzimuth).toBeLessThan(320)
  })

  it('returnerer null når ingen formørkelse finnes nær datoen', () => {
    const result = findEclipseNear(OSLO.lat, OSLO.lon, new Date('2026-06-01T12:00:00Z'))
    expect(result).toBeNull()
  })

  it('finner en framtidig formørkelse fra vilkårlig startdato', () => {
    const result = findEclipse(OSLO.lat, OSLO.lon, new Date('2026-01-01T00:00:00Z'))
    expect(result).not.toBeNull()
    expect(result!.peak.time.getTime()).toBeGreaterThan(Date.parse('2026-01-01T00:00:00Z'))
  })

  it('treffer verifiserte kontakttider for Oslo', () => {
    const r = findEclipseNear(OSLO.lat, OSLO.lon, new Date('2026-08-12T12:00:00Z'))!
    // Verdier verifisert mot timeanddate.no (19:57 CEST) og absoluteeclipse.eu
    // (83,0 % dekning) 2026-08-12. Toleranse ±60 sekunder.
    const peakUtc = Date.parse('2026-08-12T17:57:00Z')
    expect(Math.abs(r.peak.time.getTime() - peakUtc)).toBeLessThan(60_000)
    expect(r.obscuration).toBeCloseTo(0.83, 2)
  })
})
