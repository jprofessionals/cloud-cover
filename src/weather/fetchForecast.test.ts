import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchForecast } from './fetchForecast'
import metFixture from './__fixtures__/met-complete.json'
import openMeteoFixture from './__fixtures__/open-meteo-single.json'

const POINT = { lat: 59.91, lon: 10.75 }
const FROM = new Date('2026-08-12T11:00:00Z')
const TO = new Date('2026-08-12T13:00:00Z')

afterEach(() => vi.unstubAllGlobals())

function stubFetch(handler: (url: string) => Response | Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo) => handler(String(input))))
}

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })

describe('fetchForecast', () => {
  it('bruker MET når MET svarer', async () => {
    stubFetch(() => ok(metFixture))
    expect((await fetchForecast(POINT, FROM, TO)).source).toBe('met')
  })

  it('faller tilbake til Open-Meteo når MET feiler', async () => {
    stubFetch((url) =>
      url.includes('/api/met')
        ? new Response('nei', { status: 503 })
        : ok(openMeteoFixture),
    )
    expect((await fetchForecast(POINT, FROM, TO)).source).toBe('open-meteo')
  })

  it('faller tilbake når MET svarer uten skylagsdata', async () => {
    stubFetch((url) =>
      url.includes('/api/met')
        ? ok({ properties: { timeseries: [] } })
        : ok(openMeteoFixture),
    )
    expect((await fetchForecast(POINT, FROM, TO)).source).toBe('open-meteo')
  })

  it('lar feilen boble når begge kilder feiler', async () => {
    stubFetch(() => new Response('nei', { status: 500 }))
    await expect(fetchForecast(POINT, FROM, TO)).rejects.toThrow()
  })
})
