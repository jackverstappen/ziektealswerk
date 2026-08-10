/**
 * PDF → pagina-afbeeldingen + tekstlaag.
 *
 * Draait automatisch bij `npm run build`. Voor elk nummer in
 * src/content/nummers/ wordt de PDF uitgelezen en weggeschreven als:
 *
 *   public/pagina/<nummer>/p01.jpg …    de pagina's, 1400 px breed
 *   public/pagina/<nummer>/tekst.json   de tekst per pagina (leesmodus + zoeken)
 *
 * Al bestaande nummers worden overgeslagen, zodat een build snel blijft.
 * Opnieuw genereren: npm run paginas:forceer
 */
import { readFile, writeFile, mkdir, readdir, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas } from "@napi-rs/canvas";

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

async function nummersUitContent() {
  const map = join(wortel, "src/content/nummers");
  const bestanden = (await readdir(map)).filter((f) => /\.mdx?$/.test(f));
  return Promise.all(
    bestanden.map(async (f) => {
      const tekst = await readFile(join(map, f), "utf8");
      // De kop staat tussen twee regels met ---; het CMS laat er soms
      // spaties of een Windows-regeleinde achter, vandaar de ruimere match.
      const kop = /^---\r?\n([\s\S]*?)\r?\n---/.exec(tekst)?.[1] ?? "";
      const nummer = Number(/^nummer:\s*["']?(\d+)/m.exec(kop)?.[1]);
      const pdf = /^pdf:\s*["']?([^"'\r\n]+)/m.exec(kop)?.[1]?.trim();
      const paginas = Number(/^paginas:\s*["']?(\d+)/m.exec(kop)?.[1]);
      return { nummer, pdf, paginas, bron: f };
    })
  );
}

async function rendered(nummer, pdfPad) {
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
    disableFontFace: true,
    useSystemFonts: true,
    standardFontDataUrl: standaardLetters
  }).promise;
  const tekst = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const pagina = await doc.getPage(p);
    const basis = pagina.getViewport({ scale: 1 });
    const vp = pagina.getViewport({ scale: BREEDTE / basis.width });
    const canvas = createCanvas(Math.round(vp.width), Math.round(vp.height));
    await pagina.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
    await writeFile(
      join(uit, `p${String(p).padStart(2, "0")}.jpg`),
      await canvas.encode("jpeg", Math.round(KWALITEIT * 100))
    );

    const inhoud = await pagina.getTextContent();
    // De blokken worden meteen naar schermcoördinaten omgerekend (linksboven
    // als oorsprong, in de breedte hieronder). De browser hoeft ze straks
    // alleen nog te schalen naar de getoonde breedte.
    const blokken = inhoud.items
      .filter((i) => i.str.trim())
      .map((i) => {
        const t = pdfjs.Util.transform(vp.transform, i.transform);
        const grootte = Math.hypot(t[2], t[3]);
        return {
          s: i.str,
          x: Math.round(t[4] * 100) / 100,
          y: Math.round((t[5] - grootte) * 100) / 100,
          g: Math.round(grootte * 100) / 100
        };
      });

    tekst.push({
      pagina: p,
      breedte: Math.round(vp.width),
      hoogte: Math.round(vp.height),
      blokken,
      plat: schoon(inhoud.items.map((i) => i.str).join(" "))
    });
    process.stdout.write(`\rnummer ${nummer}: pagina ${p}/${doc.numPages}`);
  }

  await writeFile(join(uit, "tekst.json"), JSON.stringify(tekst));
  console.log(`\nnummer ${nummer}: ${doc.numPages} pagina's klaar`);
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
  if (!n.nummer || !n.pdf) {
    console.warn(`${n.bron}: geen nummer of pdf in de kop, overgeslagen`);
    continue;
  }
  await rendered(n.nummer, n.pdf);
}
