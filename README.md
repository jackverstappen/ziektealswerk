# ziekte ⇔ werk — de website

Een statische site: er draait geen server en er is geen database. Alle inhoud
staat als gewone bestanden in deze repo. Wie iets wijzigt, wijzigt een bestand;
de site wordt daarna automatisch opnieuw gebouwd en gepubliceerd.

---

## Voor wie de site bijhoudt (geen techniek nodig)

Ga naar **ziekte-werk.nl/admin** en log in met je GitHub-account. Je krijgt
formulieren voor Publicaties, Agenda en Nieuws. Opslaan is publiceren: binnen
een paar minuten staat het online. Je hoeft niets te installeren en je kunt
niets stukmaken — elke wijziging is terug te draaien.

### Een nieuw nummer publiceren

Je hebt nodig: de PDF van het nummer, een afbeelding van de omslag, en per
artikel een mp3.

1. **Zet de mp3's online.** Niet hier — audiobestanden zijn te groot voor de
   site. Upload ze naar Internet Archive (of R2) en kopieer per bestand de
   directe link. Noem ze `1-01.mp3`, `1-02.mp3` … zodat je ze terugvindt.
2. **Open /admin → Publicaties → Nieuw.**
3. Vul nummer, titel, jaar, aantal pagina's en de verschijningsdatum in.
4. **Sleep de omslag en de PDF in het formulier.** De pagina's van de online
   lezer worden hier automatisch uit gehaald — die hoef je niet apart te maken.
5. **Voeg de artikelen toe.** Per artikel: volgnummer (`01`, `02` …), titel,
   auteur, een samenvatting van twee regels, de link naar de mp3, de duur in
   seconden en de bestandsgrootte in bytes.
6. **Opslaan.** Klaar. De publicatiepagina, de online lezer, de luisterpagina's,
   de QR-codes en de podcastfeed maken zichzelf.

> **Twee dingen die je nooit meer mag wijzigen:** het nummer en het volgnummer
> van een artikel. Die staan samen in de gedrukte QR-code (`/luister/1-07`) en
> in de podcast-apps van je luisteraars. Wijzig je ze, dan werken gedrukte codes
> niet meer en verschijnen afleveringen dubbel.

### Een bijeenkomst of nieuwsbericht

/admin → Agenda of Nieuws → Nieuw. Datum en tijd zijn Nederlandse tijd.
Bijeenkomsten verdwijnen vanzelf uit de agenda zodra ze geweest zijn.

### Waar de QR-codes vandaan komen

Ga naar `/luister/<nummer>`, onderaan staat het QR-vel. Elke code is een SVG en
dus verliesvrij te vergroten — rechtsklikken, opslaan, in de opmaak plaatsen.
Druk ze minimaal 20 × 20 mm, met witruimte eromheen, donker op licht, en zet de
URL er klein onder voor wie niet scant.

---

## Waar wat staat

| Wat je op de site ziet | Welk bestand |
| --- | --- |
| Startpagina | `src/pages/index.astro` |
| Publicaties | `src/pages/publicaties.astro` |
| Agenda | `src/pages/agenda.astro` |
| Online lezer | `src/pages/lezen/[nummer].astro` + `src/scripts/lezer.js` |
| Luisteren, QR-vel, artikelpagina | `src/pages/luister/[code].astro` |
| Podcastfeed | `src/pages/luister/feed.xml.js` |
| Balk, voettekst, mobiel menu | `src/layouts/Basis.astro` |
| Kleuren, type, componenten | `src/styles/industry.css` (het designsysteem — niet ter plekke aanpassen) |

## Voor wie er technisch aan werkt

```
npm install
npm run dev        # lokale voorbeeldsite
npm run build      # PDF's uitpakken + site bouwen
npm run paginas    # alleen de PDF's uitpakken
```

**Opbouw**

```
src/content/nummers/   één bestand per publicatie (PDF + artikelen)
src/content/events/    agenda
src/content/nieuws/    berichten
scripts/render-pdf.mjs PDF → pagina-afbeeldingen + tekstlaag (draait bij build)
src/pages/lezen/       de online lezer
src/pages/luister/     luisterpagina's, QR-vel en feed.xml
public/admin/          Sveltia CMS (config.yml = de formulieren)
```

**Hosting.** Cloudflare Pages, gekoppeld aan deze repo. Build: `npm run build`,
uitvoermap `dist`. Gratis, geen limiet op verkeer. De gegenereerde
pagina-afbeeldingen worden meegecommit zodat een build snel blijft; verwijder
`public/pagina/<nummer>/` en draai `npm run paginas:forceer` om ze opnieuw te
maken.

**Inloggen op /admin** loopt via een kleine authenticatie-worker
(sveltia-cms-auth) op Cloudflare. Het adres daarvan staat als `base_url` in
`public/admin/config.yml`. Eén keer instellen, daarna nooit meer.

**Wat er bewust niet is:** geen server, geen database, geen inlog voor
bezoekers. Het contactformulier heeft daarom een externe dienst nodig, of
gewoon een `mailto:`-link — dat laatste werkt en gaat nooit stuk.

**Toegankelijkheid** is hier geen bijzaak. De pagina's van de lezer zijn beeld,
maar er ligt een onzichtbare tekstlaag overheen (selecteren, kopiëren, zoeken)
en het transcript per artikel is de leesbare versie voor wie vergroot of een
schermlezer gebruikt. Laat het transcriptveld niet leeg.
