import type { EclipseCircumstances } from '../eclipse/types'
import { compassName, formatPercent, formatTime } from '../format'

type Props = {
  circumstances: EclipseCircumstances
  timeZone: string
}

/** Nøkkeltallene for formørkelsen. Vises uavhengig av om værvarsel finnes. */
export function EclipseFacts({ circumstances, timeZone }: Props) {
  const { peak, obscuration } = circumstances
  return (
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
  )
}
