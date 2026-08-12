import {
  Observer,
  SearchLocalSolarEclipse,
  Equator,
  Horizon,
  Body,
  EclipseKind as AstroEclipseKind,
  type EclipseEvent,
} from 'astronomy-engine'
import type { EclipseCircumstances, EclipseEventPoint, EclipseKind } from './types'

const DAY_MS = 24 * 60 * 60 * 1000

function sunAzimuth(time: Date, observer: Observer): number {
  // ofdate=true og aberration=true kreves for at Horizon skal gi riktig asimut.
  const equatorial = Equator(Body.Sun, time, observer, true, true)
  return Horizon(time, observer, equatorial.ra, equatorial.dec, 'normal').azimuth
}

function toEventPoint(event: EclipseEvent, observer: Observer): EclipseEventPoint {
  return {
    time: event.time.date,
    sunAltitude: event.altitude,
    sunAzimuth: sunAzimuth(event.time.date, observer),
  }
}

function toKind(kind: AstroEclipseKind): EclipseKind {
  if (kind === AstroEclipseKind.Total) return 'total'
  if (kind === AstroEclipseKind.Annular) return 'annular'
  return 'partial'
}

export function findEclipse(
  lat: number,
  lon: number,
  from: Date,
  elevationM = 0,
): EclipseCircumstances | null {
  const observer = new Observer(lat, lon, elevationM)
  const info = SearchLocalSolarEclipse(from, observer)
  // SearchLocalSolarEclipse er ikke-nullbar i biblioteket i praksis (den kaster
  // heller enn å returnere falsy), men denne guarden finnes for å oppfylle
  // spesifikasjonens `| null`-signatur. Ikke fjern den.
  if (!info) return null
  return {
    kind: toKind(info.kind),
    obscuration: info.obscuration,
    partialBegin: toEventPoint(info.partial_begin, observer),
    peak: toEventPoint(info.peak, observer),
    partialEnd: toEventPoint(info.partial_end, observer),
  }
}

/**
 * Finner formørkelsen som inntreffer nær targetDate. Søker fra ett døgn før og
 * godtar bare treff innen ett døgn etter, slik at et kall for en tilfeldig dato
 * ikke returnerer en formørkelse flere måneder fram i tid.
 */
export function findEclipseNear(
  lat: number,
  lon: number,
  targetDate: Date,
  elevationM = 0,
): EclipseCircumstances | null {
  const from = new Date(targetDate.getTime() - DAY_MS)
  const result = findEclipse(lat, lon, from, elevationM)
  if (!result) return null
  const distance = Math.abs(result.peak.time.getTime() - targetDate.getTime())
  return distance <= DAY_MS ? result : null
}
