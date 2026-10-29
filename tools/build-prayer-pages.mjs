// Builds the 10 prayer language pages:
//   satsang-morning-prayer-{english,hindi,odia,bengali,assamese}.html
//   satsang-evening-prayer-{english,hindi,odia,bengali,assamese}.html
// and refreshes their entries (with hreflang alternates) in sitemap.xml.
//
// Run:  node tools/build-prayer-pages.mjs
// (A GitHub Action runs this on every push that changes data/prayers or tools/prayers.)
//
// Prayer text comes only from data/prayers/lyrics/<page>/<prayer>.<language>.txt and is
// printed exactly as written there. For each language page the build picks, per prayer:
//   1. <prayer>.<language>.txt   native text for that page (hindi, bengali, odia, assamese)
//   2. <prayer>.hindi.txt        converted letter by letter into the page's script
//                                (Bengali, Odia, Assamese pages only)
//   3. <prayer>.latin.txt        the English-letters text, as a fallback
// Page copy (headings, labels, FAQ) lives in tools/prayers/i18n.mjs.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { L, LANG_ORDER } from "./prayers/i18n.mjs";
import { convertDevanagari } from "./prayers/script-convert.mjs";

const DATA = JSON.parse(readFileSync("data/prayers/pages.json", "utf8"));
const SITE = DATA.site;
const SHELL = readFileSync("tools/prayers/shell.html", "utf8");
const DATE = DATA.dateModified;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escText = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const plain = (s) => String(s).replace(/&nbsp;/g, " ");
const jsonForScript = (v, indent) => JSON.stringify(v, null, indent).replace(/</g, "\\u003c");
const url = (base, lang) => `${SITE}/${base}-${L[lang].slug}`;
const path = (base, lang) => `/${base}-${L[lang].slug}`;

