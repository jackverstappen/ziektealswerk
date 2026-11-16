/**
 * PDF → pagina-afbeeldingen + tekstlaag.
 *
 * Draait automatisch bij `npm run build`. Voor elk nummer in
 * src/content/nummers/ wordt de PDF uitgelezen en weggeschreven als:
 *
 *   public/pagina/<nummer>/p01.jpg …    de pagina's, 1400 px breed
 *   public/pagina/<nummer>/tekst.json   de tekst per pagina (leesmodus + zoeken)
 *
 * Spreads: sommige PDF's bevatten per PDF-pagina twee tijdschriftpagina's
 * naast elkaar (alleen de cover en de achterkant zijn enkel). Zet dan in de
 * kop van het nummer:
 *
 *   spreads: true
 *
 * De eerste en laatste PDF-pagina blijven dan één pagina; alle pagina's
 * daartussen worden in een linker- en rechterhelft geknipt, elk weer 1400 px
 * breed. Zonder dat veld (of met spreads: false) verandert er niets.
 *
 * Al bestaande nummers worden overgeslagen, zodat een build snel blijft.
 * Opnieuw genereren (ook nodig na het aan- of uitzetten van spreads):
 *   npm run paginas:forceer
 */
import { readFile, writeFile, mkdir, readdir, access, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, Path2D, ImageData, DOMMatrix } from "@napi-rs/canvas";

const wortel = join(dirname(fileURLToPath(import.meta.url)), "..");
const BREEDTE = 1400;
const KWALITEIT = 0.84;
const forceer = process.argv.includes("--forceer");

const bestaat = async (p) => access(p).then(() => true, () => false);

// pdfjs draait hier zonder worker (Node), vandaar de legacy-build.
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

// Waar pdfjs de standaardletters vindt. Zonder dit wordt elk teken uit een
// niet-ingebed lettertype een vakje met een kruis.
const standaardLetters = join(
  dirname(fileURLToPath(import.meta.resolve("pdfjs-dist/legacy/build/pdf.mjs"))),
  "../../standard_fonts/"
);

// pdf.js verwacht deze namen globaal zodra een pagina afbeeldingen, maskers
// of transparantie bevat. In Node bestaan ze niet, dus lenen we ze van
// @napi-rs/canvas. Zonder dit verdwijnt de afbeelding stil, of wordt de
// hele pagina wit.
globalThis.Path2D ??= Path2D;
globalThis.ImageData ??= ImageData;
globalThis.DOMMatrix ??= DOMMatrix;

// Voor softmasks, afbeeldingsmaskers en blend-modi maakt pdf.js zélf extra
// canvassen aan — in de browser via document.createElement. Die weg is er
// hier niet, dus leveren we een eigen fabriek aan.
class CanvasFabriek {
  create(breedte, hoogte) {
    const canvas = createCanvas(Math.max(1, breedte | 0), Math.max(1, hoogte | 0));
    return { canvas, context: canvas.getContext("2d") };
  }
  reset(doos, breedte, hoogte) {
    doos.canvas.width = Math.max(1, breedte | 0);
    doos.canvas.height = Math.max(1, hoogte | 0);
  }
  destroy(doos) {
    doos.canvas.width = 0;
    doos.canvas.height = 0;
    doos.canvas = null;
    doos.context = null;
  }
}

