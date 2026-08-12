# Cloud Cover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En nettside som svarer på om du får sett en solformørkelse fra et gitt sted, og hvor i nærheten forholdene er bedre.

**Architecture:** Statisk Vite + React + TypeScript-app. All astronomi beregnes i nettleseren med `astronomy-engine`. Skydata hentes fra Open-Meteo direkte (har CORS) og fra MET/yr gjennom en tynn proxy, fordi nettleser-JS ikke kan sette `User-Agent`. Rene beregningsmoduler uten I/O er skilt fra API-klienter, og UI-et kjenner bare et felles `CloudForecast`-grensesnitt.

**Tech Stack:** Vite 5, React 18, TypeScript 5, Vitest, Leaflet 1.9, astronomy-engine 2.x. Ingen API-nøkler, ingen database.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-12-cloud-cover-design.md`. Ved konflikt vinner speccen.
- Node 20+. Pakkebehandler: npm.
- All kode i TypeScript med `strict: true`. Ingen `any` i modulgrensesnitt.
- Rene moduler (`eclipse`, `scoring`, `geo`, `format`) gjør **ingen** nettverkskall og importerer ikke fra `weather/` eller `ui/`.
- Tester gjør ingen nettverkskall. API-svar testes mot lagrede fixtures i `src/weather/__fixtures__/`.
- MET krever identifiserende `User-Agent`. Verdien er `cloud-cover/0.1 github.com/runarbell/cloud-cover` og settes kun på serversiden (Vite dev-proxy og Vercel-funksjon), aldri i klientkode.
- MET-endepunktet er `locationforecast/2.0/**complete**`. `compact` mangler `cloud_area_fraction_low/medium/high` og kan ikke brukes.
- MET-feltnavn er `cloud_area_fraction_medium`, ikke `_mid`. Open-Meteo-feltnavn er `cloud_cover_mid`. De to skal normaliseres til `mid` i `CloudSample`.
- Open-Meteo `/v1/forecast` returnerer et **objekt** når det sendes én koordinat, og et **array** når det sendes flere. Klienten må håndtere begge.
- Alt brukervendt tekst er på norsk bokmål.
- Commit etter hver oppgave. Meldinger på norsk, imperativ form.

## Filstruktur

| Fil | Ansvar |
|---|---|
| `src/eclipse/types.ts` | `EclipseEventPoint`, `EclipseCircumstances` |
| `src/eclipse/findEclipse.ts` | Innpakning rundt astronomy-engine |
| `src/scoring/types.ts` | `LocationScore`, `VerdictKind` |
| `src/scoring/weights.ts` | Skylagsvekter som funksjon av solhøyde |
| `src/scoring/scoreWindow.ts` | Score over formørkelsesvinduet |
| `src/geo/distance.ts` | Avstand og himmelretning |
| `src/geo/grid.ts` | Rutenettgenerering (fase 2) |
| `src/geo/geocode.ts` | Stedssøk mot Open-Meteo geocoding |
| `src/geo/useGeolocation.ts` | React-hook for nettleserposisjon |
| `src/weather/types.ts` | `CloudSample`, `CloudForecast` |
| `src/weather/resample.ts` | Timesverdier → 15-minutters steg |
| `src/weather/openMeteo.ts` | Open-Meteo-klient, én eller mange koordinater |
| `src/weather/met.ts` | MET-klient gjennom `/api/met` |
| `src/weather/fetchForecast.ts` | MET med Open-Meteo som fallback |
| `src/format/index.ts` | Tid, prosent, himmelretning til tekst |
| `src/ui/App.tsx` | Layout, tilstand, datasammenkobling |
| `src/ui/LocationPicker.tsx` | Geolokasjon og stedssøk |
| `src/ui/Verdict.tsx` | Verdikt, dekningsgrad, solhøyde |
| `src/ui/Timeline.tsx` | Tidslinje gjennom formørkelsen |
| `src/ui/NearbyList.tsx` | Topp 3 steder (fase 2) |
| `src/ui/MapPanel.tsx` | Leaflet-kart med rutenett (fase 2) |
| `api/met.ts` | Vercel-funksjon som proxyer MET |
| `vite.config.ts` | Bygg, testoppsett, dev-proxy for `/api/met` |

---

## FASE 1 — kjørbar i kveld

### Task 1: Prosjektoppsett

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/ui/App.tsx`, `src/format/index.ts`, `src/format/index.test.ts`

**Interfaces:**
- Consumes: ingenting
- Produces: `formatTime(d: Date, tz: string): string`, `formatPercent(n: number): string`, `compassName(deg: number): string`

- [ ] **Step 1: Opprett prosjektet**

```bash
npm create vite@latest . -- --template react-ts
npm install
npm install astronomy-engine leaflet
npm install -D vitest @types/leaflet jsdom @testing-library/react
```

Svar «ignore files and continue» hvis Vite spør om katalogen ikke er tom.

- [ ] **Step 2: Konfigurer Vite, tester og dev-proxy**

Erstatt `vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const MET_USER_AGENT = 'cloud-cover/0.1 github.com/runarbell/cloud-cover'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // MET krever en identifiserende User-Agent, som nettleser-JS ikke får sette.
      // I dev løser vi det her; i produksjon gjør api/met.ts det samme.
      '/api/met': {
        target: 'https://api.met.no',
        changeOrigin: true,
        headers: { 'User-Agent': MET_USER_AGENT },
        rewrite: (path) =>
          path.replace(/^\/api\/met/, '/weatherapi/locationforecast/2.0/complete'),
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
```

Legg til i `tsconfig.json` under `compilerOptions`: `"types": ["vitest/globals"]`.

Legg til i `package.json` under `scripts`: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 3: Skriv den feilende testen**

`src/format/index.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { formatPercent, compassName } from './index'

describe('formatPercent', () => {
  it('runder til nærmeste hele prosent', () => {
    expect(formatPercent(0.874)).toBe('87 %')
  })
})

describe('compassName', () => {
  it('gir nord for 0 grader', () => {
    expect(compassName(0)).toBe('nord')
  })
  it('gir vest for 270 grader', () => {
    expect(compassName(270)).toBe('vest')
  })
  it('gir nordvest for 315 grader', () => {
    expect(compassName(315)).toBe('nordvest')
  })
  it('håndterer verdier over 360', () => {
    expect(compassName(361)).toBe('nord')
  })
})
```

- [ ] **Step 4: Kjør testen og se at den feiler**

Run: `npm test`
Expected: FAIL, `Failed to resolve import "./index"`

- [ ] **Step 5: Skriv minimal implementasjon**

`src/format/index.ts`:

```ts
const COMPASS = [
  'nord', 'nordøst', 'øst', 'sørøst',
  'sør', 'sørvest', 'vest', 'nordvest',
] as const

export function compassName(degrees: number): string {
  const normalized = ((degrees % 360) + 360) % 360
  const index = Math.round(normalized / 45) % 8
  return COMPASS[index]
}

export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)} %`
}

export function formatTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('nb-NO', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(date)
}
```

- [ ] **Step 6: Kjør testen og se at den passerer**

Run: `npm test`
Expected: PASS, 4 tester

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Sett opp Vite, Vitest og formateringsmodul"
```

---

### Task 2: Formørkelsesmotor

**Files:**
- Create: `src/eclipse/types.ts`, `src/eclipse/findEclipse.ts`, `src/eclipse/findEclipse.test.ts`

**Interfaces:**
- Consumes: ingenting
- Produces:
  - `type EclipseEventPoint = { time: Date; sunAltitude: number; sunAzimuth: number }`
  - `type EclipseCircumstances = { kind: 'partial'|'annular'|'total'; obscuration: number; partialBegin: EclipseEventPoint; peak: EclipseEventPoint; partialEnd: EclipseEventPoint }`
  - `findEclipse(lat: number, lon: number, from: Date, elevationM?: number): EclipseCircumstances | null`
  - `findEclipseNear(lat: number, lon: number, targetDate: Date, elevationM?: number): EclipseCircumstances | null`

- [ ] **Step 1: Skriv typene**

`src/eclipse/types.ts`:

```ts
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
```

- [ ] **Step 2: Skriv den feilende testen**

`src/eclipse/findEclipse.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { findEclipse, findEclipseNear } from './findEclipse'

const OSLO = { lat: 59.91, lon: 10.75 }

describe('findEclipse', () => {
  it('finner formørkelsen 12. august 2026 fra Oslo', () => {
    const result = findEclipseNear(OSLO.lat, OSLO.lon, new Date('2026-08-12T12:00:00Z'))
    expect(result).not.toBeNull()
    expect(result!.kind).toBe('partial')
    expect(result!.peak.time.toISOString().slice(0, 10)).toBe('2026-08-12')
  })

  it('gir kontakttider i riktig rekkefølge', () => {
    const r = findEclipseNear(OSLO.lat, OSLO.lon, new Date('2026-08-12T12:00:00Z'))!
    expect(r.partialBegin.time.getTime()).toBeLessThan(r.peak.time.getTime())
    expect(r.peak.time.getTime()).toBeLessThan(r.partialEnd.time.getTime())
  })

  it('gir dekningsgrad mellom 0 og 1', () => {
    const r = findEclipseNear(OSLO.lat, OSLO.lon, new Date('2026-08-12T12:00:00Z'))!
    expect(r.obscuration).toBeGreaterThan(0)
    expect(r.obscuration).toBeLessThanOrEqual(1)
  })

  it('gir en asimut i vestlig sektor når sola går ned i vest', () => {
    const r = findEclipseNear(OSLO.lat, OSLO.lon, new Date('2026-08-12T12:00:00Z'))!
    expect(r.peak.sunAzimuth).toBeGreaterThan(240)
    expect(r.peak.sunAzimuth).toBeLessThan(320)
  })

  it('returnerer null når ingen formørkelse finnes nær datoen', () => {
    const result = findEclipseNear(OSLO.lat, OSLO.lon, new Date('2026-06-01T12:00:00Z'))
    expect(result).toBeNull()
  })

  it('finner en framtidig formørkelse fra vilkårlig startdato', () => {
    const result = findEclipse(OSLO.lat, OSLO.lon, new Date('2026-01-01T00:00:00Z'))
    expect(result).not.toBeNull()
    expect(result!.peak.time.getTime()).toBeGreaterThan(Date.parse('2026-01-01T00:00:00Z'))
  })
})
```

- [ ] **Step 3: Kjør testen og se at den feiler**

Run: `npx vitest run src/eclipse`
Expected: FAIL, `Failed to resolve import "./findEclipse"`

- [ ] **Step 4: Skriv implementasjonen**

`src/eclipse/findEclipse.ts`:

```ts
import {
  Observer,
  SearchLocalSolarEclipse,
  Equator,
  Horizon,
  Body,
  EclipseKind as AstroEclipseKind,
} from 'astronomy-engine'
import type { EclipseCircumstances, EclipseEventPoint, EclipseKind } from './types'

const DAY_MS = 24 * 60 * 60 * 1000

function sunAzimuth(time: Date, observer: Observer): number {
  // ofdate=true og aberration=true kreves for at Horizon skal gi riktig asimut.
  const equatorial = Equator(Body.Sun, time, observer, true, true)
  return Horizon(time, observer, equatorial.ra, equatorial.dec, 'normal').azimuth
}

function toEventPoint(
  event: { time: { date: Date }; altitude: number },
  observer: Observer,
): EclipseEventPoint {
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
  if (!info) return null
  return {
    kind: toKind(info.kind),
    obscuration: info.obscuration,
    partialBegin: toEventPoint(info.partialBegin, observer),
    peak: toEventPoint(info.peak, observer),
    partialEnd: toEventPoint(info.partialEnd, observer),
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
```

- [ ] **Step 5: Kjør testene**

Run: `npx vitest run src/eclipse`
Expected: PASS, 6 tester

Feiler `toKind`-importen, se på `node_modules/astronomy-engine/index.d.ts` for det faktiske navnet på enum-verdiene og juster. Enum-medlemmene heter `Total`, `Annular`, `Partial`, `None`.

- [ ] **Step 6: Verifiser mot ekstern fasit og lås testen**

Dette er det eneste steget i planen som krever manuell kontroll, og det er verdt det: hele appen hviler på at denne modulen er riktig.

```bash
npx tsx -e "import('./src/eclipse/findEclipse.ts').then(m => console.log(JSON.stringify(m.findEclipseNear(59.91, 10.75, new Date('2026-08-12T12:00:00Z')), null, 2)))"
```

Sammenlign kontakttider og dekningsgrad med `timeanddate.no/formorkelse/sol/2026-august-12` for Oslo. Avvik skal være under ett minutt. Legg deretter til en gyllen test med de verifiserte verdiene:

```ts
it('treffer verifiserte kontakttider for Oslo', () => {
  const r = findEclipseNear(OSLO.lat, OSLO.lon, new Date('2026-08-12T12:00:00Z'))!
  // Verdier verifisert mot timeanddate.no 2026-08-12. Toleranse ±60 sekunder.
  const peakUtc = Date.parse('SETT_INN_VERIFISERT_ISO_TID')
  expect(Math.abs(r.peak.time.getTime() - peakUtc)).toBeLessThan(60_000)
  expect(r.obscuration).toBeCloseTo(SETT_INN_VERIFISERT_DEKNING, 2)
})
```

Erstatt de to plassholderne med de faktiske verdiene før du committer. Testen skal ikke committes med plassholdere i seg.

- [ ] **Step 7: Commit**

```bash
git add src/eclipse
git commit -m "Legg til formørkelsesmotor basert på astronomy-engine"
```

---

### Task 3: Scoringsmodellen

**Files:**
- Create: `src/scoring/types.ts`, `src/scoring/weights.ts`, `src/scoring/weights.test.ts`, `src/scoring/scoreWindow.ts`, `src/scoring/scoreWindow.test.ts`

**Interfaces:**
- Consumes: `CloudSample` fra Task 4 (definer typen her midlertidig hvis Task 4 ikke er gjort; den er identisk)
- Produces:
  - `type VerdictKind = 'clear'|'mixed'|'clouded'|'unknown'`
  - `type LocationScore = { score: number; verdict: VerdictKind; reason: string; terrainWarning: boolean }`
  - `layerWeights(sunAltitude: number): { low: number; mid: number; high: number }`
  - `scoreSample(sample: CloudSample, sunAltitude: number): number`
  - `scoreWindow(samples: CloudSample[], circumstances: EclipseCircumstances): LocationScore`

- [ ] **Step 1: Skriv den feilende vekttesten**

`src/scoring/weights.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { layerWeights, scoreSample } from './weights'

describe('layerWeights', () => {
  it('vekter cirrus lavt når sola står høyt', () => {
    expect(layerWeights(45).high).toBe(0.45)
  })
  it('vekter cirrus høyt når sola står lavt', () => {
    expect(layerWeights(1).high).toBe(0.85)
  })
  it('vekter lave skyer absolutt uansett solhøyde', () => {
    expect(layerWeights(45).low).toBe(1)
    expect(layerWeights(1).low).toBe(1)
  })
  it('bruker grensene inklusivt nedenfra', () => {
    expect(layerWeights(10).mid).toBe(0.9)
    expect(layerWeights(9.99).mid).toBe(0.95)
    expect(layerWeights(3).mid).toBe(0.95)
    expect(layerWeights(2.99).mid).toBe(1)
  })
})

describe('scoreSample', () => {
  it('gir full score ved skyfri himmel', () => {
    expect(scoreSample({ time: new Date(), low: 0, mid: 0, high: 0 }, 20)).toBe(100)
  })
  it('gir null score ved tett lavt skydekke', () => {
    expect(scoreSample({ time: new Date(), low: 100, mid: 0, high: 0 }, 20)).toBe(0)
  })
  it('kombinerer lag multiplikativt, ikke additivt', () => {
    // To lag på 50 % skal ikke gi 0. Med wM=0.9 og wH=0.55 ved 20 grader:
    // blokkert = 1 - (1-0.5*0.9)(1-0.5*0.55) = 1 - 0.55*0.725 = 0.60125
    const s = scoreSample({ time: new Date(), low: 0, mid: 50, high: 50 }, 20)
    expect(s).toBeCloseTo(39.875, 2)
  })
})
```

- [ ] **Step 2: Kjør og se at den feiler**

Run: `npx vitest run src/scoring`
Expected: FAIL, `Failed to resolve import "./weights"`

- [ ] **Step 3: Implementer vektene**

`src/scoring/weights.ts`:

```ts
import type { CloudSample } from '../weather/types'

export type LayerWeights = { low: number; mid: number; high: number }

/**
 * Vektene flyttes av solhøyden. Ved lav sol går siktlinjen titalls kilometer
 * nesten vannrett gjennom hvert skylag, så selv tynn cirrus blir ugjennomtrengelig.
 * Ved høy sol ser man ofte sola tvers gjennom cirrus.
 */
