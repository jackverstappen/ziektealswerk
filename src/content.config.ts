import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

// Eén nummer = één bestand in src/content/nummers/.
// De PDF en de artikelen staan erin; de pagina-afbeeldingen worden bij het
// bouwen automatisch uit de PDF gehaald (scripts/render-pdf.mjs).
const nummers = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/nummers" }),
  schema: z.object({
    nummer: z.number(),
    titel: z.string(),
    ondertitel: z.string().optional(),
    jaar: z.number(),
    paginas: z.number(),
    status: z.enum(["Nieuw", "Te bestellen", "Uitverkocht in print", "In de maak"]),
    omslag: z.string(),                 // pad in /public, bv. /omslag/1.jpg
    pdf: z.string(),                    // pad in /public, bv. /pdf/nummer-1.pdf
    verschenen: z.coerce.date(),
    artikelen: z.array(
      z.object({
        n: z.string(),                  // "01" — ligt vast, staat in gedrukte QR-codes
        titel: z.string(),
        auteur: z.string(),
        lezer: z.string().optional(),
        samenvatting: z.string(),
        audio: z.string().optional(),   // volledige URL naar de mp3 (Internet Archive of R2)
        duur: z.number().optional(),    // seconden
        bytes: z.number().optional(),   // bestandsgrootte, voor de podcastfeed
        transcript: z.string().optional()
      })
    ).default([])
  })
});

const events = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/events" }),
  schema: z.object({
    titel: z.string(),
    datum: z.coerce.date(),
    eindtijd: z.coerce.date().optional(),
    plaats: z.string(),
    soort: z.enum(["Leesgroep", "Presentatie", "Werksessie", "Gesprek", "Tentoonstelling"]),
    aanmelden: z.string().optional()
  })
});

const nieuws = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/nieuws" }),
  schema: z.object({
    titel: z.string(),
    datum: z.coerce.date(),
    soort: z.enum(["Aankondiging", "Open oproep", "Pers"]).default("Aankondiging"),
    bron: z.string().optional()
  })
});

export const collections = { nummers, events, nieuws };