async function nummersUitContent() {
  const map = join(wortel, "src/content/nummers");
  const bestanden = (await readdir(map)).filter((f) => /\.mdx?$/.test(f));
  return Promise.all(
    bestanden.map(async (f) => {
      const tekst = await readFile(join(map, f), "utf8");
      // De kop staat tussen twee regels met ---; het CMS laat er soms
      // spaties of een Windows-regeleinde achter, vandaar de ruimere match.
      const kop = /^---\r?\n([\s\S]*?)\r?\n---/.exec(tekst)?.[1] ?? "";
      const gevonden = /^nummer:\s*["']?(\d+)/m.exec(kop)?.[1];
      const nummer = gevonden === undefined ? NaN : Number(gevonden);
      const pdf = /^pdf:\s*["']?([^"'\r\n]+)/m.exec(kop)?.[1]?.trim();
      const paginas = Number(/^paginas:\s*["']?(\d+)/m.exec(kop)?.[1]);
      // spreads: true / ja / yes → middelste PDF-pagina's in tweeën knippen.
      const spreads = /^spreads:\s*["']?(true|ja|yes)\b/im.test(kop);
      return { nummer, pdf, paginas, spreads, bron: f };
    })
  );
}

async function rendered(nummer, pdfPad, spreads) {
  const uit = join(wortel, "public/pagina", String(nummer));
  if (!forceer && (await bestaat(join(uit, "tekst.json")))) {
    console.log(`nummer ${nummer}: al gegenereerd, overgeslagen`);
    return;
  }
  await mkdir(uit, { recursive: true });

  // De PDF mag in /public staan, of ergens anders online (R2, Internet Archive).
  // Grote nummers horen niet in de repo: Git stopt rond 100 MB en het CMS al
  // veel eerder. Zet ze op R2 en vul hier het volledige adres in.
  let data;
  if (/^https?:\/\//.test(pdfPad)) {
    const antwoord = await fetch(pdfPad);
    if (!antwoord.ok) {
      console.warn(`nummer ${nummer}: ${pdfPad} gaf ${antwoord.status}, overgeslagen`);
      return;
    }
    data = new Uint8Array(await antwoord.arrayBuffer());
  } else {
    const bron = join(wortel, "public", pdfPad.replace(/^\//, ""));
    if (!(await bestaat(bron))) {
      console.warn(`nummer ${nummer}: ${pdfPad} niet gevonden, overgeslagen`);
      return;
    }
    data = new Uint8Array(await readFile(bron));
  }
  const doc = await pdfjs.getDocument({
    data,
    // In Node moet dit AAN staan: pdfjs kan hier geen lettertypen bij het
    // systeem registreren, dus tekent hij de letters als vormen. Zet je dit
    // uit, dan wordt elk teken een vakje met een kruis.
    disableFontFace: true,
    useSystemFonts: false,
    standardFontDataUrl: standaardLetters,
    CanvasFactory: CanvasFabriek,
    canvasFactory: new CanvasFabriek()
  }).promise;

  // Oude afbeeldingen weg: met of zonder spreads verschilt het aantal
  // pagina's, en een overgebleven p37.jpg van een vorige run hoort er niet bij.
  for (const f of await readdir(uit)) {
    if (/^p\d+\.jpg$/.test(f)) await rm(join(uit, f));
  }

  const tekst = [];
  const totaal = doc.numPages;
  let volgnummer = 0; // nummer van de pagina zoals de lezer hem ziet

  for (let p = 1; p <= totaal; p++) {
    const pagina = await doc.getPage(p);
    const basis = pagina.getViewport({ scale: 1 });

    // Hoeveel tijdschriftpagina's staan er op deze PDF-pagina?
    // Cover en achterkant zijn altijd enkel. Een middenpagina die toch
    // staand is, is waarschijnlijk geen spread: niet knippen, wel melden.
    let delen = 1;
    if (spreads && p > 1 && p < totaal) {
      if (basis.width > basis.height) delen = 2;
      else console.warn(`\nnummer ${nummer}, pagina ${p}: staand formaat, niet geknipt`);
    }

    // Een spread wordt dubbel zo breed getekend, zodat elke helft weer
    // BREEDTE pixels breed is.
    const vp = pagina.getViewport({ scale: (BREEDTE * delen) / basis.width });
    const canvas = createCanvas(Math.round(vp.width), Math.round(vp.height));
    const ctx = canvas.getContext("2d");
    // Een pagina zonder eigen achtergrond blijft anders doorzichtig, wat in
    // een JPEG zwart wordt.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    try {
      await pagina.render({ canvasContext: ctx, viewport: vp }).promise;
    } catch (fout) {
      // Doorgaan: één stukgelopen pagina mag de hele build niet stilzetten.
      // De melding hieronder vertelt wélke pagina en waarom.
      console.warn(`\nnummer ${nummer}, pagina ${p}: tekenen mislukt — ${fout?.message || fout}`);
    }

    // Waar de vouw zit, in pixels.
    const vouw = delen === 2 ? Math.round(canvas.width / 2) : canvas.width;

    // De tekst meteen naar schermcoördinaten (linksboven als oorsprong) en
    // per blok onthouden op welke helft het begint. Een kop die over de vouw
    // doorloopt, komt zo bij de linkerpagina terecht.
    const inhoud = await pagina.getTextContent();
    const stukken = inhoud.items.map((i) => {
      const t = pdfjs.Util.transform(vp.transform, i.transform);
      const grootte = Math.hypot(t[2], t[3]);
      return { s: i.str, x: t[4], y: t[5] - grootte, g: grootte, deel: t[4] >= vouw ? 1 : 0 };
    });

    for (let d = 0; d < delen; d++) {
      const links = d === 0 ? 0 : vouw;
      const breedte = d === 0 ? vouw : canvas.width - vouw;

      let beeld = canvas;
      if (delen === 2) {
        beeld = createCanvas(breedte, canvas.height);
        beeld
          .getContext("2d")
          .drawImage(canvas, links, 0, breedte, canvas.height, 0, 0, breedte, canvas.height);
      }

      volgnummer++;
      await writeFile(
        join(uit, `p${String(volgnummer).padStart(2, "0")}.jpg`),
        await beeld.encode("jpeg", Math.round(KWALITEIT * 100))
      );

      const hier = stukken.filter((b) => b.deel === d);
      tekst.push({
        pagina: volgnummer,
        pdfPagina: p,
        breedte,
        hoogte: canvas.height,
        blokken: hier
          .filter((b) => b.s.trim())
          .map((b) => ({
            s: b.s,
            x: Math.round((b.x - links) * 100) / 100,
            y: Math.round(b.y * 100) / 100,
            g: Math.round(b.g * 100) / 100
          })),
        plat: schoon(hier.map((b) => b.s).join(" "))
      });
    }
    process.stdout.write(`\rnummer ${nummer}: pagina ${p}/${totaal}`);
  }

  await writeFile(join(uit, "tekst.json"), JSON.stringify(tekst));
  console.log(
    spreads
      ? `\nnummer ${nummer}: ${totaal} PDF-pagina's → ${volgnummer} pagina's klaar`
      : `\nnummer ${nummer}: ${volgnummer} pagina's klaar`
  );
}

// Afbreekstreepjes en harde regeleinden weghalen, zodat de leesmodus
// meeloopt op een telefoon.
function schoon(s) {
  return s
    .replace(/\s+/g, " ")
    .replace(/([a-zà-ÿ])-\s([a-zà-ÿ])/g, "$1$2")
    .replace(/(^|\s)([A-Z]) (?=[a-zà-ÿ]{2})/g, "$1$2")
    .trim();
}

for (const n of await nummersUitContent()) {
  // Number.isFinite, niet !n.nummer: nummer 0 bestaat en is geldig.
  if (!Number.isFinite(n.nummer) || !n.pdf) {
    console.warn(`${n.bron}: geen nummer of pdf in de kop, overgeslagen`);
    continue;
  }
  await rendered(n.nummer, n.pdf, n.spreads);
}