export function layerWeights(sunAltitude: number): LayerWeights {
  if (sunAltitude >= 30) return { low: 1, mid: 0.85, high: 0.45 }
  if (sunAltitude >= 10) return { low: 1, mid: 0.9, high: 0.55 }
  if (sunAltitude >= 3) return { low: 1, mid: 0.95, high: 0.7 }
  return { low: 1, mid: 1, high: 0.85 }
}

export function scoreSample(sample: CloudSample, sunAltitude: number): number {
  const w = layerWeights(sunAltitude)
  const transmitted =
    (1 - (sample.low / 100) * w.low) *
    (1 - (sample.mid / 100) * w.mid) *
    (1 - (sample.high / 100) * w.high)
  return Math.max(0, Math.min(100, transmitted * 100))
}
```

- [ ] **Step 4: Kjør og se at vekttestene passerer**

Run: `npx vitest run src/scoring/weights`
Expected: PASS, 7 tester

- [ ] **Step 5: Skriv den feilende vindustesten**

`src/scoring/scoreWindow.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { scoreWindow } from './scoreWindow'
import type { EclipseCircumstances } from '../eclipse/types'
import type { CloudSample } from '../weather/types'

function circumstances(peakAltitude: number): EclipseCircumstances {
  const point = (iso: string, alt: number) => ({
    time: new Date(iso),
    sunAltitude: alt,
    sunAzimuth: 280,
  })
  return {
    kind: 'partial',
    obscuration: 0.87,
    partialBegin: point('2026-08-12T17:40:00Z', peakAltitude + 6),
    peak: point('2026-08-12T18:30:00Z', peakAltitude),
    partialEnd: point('2026-08-12T19:20:00Z', Math.max(0, peakAltitude - 6)),
  }
}

function samples(low: number, mid = 0, high = 0): CloudSample[] {
  const out: CloudSample[] = []
  for (let t = Date.parse('2026-08-12T17:30:00Z'); t <= Date.parse('2026-08-12T19:30:00Z'); t += 15 * 60_000) {
    out.push({ time: new Date(t), low, mid, high })
  }
  return out
}

