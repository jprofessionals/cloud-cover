import { describe, it, expect } from 'vitest'
import { deriveState } from './useForecast'

const CIRCUMSTANCES = {
  kind: 'partial' as const,
  obscuration: 0.87,
  partialBegin: { time: new Date('2026-08-12T17:40:00Z'), sunAltitude: 15, sunAzimuth: 270 },
  peak: { time: new Date('2026-08-12T18:30:00Z'), sunAltitude: 9, sunAzimuth: 285 },
  partialEnd: { time: new Date('2026-08-12T19:20:00Z'), sunAltitude: 3, sunAzimuth: 298 },
}

describe('deriveState', () => {
  it('melder no-eclipse når motoren ikke finner noe', () => {
    expect(deriveState(null, null).status).toBe('no-eclipse')
  })

  it('melder no-weather når formørkelsen finnes men skydata mangler', () => {
    const state = deriveState(CIRCUMSTANCES, null)
    expect(state.status).toBe('no-weather')
    expect(state.circumstances).not.toBeNull()
  })

  it('melder no-weather når varselet ikke dekker formørkelsesvinduet', () => {
    const forecast = {
      source: 'open-meteo' as const,
      samples: [{ time: new Date('2026-08-10T12:00:00Z'), low: 0, mid: 0, high: 0 }],
    }
    expect(deriveState(CIRCUMSTANCES, forecast).status).toBe('no-weather')
  })

  it('melder ready med score når alt finnes', () => {
    const forecast = {
      source: 'met' as const,
      samples: [
        { time: new Date('2026-08-12T17:00:00Z'), low: 0, mid: 0, high: 0 },
        { time: new Date('2026-08-12T20:00:00Z'), low: 0, mid: 0, high: 0 },
      ],
    }
    const state = deriveState(CIRCUMSTANCES, forecast)
    expect(state.status).toBe('ready')
    expect(state.score!.verdict).toBe('clear')
  })
})
