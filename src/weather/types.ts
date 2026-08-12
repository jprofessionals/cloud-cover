export type CloudSample = {
  time: Date
  /** Prosent, 0–100. */
  low: number
  mid: number
  high: number
}

export type ForecastSource = 'met' | 'open-meteo'

export type CloudForecast = {
  source: ForecastSource
  samples: CloudSample[]
}

export type Point = { lat: number; lon: number }
