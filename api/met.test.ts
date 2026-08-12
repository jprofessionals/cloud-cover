import { describe, it, expect, vi, afterEach } from 'vitest'
import handler from './met'

afterEach(() => vi.unstubAllGlobals())

function req(query: string): Request {
  return new Request(`http://localhost/api/met${query}`)
}

/** Stubber fetch slik at ingen test kan gjøre et reelt nettverkskall. */
function stubFetch() {
  const fetchMock = vi.fn((_input: RequestInfo) =>
    Promise.resolve(
      new Response(JSON.stringify({ properties: { timeseries: [] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('api/met handler — validering av lat/lon', () => {
  it('avviser når lat og lon mangler helt', async () => {
    const fetchMock = stubFetch()
    const response = await handler(req(''))
    expect(response.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('avviser når lat er en tom streng', async () => {
    const fetchMock = stubFetch()
    const response = await handler(req('?lat=&lon=10.7'))
    expect(response.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('avviser når lat ikke er et tall', async () => {
    const fetchMock = stubFetch()
    const response = await handler(req('?lat=abc&lon=10.7'))
    expect(response.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('avviser lat utenfor gyldig område', async () => {
    const fetchMock = stubFetch()
    const response = await handler(req('?lat=200&lon=10.7'))
    expect(response.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('avviser lon utenfor gyldig område', async () => {
    const fetchMock = stubFetch()
    const response = await handler(req('?lat=59.9&lon=-200'))
    expect(response.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('slipper gyldige koordinater gjennom til MET, uten nettverkskall', async () => {
    const fetchMock = stubFetch()

    const response = await handler(req('?lat=59.9&lon=10.7'))

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const upstreamUrl = String(fetchMock.mock.calls[0]?.[0])
    expect(upstreamUrl).toContain('lat=59.9')
    expect(upstreamUrl).toContain('lon=10.7')
  })
})
