export type VerdictKind = 'clear' | 'mixed' | 'clouded' | 'unknown'

export type LocationScore = {
  /** 0–100. Høyere er bedre sikt. */
  score: number
  verdict: VerdictKind
  /** Menneskelig begrunnelse, vises direkte i UI. */
  reason: string
  /** Sann når sola står så lavt at terrenget sannsynligvis avgjør. */
  terrainWarning: boolean
}
