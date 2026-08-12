import type { CloudSample } from './types'

function lerp(a: number, b: number, f: number): number {
  return a + (b - a) * f
}

/**
 * Open-Meteo og MET gir skylag time for time. minutely_15 dekker ikke skylag i
 * alle modeller, så vi interpolerer i stedet. Scoringen får dermed alltid jevne
 * steg uansett kilde.
 */
export function resample(samples: CloudSample[], stepMinutes: number): CloudSample[] {
  if (samples.length <= 1) return samples
  const sorted = [...samples].sort((a, b) => a.time.getTime() - b.time.getTime())
  const step = stepMinutes * 60_000
  const start = sorted[0].time.getTime()
  const end = sorted[sorted.length - 1].time.getTime()

  const out: CloudSample[] = []
  let index = 0
  for (let t = start; t <= end; t += step) {
    while (index < sorted.length - 2 && sorted[index + 1].time.getTime() < t) index++
    const a = sorted[index]
    const b = sorted[index + 1]
    const span = b.time.getTime() - a.time.getTime()
    const f = span === 0 ? 0 : (t - a.time.getTime()) / span
    out.push({
      time: new Date(t),
      low: lerp(a.low, b.low, f),
      mid: lerp(a.mid, b.mid, f),
      high: lerp(a.high, b.high, f),
    })
  }
  return out
}
