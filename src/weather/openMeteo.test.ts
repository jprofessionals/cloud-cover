import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseOpenMeteo, fetchOpenMeteo } from './openMeteo'
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

  it('gir Date-objekter og tall i prosent, med lagene i riktig rekkefølge', () => {
    const first = parseOpenMeteo(single)[0].samples[0]
    expect(first.time).toBeInstanceOf(Date)
    // Pinner de faktiske verdiene fra fixturen, ikke bare et gyldig område,
    // slik at en ombytting av low/mid/high faktisk blir fanget opp.
    expect(first).toMatchObject({ low: 0, mid: 1, high: 38 })
  })

  it('tolker tidene som UTC', () => {
    const first = parseOpenMeteo(single)[0].samples[0]
    expect(first.time.toISOString()).toMatch(/T00:00:00\.000Z$/)
  })

  it('kaster ved uventet form', () => {
    expect(() => parseOpenMeteo({ nope: true })).toThrow(/Uventet svar/)
  })
})

describe('fetchOpenMeteo', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('spenner start_date og end_date over hele vinduet når det krysser UTC-midnatt', async () => {
    let requestedUrl = ''
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo) => {
        requestedUrl = String(input)
        return Promise.resolve(new Response(JSON.stringify(single), { status: 200 }))
      }),
    )

    // Seoul 2035-09-01: formørkelsen begynner 23:30 UTC dagen før og slutter
    // 02:09 UTC dagen etter.
    await fetchOpenMeteo(
      [{ lat: 37.57, lon: 126.98 }],
      new Date('2035-09-01T23:30:00Z'),
      new Date('2035-09-02T02:09:00Z'),
    )

    const params = new URL(requestedUrl).searchParams
    expect(params.get('start_date')).toBe('2035-09-01')
    expect(params.get('end_date')).toBe('2035-09-02')
  })
})
