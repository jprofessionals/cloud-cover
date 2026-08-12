import type { CloudForecast, Point } from './types'
import { fetchMet } from './met'
import { fetchOpenMeteo } from './openMeteo'

/**
 * MET er mest treffsikker i Norge, men dekker ikke hele kloden og kan være nede.
 * Open-Meteo er alltid tilgjengelig og brukes som reserve. Kilden følger med
 * svaret slik at UI-et kan vise hvor tallene kom fra.
 */
export async function fetchForecast(point: Point, date: Date): Promise<CloudForecast> {
  try {
    const met = await fetchMet(point)
    if (met.samples.length > 0) return met
  } catch {
    // Faller gjennom til Open-Meteo.
  }
  const [forecast] = await fetchOpenMeteo([point], date)
  if (!forecast) throw new Error('Ingen skydata tilgjengelig')
  return forecast
}