// ---------- lyrics files ----------
function readLyrics(base, id, key) {
  const file = `data/prayers/lyrics/${base}/${id}.${key}.txt`;
  if (!existsSync(file)) return null;
  const raw = readFileSync(file, "utf8").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const lines = raw.split("\n");
  const meta = {};
  while (lines.length && /^#/.test(lines[0])) {
    const m = lines.shift().match(/^#\s*([a-z]+)\s*:\s*(.+?)\s*$/i);
    if (m) meta[m[1].toLowerCase()] = m[2];
  }
  const text = lines.map((l) => l.replace(/\s+$/, "")).join("\n").replace(/^\n+|\n+$/g, "");
  if (!text) return null;
  const stanzas = text.split(/\n{2,}/).map((s) => s.split("\n"));
  return { text: stanzas.map((s) => s.join("\n")).join("\n\n"), stanzas, source: meta.source || null, file };
}

const SCRIPT_OF = { english: "Latn", hindi: "Deva", bengali: "Beng", assamese: "Beng", odia: "Orya" };
const DEFAULT_SCRIPT = { hi: "Deva", sa: "Deva", bn: "Beng" };
function lyricsLang(src, lang, status) {
  if (status === "latin" || status === "fallback") return `${src}-Latn`;
  const script = SCRIPT_OF[lang];
  return DEFAULT_SCRIPT[src] === script ? src : `${src}-${script}`;
}

function resolve(page, prayer, lang) {
  const latin = readLyrics(page.base, prayer.id, "latin");
  if (!latin) throw new Error(`Missing ${page.base}/${prayer.id}.latin.txt`);
  const T = L[lang];
  if (T.nativeKey === "latin") return { ...latin, status: "latin" };
  const native = readLyrics(page.base, prayer.id, T.nativeKey);
  if (native) return { ...native, status: "native" };
  if (T.convertTarget) {
    const hindi = readLyrics(page.base, prayer.id, "hindi");
    if (hindi) {
      const text = convertDevanagari(hindi.text, T.convertTarget, prayer.sourceLanguage);
      return { text, stanzas: text.split("\n\n").map((s) => s.split("\n")), source: hindi.source, status: "converted" };
    }
  }
  return { ...latin, status: "fallback" };
}

const firstLine = (text) => text.split("\n")[0].replace(/\s*\(\d+\)\s*$/, "").replace(/[\s।॥.,!;:]+$/u, "");

// ---------- page parts ----------
function switcher(base, lang) {
  const T = L[lang];
  const links = LANG_ORDER.map((l) => {
    const t = L[l];
    const cur = l === lang ? ' aria-current="page"' : "";
    const cls = t.fontClass ? ` class="${t.fontClass}"` : "";
    return `<a href="${path(base, l)}" hreflang="${t.hreflang}" lang="${t.htmlLang}"${cls}${cur}>${t.endonym}</a>`;
  }).join("");
  return `<nav class="lang-switch" aria-label="${esc(T.switcherAria)}"><span class="lbl">${T.switcherLabel}</span>${links}</nav>`;
}

function langLinks(base) {
  return LANG_ORDER.map((l) => `<a class="textlink${L[l].fontClass ? " " + L[l].fontClass : ""}" href="${path(base, l)}" hreflang="${L[l].hreflang}" lang="${L[l].htmlLang}">${L[l].endonym}</a>`).join("");
}

function buildPage(key, lang) {
  const page = DATA.pages[key];
  const other = key === "morning" ? "evening" : "morning";
  const T = L[lang];
  const pageUrl = url(page.base, lang);
  const n = page.prayers.length;

  const items = page.prayers.map((prayer, i) => {
    const r = resolve(page, prayer, lang);
    const isKirtan = prayer.kind === "kirtan";
    const latinTitle = prayer.title;
    const title = isKirtan ? T.kirtanTitle : (r.status === "latin" || r.status === "fallback") ? latinTitle : firstLine(r.text);
    return { prayer, r, isKirtan, title, latinTitle, num: i + 1 };
  });
  const statuses = new Set(items.map((x) => x.r.status));

  // ---- head ----
  const tags = lang === "english" ? [...page.englishTags, ...T.extraTags[key]] : T.tags[key];
  const nativeTags = lang === "english" ? page.englishNativeTags : [];
  const prayerList = key === "morning" ? "Radhaswami Naam Jo Gaawe, Bar Bar Kar Jor Kar, Gururbrahmaa" : "Bar Bar Karoon Binati, Bar Bar Kar Jor Kar, Gururbrahmaa";
  const title = T.title(key);
  const description = T.description(key, prayerList);
  const ogTitle = T.ogTitle ? T.ogTitle(key) : `${plain(T.h1[key])} | Sri Sri Thakur`;
  const ogAlt = lang === "english" ? page.ogImageAlt : plain(T.h1[key]);
  const alternates = LANG_ORDER.map((l) => `<link rel="alternate" hreflang="${L[l].hreflang}" href="${url(page.base, l)}">`).join("\n")
    + `\n<link rel="alternate" hreflang="x-default" href="${url(page.base, "english")}">`;
  const localeAlts = LANG_ORDER.filter((l) => l !== lang).map((l) => `<meta property="og:locale:alternate" content="${L[l].ogLocale}">`).join("\n");
  const headMeta = [
    `<title>${escText(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    `<meta name="keywords" content="${esc([...tags, ...nativeTags.map((t) => t[1])].join(", "))}">`,
    `<meta name="robots" content="index, follow, max-image-preview:large">`,
    `<link rel="canonical" href="${pageUrl}">`,
    alternates,
    `<meta property="og:type" content="article">`,
    `<meta property="og:site_name" content="Sri Sri Thakur">`,
    `<meta property="og:title" content="${esc(ogTitle)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${pageUrl}">`,
    `<meta property="og:image" content="${page.ogImage}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="${esc(ogAlt)}">`,
    `<meta property="og:locale" content="${T.ogLocale}">`,
    localeAlts,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(ogTitle)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    `<meta name="twitter:image" content="${page.ogImage}">`,
  ].join("\n");
  const fontFamilies = ["Geist:wght@300;400;500;600", "Noto+Serif+Bengali:wght@400;500", "Noto+Sans+Devanagari:wght@400;500"];
  if (lang === "odia") fontFamilies.push("Noto+Sans+Oriya:wght@400;500");
  const fonts = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${fontFamilies.map((f) => "family=" + f).join("&")}&display=swap">`;

  // ---- status sentences ----
  let status;
  if (lang === "english") status = T.statusLatin;
  else status = [statuses.has("native") && T.statusNative, statuses.has("converted") && T.statusConverted, statuses.has("fallback") && T.statusLatin].filter(Boolean).join(" ");

  // ---- main ----
  const toc = items.map(({ prayer, isKirtan, title, num }) => {
    const label = isKirtan ? `${T.kirtanWord} · ${T.langName[prayer.sourceLanguage]}` : `${T.prayerN(num)} · ${T.langName[prayer.sourceLanguage]}`;
    return `<a href="#${prayer.id}"><span class="num">${num}</span><span><b>${escText(title)}</b><small>${label}</small></span></a>`;
  }).join("");

  const pageHead = `  <div class="wrap">
    <nav class="crumbs" aria-label="${esc(T.crumbAria)}"><a href="/">${T.home}</a><span aria-hidden="true">/</span><span aria-current="page">${T.pageName[key]}</span></nav>
    <div class="page-head">
      ${switcher(page.base, lang)}
      <p class="eyebrow">${T.eyebrow[key]}</p>
      <h1>${T.h1[key]}</h1>
      ${lang === "english" ? `<p class="native">${T.nativeLine[key]}</p>` : `<p class="native" lang="en">${L.english.pageName[key]} in ${T.englishName}</p>`}
      <p class="lede">${T.lede(T.shortName[key])}</p>
      ${lang !== "english" && statuses.has("fallback") ? `<div class="note"><svg><use href="#i-info"/></svg><span>${T.pageNoteLatin}</span></div>` : ""}
      <nav class="toc" aria-label="${esc(T.tocAria)}">${toc}</nav>
      <div class="reader" role="group" aria-label="${esc(T.textSizeAria)}"><span>${T.textSize}</span><div class="seg"><button type="button" data-size="1.02rem" aria-pressed="false" aria-label="${esc(T.sizeSmaller)}">A−</button><button type="button" data-size="1.14rem" aria-pressed="true" aria-label="${esc(T.sizeDefault)}">A</button><button type="button" data-size="1.4rem" aria-pressed="false" aria-label="${esc(T.sizeLarger)}">A+</button></div></div>
      <p class="small muted">${T.alsoOnSite} <a class="textlink" href="${path(DATA.pages[other].base, lang)}">${T.pageName[other]}</a></p>
    </div>
  </div>`;

  const articles = items.map(({ prayer, r, isKirtan, title, latinTitle, num }) => {
    const id = prayer.id;
    const lyrLang = lyricsLang(prayer.sourceLanguage, lang, r.status);
    const nativeScript = r.status === "native" || r.status === "converted";
    const cls = ["lyrics", prayer.numbered ? "numbered" : "", nativeScript && T.fontClass ? T.fontClass : ""].filter(Boolean).join(" ");
    const stanzas = r.stanzas.map((st) => `<p class="stanza">${st.map((ln) => `<span class="ln">${escText(ln)}</span>`).join("")}</p>`).join("");
    const scriptLabel = lang === "english" ? T.scriptLatin : nativeScript ? T.scriptNative : T.scriptLatin;
    const notes = [];
    if (r.status === "converted") notes.push(`<p class="small muted">${T.convertedNote}</p>`);
    if (r.source && nativeScript) {
      let host = r.source;
      try { host = new URL(r.source).hostname.replace(/^www\./, ""); } catch {}
      notes.push(`<p class="small muted">${T.sourceLabel} <a class="textlink" href="${esc(r.source)}" target="_blank" rel="noopener">${escText(host)}</a></p>`);
    }
    const h2 = isKirtan ? escText(title) : `${T.prayerN(num)}: ${escText(title)}`;
    const eyebrow = isKirtan ? T.kirtanEyebrow(key) : T.articleEyebrow(key, num);
    const img = prayer.image;
    const alt = lang === "english" ? img.altEnglish : isKirtan ? T.kirtanAlt(key) : T.imageAlt(key, num, latinTitle);
    const caption = isKirtan ? (lang === "english" ? title : T.kirtanTitle) : `${T.prayerN(num)}: ${escText(latinTitle)}`;
    const loading = num === 1 ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"';
    const wa = `https://wa.me/?text=${encodeURIComponent(`${plain(title)} ${pageUrl}#${id}`)}`;
    return `  <article class="prayer" id="${id}" aria-labelledby="${id}-h">
    <div class="prayer-text">
      <p class="step">${T.stepOf(num, n)}</p>
      <p class="eyebrow">${eyebrow}</p>
      <h2 id="${id}-h">${h2}</h2>
      <p class="small muted">${T.langName[prayer.sourceLanguage]} · ${scriptLabel}</p>${notes.map((x) => "\n      " + x).join("")}
      <div class="${cls}" lang="${lyrLang}">${stanzas}</div>
      <div class="tools">
        <button class="btn btn-ghost sm" type="button" data-copy="${id}"><svg><use href="#i-copy"/></svg><span>${T.copy}</span></button>
        <a class="btn btn-ghost sm" data-wa="${id}" href="${esc(wa)}" target="_blank" rel="noopener"><svg><use href="#i-wa"/></svg><span>${T.whatsapp}</span></a>
      </div>
    </div>
    <figure class="prayer-media">
      <picture><source type="image/webp" srcset="${img.webp760} 760w, ${img.webp} 1086w" sizes="(max-width: 900px) min(92vw, 520px), 460px"><img src="${img.jpg}" width="${img.width}" height="${img.height}" alt="${esc(alt)}" ${loading} decoding="async"></picture>
      <figcaption><span>${caption}</span><a class="textlink" href="${img.jpg}" download>${T.download}</a></figcaption>
    </figure>
  </article>`;
  }).join("\n");

  const names = items.filter((x) => !x.isKirtan).map((x) => x.title);
  const faq = T.faq({ k: key, p: T.shortName[key], names, kirtan: T.faqKirtanName, status });
  const faqHtml = faq.map((f) => `<details><summary>${escText(f.q)}</summary><p>${escText(f.a)}</p>${f.langLinks ? `<p class="lang-links">${langLinks(page.base)}</p>` : ""}</details>`).join("");

  const tagLis = tags.map((t) => /^[\x00-\x7F]*$/.test(t) ? `<li lang="en">${escText(t)}</li>` : `<li lang="${T.htmlLang}"${T.fontClass ? ` class="${T.fontClass}"` : ""}>${escText(t)}</li>`)
    .concat(nativeTags.map(([l, t]) => `<li lang="${l}" class="${l}">${escText(t)}</li>`)).join("");
  // English page keeps the original tag markup (no lang on Latin items).
  const tagList = lang === "english" ? tagLis.replace(/<li lang="en">/g, "<li>") : tagLis;

  const after = `  <div class="after">
    <div class="wrap block">
      <div class="band">
        <div style="display:grid;gap:12px"><p class="eyebrow">${T.bandEyebrow}</p><h2>${T.bandH2(T.shortName[key])}</h2><p>${T.bandP}</p></div>
        <a class="btn" href="/map">${T.bandBtn} <svg><use href="#i-arrow"/></svg></a>
      </div>
    </div>

    <div class="wrap block">
      <div class="two-col">
        <div style="display:grid;gap:14px"><p class="eyebrow">${T.faqEyebrow}</p><h2>${T.faqH2}</h2></div>
        <div class="faq">${faqHtml}</div>
      </div>
    </div>

    <div class="wrap block">
      <div class="two-col">
        <div style="display:grid;gap:14px"><p class="eyebrow">${T.tagsEyebrow}</p><h2>${T.tagsH2}</h2><p class="muted small">${T.tagsP}</p></div>
        <div style="display:grid;gap:22px">
          <ul class="tags">${tagList}</ul>
          <div class="note"><svg><use href="#i-info"/></svg><span>${T.correction}</span></div>
        </div>
      </div>
    </div>
  </div>`;

  const main = `<main id="main">\n${pageHead}\n\n  <div class="wrap">\n${articles}\n  </div>\n\n${after}\n</main>`;

  // ---- JSON-LD ----
  const graph = [
    { "@type": "WebSite", "@id": `${SITE}/#website`, url: `${SITE}/`, name: "Sri Sri Thakur", description: "Home for the devotees of Sri Sri Thakur Anukulchandra" },
    {
      "@type": "WebPage", "@id": `${pageUrl}#webpage`, url: pageUrl, name: title, description, inLanguage: T.hreflang,
      isPartOf: { "@id": `${SITE}/#website` }, dateModified: DATE,
      primaryImageOfPage: { "@type": "ImageObject", url: page.primaryImage, width: 1086, height: 1448 },
      about: { "@type": "Person", name: "Sri Sri Thakur Anukulchandra", alternateName: ["Anukulchandra Chakravarty", "Thakur Anukul Chandra"], sameAs: "https://en.wikipedia.org/wiki/Anukulchandra_Chakravarty" },
      keywords: [...tags, ...nativeTags.map((t) => t[1])].join(", "),
      breadcrumb: { "@id": `${pageUrl}#breadcrumb` },
      hasPart: items.map(({ prayer, r, title }) => ({
        "@type": "MusicComposition", "@id": `${pageUrl}#${prayer.id}`, name: plain(title),
        ...(prayer.alternateName ? { alternateName: prayer.alternateName } : {}),
        url: `${pageUrl}#${prayer.id}`, inLanguage: lyricsLang(prayer.sourceLanguage, lang, r.status),
        image: `${SITE}${prayer.image.jpg}`,
        lyrics: { "@type": "CreativeWork", inLanguage: lyricsLang(prayer.sourceLanguage, lang, r.status), text: r.text },
      })),
    },
    { "@type": "BreadcrumbList", "@id": `${pageUrl}#breadcrumb`, itemListElement: [
      { "@type": "ListItem", position: 1, name: T.home, item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: T.pageName[key], item: pageUrl },
    ] },
    { "@type": "FAQPage", "@id": `${pageUrl}#faq`, inLanguage: T.hreflang, mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
  ];
  const jsonld = `<script type="application/ld+json">\n${jsonForScript({ "@context": "https://schema.org", "@graph": graph }, 1)}\n</script>`;

  const lyricsJs = jsonForScript(Object.fromEntries(items.map(({ prayer, r, title }) => [prayer.id, { title: plain(title), text: r.text }])));

  const extraCss = `/* prayer language routes (tools/build-prayer-pages.mjs) */
:root{--font-or:"Noto Sans Oriya","Kalinga","Oriya Sangam MN",sans-serif}
.or{font-family:var(--font-or)}
html[lang="hi"] main{font-family:"Geist","Noto Sans Devanagari","Kohinoor Devanagari",ui-sans-serif,system-ui,sans-serif}
html[lang="bn"] main,html[lang="as"] main{font-family:"Geist","Noto Serif Bengali","Bangla Sangam MN",ui-sans-serif,system-ui,sans-serif}
html[lang="or"] main{font-family:"Geist","Noto Sans Oriya","Kalinga","Oriya Sangam MN",ui-sans-serif,system-ui,sans-serif}
.lang-switch{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.lang-switch .lbl{font-size:.84rem;color:var(--fg-3);margin-right:2px}
.lang-switch a{display:inline-flex;align-items:center;min-height:36px;padding:0 14px;border:1px solid var(--line-2);border-radius:999px;background:var(--surface);color:var(--fg-2);text-decoration:none;font-size:.9rem;line-height:1.2;transition:border-color .2s,color .2s}
.lang-switch a:hover{border-color:var(--saffron);color:var(--fg)}
.lang-switch a[aria-current="page"]{background:var(--fg);border-color:var(--fg);color:var(--bg)}
.lyrics.hi,.lyrics.bn,.lyrics.or{line-height:2}
.lang-links{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:8px}
@media print{.lang-switch{display:none!important}}`;

  const otherBase = DATA.pages[other].base;
  const morningHref = path(key === "morning" ? page.base : otherBase, lang);
  const eveningHref = path(key === "evening" ? page.base : otherBase, lang);
  const fill = {
    LANG: T.htmlLang,
    HEAD_META: headMeta,
    FONTS: fonts,
    JSONLD: jsonld,
    EXTRA_CSS: extraCss,
    MAIN: main,
    MORNING_HREF: morningHref,
    EVENING_HREF: eveningHref,
    MORNING_CURRENT: key === "morning" ? ' aria-current="page"' : "",
    EVENING_CURRENT: key === "evening" ? ' aria-current="page"' : "",
    LYRICS_JS: lyricsJs,
    PAGE_JS: JSON.stringify(pageUrl),
    NAV_DEFAULT_JS: JSON.stringify(T.navDefault),
    T_COPIED_JS: JSON.stringify(T.copied),
    T_COPYFAIL_JS: JSON.stringify(T.copyFail),
  };
  let html = SHELL.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => {
    if (!(k in fill)) throw new Error(`No value for ${m}`);
    return fill[k];
  });
  html = html.replace("<head>", "<head>\n<!-- Generated by tools/build-prayer-pages.mjs. Edit data/prayers or tools/prayers, not this file. -->");
  if (/—/.test(main + headMeta)) throw new Error(`Em dash found in ${page.base}-${T.slug}`);
  const file = `${page.base}-${T.slug}.html`;
  writeFileSync(file, html);
  return { file, url: pageUrl, statuses: items.map((x) => `${x.prayer.id}:${x.r.status}`).join(" ") };
}

// ---------- build ----------
const built = [];
for (const key of Object.keys(DATA.pages)) for (const lang of LANG_ORDER) built.push(buildPage(key, lang));

// ---------- sitemap ----------
let sm = readFileSync("sitemap.xml", "utf8");
if (!sm.includes('xmlns:xhtml=')) sm = sm.replace('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml"');
const prayerUrlRe = /<url><loc>https:\/\/srisrithakur\.com\/satsang-(?:morning|evening)-prayer[^<]*<\/loc>[\s\S]*?<\/url>\n?/g;
const firstIdx = sm.search(prayerUrlRe);
sm = sm.replace(prayerUrlRe, "");
const entries = Object.values(DATA.pages).flatMap((page) => LANG_ORDER.map((lang) =>
  `<url><loc>${url(page.base, lang)}</loc><lastmod>${DATE}</lastmod>` +
  LANG_ORDER.map((l) => `<xhtml:link rel="alternate" hreflang="${L[l].hreflang}" href="${url(page.base, l)}"/>`).join("") +
  `<xhtml:link rel="alternate" hreflang="x-default" href="${url(page.base, "english")}"/></url>\n`)).join("");
const at = firstIdx >= 0 ? firstIdx : sm.indexOf("</urlset>");
sm = sm.slice(0, at) + entries + sm.slice(at);
writeFileSync("sitemap.xml", sm);

for (const b of built) console.log(`${b.file}  ${b.statuses}`);
console.log(`Built ${built.length} prayer pages and refreshed sitemap.xml`);
