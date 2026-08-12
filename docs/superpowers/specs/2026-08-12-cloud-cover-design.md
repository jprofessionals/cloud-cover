# Cloud Cover — designspesifikasjon

Dato: 2026-08-12

## Formål

Svare på ett spørsmål: *får jeg sett solformørkelsen herfra?* Verktøyet kombinerer
formørkelsens lokale omstendigheter med skydekkevarsel, og peker på bedre steder i
nærheten når du står feil.

Verktøyet er generelt: vilkårlig sted, vilkårlig formørkelse. Den delvise
formørkelsen 12. august 2026 er første bruk, ikke eneste.

## Hva verktøyet svarer på

1. Skjer det en formørkelse synlig fra dette stedet, og når?
2. Hvor mye av sola dekkes, og hvor høyt står den?
3. Blir sikten klar nok gjennom formørkelsesvinduet?
4. Finnes det et bedre sted innen kjøreavstand?

## Sentral innsikt

Sola står lavt under maks i Norge (rundt 5–15° 12. august 2026). Da går siktlinjen
titalls kilometer nesten vannrett gjennom det laveste skylaget. Skyer rett over
hodet er irrelevante; skyer nær horisonten i solretningen avgjør alt. Scoringen må
derfor vekte skylag etter solhøyde, ikke summere dem.

## Arkitektur

Vite + React + TypeScript, statisk bygg. Én serverless-funksjon `/api/met` som
setter `User-Agent` og videresender til `api.met.no`. Vite dev-proxy eksponerer
samme sti lokalt, så frontend-koden er identisk i dev og prod.

Ingen database, ingen API-nøkler, intet state-bibliotek.

### Hvorfor proxy for MET

Nettleser-JS kan ikke sette `User-Agent`; headeren er forbudt i fetch. MET krever
en identifiserende User-Agent og garanterer ikke CORS. Open-Meteo har CORS og
krever ingenting, og kalles direkte fra nettleseren.

## Moduler

Rene moduler, null I/O, testbare uten nett:

| Modul | Ansvar | Grensesnitt |
|---|---|---|
| `eclipse` | Lokale omstendigheter | `findEclipse(lat, lon, from) → EclipseCircumstances \| null` |
| `scoring` | Skydekke + solhøyde → svar | `scoreWindow(forecast, circumstances) → LocationScore` |
| `geo` | Rutenett, avstand, retning | `buildGrid(center, radiusKm) → GridPoint[]` |
| `format` | Tid, retning, prosent til tekst | rene formateringsfunksjoner |

I/O-moduler bak ett felles grensesnitt, slik at UI-et ikke vet hvilken kilde det fikk:

| Modul | Ansvar |
|---|---|
| `weather/openMeteo` | `fetchCloudForecast(points[], window) → CloudForecast[]` |
| `weather/met` | `fetchCloudForecast([point], window) → CloudForecast[]` via `/api/met` |
| `geo/geocode` | Stedssøk via Open-Meteo geocoding |

UI-laget kaller kun disse. Ingen komponent snakker direkte med et eksternt API.

### Datatyper

```ts
type EclipseEventPoint = { time: Date; sunAltitude: number; sunAzimuth: number }

type EclipseCircumstances = {
  kind: 'partial' | 'annular' | 'total'
  obscuration: number          // 0–1 ved maks
  partialBegin: EclipseEventPoint
  peak: EclipseEventPoint
  partialEnd: EclipseEventPoint
}

type CloudSample = {
  time: Date
  low: number; mid: number; high: number   // 0–100
}

type CloudForecast = {
  source: 'met' | 'open-meteo'
  samples: CloudSample[]
}

type LocationScore = {
  score: number                // 0–100, høyere er bedre sikt
  verdict: 'clear' | 'mixed' | 'clouded' | 'unknown'
  reason: string               // menneskelig begrunnelse, vises i UI
  terrainWarning: boolean      // sann når solhøyde ved maks < 3°
}
```

## Formørkelsesmotoren

Bygget på `astronomy-engine` (MIT, rent TypeScript, ingen backend).
`SearchLocalSolarEclipse(startTime, observer)` returnerer kontakttider, dekningsgrad
og solhøyde ved hvert punkt, refraksjonskorrigert. Solens asimut hentes med
`Equator` + `Horizon` for samme tidspunkt, og brukes til å angi retning å se i.

Default er neste formørkelse synlig fra valgt sted. Datovelger lar brukeren søke
framover til en annen formørkelse.

## Scoringsmodellen

Skylagene kombineres multiplikativt, ikke additivt. To lag på 50 % gir ikke 100 %
blokkering.

```
blokkert = 1 − (1 − L·wL)(1 − M·wM)(1 − H·wH)
score    = 100 · (1 − blokkert)
```

Vektene er funksjoner av solhøyden ved det aktuelle tidspunktet:

