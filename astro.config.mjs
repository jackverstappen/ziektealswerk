// @ts-check
import { defineConfig } from "astro/config";

export default defineConfig({
  // Pas dit aan naar het echte domein. Het adres wordt gebruikt in feed.xml
  // en in de QR-codes, dus wijzig het niet meer nadat er iets gedrukt is.
  site: "https://ziektealswerk.nl",
  trailingSlash: "never",
  build: { format: "file" }
});