describe('scoreWindow', () => {
  it('gir clear ved skyfri himmel', () => {
    const r = scoreWindow(samples(0), circumstances(9))
    expect(r.verdict).toBe('clear')
    expect(r.score).toBeGreaterThanOrEqual(70)
  })

  it('gir clouded ved tett lavt skydekke', () => {
    const r = scoreWindow(samples(95), circumstances(9))
    expect(r.verdict).toBe('clouded')
  })

  it('gir unknown når det ikke finnes prøver i vinduet', () => {
    const r = scoreWindow([], circumstances(9))
    expect(r.verdict).toBe('unknown')
    expect(r.reason).toContain('Ingen skydata')
  })

  it('setter terrengvarsel når sola står under 3 grader ved maks', () => {
    const r = scoreWindow(samples(0), circumstances(2))
    expect(r.terrainWarning).toBe(true)
  })

  it('setter ikke terrengvarsel når sola står høyt nok', () => {
    const r = scoreWindow(samples(0), circumstances(9))
    expect(r.terrainWarning).toBe(false)
  })

  it('vekter maks tyngre enn kontakttidene', () => {
    // Skyfritt ved maks, overskyet i kantene, skal slå det motsatte.
    const clearAtPeak = samples(0).map((s) => ({
      ...s,
      low: Math.abs(s.time.getTime() - Date.parse('2026-08-12T18:30:00Z')) > 30 * 60_000 ? 100 : 0,
    }))
    const cloudyAtPeak = clearAtPeak.map((s) => ({ ...s, low: 100 - s.low }))
    expect(scoreWindow(clearAtPeak, circumstances(9)).score)
      .toBeGreaterThan(scoreWindow(cloudyAtPeak, circumstances(9)).score)
  })

  it('begrunner svaret med det dominerende skylaget', () => {
    const r = scoreWindow(samples(0, 0, 90), circumstances(20))
    expect(r.reason).toContain('høye skyer')
  })
})
```

- [ ] **Step 6: Kjør og se at den feiler**

Run: `npx vitest run src/scoring/scoreWindow`
Expected: FAIL, `Failed to resolve import "./scoreWindow"`

- [ ] **Step 7: Implementer scoreWindow**

`src/scoring/types.ts`:

```ts
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
```

`src/scoring/scoreWindow.ts`:

```ts
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

/** Lineær interpolasjon av solhøyde mellom kontakttidene. */
function altitudeAt(time: Date, c: EclipseCircumstances): number {
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
```

- [ ] **Step 8: Kjør alle scoringstester**

Run: `npx vitest run src/scoring`
Expected: PASS, 14 tester

- [ ] **Step 9: Commit**

```bash
git add src/scoring
git commit -m "Legg til scoringsmodell vektet etter solhøyde"
```

---

### Task 4: Værtyper, resampling og Open-Meteo-klient

**Files:**
- Create: `src/weather/types.ts`, `src/weather/resample.ts`, `src/weather/resample.test.ts`, `src/weather/openMeteo.ts`, `src/weather/openMeteo.test.ts`, `src/weather/__fixtures__/open-meteo-single.json`, `src/weather/__fixtures__/open-meteo-multi.json`

**Interfaces:**
- Consumes: ingenting
- Produces:
  - `type CloudSample = { time: Date; low: number; mid: number; high: number }`
  - `type CloudForecast = { source: 'met'|'open-meteo'; samples: CloudSample[] }`
  - `resample(samples: CloudSample[], stepMinutes: number): CloudSample[]`
  - `parseOpenMeteo(json: unknown): CloudForecast[]`
  - `fetchOpenMeteo(points: {lat:number;lon:number}[], date: Date): Promise<CloudForecast[]>`

- [ ] **Step 1: Lagre fixtures fra ekte API**

```bash
mkdir -p src/weather/__fixtures__
curl -s "https://api.open-meteo.com/v1/forecast?latitude=59.91&longitude=10.75&hourly=cloud_cover_low,cloud_cover_mid,cloud_cover_high&forecast_days=1&timezone=UTC&cell_selection=land" -o src/weather/__fixtures__/open-meteo-single.json
```

```bash
curl -s "https://api.open-meteo.com/v1/forecast?latitude=59.91,60.05&longitude=10.75,10.30&hourly=cloud_cover_low,cloud_cover_mid,cloud_cover_high&forecast_days=1&timezone=UTC&cell_selection=land" -o src/weather/__fixtures__/open-meteo-multi.json
```

Åpne begge og bekreft forskjellen: den første er et objekt, den andre et array. Klienten må tåle begge.

- [ ] **Step 2: Skriv typene**

`src/weather/types.ts`:

```ts
export type CloudSample = {
  time: Date
  /** Prosent, 0–100. */
  low: number
  mid: number
  high: number
}

export type ForecastSource = 'met' | 'open-meteo'

export type CloudForecast = {
  source: ForecastSource
  samples: CloudSample[]
}

export type Point = { lat: number; lon: number }
```

- [ ] **Step 3: Skriv den feilende resample-testen**

`src/weather/resample.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resample } from './resample'
import type { CloudSample } from './types'

const hourly: CloudSample[] = [
  { time: new Date('2026-08-12T18:00:00Z'), low: 0, mid: 0, high: 0 },
  { time: new Date('2026-08-12T19:00:00Z'), low: 100, mid: 40, high: 20 },
]

describe('resample', () => {
  it('gir fire steg per time', () => {
    expect(resample(hourly, 15)).toHaveLength(5)
  })

  it('interpolerer lineært mellom timesverdier', () => {
    const out = resample(hourly, 15)
    expect(out[1].time.toISOString()).toBe('2026-08-12T18:15:00.000Z')
    expect(out[1].low).toBeCloseTo(25, 5)
    expect(out[2].low).toBeCloseTo(50, 5)
  })

  it('beholder endepunktene uendret', () => {
    const out = resample(hourly, 15)
    expect(out[0].low).toBe(0)
    expect(out[out.length - 1].low).toBe(100)
  })

  it('returnerer tom liste for tom inndata', () => {
    expect(resample([], 15)).toEqual([])
  })

  it('returnerer den ene prøven uendret når det bare finnes én', () => {
    expect(resample([hourly[0]], 15)).toEqual([hourly[0]])
  })
})
```

- [ ] **Step 4: Kjør og se at den feiler**

Run: `npx vitest run src/weather/resample`
Expected: FAIL, `Failed to resolve import "./resample"`

- [ ] **Step 5: Implementer resample**

`src/weather/resample.ts`:

```ts
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
```

- [ ] **Step 6: Kjør og se at den passerer**

Run: `npx vitest run src/weather/resample`
Expected: PASS, 5 tester

- [ ] **Step 7: Skriv den feilende Open-Meteo-testen**

`src/weather/openMeteo.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseOpenMeteo } from './openMeteo'
import single from './__fixtures__/open-meteo-single.json'
import multi from './__fixtures__/open-meteo-multi.json'

describe('parseOpenMeteo', () => {
  it('tåler objektsvaret for én koordinat', () => {
    const result = parseOpenMeteo(single)
    expect(result).toHaveLength(1)
    expect(result[0].source).toBe('open-meteo')
    expect(result[0].samples.length).toBeGreaterThan(0)
  })

  it('tåler arraysvaret for flere koordinater', () => {
    expect(parseOpenMeteo(multi)).toHaveLength(2)
  })

  it('gir Date-objekter og tall i prosent', () => {
    const first = parseOpenMeteo(single)[0].samples[0]
    expect(first.time).toBeInstanceOf(Date)
    expect(first.low).toBeGreaterThanOrEqual(0)
    expect(first.low).toBeLessThanOrEqual(100)
  })

  it('tolker tidene som UTC', () => {
    const first = parseOpenMeteo(single)[0].samples[0]
    expect(first.time.toISOString()).toMatch(/T00:00:00\.000Z$/)
  })

  it('kaster ved uventet form', () => {
    expect(() => parseOpenMeteo({ nope: true })).toThrow(/Uventet svar/)
  })
})
```

- [ ] **Step 8: Kjør og se at den feiler**

Run: `npx vitest run src/weather/openMeteo`
Expected: FAIL, `Failed to resolve import "./openMeteo"`

- [ ] **Step 9: Implementer klienten**

`src/weather/openMeteo.ts`:

```ts
import type { CloudForecast, CloudSample, Point } from './types'

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast'

type HourlyBlock = {
  time: string[]
  cloud_cover_low: number[]
  cloud_cover_mid: number[]
  cloud_cover_high: number[]
}

function isLocation(value: unknown): value is { hourly: HourlyBlock } {
  const hourly = (value as { hourly?: { time?: unknown } } | null)?.hourly
  return Array.isArray(hourly?.time)
}

function toSamples(hourly: HourlyBlock): CloudSample[] {
  return hourly.time.map((iso, i) => ({
    // Open-Meteo returnerer "2026-08-12T18:00" uten sone når timezone=UTC.
    time: new Date(`${iso}:00Z`.replace(/(:\d\d):00Z$/, '$1:00Z')),
    low: hourly.cloud_cover_low[i],
    mid: hourly.cloud_cover_mid[i],
    high: hourly.cloud_cover_high[i],
  }))
}

export function parseOpenMeteo(json: unknown): CloudForecast[] {
  const locations = Array.isArray(json) ? json : [json]
  if (!locations.every(isLocation)) {
    throw new Error('Uventet svar fra Open-Meteo')
  }
  return locations.map((location) => ({
    source: 'open-meteo' as const,
    samples: toSamples(location.hourly),
  }))
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export async function fetchOpenMeteo(points: Point[], date: Date): Promise<CloudForecast[]> {
  if (points.length === 0) return []
  const params = new URLSearchParams({
    latitude: points.map((p) => p.lat.toFixed(4)).join(','),
    longitude: points.map((p) => p.lon.toFixed(4)).join(','),
    hourly: 'cloud_cover_low,cloud_cover_mid,cloud_cover_high',
    start_date: isoDate(date),
    end_date: isoDate(date),
    timezone: 'UTC',
    cell_selection: 'land',
  })
  const response = await fetch(`${ENDPOINT}?${params}`)
  if (!response.ok) {
    throw new Error(`Open-Meteo svarte ${response.status}`)
  }
  return parseOpenMeteo(await response.json())
}
```

Legg til `"resolveJsonModule": true` i `tsconfig.json` hvis importen av fixture-JSON ikke kompilerer.

- [ ] **Step 10: Kjør og se at testene passerer**

Run: `npx vitest run src/weather`
Expected: PASS, 10 tester

- [ ] **Step 11: Commit**

```bash
git add src/weather tsconfig.json
git commit -m "Legg til værtyper, resampling og Open-Meteo-klient"
```

---

### Task 5: MET-klient og proxy

**Files:**
- Create: `src/weather/met.ts`, `src/weather/met.test.ts`, `src/weather/__fixtures__/met-complete.json`, `src/weather/fetchForecast.ts`, `src/weather/fetchForecast.test.ts`, `api/met.ts`, `vercel.json`

**Interfaces:**
- Consumes: `CloudForecast`, `CloudSample`, `Point` fra Task 4
- Produces:
  - `parseMet(json: unknown): CloudForecast`
  - `fetchMet(point: Point): Promise<CloudForecast>`
  - `fetchForecast(point: Point, date: Date): Promise<CloudForecast>`

- [ ] **Step 1: Lagre MET-fixture**

```bash
curl -s -H "User-Agent: cloud-cover/0.1 github.com/runarbell/cloud-cover" "https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=59.91&lon=10.75" -o src/weather/__fixtures__/met-complete.json
```

Bekreft at `properties.timeseries[0].data.instant.details` inneholder `cloud_area_fraction_low`, `cloud_area_fraction_medium` og `cloud_area_fraction_high`. Gjør den ikke det, har du truffet `compact` i stedet for `complete`.

- [ ] **Step 2: Skriv den feilende testen**

`src/weather/met.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseMet } from './met'
import fixture from './__fixtures__/met-complete.json'

