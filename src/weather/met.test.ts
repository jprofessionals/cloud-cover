import { describe, it, expect } from 'vitest'
import { parseMet } from './met'
import fixture from './__fixtures__/met-complete.json'

describe('parseMet', () => {
  it('gir kilde met', () => {
    expect(parseMet(fixture).source).toBe('met')
  })

  it('normaliserer medium til mid', () => {
    const first = parseMet(fixture).samples[0]
    expect(typeof first.mid).toBe('number')
    expect(first.mid).toBeGreaterThanOrEqual(0)
    expect(first.mid).toBeLessThanOrEqual(100)
  })

  it('gir stigende tider som Date', () => {
    const samples = parseMet(fixture).samples
    expect(samples[0].time).toBeInstanceOf(Date)
    expect(samples[1].time.getTime()).toBeGreaterThan(samples[0].time.getTime())
  })

  it('hopper over steg uten skylagsdata', () => {
    const trimmed = {
      properties: {
        timeseries: [
          { time: '2026-08-12T18:00:00Z', data: { instant: { details: {} } } },
          {
            time: '2026-08-12T19:00:00Z',
            data: {
              instant: {
                details: {
                  cloud_area_fraction_low: 10,
                  cloud_area_fraction_medium: 20,
                  cloud_area_fraction_high: 30,
                },
              },
            },
          },
        ],
      },
    }
    expect(parseMet(trimmed).samples).toHaveLength(1)
  })

  it('kaster ved uventet form', () => {
    expect(() => parseMet({ nope: true })).toThrow(/Uventet svar/)
  })
})