| Solhøyde | wL (lav) | wM (middels) | wH (høy/cirrus) |
|---|---|---|---|
| > 30° | 1.00 | 0.85 | 0.45 |
| 10–30° | 1.00 | 0.90 | 0.55 |
| 3–10° | 1.00 | 0.95 | 0.70 |
| < 3° | 1.00 | 1.00 | 0.85 |

Begrunnelse: cirrus er delvis gjennomsiktig og sola sees ofte gjennom den når den
står høyt. Ved lav sol er den optiske veilengden gjennom hvert lag mange ganger
lengre, og selv tynne lag blir ugjennomtrengelige.

Skydata kommer time for time. `minutely_15` dekker ikke skylag i alle modeller og
regioner, så vi henter alltid timesverdier og interpolerer lineært til 15-minutters
steg. Interpolasjonen skjer i `weather`-laget, slik at `scoring` alltid får jevne
steg uansett kilde.

Scoren beregnes per 15-minutters steg gjennom formørkelsesvinduet og vektes med en
trekantvekt sentrert på maks: tidspunktet for maksimal dekning teller tyngst,
kontakttidene minst.

Terskler: `clear` ≥ 70, `mixed` 40–69, `clouded` < 40.

Under 3° solhøyde settes `terrainWarning`. UI-et sier da rett ut at terrenget i
solretningen sannsynligvis avgjør, og at verktøyet ikke har høydedata. Scoren vises
fortsatt, men nedtonet.

## Rutenett og «beste sted i nærheten»

7×7 punkter jevnt fordelt innenfor valgt radius (10, 50 eller 150 km; 50 er default), sentrert på
brukerens sted. 49 punkter hentes i ett Open-Meteo-kall med komma-separerte
koordinater og `cell_selection=land`, som velger nærmeste landcelle i stedet for hav.

Hvert punkt scores med samme modell, men med formørkelsens omstendigheter beregnet
for *det* punktet — kontakttider og solhøyde varierer merkbart over 150 km.

Topp 3 vises med avstand i km og himmelretning fra brukeren.

Begrensning som står i UI-et: et rutenettpunkt er en værcelle, ikke en adresse. Det
kan være myr, privat mark eller uten vei. Punktene er en pekepinn om hvilken retning
du bør dra, ikke et reisemål.

## Brukergrensesnitt

Delt skjerm. Venstre panel:

- Stedsvelger: nettleser-geolokasjon som primær, fritekstsøk som alternativ
- Verdikt i stor skrift, med begrunnelse under
- Dekningsgrad, tidspunkt for maks, solhøyde og himmelretning
- Tidslinje over formørkelsesvinduet, 15-minutters kolonner farget etter score
- Topp 3 steder i nærheten, med avstand og retning

Høyre panel: kart (Leaflet med OpenStreetMap-fliser) med brukerens posisjon,
fargelagt rutenett og markerte kandidater. Klikk på et rutenettpunkt oppdaterer
venstre panel til det stedet.

Under 900 px bredde stables panelene med verdikt øverst og kart under.

Datovelger ligger bak en sekundær «annen formørkelse»-kontroll.

## Feilhåndtering

Alle tilfeller under gir eksplisitt tekst i UI-et, aldri tom skjerm eller stille feil.

| Situasjon | Oppførsel |
|---|---|
| Formørkelse mer enn ~16 dager fram | Vis astronomien, si at værvarsel ikke finnes så langt fram |
| MET utilgjengelig | Fall tilbake til Open-Meteo, vis hvilken kilde som ble brukt |
| Open-Meteo utilgjengelig | Vis astronomien, si at skydata mangler; `verdict: 'unknown'` |
| Geolokasjon avvist eller utilgjengelig | Vis søkefelt, ingen feilmelding |
| Ingen formørkelse funnet i søkevinduet | Si det, tilby å søke lenger fram |
| Rutenett-kall feiler | Punktvarselet vises som normalt, kartet viser feilmelding |

## Testing

Vitest. Ingen nettverk i testene.

- `scoring`: rene funksjoner mot fasitverdier, inkludert grensetilfeller ved 3° og 10°
- `geo`: rutenettgeometri, avstand og retning mot kjente koordinatpar
- `eclipse`: kontakttider og dekningsgrad for Oslo 12.08.2026 mot publiserte verdier,
  toleranse ±1 minutt og ±0.01 dekningsgrad
- `weather/*`: parsing mot lagrede API-fixtures, inkludert feilsvar

## Faser

**Fase 1 — kjørbar i kveld**

Stedsvelger, formørkelsesmotor, punktvarsel fra MET med Open-Meteo som fallback,
verdikt og tidslinje. Venstre panel komplett, ingen kartkolonne.

**Fase 2**

Kart, rutenett, topp-3, radiusvelger, datovelger for andre formørkelser.

## Avgrensninger

Ute av omfang, bevisst:

- Høydedata og siktlinjeberegning mot terreng
- Tåkevarsel som egen faktor
- Ensemblevarsel og usikkerhetsspenn
- Ruteplanlegging eller kjøretid til kandidatstedene
- Innlogging, lagrede steder, varsling
