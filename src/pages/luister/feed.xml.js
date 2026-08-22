import { getCollection } from "astro:content";

const SHOW = {
  titel: "ziekte ⇔ werk",
  ondertitel: "Gesproken versies van onze publicatie",
  omschrijving:
    "Elk artikel uit de publicatie ziekte ⇔ werk, voorgelezen door de mensen die eraan meeschreven. " +
    "Over werk dat niet meetelt: herstellen, wachten, formulieren invullen, en toch doorgaan.",
  taal: "nl-NL",
  auteur: "Werkgroep ziekte ⇔ werk",
  email: "info@ziektealswerk.nl",
  omslag: "/podcast-omslag.jpg",
  categorie: "Society & Culture"
};

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const duur = (s = 0) =>
  [Math.floor(s / 3600), Math.floor((s % 3600) / 60), Math.round(s % 60)]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");

// Podcast-apps leiden het formaat af uit dit type, niet uit de bestandsnaam.
const mimetype = (url = "") => {
  const ext = url.split("?")[0].split(".").pop().toLowerCase();
  if (ext === "m4a") return "audio/x-m4a";
  if (ext === "mp4" || ext === "m4b") return "audio/mp4";
  if (ext === "aac") return "audio/aac";
  if (ext === "wav") return "audio/wav";
  return "audio/mpeg";
};

export async function GET({ site }) {
  const basis = site.href.replace(/\/$/, "");
  const nummers = await getCollection("nummers");

  const afleveringen = nummers
    .flatMap((n) =>
      n.data.artikelen
        .filter((a) => a.audio)
        .map((a) => ({ ...a, nummer: n.data.nummer, verschenen: n.data.verschenen }))
    )
    .sort((a, b) => b.verschenen - a.verschenen);

  const items = afleveringen
    .map(
      (a) => `    <item>
      <title>${esc(a.titel)}</title>
      <link>${basis}/luister/${a.nummer}-${a.n}</link>
      <guid isPermaLink="false">ziekte-werk-${a.nummer}-${a.n}</guid>
      <pubDate>${a.verschenen.toUTCString()}</pubDate>
      <description>${esc(a.samenvatting)}</description>
      <itunes:author>${esc(a.auteur)}</itunes:author>
      <itunes:duration>${duur(a.duur)}</itunes:duration>
      <itunes:season>${a.nummer}</itunes:season>
      <itunes:episode>${parseInt(a.n, 10)}</itunes:episode>
      <enclosure url="${esc(a.audio)}" length="${a.bytes ?? 0}" type="${mimetype(a.audio)}"/>
    </item>`
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(SHOW.titel)} — ${esc(SHOW.ondertitel)}</title>
    <link>${basis}</link>
    <atom:link href="${basis}/luister/feed.xml" rel="self" type="application/rss+xml"/>
    <language>${SHOW.taal}</language>
    <description>${esc(SHOW.omschrijving)}</description>
    <itunes:author>${esc(SHOW.auteur)}</itunes:author>
    <itunes:owner>
      <itunes:name>${esc(SHOW.auteur)}</itunes:name>
      <itunes:email>${esc(SHOW.email)}</itunes:email>
    </itunes:owner>
    <itunes:image href="${basis}${SHOW.omslag}"/>
    <itunes:category text="${esc(SHOW.categorie)}"/>
    <itunes:explicit>false</itunes:explicit>
${items}
  </channel>
</rss>
`;

  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
