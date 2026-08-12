import { describe, it, expect, vi, afterEach } from 'vitest'
import { searchPlaces, parseGeocoding } from './geocode'

afterEach(() => vi.unstubAllGlobals())

const FIXTURE = {
  results: [
    {
      name: 'Kolsås',
      latitude: 59.91363,
      longitude: 10.51192,
      elevation: 85,
      timezone: 'Europe/Oslo',
      country: 'Norge',
      admin1: 'Akershus fylke',
    },
  ],
}

describe('parseGeocoding', () => {
  it('mapper til Place', () => {
    const [place] = parseGeocoding(FIXTURE)
    expect(place.name).toBe('Kolsås')
    expect(place.lat).toBeCloseTo(59.91363, 5)
    expect(place.region).toBe('Akershus fylke, Norge')
  })

  it('gir tom liste når results mangler', () => {
    expect(parseGeocoding({})).toEqual([])
  })

  it('tåler manglende admin1', () => {
    const [place] = parseGeocoding({
      results: [{ name: 'X', latitude: 1, longitude: 2, elevation: 0, timezone: 'UTC', country: 'Norge' }],
    })
    expect(place.region).toBe('Norge')
  })
})

describe('searchPlaces', () => {
  it('returnerer tom liste for kort søk uten å kalle API-et', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await searchPlaces('a')).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
