export type EclipseKind = 'partial' | 'annular' | 'total'

export type EclipseEventPoint = {
  time: Date
  /** Grader over horisonten, korrigert for refraksjon. */
  sunAltitude: number
  /** Grader fra nord, med klokka. */
  sunAzimuth: number
}

export type EclipseCircumstances = {
  kind: EclipseKind
  /** Andel av solskiva dekket ved maks, 0–1. */
  obscuration: number
  partialBegin: EclipseEventPoint
  peak: EclipseEventPoint
  partialEnd: EclipseEventPoint
}
