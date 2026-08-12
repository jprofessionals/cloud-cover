# Cloud Cover

Svarer på ett spørsmål: **får jeg sett solformørkelsen herfra?**

Du velger et sted. Appen regner ut når formørkelsen skjer akkurat der, hvor mye av
sola som dekkes og hvor høyt den står, henter skydekket for det tidsrommet, og gir
deg et svar i klartekst i stedet for en tabell du må tolke selv.

## Kom i gang

Du trenger **Node 20 eller nyere**. Sjekk med `node --version`.

```bash
npm install
npm run dev
```

Åpne **http://localhost:5173** i nettleseren.

Er porten opptatt, velger Vite den neste ledige og skriver adressen i terminalen.
Stopp serveren med `Ctrl+C`.

## Slik bruker du den

Trykk **«Bruk min posisjon»**, eller skriv et stedsnavn i søkefeltet og velg fra
lista. Sier du nei til posisjonsdeling er det helt greit, søkefeltet gjør samme
nytten.

Du får:

- **Verdikt** i stor skrift, med en setning om hvorfor
- **Maks** — klokkeslettet formørkelsen er på sitt største, i stedets egen tidssone
- **Dekket** — hvor stor del av solskiva månen dekker
- **Solhøyde** — grader over horisonten
- **Se mot** — himmelretningen du skal se i
- **Tidslinje** — skydekket gjennom hele formørkelsen, i 15-minutters kolonner.
  Grønt er klart, gult vekslende, rødt overskyet. Hold musepekeren over en kolonne
  for klokkeslett og poengsum.

Er det ingen formørkelse i dag, viser appen den neste som er synlig fra stedet du
valgte. Ligger den mer enn et par uker fram, finnes det ikke værvarsel ennå, og
appen sier fra om det framfor å gjette.

## Hvorfor svaret ikke bare er «40 % skyer»

Når sola står lavt, går siktlinjen din titalls kilometer nesten vannrett gjennom
det laveste skylaget. Da er skyer rett over hodet uten betydning, mens et lavt lag
mot vest ødelegger alt. Appen vekter derfor skylagene etter hvor høyt sola står,
ikke bare summerer dem.

Står sola under tre grader sier appen fra om at terrenget i solretningen trolig
avgjør. Den har ingen høydedata og vet ikke om det står et fjell i veien.

## Datakilder

Ingen API-nøkler, ingen konto, ingenting å sette opp.

- **MET Norway** (yr.no) for skydekke, mest treffsikker i Norge
- **Open-Meteo** som reserve når MET ikke svarer, og for steder utenfor Norden
- **Open-Meteo geocoding** for stedssøk
- **astronomy-engine** for formørkelsesberegningene, lokalt i nettleseren

Appen viser hvilken kilde tallene kom fra.

MET krever at kall identifiserer seg med en `User-Agent`, og den headeren får ikke
JavaScript i nettleseren lov til å sette. Derfor går MET-kallene gjennom en liten
proxy. I utvikling er den innebygd i Vite og virker uten oppsett.

## Andre kommandoer

```bash
npm test          # kjør testene
npm run test:watch # kjør testene kontinuerlig mens du endrer kode
npm run build     # bygg for produksjon, ender i dist/
npm run preview   # se på produksjonsbygget lokalt
```

Merk at `npm run preview` ikke har MET-proxyen. Appen faller da tilbake til
Open-Meteo og sier fra i grensesnittet at det er kilden.

## Hvis noe ikke virker

**Blank side eller feil i konsollen etter `git pull`:** kjør `npm install` på nytt,
avhengighetene kan ha endret seg.

**«Fikk ikke hentet skydata»:** begge værtjenestene er utilgjengelige, eller du er
uten nett. Formørkelsesberegningene virker fortsatt, de kjører lokalt.

**«Fikk ikke kontakt med stedssøket»:** geocoding-tjenesten svarer ikke. Prøv igjen,
eller bruk posisjonsknappen.

**Posisjonsknappen gjør ingenting:** nettlesere gir bare posisjon på `localhost`
eller over HTTPS. På `localhost` skal det virke; ellers bruk søkefeltet.

## Status

Fase 1 er ferdig: sted, formørkelse, verdikt og tidslinje.

Fase 2 kommer: kart med fargelagt rutenett, forslag til bedre steder i nærheten, og
en velger for andre formørkelser enn den neste.
