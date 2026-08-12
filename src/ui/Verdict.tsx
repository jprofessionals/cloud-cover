import type { EclipseCircumstances } from '../eclipse/types'
import type { LocationScore } from '../scoring/types'
import type { ForecastSource } from '../weather/types'
import { compassName, formatPercent, formatTime } from '../format'

const HEADLINE: Record<LocationScore['verdict'], string> = {
  clear: 'Ja, det ser bra ut',
  mixed: 'Kanskje, det veksler',
  clouded: 'Nei, overskyet',
  unknown: 'Vet ikke',
}

type Props = {
  circumstances: EclipseCircumstances
  score: LocationScore
  timeZone: string
  source: ForecastSource
}

export function Verdict({ circumstances, score, timeZone, source }: Props) {
  const { peak, obscuration } = circumstances
  return (
    <section className={`verdict verdict--${score.verdict}`}>
      <h1>{HEADLINE[score.verdict]}</h1>
      <p className="reason">{score.reason}</p>
      <dl className="facts">
        <div>
          <dt>Maks</dt>
          <dd>{formatTime(peak.time, timeZone)}</dd>
        </div>
        <div>
          <dt>Dekket</dt>
          <dd>{formatPercent(obscuration)}</dd>
        </div>
        <div>
          <dt>Solhøyde</dt>
          <dd>{peak.sunAltitude.toFixed(0)}°</dd>
        </div>
        <div>
          <dt>Se mot</dt>
          <dd>{compassName(peak.sunAzimuth)}</dd>
        </div>
      </dl>
      <p className="source">
        Skydata fra {source === 'met' ? 'MET (yr.no)' : 'Open-Meteo'}.
      </p>
    </section>
  )
}
