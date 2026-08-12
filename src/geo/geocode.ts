const ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search'

export type Place = {
  name: string
  region: string
  lat: number
  lon: number
  elevation: number
  timezone: string
}

type RawResult = {
  name: string
  latitude: number
  longitude: number
  elevation?: number
  timezone?: string
  country?: string
  admin1?: string
}

export function parseGeocoding(json: unknown): Place[] {
  const results = (json as { results?: RawResult[] } | null)?.results
  if (!Array.isArray(results)) return []
  return results.map((r) => ({
    name: r.name,
    region: [r.admin1, r.country].filter(Boolean).join(', '),
    lat: r.latitude,
    lon: r.longitude,
    elevation: r.elevation ?? 0,
    timezone: r.timezone ?? 'Europe/Oslo',
  }))
}

export async function searchPlaces(query: string): Promise<Place[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []
  const params = new URLSearchParams({
    name: trimmed,
    count: '5',
    language: 'no',
    format: 'json',
  })
  const response = await fetch(`${ENDPOINT}?${params}`)
  if (!response.ok) throw new Error(`Stedssøk svarte ${response.status}`)
  return parseGeocoding(await response.json())
}
