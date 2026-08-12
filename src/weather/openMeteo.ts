import type { CloudForecast, CloudSample, Point } from './types'

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast'

type HourlyBlock = {
  time: string[]
  cloud_cover_low: number[]
  cloud_cover_mid: number[]
  cloud_cover_high: number[]
}

function isLocation(value: unknown): value is { hourly: HourlyBlock } {
  const hourly = (value as { hourly?: { time?: unknown } } | null)?.hourly
  return Array.isArray(hourly?.time)
}

function toSamples(hourly: HourlyBlock): CloudSample[] {
  return hourly.time.map((iso, i) => ({
    // Open-Meteo returnerer "2026-08-12T18:00" uten sone når timezone=UTC,
    // så vi legger til sekunder og Z-suffiks direkte.
    time: new Date(`${iso}:00Z`),
    low: hourly.cloud_cover_low[i],
    mid: hourly.cloud_cover_mid[i],
    high: hourly.cloud_cover_high[i],
  }))
}

export function parseOpenMeteo(json: unknown): CloudForecast[] {
  const locations = Array.isArray(json) ? json : [json]
  if (!locations.every(isLocation)) {
    throw new Error('Uventet svar fra Open-Meteo')
  }
  return locations.map((location) => ({
    source: 'open-meteo' as const,
    samples: toSamples(location.hourly),
  }))
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export async function fetchOpenMeteo(points: Point[], date: Date): Promise<CloudForecast[]> {
  if (points.length === 0) return []
  const params = new URLSearchParams({
    latitude: points.map((p) => p.lat.toFixed(4)).join(','),
    longitude: points.map((p) => p.lon.toFixed(4)).join(','),
    hourly: 'cloud_cover_low,cloud_cover_mid,cloud_cover_high',
    start_date: isoDate(date),
    end_date: isoDate(date),
    timezone: 'UTC',
    cell_selection: 'land',
  })
  const response = await fetch(`${ENDPOINT}?${params}`)
  if (!response.ok) {
    throw new Error(`Open-Meteo svarte ${response.status}`)
  }
  return parseOpenMeteo(await response.json())
}
