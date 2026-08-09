/**
 * De online lezer. Bewust klein en zonder framework: pagina-afbeeldingen,
 * een onzichtbare tekstlaag om te kunnen selecteren, en spreads zoals in druk.
 */
export function start(root) {
  if (!root) return;
  const nummer = Number(root.dataset.nummer);
  const totaal = Number(root.dataset.paginas);
  const tekst = JSON.parse(root.dataset.tekst || "[]");
  const spread = root.querySelector("[data-spread]");
  const teller = root.querySelector("[data-teller]");
  const rail = root.querySelector("[data-rail]");
  const sleutel = `zw-lezen-${nummer}`;

  const src = (p) => `/pagina/${nummer}/p${String(p).padStart(2, "0")}.jpg`;
  // Een spread past zodra het scherm breder is dan hoog en er genoeg breedte is
  // — dus ook op een telefoon die je kantelt. Anders één pagina tegelijk.
  const smal = () => !(window.innerWidth >= 820 || (window.innerWidth > window.innerHeight && window.innerWidth >= 640));
  let pagina = Math.min(totaal, Math.max(1, Number(localStorage.getItem(sleutel)) || 1));

  const links = () => (smal() || pagina === 1 ? pagina : pagina % 2 === 0 ? pagina : pagina - 1);

  function teken() {
    const l = links();
    const naast = !smal() && l > 1 && l + 1 <= totaal;
    spread.replaceChildren(kader(l, true), ...(naast ? [kader(l + 1, false)] : []));
    teller.textContent = (naast ? `${l}–${l + 1}` : l) + ` van ${totaal}`;
    rail.querySelectorAll("[data-ga]").forEach((b) => {
      const aan = Number(b.dataset.ga) === l || (naast && Number(b.dataset.ga) === l + 1);
      b.style.borderColor = aan ? "var(--color-accent)" : "var(--color-divider)";
    });
    localStorage.setItem(sleutel, String(pagina));
  }

  function kader(p, metTekst) {
    const fig = document.createElement("figure");
    fig.className = "blueprint";
    fig.style.cssText =
      "margin:0;padding:0;border-radius:0;background:#fff;position:relative;" +
      (smal() ? "width:min(560px,94vw)" : "width:min(560px,44vw);max-height:calc(100dvh - 130px)");
    fig.innerHTML = '<i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>';
    const doos = document.createElement("div");
    doos.style.position = "relative";
    const img = new Image();
    img.src = src(p);
    img.alt = `Pagina ${p} van nummer ${nummer}`;
    img.style.cssText = "width:100%;display:block";
    doos.appendChild(img);
    fig.appendChild(doos);
    if (metTekst) img.addEventListener("load", () => tekstlaag(doos, img, p));
    return fig;
  }

  // De blokken staan al in schermcoördinaten bij een breedte van data.breedte;
  // hier alleen nog schalen naar de breedte waarop de pagina getoond wordt.
  function tekstlaag(doos, img, p) {
    const data = tekst.find((t) => t.pagina === p);
    if (!data) return;
    const schaal = img.getBoundingClientRect().width / data.breedte;
    const laag = document.createElement("div");
    laag.className = "tekstlaag";
    laag.style.cssText = "position:absolute;inset:0;overflow:hidden;line-height:1";
    laag.innerHTML = data.blokken
      .map(
        (b) =>
          `<span style="left:${(b.x * schaal).toFixed(2)}px;top:${(b.y * schaal).toFixed(2)}px;font-size:${(b.g * schaal).toFixed(2)}px">${escape(b.s)}</span>`
      )
      .join("");
    doos.querySelector(".tekstlaag")?.remove();
    doos.appendChild(laag);
  }

  const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  function ga(n) {
    pagina = Math.min(totaal, Math.max(1, n));
    teken();
  }
  const stap = () => (smal() || links() === 1 ? 1 : 2);

  root.querySelector("[data-vorige]").addEventListener("click", () => ga(links() === 1 ? 1 : links() - stap()));
  root.querySelector("[data-volgende]").addEventListener("click", () => ga(links() + stap()));
  rail.addEventListener("click", (e) => {
    const b = e.target.closest("[data-ga]");
    if (b) ga(Number(b.dataset.ga));
  });
  window.addEventListener("keydown", (e) => {
    if (/INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === "ArrowRight") ga(links() + stap());
    if (e.key === "ArrowLeft") ga(links() === 1 ? 1 : links() - stap());
  });
  let x0 = null;
  window.addEventListener("touchstart", (e) => (x0 = e.touches[0].clientX), { passive: true });
  window.addEventListener("touchend", (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 60) ga(pagina + (dx < 0 ? 1 : -1));
    x0 = null;
  }, { passive: true });
  let t;
  window.addEventListener("resize", () => {
    clearTimeout(t);
    t = setTimeout(teken, 200);
  });
  // Kantelen van het toestel wisselt tussen één pagina en een spread.
  window.addEventListener("orientationchange", () => setTimeout(teken, 300));

  const stijl = document.createElement("style");
  stijl.textContent =
    ".tekstlaag span{position:absolute;color:transparent;white-space:pre;transform-origin:0 0;cursor:text}" +
    ".tekstlaag ::selection{background:color-mix(in srgb,var(--color-accent) 40%,transparent)}";
  document.head.appendChild(stijl);

  teken();
}
