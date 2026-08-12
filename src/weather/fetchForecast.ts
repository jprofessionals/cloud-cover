import type { CloudForecast, Point } from './types'
import { fetchMet } from './met'
import { fetchOpenMeteo } from './openMeteo'

/**
 * MET er mest treffsikker i Norge, men dekker ikke hele kloden og kan være nede.
 * Open-Meteo er alltid tilgjengelig og brukes som reserve. Kilden følger med
 * svaret slik at UI-et kan vise hvor tallene kom fra.
 */
export async function fetchForecast(point: Point, from: Date, to: Date): Promise<CloudForecast> {
  try {
    const met = await fetchMet(point)
    if (met.samples.length > 0) return met
  } catch (err) {
    // Faller gjennom til Open-Meteo, men logg feilen så en reell bug i vår
    // egen parsing ikke forsvinner stille.
    console.warn('MET feilet, faller tilbake til Open-Meteo:', err)
  }
  const [forecast] = await fetchOpenMeteo([point], from, to)
  if (!forecast) throw new Error('Ingen skydata tilgjengelig')
  return forecast
}
