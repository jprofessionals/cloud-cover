import type { EclipseCircumstances } from '../eclipse/types'
import type { CloudSample } from '../weather/types'
import { altitudeAt, verdictFor } from '../scoring/scoreWindow'
import { scoreSample } from '../scoring/weights'
import { formatTime } from '../format'

type Props = {
  samples: CloudSample[]
  circumstances: EclipseCircumstances
  timeZone: string
}

function colorFor(score: number): string {
  switch (verdictFor(score)) {
    case 'clear':
      return 'var(--clear)'
    case 'mixed':
      return 'var(--mixed)'
    case 'clouded':
      return 'var(--clouded)'
    case 'unknown':
      // verdictFor never returns 'unknown' for a numeric score, but VerdictKind
      // includes it; --mixed reads as "uncertain" rather than a false clear/clouded claim.
      return 'var(--mixed)'
  }
}

export function Timeline({ samples, circumstances, timeZone }: Props) {
  return (
    <section className="timeline">
      <h2>Gjennom formørkelsen</h2>
      <div className="timeline__bars" role="img" aria-label="Skydekke gjennom formørkelsen">
        {samples.map((sample) => {
          const score = scoreSample(sample, altitudeAt(sample.time, circumstances))
          return (
            <div
              key={sample.time.toISOString()}
              className="timeline__bar"
              style={{ height: `${Math.max(4, score)}%`, background: colorFor(score) }}
              title={`${formatTime(sample.time, timeZone)} · ${Math.round(score)} av 100`}
            />
          )
        })}
      </div>
      <div className="timeline__labels">
        <span>{formatTime(circumstances.partialBegin.time, timeZone)}</span>
        <span>{formatTime(circumstances.peak.time, timeZone)}</span>
        <span>{formatTime(circumstances.partialEnd.time, timeZone)}</span>
      </div>
    </section>
  )
}
