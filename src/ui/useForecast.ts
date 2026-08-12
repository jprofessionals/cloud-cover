import { useEffect, useState } from 'react'
import { findEclipse } from '../eclipse/findEclipse'
import type { EclipseCircumstances } from '../eclipse/types'
import { scoreWindow } from '../scoring/scoreWindow'
import type { LocationScore } from '../scoring/types'
import { fetchForecast } from '../weather/fetchForecast'
import { resample } from '../weather/resample'
import type { CloudForecast, CloudSample } from '../weather/types'
import type { Place } from '../geo/geocode'

export type ForecastStatus =
  | 'idle' | 'loading' | 'ready' | 'error' | 'no-eclipse' | 'no-weather'

export type ForecastState = {
  status: ForecastStatus
  circumstances: EclipseCircumstances | null
  forecast: CloudForecast | null
  /** Prøvene innenfor formørkelsesvinduet, i 15-minutters steg. */
  windowSamples: CloudSample[]
  score: LocationScore | null
  error: string | null
}

const EMPTY: ForecastState = {
  status: 'idle',
  circumstances: null,
  forecast: null,
  windowSamples: [],
  score: null,
  error: null,
}

export function deriveState(
  circumstances: EclipseCircumstances | null,
  forecast: CloudForecast | null,
): ForecastState {
  if (!circumstances) {
    return { ...EMPTY, status: 'no-eclipse' }
  }
  if (!forecast || forecast.samples.length === 0) {
    return { ...EMPTY, status: 'no-weather', circumstances }
  }

  const stepped = resample(forecast.samples, 15)
  const from = circumstances.partialBegin.time.getTime()
  const to = circumstances.partialEnd.time.getTime()
  const windowSamples = stepped.filter(
    (s) => s.time.getTime() >= from && s.time.getTime() <= to,
  )

  if (windowSamples.length === 0) {
    // Varselet finnes, men rekker ikke fram til formørkelsen.
    return { ...EMPTY, status: 'no-weather', circumstances, forecast }
  }

  return {
    status: 'ready',
    circumstances,
    forecast,
    windowSamples,
    score: scoreWindow(windowSamples, circumstances),
    error: null,
  }
}

export function useForecast(place: Place | null): ForecastState {
  const [state, setState] = useState<ForecastState>(EMPTY)

  useEffect(() => {
    if (!place) {
      setState(EMPTY)
      return
    }
    let cancelled = false
    setState({ ...EMPTY, status: 'loading' })

    const circumstances = findEclipse(place.lat, place.lon, new Date(), place.elevation)
    if (!circumstances) {
      if (!cancelled) setState({ ...EMPTY, status: 'no-eclipse' })
      return
    }

    fetchForecast({ lat: place.lat, lon: place.lon }, circumstances.peak.time)
      .then((forecast) => {
        if (!cancelled) setState(deriveState(circumstances, forecast))
      })
      .catch((err: unknown) => {
        if (cancelled) return
        // Astronomien er fortsatt nyttig uten vær, så vi kaster den ikke.
        setState({
          ...deriveState(circumstances, null),
          status: 'error',
          error: err instanceof Error ? err.message : 'Ukjent feil',
        })
      })

    return () => {
      cancelled = true
    }
  }, [place])

  return state
}
