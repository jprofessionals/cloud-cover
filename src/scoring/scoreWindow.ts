import type { CloudSample } from '../weather/types'
import type { EclipseCircumstances } from '../eclipse/types'
import type { LocationScore, VerdictKind } from './types'
import { scoreSample } from './weights'

const TERRAIN_ALTITUDE_LIMIT = 3

function verdictFor(score: number): VerdictKind {
  if (score >= 70) return 'clear'
  if (score >= 40) return 'mixed'
  return 'clouded'
}

/**
 * Lineær interpolasjon av solhøyde mellom kontakttidene. Eksportert fordi
 * tidslinjen i UI-et fargelegger hvert steg med samme solhøyde som scoringen
 * bruker; to kopier av denne ville kunne gli fra hverandre.
 */
export function altitudeAt(time: Date, c: EclipseCircumstances): number {
  const t = time.getTime()
  const peak = c.peak.time.getTime()
  if (t <= peak) {
    const begin = c.partialBegin.time.getTime()
    const f = peak === begin ? 1 : (t - begin) / (peak - begin)
    return c.partialBegin.sunAltitude + f * (c.peak.sunAltitude - c.partialBegin.sunAltitude)
  }
  const end = c.partialEnd.time.getTime()
  const f = end === peak ? 0 : (t - peak) / (end - peak)
  return c.peak.sunAltitude + f * (c.partialEnd.sunAltitude - c.peak.sunAltitude)
}

/** Trekantvekt: 1 ved maks, fallende mot 0 ved kontakttidene. */
function timeWeight(time: Date, c: EclipseCircumstances): number {
  const t = time.getTime()
  const peak = c.peak.time.getTime()
  const half = t <= peak
    ? peak - c.partialBegin.time.getTime()
    : c.partialEnd.time.getTime() - peak
  if (half <= 0) return 1
  return Math.max(0, 1 - Math.abs(t - peak) / half)
}

function dominantLayer(samples: CloudSample[]): string | null {
  const mean = (pick: (s: CloudSample) => number) =>
    samples.reduce((sum, s) => sum + pick(s), 0) / samples.length
  const layers = [
    { name: 'lave skyer', value: mean((s) => s.low) },
    { name: 'middels høye skyer', value: mean((s) => s.mid) },
    { name: 'høye skyer', value: mean((s) => s.high) },
  ].sort((a, b) => b.value - a.value)
  return layers[0].value >= 25 ? layers[0].name : null
}

export function scoreWindow(
  samples: CloudSample[],
  circumstances: EclipseCircumstances,
): LocationScore {
  const terrainWarning = circumstances.peak.sunAltitude < TERRAIN_ALTITUDE_LIMIT
  const from = circumstances.partialBegin.time.getTime()
  const to = circumstances.partialEnd.time.getTime()
  const inWindow = samples.filter((s) => s.time.getTime() >= from && s.time.getTime() <= to)

  if (inWindow.length === 0) {
    return {
      score: 0,
      verdict: 'unknown',
      reason: 'Ingen skydata for dette tidsrommet.',
      terrainWarning,
    }
  }

  let weighted = 0
  let totalWeight = 0
  for (const sample of inWindow) {
    // Vekten er 0 nøyaktig ved kontakttidene; +0.05 hindrer at randprøvene
    // faller helt ut og at totalWeight blir 0 for et vindu med to prøver.
    const w = timeWeight(sample.time, circumstances) + 0.05
    weighted += scoreSample(sample, altitudeAt(sample.time, circumstances)) * w
    totalWeight += w
  }
  const score = Math.round(weighted / totalWeight)
  const layer = dominantLayer(inWindow)

  let reason: string
  if (score >= 70) {
    reason = layer
      ? `Stort sett klart, noe ${layer}.`
      : 'Klar himmel gjennom hele formørkelsen.'
  } else if (score >= 40) {
    reason = layer ? `Vekslende, med ${layer} i veien.` : 'Vekslende skydekke.'
  } else {
    reason = layer ? `Tett ${layer} gjennom formørkelsen.` : 'Overskyet.'
  }
  if (terrainWarning) {
    reason += ' Sola står så lavt at terrenget i solretningen trolig avgjør.'
  }

  return { score, verdict: verdictFor(score), reason, terrainWarning }
}