describe('parseMet', () => {
  it('gir kilde met', () => {
    expect(parseMet(fixture).source).toBe('met')
  })

  it('normaliserer medium til mid', () => {
    const first = parseMet(fixture).samples[0]
    expect(typeof first.mid).toBe('number')
    expect(first.mid).toBeGreaterThanOrEqual(0)
    expect(first.mid).toBeLessThanOrEqual(100)
  })

  it('gir stigende tider som Date', () => {
    const samples = parseMet(fixture).samples
    expect(samples[0].time).toBeInstanceOf(Date)
    expect(samples[1].time.getTime()).toBeGreaterThan(samples[0].time.getTime())
  })

  it('hopper over steg uten skylagsdata', () => {
    const trimmed = {
      properties: {
        timeseries: [
          { time: '2026-08-12T18:00:00Z', data: { instant: { details: {} } } },
          {
            time: '2026-08-12T19:00:00Z',
            data: {
              instant: {
                details: {
                  cloud_area_fraction_low: 10,
                  cloud_area_fraction_medium: 20,
                  cloud_area_fraction_high: 30,
                },
              },
            },
          },
        ],
      },
    }
    expect(parseMet(trimmed).samples).toHaveLength(1)
  })

  it('kaster ved uventet form', () => {
    expect(() => parseMet({ nope: true })).toThrow(/Uventet svar/)
  })
})
```

- [ ] **Step 3: Kjør og se at den feiler**

Run: `npx vitest run src/weather/met`
Expected: FAIL, `Failed to resolve import "./met"`

- [ ] **Step 4: Implementer MET-klienten**

`src/weather/met.ts`:

```ts
import type { CloudForecast, CloudSample, Point } from './types'

type MetDetails = {
  cloud_area_fraction_low?: number
  cloud_area_fraction_medium?: number
  cloud_area_fraction_high?: number
}

type MetEntry = {
  time: string
  data?: { instant?: { details?: MetDetails } }
}

export function parseMet(json: unknown): CloudForecast {
  const series = (json as { properties?: { timeseries?: unknown } } | null)
    ?.properties?.timeseries
  if (!Array.isArray(series)) {
    throw new Error('Uventet svar fra MET')
  }

  const samples: CloudSample[] = []
  for (const entry of series as MetEntry[]) {
    const details = entry.data?.instant?.details
    // MET slutter å levere skylag lenger ut i serien; de stegene hoppes over
    // heller enn å bli tolket som skyfritt.
    if (
      details?.cloud_area_fraction_low === undefined ||
      details.cloud_area_fraction_medium === undefined ||
      details.cloud_area_fraction_high === undefined
    ) {
      continue
    }
    samples.push({
      time: new Date(entry.time),
      low: details.cloud_area_fraction_low,
      mid: details.cloud_area_fraction_medium,
      high: details.cloud_area_fraction_high,
    })
  }
  return { source: 'met', samples }
}

export async function fetchMet(point: Point): Promise<CloudForecast> {
  const params = new URLSearchParams({
    lat: point.lat.toFixed(4),
    lon: point.lon.toFixed(4),
  })
  const response = await fetch(`/api/met?${params}`)
  if (!response.ok) {
    throw new Error(`MET svarte ${response.status}`)
  }
  return parseMet(await response.json())
}
```

- [ ] **Step 5: Kjør og se at testene passerer**

Run: `npx vitest run src/weather/met`
Expected: PASS, 5 tester

- [ ] **Step 6: Skriv den feilende fallback-testen**

`src/weather/fetchForecast.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchForecast } from './fetchForecast'
import metFixture from './__fixtures__/met-complete.json'
import openMeteoFixture from './__fixtures__/open-meteo-single.json'

const POINT = { lat: 59.91, lon: 10.75 }
const DATE = new Date('2026-08-12T12:00:00Z')

afterEach(() => vi.unstubAllGlobals())

function stubFetch(handler: (url: string) => Response | Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo) => handler(String(input))))
}

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })

describe('fetchForecast', () => {
  it('bruker MET når MET svarer', async () => {
    stubFetch(() => ok(metFixture))
    expect((await fetchForecast(POINT, DATE)).source).toBe('met')
  })

  it('faller tilbake til Open-Meteo når MET feiler', async () => {
    stubFetch((url) =>
      url.includes('/api/met')
        ? new Response('nei', { status: 503 })
        : ok(openMeteoFixture),
    )
    expect((await fetchForecast(POINT, DATE)).source).toBe('open-meteo')
  })

  it('faller tilbake når MET svarer uten skylagsdata', async () => {
    stubFetch((url) =>
      url.includes('/api/met')
        ? ok({ properties: { timeseries: [] } })
        : ok(openMeteoFixture),
    )
    expect((await fetchForecast(POINT, DATE)).source).toBe('open-meteo')
  })

  it('lar feilen boble når begge kilder feiler', async () => {
    stubFetch(() => new Response('nei', { status: 500 }))
    await expect(fetchForecast(POINT, DATE)).rejects.toThrow()
  })
})
```

- [ ] **Step 7: Kjør og se at den feiler**

Run: `npx vitest run src/weather/fetchForecast`
Expected: FAIL, `Failed to resolve import "./fetchForecast"`

- [ ] **Step 8: Implementer fallback**

`src/weather/fetchForecast.ts`:

```ts
import type { CloudForecast, Point } from './types'
import { fetchMet } from './met'
import { fetchOpenMeteo } from './openMeteo'

/**
 * MET er mest treffsikker i Norge, men dekker ikke hele kloden og kan være nede.
 * Open-Meteo er alltid tilgjengelig og brukes som reserve. Kilden følger med
 * svaret slik at UI-et kan vise hvor tallene kom fra.
 */
export async function fetchForecast(point: Point, date: Date): Promise<CloudForecast> {
  try {
    const met = await fetchMet(point)
    if (met.samples.length > 0) return met
  } catch {
    // Faller gjennom til Open-Meteo.
  }
  const [forecast] = await fetchOpenMeteo([point], date)
  if (!forecast) throw new Error('Ingen skydata tilgjengelig')
  return forecast
}
```

- [ ] **Step 9: Kjør og se at testene passerer**

Run: `npx vitest run src/weather`
Expected: PASS, 19 tester

- [ ] **Step 10: Skriv Vercel-funksjonen**

`api/met.ts`:

```ts
const MET_USER_AGENT = 'cloud-cover/0.1 github.com/runarbell/cloud-cover'
const MET_ENDPOINT = 'https://api.met.no/weatherapi/locationforecast/2.0/complete'

export const config = { runtime: 'edge' }

export default async function handler(request: Request): Promise<Response> {
  const incoming = new URL(request.url)
  const lat = incoming.searchParams.get('lat')
  const lon = incoming.searchParams.get('lon')
  if (!lat || !lon) {
    return new Response(JSON.stringify({ error: 'lat og lon er påkrevd' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }

  const upstream = await fetch(`${MET_ENDPOINT}?lat=${lat}&lon=${lon}`, {
    // MET krever en identifiserende User-Agent. Nettleser-JS kan ikke sette den,
    // derfor finnes denne funksjonen.
    headers: { 'User-Agent': MET_USER_AGENT },
  })

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': 'application/json',
      // MET ber om at svar caches. Ti minutter er godt innenfor deres krav.
      'cache-control': 'public, max-age=600',
    },
  })
}
```

`vercel.json`:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [{ "source": "/api/met", "destination": "/api/met" }]
}
```

- [ ] **Step 11: Verifiser proxyen i dev**

Kjør `npm run dev` i én terminal. I en annen:

Run: `curl -s "http://localhost:5173/api/met?lat=59.91&lon=10.75"`
Expected: JSON med `properties.timeseries`, ikke en 403 fra MET

- [ ] **Step 12: Commit**

```bash
git add src/weather api vercel.json
git commit -m "Legg til MET-klient, proxy og fallback til Open-Meteo"
```

---

### Task 6: Stedsvelger

**Files:**
- Create: `src/geo/geocode.ts`, `src/geo/geocode.test.ts`, `src/geo/useGeolocation.ts`, `src/ui/LocationPicker.tsx`

**Interfaces:**
- Consumes: `Point` fra Task 4
- Produces:
  - `type Place = { name: string; region: string; lat: number; lon: number; elevation: number; timezone: string }`
  - `searchPlaces(query: string): Promise<Place[]>`
  - `useGeolocation(): { place: Place | null; status: 'idle'|'asking'|'granted'|'denied'; request: () => void }`
  - `<LocationPicker value={Place|null} onChange={(p: Place) => void} />`

- [ ] **Step 1: Skriv den feilende testen**

