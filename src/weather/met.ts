import type { CloudForecast, CloudSample, Point } from './types'

type MetDetails = {
  cloud_area_fraction_low?: number
  cloud_area_fraction_medium?: number
  cloud_area_fraction_high?: number
}

type MetEntry = {
  time: string
  data?: { instant?: { details?: MetDetails } }
}

export function parseMet(json: unknown): CloudForecast {
  const series = (json as { properties?: { timeseries?: unknown } } | null)
    ?.properties?.timeseries
  if (!Array.isArray(series)) {
    throw new Error('Uventet svar fra MET')
  }

  const samples: CloudSample[] = []
  for (const entry of series as MetEntry[]) {
    const details = entry.data?.instant?.details
    // MET slutter å levere skylag lenger ut i serien; de stegene hoppes over
    // heller enn å bli tolket som skyfritt.
    if (
      details?.cloud_area_fraction_low === undefined ||
      details.cloud_area_fraction_medium === undefined ||
      details.cloud_area_fraction_high === undefined
    ) {
      continue
    }
    samples.push({
      time: new Date(entry.time),
      low: details.cloud_area_fraction_low,
      mid: details.cloud_area_fraction_medium,
      high: details.cloud_area_fraction_high,
    })
  }
  return { source: 'met', samples }
}

export async function fetchMet(point: Point): Promise<CloudForecast> {
  const params = new URLSearchParams({
    lat: point.lat.toFixed(4),
    lon: point.lon.toFixed(4),
  })
  const response = await fetch(`/api/met?${params}`)
  if (!response.ok) {
    throw new Error(`MET svarte ${response.status}`)
  }
  return parseMet(await response.json())
}
