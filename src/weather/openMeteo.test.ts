import { describe, it, expect } from 'vitest'
import { parseOpenMeteo } from './openMeteo'
import single from './__fixtures__/open-meteo-single.json'
import multi from './__fixtures__/open-meteo-multi.json'

describe('parseOpenMeteo', () => {
  it('tåler objektsvaret for én koordinat', () => {
    const result = parseOpenMeteo(single)
    expect(result).toHaveLength(1)
    expect(result[0].source).toBe('open-meteo')
    expect(result[0].samples.length).toBeGreaterThan(0)
  })

  it('tåler arraysvaret for flere koordinater', () => {
    expect(parseOpenMeteo(multi)).toHaveLength(2)
  })

  it('gir Date-objekter og tall i prosent', () => {
    const first = parseOpenMeteo(single)[0].samples[0]
    expect(first.time).toBeInstanceOf(Date)
    expect(first.low).toBeGreaterThanOrEqual(0)
    expect(first.low).toBeLessThanOrEqual(100)
  })

  it('tolker tidene som UTC', () => {
    const first = parseOpenMeteo(single)[0].samples[0]
    expect(first.time.toISOString()).toMatch(/T00:00:00\.000Z$/)
  })

  it('kaster ved uventet form', () => {
    expect(() => parseOpenMeteo({ nope: true })).toThrow(/Uventet svar/)
  })
})