`src/geo/geocode.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { searchPlaces, parseGeocoding } from './geocode'

afterEach(() => vi.unstubAllGlobals())

const FIXTURE = {
  results: [
    {
      name: 'Kolsås',
      latitude: 59.91363,
      longitude: 10.51192,
      elevation: 85,
      timezone: 'Europe/Oslo',
      country: 'Norge',
      admin1: 'Akershus fylke',
    },
  ],
}

describe('parseGeocoding', () => {
  it('mapper til Place', () => {
    const [place] = parseGeocoding(FIXTURE)
    expect(place.name).toBe('Kolsås')
    expect(place.lat).toBeCloseTo(59.91363, 5)
    expect(place.region).toBe('Akershus fylke, Norge')
  })

  it('gir tom liste når results mangler', () => {
    expect(parseGeocoding({})).toEqual([])
  })

  it('tåler manglende admin1', () => {
    const [place] = parseGeocoding({
      results: [{ name: 'X', latitude: 1, longitude: 2, elevation: 0, timezone: 'UTC', country: 'Norge' }],
    })
    expect(place.region).toBe('Norge')
  })
})

describe('searchPlaces', () => {
  it('returnerer tom liste for kort søk uten å kalle API-et', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await searchPlaces('a')).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Kjør og se at den feiler**

Run: `npx vitest run src/geo/geocode`
Expected: FAIL, `Failed to resolve import "./geocode"`

- [ ] **Step 3: Implementer geokoding**

`src/geo/geocode.ts`:

```ts
const ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search'

export type Place = {
  name: string
  region: string
  lat: number
  lon: number
  elevation: number
  timezone: string
}

type RawResult = {
  name: string
  latitude: number
  longitude: number
  elevation?: number
  timezone?: string
  country?: string
  admin1?: string
}

export function parseGeocoding(json: unknown): Place[] {
  const results = (json as { results?: RawResult[] } | null)?.results
  if (!Array.isArray(results)) return []
  return results.map((r) => ({
    name: r.name,
    region: [r.admin1, r.country].filter(Boolean).join(', '),
    lat: r.latitude,
    lon: r.longitude,
    elevation: r.elevation ?? 0,
    timezone: r.timezone ?? 'Europe/Oslo',
  }))
}

export async function searchPlaces(query: string): Promise<Place[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []
  const params = new URLSearchParams({
    name: trimmed,
    count: '5',
    language: 'no',
    format: 'json',
  })
  const response = await fetch(`${ENDPOINT}?${params}`)
  if (!response.ok) throw new Error(`Stedssøk svarte ${response.status}`)
  return parseGeocoding(await response.json())
}
```

- [ ] **Step 4: Kjør og se at testene passerer**

Run: `npx vitest run src/geo/geocode`
Expected: PASS, 4 tester

- [ ] **Step 5: Implementer geolokasjons-hooken**

`src/geo/useGeolocation.ts`:

```ts
import { useCallback, useState } from 'react'
import type { Place } from './geocode'

export type GeolocationStatus = 'idle' | 'asking' | 'granted' | 'denied'

export function useGeolocation() {
  const [place, setPlace] = useState<Place | null>(null)
  const [status, setStatus] = useState<GeolocationStatus>('idle')

  const request = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus('denied')
      return
    }
    setStatus('asking')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPlace({
          name: 'Min posisjon',
          region: '',
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          elevation: position.coords.altitude ?? 0,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        })
        setStatus('granted')
      },
      // Avslag er ikke en feil. Brukeren får søkefeltet i stedet.
      () => setStatus('denied'),
      { timeout: 10_000 },
    )
  }, [])

  return { place, status, request }
}
```

- [ ] **Step 6: Implementer LocationPicker**

`src/ui/LocationPicker.tsx`:

```tsx
import { useState } from 'react'
import { searchPlaces, type Place } from '../geo/geocode'
import { useGeolocation } from '../geo/useGeolocation'

type Props = {
  value: Place | null
  onChange: (place: Place) => void
}

export function LocationPicker({ value, onChange }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Place[]>([])
  const [error, setError] = useState<string | null>(null)
  const geo = useGeolocation()

  if (geo.place && geo.place !== value && geo.status === 'granted' && !value) {
    onChange(geo.place)
  }

  async function search(next: string) {
    setQuery(next)
    setError(null)
    try {
      setResults(await searchPlaces(next))
    } catch {
      setError('Fikk ikke kontakt med stedssøket.')
    }
  }

  return (
    <div className="location-picker">
      <button type="button" onClick={geo.request} disabled={geo.status === 'asking'}>
        {geo.status === 'asking' ? 'Finner posisjon…' : 'Bruk min posisjon'}
      </button>
      {geo.status === 'denied' && <p className="hint">Søk opp et sted i stedet.</p>}

      <input
        type="search"
        value={query}
        placeholder="Søk etter sted"
        onChange={(e) => void search(e.target.value)}
      />
      {error && <p className="error">{error}</p>}

      <ul>
        {results.map((place) => (
          <li key={`${place.lat},${place.lon}`}>
            <button type="button" onClick={() => onChange(place)}>
              {place.name}
              {place.region && <span className="region"> · {place.region}</span>}
            </button>
          </li>
        ))}
      </ul>

      {value && <p className="current">Valgt: {value.name}</p>}
    </div>
  )
}
```

- [ ] **Step 7: Kjør hele testsuiten**

Run: `npm test`
Expected: PASS, ingen regresjoner

- [ ] **Step 8: Commit**

```bash
git add src/geo src/ui
git commit -m "Legg til stedssøk og geolokasjon"
```

---

### Task 7: Verdikt, tidslinje og sammenkobling — fase 1 komplett

**Files:**
- Create: `src/ui/Verdict.tsx`, `src/ui/Timeline.tsx`, `src/ui/useForecast.ts`, `src/ui/app.css`
- Modify: `src/ui/App.tsx`, `src/main.tsx`

**Interfaces:**
- Consumes: `findEclipseNear`/`findEclipse` (Task 2), `scoreWindow` (Task 3), `resample` (Task 4), `fetchForecast` (Task 5), `Place` (Task 6), `formatTime`/`formatPercent`/`compassName` (Task 1)
- Produces:
  - `type ForecastState = { status: 'idle'|'loading'|'ready'|'error'|'no-eclipse'|'no-weather'; circumstances: EclipseCircumstances | null; forecast: CloudForecast | null; score: LocationScore | null; error: string | null }`
  - `useForecast(place: Place | null): ForecastState`

- [ ] **Step 1: Skriv den feilende testen for tilstandsmaskinen**

`src/ui/useForecast.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { deriveState } from './useForecast'

const CIRCUMSTANCES = {
  kind: 'partial' as const,
  obscuration: 0.87,
  partialBegin: { time: new Date('2026-08-12T17:40:00Z'), sunAltitude: 15, sunAzimuth: 270 },
  peak: { time: new Date('2026-08-12T18:30:00Z'), sunAltitude: 9, sunAzimuth: 285 },
  partialEnd: { time: new Date('2026-08-12T19:20:00Z'), sunAltitude: 3, sunAzimuth: 298 },
}

describe('deriveState', () => {
  it('melder no-eclipse når motoren ikke finner noe', () => {
    expect(deriveState(null, null).status).toBe('no-eclipse')
  })

  it('melder no-weather når formørkelsen finnes men skydata mangler', () => {
    const state = deriveState(CIRCUMSTANCES, null)
    expect(state.status).toBe('no-weather')
    expect(state.circumstances).not.toBeNull()
  })

  it('melder no-weather når varselet ikke dekker formørkelsesvinduet', () => {
    const forecast = {
      source: 'open-meteo' as const,
      samples: [{ time: new Date('2026-08-10T12:00:00Z'), low: 0, mid: 0, high: 0 }],
    }
    expect(deriveState(CIRCUMSTANCES, forecast).status).toBe('no-weather')
  })

  it('melder ready med score når alt finnes', () => {
    const forecast = {
      source: 'met' as const,
      samples: [
        { time: new Date('2026-08-12T17:00:00Z'), low: 0, mid: 0, high: 0 },
        { time: new Date('2026-08-12T20:00:00Z'), low: 0, mid: 0, high: 0 },
      ],
    }
    const state = deriveState(CIRCUMSTANCES, forecast)
    expect(state.status).toBe('ready')
    expect(state.score!.verdict).toBe('clear')
  })
})
```

- [ ] **Step 2: Kjør og se at den feiler**

Run: `npx vitest run src/ui/useForecast`
Expected: FAIL, `Failed to resolve import "./useForecast"`

- [ ] **Step 3: Implementer tilstandsmaskinen og hooken**

`src/ui/useForecast.ts`:

```ts
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
```

- [ ] **Step 4: Kjør og se at testene passerer**

Run: `npx vitest run src/ui/useForecast`
Expected: PASS, 4 tester

- [ ] **Step 5: Implementer Verdict**

`src/ui/Verdict.tsx`:

```tsx
import type { EclipseCircumstances } from '../eclipse/types'
import type { LocationScore } from '../scoring/types'
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
  source: 'met' | 'open-meteo'
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
```

- [ ] **Step 6: Implementer Timeline**

`src/ui/Timeline.tsx`:

```tsx
import type { EclipseCircumstances } from '../eclipse/types'
import type { CloudSample } from '../weather/types'
import { scoreSample } from '../scoring/weights'
import { formatTime } from '../format'

type Props = {
  samples: CloudSample[]
  circumstances: EclipseCircumstances
  timeZone: string
}

function colorFor(score: number): string {
  if (score >= 70) return 'var(--clear)'
  if (score >= 40) return 'var(--mixed)'
  return 'var(--clouded)'
}

