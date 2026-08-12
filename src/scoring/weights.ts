import type { CloudSample } from '../weather/types'

export type LayerWeights = { low: number; mid: number; high: number }

/**
 * Vektene flyttes av solhøyden. Ved lav sol går siktlinjen titalls kilometer
 * nesten vannrett gjennom hvert skylag, så selv tynn cirrus blir ugjennomtrengelig.
 * Ved høy sol ser man ofte sola tvers gjennom cirrus.
 */
export function layerWeights(sunAltitude: number): LayerWeights {
  if (sunAltitude >= 30) return { low: 1, mid: 0.85, high: 0.45 }
  if (sunAltitude >= 10) return { low: 1, mid: 0.9, high: 0.55 }
  if (sunAltitude >= 3) return { low: 1, mid: 0.95, high: 0.7 }
  return { low: 1, mid: 1, high: 0.85 }
}

export function scoreSample(sample: CloudSample, sunAltitude: number): number {
  const w = layerWeights(sunAltitude)
  const transmitted =
    (1 - (sample.low / 100) * w.low) *
    (1 - (sample.mid / 100) * w.mid) *
    (1 - (sample.high / 100) * w.high)
  return Math.max(0, Math.min(100, transmitted * 100))
}