/** Solhøyde interpolert mellom kontakttidene, samme regel som i scoringen. */
function altitudeAt(time: Date, c: EclipseCircumstances): number {
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
```

- [ ] **Step 7: Koble sammen i App**

`src/ui/App.tsx`:

```tsx
import { useState } from 'react'
import { LocationPicker } from './LocationPicker'
import { Verdict } from './Verdict'
import { Timeline } from './Timeline'
import { useForecast } from './useForecast'
import type { Place } from '../geo/geocode'
import './app.css'

export default function App() {
  const [place, setPlace] = useState<Place | null>(null)
  const state = useForecast(place)
  const timeZone = place?.timezone ?? 'Europe/Oslo'

  return (
    <main className="app">
      <div className="panel panel--left">
        <LocationPicker value={place} onChange={setPlace} />

        {state.status === 'idle' && (
          <p className="hint">Velg et sted for å se om du får sett formørkelsen.</p>
        )}
        {state.status === 'loading' && <p className="hint">Henter varsel…</p>}

        {state.status === 'no-eclipse' && (
          <p className="hint">Fant ingen solformørkelse synlig fra dette stedet.</p>
        )}

        {state.status === 'no-weather' && state.circumstances && (
          <p className="hint">
            Formørkelsen er {state.circumstances.peak.time.toLocaleDateString('nb-NO')}, men
            værvarsel finnes bare omtrent 16 dager fram i tid. Kom tilbake nærmere datoen.
          </p>
        )}

        {state.status === 'error' && (
          <p className="error">Fikk ikke hentet skydata: {state.error}</p>
        )}

        {state.status === 'ready' && state.circumstances && state.score && state.forecast && (
          <>
            <Verdict
              circumstances={state.circumstances}
              score={state.score}
              timeZone={timeZone}
              source={state.forecast.source}
            />
            <Timeline
              samples={state.windowSamples}
              circumstances={state.circumstances}
              timeZone={timeZone}
            />
          </>
        )}
      </div>

      <div className="panel panel--right">
        <p className="hint">Kart kommer i neste versjon.</p>
      </div>
    </main>
  )
}
```

`src/ui/app.css`:

```css
:root {
  --clear: #2e7d5b;
  --mixed: #b8862b;
  --clouded: #8d3b3b;
  --bg: #10141a;
  --fg: #eef2f7;
  --muted: #93a1b3;
  color-scheme: dark;
}

body { margin: 0; background: var(--bg); color: var(--fg);
  font-family: system-ui, sans-serif; }

.app { display: grid; grid-template-columns: minmax(320px, 1fr) 1fr;
  gap: 1.5rem; padding: 1.5rem; min-height: 100vh; box-sizing: border-box; }

@media (max-width: 900px) { .app { grid-template-columns: 1fr; } }

.verdict h1 { font-size: 2.25rem; margin: 0.5rem 0 0.25rem; letter-spacing: -0.02em; }
.verdict--clear h1 { color: var(--clear); }
.verdict--mixed h1 { color: var(--mixed); }
.verdict--clouded h1 { color: var(--clouded); }

.reason { color: var(--muted); margin-top: 0; }
.facts { display: flex; gap: 1.5rem; flex-wrap: wrap; }
.facts dt { font-size: 0.75rem; text-transform: uppercase; color: var(--muted); }
.facts dd { margin: 0; font-size: 1.25rem; font-variant-numeric: tabular-nums; }
.source, .hint { color: var(--muted); font-size: 0.875rem; }
.error { color: var(--clouded); }

.timeline__bars { display: flex; gap: 2px; align-items: flex-end; height: 120px; }
.timeline__bar { flex: 1; border-radius: 2px 2px 0 0; min-height: 4px; }
.timeline__labels { display: flex; justify-content: space-between;
  color: var(--muted); font-size: 0.75rem; margin-top: 0.25rem; }

.location-picker input { width: 100%; padding: 0.5rem; margin-top: 0.5rem;
  background: #1a2029; color: var(--fg); border: 1px solid #2c3542; border-radius: 6px; }
.location-picker ul { list-style: none; padding: 0; margin: 0.5rem 0; }
.location-picker button { background: none; border: none; color: var(--fg);
  cursor: pointer; padding: 0.35rem 0; text-align: left; }
.region { color: var(--muted); }
```

- [ ] **Step 8: Kjør appen og verifiser i nettleser**

Run: `npm run dev`

Åpne `http://localhost:5173`, trykk «Bruk min posisjon» eller søk «Oslo». Bekreft at verdikt, dekningsgrad, solhøyde, retning og tidslinje vises, og at kilden står oppgitt.

- [ ] **Step 9: Kjør hele testsuiten og bygget**

Run: `npm test`
Expected: PASS

Run: `npm run build`
Expected: bygger uten typefeil

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "Koble sammen verdikt og tidslinje, fase 1 komplett"
```

**Fase 1 er nå kjørbar. Stopp her hvis klokka nærmer seg formørkelsen.**

---

## FASE 2 — kart og steder i nærheten

### Task 8: Avstand, retning og rutenett

**Files:**
- Create: `src/geo/distance.ts`, `src/geo/distance.test.ts`, `src/geo/grid.ts`, `src/geo/grid.test.ts`

**Interfaces:**
- Consumes: `Point` fra Task 4
- Produces:
  - `distanceKm(a: Point, b: Point): number`
  - `bearingDegrees(from: Point, to: Point): number`
  - `buildGrid(center: Point, radiusKm: number, side?: number): Point[]`

- [ ] **Step 1: Skriv den feilende testen**

`src/geo/distance.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { distanceKm, bearingDegrees } from './distance'

const OSLO = { lat: 59.91, lon: 10.75 }
const BERGEN = { lat: 60.39, lon: 5.32 }

describe('distanceKm', () => {
  it('gir kjent avstand Oslo–Bergen', () => {
    expect(distanceKm(OSLO, BERGEN)).toBeCloseTo(304, 0)
  })
  it('gir null for samme punkt', () => {
    expect(distanceKm(OSLO, OSLO)).toBe(0)
  })
})

describe('bearingDegrees', () => {
  it('peker vestover fra Oslo til Bergen', () => {
    const b = bearingDegrees(OSLO, BERGEN)
    expect(b).toBeGreaterThan(270)
    expect(b).toBeLessThan(310)
  })
  it('peker nord for et punkt rett nord', () => {
    expect(bearingDegrees(OSLO, { lat: 61, lon: 10.75 })).toBeCloseTo(0, 1)
  })
  it('gir alltid 0–360', () => {
    const b = bearingDegrees(OSLO, { lat: 59, lon: 10.0 })
    expect(b).toBeGreaterThanOrEqual(0)
    expect(b).toBeLessThan(360)
  })
})
```

`src/geo/grid.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildGrid } from './grid'
import { distanceKm } from './distance'

const OSLO = { lat: 59.91, lon: 10.75 }

describe('buildGrid', () => {
  it('gir 49 punkter som standard', () => {
    expect(buildGrid(OSLO, 50)).toHaveLength(49)
  })

  it('holder alle punkter innenfor radius pluss slingringsmonn', () => {
    for (const point of buildGrid(OSLO, 50)) {
      expect(distanceKm(OSLO, point)).toBeLessThanOrEqual(72)
    }
  })

  it('inneholder sentrum', () => {
    const grid = buildGrid(OSLO, 50)
    const closest = Math.min(...grid.map((p) => distanceKm(OSLO, p)))
    expect(closest).toBeLessThan(1)
  })

  it('skalerer lengdegrad med breddegrad', () => {
    // Nær polen må lengdegradene spres mer for samme avstand i km.
    const north = buildGrid({ lat: 78, lon: 15 }, 50)
    const span = Math.max(...north.map((p) => p.lon)) - Math.min(...north.map((p) => p.lon))
    const southSpan = (() => {
      const g = buildGrid({ lat: 20, lon: 15 }, 50)
      return Math.max(...g.map((p) => p.lon)) - Math.min(...g.map((p) => p.lon))
    })()
    expect(span).toBeGreaterThan(southSpan)
  })
})
```

- [ ] **Step 2: Kjør og se at de feiler**

Run: `npx vitest run src/geo/distance src/geo/grid`
Expected: FAIL, uløste importer

- [ ] **Step 3: Implementer**

`src/geo/distance.ts`:

```ts
import type { Point } from '../weather/types'

const EARTH_RADIUS_KM = 6371
const toRad = (deg: number) => (deg * Math.PI) / 180
const toDeg = (rad: number) => (rad * 180) / Math.PI

export function distanceKm(a: Point, b: Point): number {
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function bearingDegrees(from: Point, to: Point): number {
  const dLon = toRad(to.lon - from.lon)
  const lat1 = toRad(from.lat)
  const lat2 = toRad(to.lat)
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}
```

`src/geo/grid.ts`:

```ts
import type { Point } from '../weather/types'

const KM_PER_DEGREE_LAT = 111.32

/**
 * Kvadratisk rutenett med oddetalls side, slik at sentrum alltid er med.
 * Lengdegradsteget skaleres med cos(breddegrad), ellers blir rutene smale
 * i sør og altfor brede i nord.
 */
export function buildGrid(center: Point, radiusKm: number, side = 7): Point[] {
  const half = Math.floor(side / 2)
  const latStep = radiusKm / half / KM_PER_DEGREE_LAT
  const lonStep = latStep / Math.max(0.1, Math.cos((center.lat * Math.PI) / 180))

  const points: Point[] = []
  for (let row = -half; row <= half; row++) {
    for (let col = -half; col <= half; col++) {
      points.push({
        lat: center.lat + row * latStep,
        lon: center.lon + col * lonStep,
      })
    }
  }
  return points
}
```

- [ ] **Step 4: Kjør og se at de passerer**

Run: `npx vitest run src/geo`
Expected: PASS, 11 tester

- [ ] **Step 5: Commit**

```bash
git add src/geo
git commit -m "Legg til avstand, retning og rutenettgenerering"
```

---

### Task 9: Rangering av steder i nærheten

**Files:**
- Create: `src/scoring/rankNearby.ts`, `src/scoring/rankNearby.test.ts`, `src/ui/useNearby.ts`, `src/ui/NearbyList.tsx`
- Modify: `src/ui/App.tsx`

**Interfaces:**
- Consumes: `buildGrid`, `distanceKm`, `bearingDegrees` (Task 8), `fetchOpenMeteo` (Task 4), `findEclipse` (Task 2), `scoreWindow` (Task 3)
- Produces:
  - `type RankedPlace = { point: Point; score: LocationScore; distanceKm: number; bearing: number }`
  - `rankNearby(points: Point[], forecasts: CloudForecast[], center: Point, date: Date): RankedPlace[]`
  - `useNearby(place: Place | null, radiusKm: number): { status: 'idle'|'loading'|'ready'|'error'; ranked: RankedPlace[]; error: string | null }`

- [ ] **Step 1: Skriv den feilende testen**

`src/scoring/rankNearby.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { rankNearby } from './rankNearby'
import type { CloudForecast } from '../weather/types'

const CENTER = { lat: 59.91, lon: 10.75 }
const DATE = new Date('2026-08-12T12:00:00Z')

function forecast(low: number): CloudForecast {
  return {
    source: 'open-meteo',
    samples: [
      { time: new Date('2026-08-12T16:00:00Z'), low, mid: 0, high: 0 },
      { time: new Date('2026-08-12T22:00:00Z'), low, mid: 0, high: 0 },
    ],
  }
}

describe('rankNearby', () => {
  const points = [
    { lat: 59.91, lon: 10.75 },
    { lat: 60.20, lon: 10.75 },
    { lat: 59.60, lon: 10.75 },
  ]

  it('sorterer beste score først', () => {
    const ranked = rankNearby(points, [forecast(90), forecast(0), forecast(50)], CENTER, DATE)
    expect(ranked[0].point.lat).toBeCloseTo(60.20, 2)
  })

  it('regner ut avstand og retning fra sentrum', () => {
    const ranked = rankNearby(points, [forecast(0), forecast(0), forecast(0)], CENTER, DATE)
    const north = ranked.find((r) => r.point.lat > 60)!
    expect(north.distanceKm).toBeGreaterThan(25)
    expect(north.bearing).toBeCloseTo(0, 0)
  })

  it('hopper over punkter uten varsel', () => {
    expect(rankNearby(points, [forecast(0)], CENTER, DATE)).toHaveLength(1)
  })

  it('hopper over punkter uten formørkelse', () => {
    // Sørpolen ser ikke denne formørkelsen.
    const ranked = rankNearby([{ lat: -80, lon: 0 }], [forecast(0)], CENTER, DATE)
    expect(ranked).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Kjør og se at den feiler**

Run: `npx vitest run src/scoring/rankNearby`
Expected: FAIL, `Failed to resolve import "./rankNearby"`

- [ ] **Step 3: Implementer rangeringen**

`src/scoring/rankNearby.ts`:

```ts
import { findEclipseNear } from '../eclipse/findEclipse'
import { bearingDegrees, distanceKm } from '../geo/distance'
import { resample } from '../weather/resample'
import type { CloudForecast, Point } from '../weather/types'
import { scoreWindow } from './scoreWindow'
import type { LocationScore } from './types'

export type RankedPlace = {
  point: Point
  score: LocationScore
  distanceKm: number
  bearing: number
}

/**
 * Kontakttider og solhøyde varierer merkbart over 150 km, så hvert rutenettpunkt
 * får formørkelsen beregnet for sin egen posisjon i stedet for å arve sentrums.
 */
export function rankNearby(
  points: Point[],
  forecasts: CloudForecast[],
  center: Point,
  date: Date,
): RankedPlace[] {
  const ranked: RankedPlace[] = []
  for (let i = 0; i < points.length; i++) {
    const forecast = forecasts[i]
    if (!forecast || forecast.samples.length === 0) continue

    const point = points[i]
    const circumstances = findEclipseNear(point.lat, point.lon, date)
    if (!circumstances) continue

    const score = scoreWindow(resample(forecast.samples, 15), circumstances)
    if (score.verdict === 'unknown') continue

    ranked.push({
      point,
      score,
      distanceKm: distanceKm(center, point),
      bearing: bearingDegrees(center, point),
    })
  }
  return ranked.sort((a, b) => b.score.score - a.score.score)
}
```

- [ ] **Step 4: Kjør og se at den passerer**

Run: `npx vitest run src/scoring/rankNearby`
Expected: PASS, 4 tester

- [ ] **Step 5: Implementer useNearby**

`src/ui/useNearby.ts`:

```ts
import { useEffect, useState } from 'react'
import { buildGrid } from '../geo/grid'
import type { Place } from '../geo/geocode'
import { rankNearby, type RankedPlace } from '../scoring/rankNearby'
import { fetchOpenMeteo } from '../weather/openMeteo'
import { findEclipse } from '../eclipse/findEclipse'

export type NearbyState = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  ranked: RankedPlace[]
  error: string | null
}

export function useNearby(place: Place | null, radiusKm: number): NearbyState {
  const [state, setState] = useState<NearbyState>({
    status: 'idle', ranked: [], error: null,
  })

  useEffect(() => {
    if (!place) {
      setState({ status: 'idle', ranked: [], error: null })
      return
    }
    let cancelled = false
    setState({ status: 'loading', ranked: [], error: null })

    const center = { lat: place.lat, lon: place.lon }
    const circumstances = findEclipse(center.lat, center.lon, new Date(), place.elevation)
    if (!circumstances) {
      setState({ status: 'idle', ranked: [], error: null })
      return
    }

    const grid = buildGrid(center, radiusKm)
    // Hele rutenettet hentes i ett kall; Open-Meteo tar komma-separerte koordinater.
    fetchOpenMeteo(grid, circumstances.peak.time)
      .then((forecasts) => {
        if (cancelled) return
        setState({
          status: 'ready',
          ranked: rankNearby(grid, forecasts, center, circumstances.peak.time),
          error: null,
        })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setState({
          status: 'error',
          ranked: [],
          error: err instanceof Error ? err.message : 'Ukjent feil',
        })
      })

    return () => { cancelled = true }
  }, [place, radiusKm])

  return state
}
```

- [ ] **Step 6: Implementer NearbyList**

`src/ui/NearbyList.tsx`:

```tsx
import type { RankedPlace } from '../scoring/rankNearby'
import { compassName } from '../format'

type Props = {
  ranked: RankedPlace[]
  onSelect: (place: RankedPlace) => void
}

export function NearbyList({ ranked, onSelect }: Props) {
  const top = ranked.slice(0, 3)
  if (top.length === 0) return null

  return (
    <section className="nearby">
      <h2>Best i nærheten</h2>
      <ol>
        {top.map((entry) => (
          <li key={`${entry.point.lat},${entry.point.lon}`}>
            <button type="button" onClick={() => onSelect(entry)}>
              <strong>{Math.round(entry.distanceKm)} km {compassName(entry.bearing)}</strong>
              <span className="score"> · {entry.score.score} av 100</span>
              <span className="reason"> {entry.score.reason}</span>
            </button>
          </li>
        ))}
      </ol>
      <p className="hint">
        Punktene er værceller, ikke adresser. De viser hvilken retning som er best,
        ikke et sted å parkere.
      </p>
    </section>
  )
}
```

- [ ] **Step 7: Koble inn i App**

I `src/ui/App.tsx`, legg til øverst:

```tsx
import { useNearby } from './useNearby'
import { NearbyList } from './NearbyList'
```

Legg til i komponenten, etter `const state = useForecast(place)`:

```tsx
const [radiusKm, setRadiusKm] = useState(50)
const nearby = useNearby(place, radiusKm)
```

Legg til rett etter `<Timeline ... />` inne i `state.status === 'ready'`-blokken:

```tsx
<label className="radius">
  Søk innenfor
  <select value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))}>
    <option value={10}>10 km</option>
    <option value={50}>50 km</option>
    <option value={150}>150 km</option>
  </select>
</label>
{nearby.status === 'loading' && <p className="hint">Søker i nærheten…</p>}
{nearby.status === 'error' && (
  <p className="error">Fikk ikke hentet rutenettet: {nearby.error}</p>
)}
{nearby.status === 'ready' && (
  <NearbyList
    ranked={nearby.ranked}
    onSelect={(entry) =>
      setPlace({
        name: `${Math.round(entry.distanceKm)} km ${compassName(entry.bearing)}`,
        region: '',
        lat: entry.point.lat,
        lon: entry.point.lon,
        elevation: 0,
        timezone: timeZone,
      })
    }
  />
)}
```

Legg til importen `import { compassName } from '../format'` i `App.tsx`.

- [ ] **Step 8: Kjør tester, bygg og verifiser i nettleser**

Run: `npm test`
Expected: PASS

Run: `npm run dev`

Søk «Oslo», bekreft at topp 3 dukker opp med avstand og retning, og at klikk på en av dem oppdaterer verdiktet.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Legg til rangering av steder i nærheten"
```

---

### Task 10: Kartpanel

**Files:**
- Create: `src/ui/MapPanel.tsx`
- Modify: `src/ui/App.tsx`, `src/ui/app.css`, `src/main.tsx`

**Interfaces:**
- Consumes: `RankedPlace` (Task 9), `Place` (Task 6)
- Produces: `<MapPanel center={Place} ranked={RankedPlace[]} onSelect={(p: RankedPlace) => void} />`

- [ ] **Step 1: Importer Leaflet-stilarket**

I `src/main.tsx`, legg til øverst:

```tsx
import 'leaflet/dist/leaflet.css'
```

- [ ] **Step 2: Implementer MapPanel**

`src/ui/MapPanel.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import type { Place } from '../geo/geocode'
import type { RankedPlace } from '../scoring/rankNearby'

type Props = {
  center: Place
  ranked: RankedPlace[]
  onSelect: (entry: RankedPlace) => void
}

function colorFor(score: number): string {
  if (score >= 70) return '#2e7d5b'
  if (score >= 40) return '#b8862b'
  return '#8d3b3b'
}

export function MapPanel({ center, ranked, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current).setView([center.lat, center.lon], 8)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 18,
    }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      layerRef.current = null
    }
  }, [])

  useEffect(() => {
    mapRef.current?.setView([center.lat, center.lon])
  }, [center.lat, center.lon])

  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return
    layer.clearLayers()

    for (const entry of ranked) {
      const marker = L.circleMarker([entry.point.lat, entry.point.lon], {
        radius: 7,
        color: colorFor(entry.score.score),
        fillColor: colorFor(entry.score.score),
        fillOpacity: 0.75,
        weight: 1,
      })
      marker.bindTooltip(`${entry.score.score} av 100`)
      marker.on('click', () => onSelect(entry))
      layer.addLayer(marker)
    }

    L.marker([center.lat, center.lon]).addTo(layer).bindTooltip('Ditt sted')
  }, [ranked, center.lat, center.lon, onSelect])

  return <div ref={containerRef} className="map" />
}
```

- [ ] **Step 3: Legg til kartstil**

I `src/ui/app.css`:

```css
.map { width: 100%; height: 100%; min-height: 420px; border-radius: 8px; }
.panel--right { display: flex; }
.radius { display: block; margin: 1rem 0 0.5rem; color: var(--muted); }
.radius select { margin-left: 0.5rem; background: #1a2029; color: var(--fg);
  border: 1px solid #2c3542; border-radius: 6px; padding: 0.25rem; }
.nearby ol { list-style: none; padding: 0; }
.nearby button { background: #1a2029; border: 1px solid #2c3542; border-radius: 6px;
  color: var(--fg); cursor: pointer; display: block; width: 100%;
  padding: 0.6rem; margin-bottom: 0.4rem; text-align: left; }
.score { color: var(--muted); }
```

- [ ] **Step 4: Bytt ut plassholderen i App**

Erstatt innholdet i `<div className="panel panel--right">` i `src/ui/App.tsx`:

```tsx
<div className="panel panel--right">
  {place ? (
    <MapPanel
      center={place}
      ranked={nearby.ranked}
      onSelect={(entry) =>
        setPlace({
          name: `${Math.round(entry.distanceKm)} km ${compassName(entry.bearing)}`,
          region: '',
          lat: entry.point.lat,
          lon: entry.point.lon,
          elevation: 0,
          timezone: timeZone,
        })
      }
    />
  ) : (
    <p className="hint">Velg et sted for å se kartet.</p>
  )}
</div>
```

Legg til `import { MapPanel } from './MapPanel'`.

- [ ] **Step 5: Verifiser i nettleser**

Run: `npm run dev`

Søk «Oslo». Bekreft at kartet viser fargede rutenettpunkter, at klikk på et punkt oppdaterer venstre panel, og at kartet ikke dupliserer markører når du bytter sted.

- [ ] **Step 6: Kjør tester og bygg**

Run: `npm test`
Expected: PASS

Run: `npm run build`
Expected: bygger uten typefeil

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Legg til kartpanel med fargelagt rutenett"
```

---

### Task 11: Velg en annen formørkelse

**Files:**
- Create: `src/ui/EclipsePicker.tsx`
- Modify: `src/eclipse/findEclipse.ts`, `src/eclipse/findEclipse.test.ts`, `src/ui/useForecast.ts`, `src/ui/App.tsx`

**Interfaces:**
- Consumes: `findEclipse` (Task 2)
- Produces:
  - `listEclipses(lat: number, lon: number, from: Date, count: number): EclipseCircumstances[]`
  - `useForecast(place: Place | null, searchFrom: Date): ForecastState` (utvidet signatur)

- [ ] **Step 1: Skriv den feilende testen**

Legg til i `src/eclipse/findEclipse.test.ts`:

```ts
import { listEclipses } from './findEclipse'

describe('listEclipses', () => {
  it('gir det antallet formørkelser det bes om', () => {
    expect(listEclipses(OSLO.lat, OSLO.lon, new Date('2026-01-01T00:00:00Z'), 3))
      .toHaveLength(3)
  })

  it('gir dem i stigende tidsrekkefølge', () => {
    const list = listEclipses(OSLO.lat, OSLO.lon, new Date('2026-01-01T00:00:00Z'), 3)
    expect(list[0].peak.time.getTime()).toBeLessThan(list[1].peak.time.getTime())
    expect(list[1].peak.time.getTime()).toBeLessThan(list[2].peak.time.getTime())
  })
})
```

- [ ] **Step 2: Kjør og se at den feiler**

Run: `npx vitest run src/eclipse`
Expected: FAIL, `listEclipses is not a function`

- [ ] **Step 3: Implementer listEclipses**

Legg til i `src/eclipse/findEclipse.ts`:

```ts
const HOUR_MS = 60 * 60 * 1000

/**
 * Søker framover ved å starte neste søk like etter forrige maks. Astronomy-engine
 * har ingen "neste etter denne" for lokale formørkelser, så vi hopper en time fram.
 */
export function listEclipses(
  lat: number,
  lon: number,
  from: Date,
  count: number,
  elevationM = 0,
): EclipseCircumstances[] {
  const out: EclipseCircumstances[] = []
  let cursor = from
  for (let i = 0; i < count; i++) {
    const next = findEclipse(lat, lon, cursor, elevationM)
    if (!next) break
    out.push(next)
    cursor = new Date(next.peak.time.getTime() + HOUR_MS)
  }
  return out
}
```

- [ ] **Step 4: Kjør og se at den passerer**

Run: `npx vitest run src/eclipse`
Expected: PASS

- [ ] **Step 5: Utvid useForecast med søkestartpunkt**

I `src/ui/useForecast.ts`, endre signaturen:

```ts
export function useForecast(place: Place | null, searchFrom: Date = new Date()): ForecastState {
```

og bruk `searchFrom` i stedet for `new Date()` i kallet til `findEclipse`. Legg `searchFrom.getTime()` til i `useEffect`-avhengighetene i stedet for `searchFrom` selv, slik at et nytt Date-objekt med samme tid ikke utløser ny henting:

```ts
}, [place, searchFrom.getTime()])
```

- [ ] **Step 6: Implementer EclipsePicker**

`src/ui/EclipsePicker.tsx`:

```tsx
import { useMemo } from 'react'
import { listEclipses } from '../eclipse/findEclipse'
import type { Place } from '../geo/geocode'

type Props = {
  place: Place
  searchFrom: Date
  onChange: (from: Date) => void
}

export function EclipsePicker({ place, searchFrom, onChange }: Props) {
  const upcoming = useMemo(
    () => listEclipses(place.lat, place.lon, new Date(), 5, place.elevation),
    [place.lat, place.lon, place.elevation],
  )

  if (upcoming.length <= 1) return null

  return (
    <label className="eclipse-picker">
      Formørkelse
      <select
        value={searchFrom.toISOString()}
        onChange={(e) => onChange(new Date(e.target.value))}
      >
        {upcoming.map((eclipse) => {
          // Start søket like før maks, så findEclipse treffer nettopp denne.
          const from = new Date(eclipse.partialBegin.time.getTime() - 60_000)
          return (
            <option key={from.toISOString()} value={from.toISOString()}>
              {eclipse.peak.time.toLocaleDateString('nb-NO', {
                day: 'numeric', month: 'long', year: 'numeric',
              })}
              {' · '}
              {Math.round(eclipse.obscuration * 100)} % dekket
            </option>
          )
        })}
      </select>
    </label>
  )
}
```

- [ ] **Step 7: Koble inn i App**

I `src/ui/App.tsx`:

```tsx
const [searchFrom, setSearchFrom] = useState(() => new Date())
const state = useForecast(place, searchFrom)
```

og rett under `<LocationPicker ... />`:

```tsx
{place && (
  <EclipsePicker place={place} searchFrom={searchFrom} onChange={setSearchFrom} />
)}
```

Legg til `import { EclipsePicker } from './EclipsePicker'`.

- [ ] **Step 8: Verifiser i nettleser**

Run: `npm run dev`

Velg en formørkelse lenger fram i tid. Bekreft at appen viser astronomien og teksten om at værvarsel bare rekker ~16 dager fram, i stedet for tom skjerm eller feilmelding.

- [ ] **Step 9: Kjør tester og bygg**

Run: `npm test`
Expected: PASS

Run: `npm run build`
Expected: bygger uten typefeil

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "Legg til velger for andre formørkelser"
```

---

### Task 12: README og deploy

**Files:**
- Create: `README.md`

- [ ] **Step 1: Skriv README**

`README.md`:

```markdown
# Cloud Cover

Svarer på om du får sett solformørkelsen fra der du er, og hvor forholdene er
bedre i nærheten.

## Kjør lokalt

    npm install
    npm run dev

Åpne http://localhost:5173

## Test

    npm test

## Deploy

    npx vercel

Frontenden er statisk. `api/met.ts` kjører som en edge-funksjon og setter den
`User-Agent` MET krever, siden nettleser-JS ikke får lov til det.

## Datakilder

- MET Norway locationforecast 2.0 complete, gjennom `/api/met`
- Open-Meteo forecast og geocoding, direkte fra nettleseren
- Formørkelsesberegninger med astronomy-engine, lokalt i nettleseren

## Begrensninger

Verktøyet har ingen høydedata og vet ikke om et fjell sperrer sikten mot sola.
Når sola står under tre grader sier appen fra om at terrenget trolig avgjør.
Rutenettpunktene er værceller, ikke adresser.
```

- [ ] **Step 2: Verifiser produksjonsbygget lokalt**

Run: `npm run build`
Expected: bygger uten feil

Run: `npx vite preview`
Expected: appen laster. Merk at `/api/met` ikke finnes i preview, så appen skal
falle tilbake til Open-Meteo og vise «Skydata fra Open-Meteo».

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Legg til README"
```

---

## Egenkontroll av planen

Utført mot speccen:

- **Dekning:** Alle spec-seksjoner har en oppgave. Arkitektur → Task 1 og 5. Moduler → Task 1–9. Formørkelsesmotor → Task 2. Scoringsmodell inkludert vekttabell, multiplikativ kombinasjon, trekantvekt og terskler → Task 3. Interpolasjon til 15-minutters steg → Task 4. Rutenett med `cell_selection=land` → Task 4 og 8. UI delt skjerm → Task 7 og 10. Feilhåndteringstabellen → Task 5 (MET-fallback), Task 7 (no-eclipse, no-weather, error), Task 9 (rutenettfeil). Testing → tester i hver oppgave. Faser → oppgavene er delt i FASE 1 og FASE 2.
- **Plassholdere:** Én bevisst plassholder finnes, i Task 2 steg 6, der de verifiserte kontakttidene må fylles inn fra ekstern fasit. Steget sier eksplisitt at testen ikke skal committes med plassholdere. Ingen andre.
- **Typekonsistens:** `CloudSample` bruker `mid` overalt; MET-feltet `cloud_area_fraction_medium` normaliseres i `parseMet`. `LocationScore.score` er 0–100 i både `scoreWindow`, `NearbyList` og `MapPanel`. `Point` defineres i `src/weather/types.ts` og importeres derfra i `geo/`. `findEclipseNear` brukes i Task 2 og 9, `findEclipse` i Task 7 og 11.
