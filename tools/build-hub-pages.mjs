// Builds the English content pages (Life, Prayers, Books, Teachings, Centres, FAQ, Photos and the
// practice guides) inside the same site chrome as the prayer pages, so every page shares one header,
// navigation and footer with the home page.
//
// Run:  node tools/build-hub-pages.mjs
// (The GitHub Action runs it on every push that changes data/hubs, tools/hubs or tools/prayers/shell.html.)
//
// Inputs:
//   tools/prayers/shell.html   site chrome (head, header, footer, nav script), shared with the prayer pages
//   tools/hubs/hubs.css        styles for these pages
//   data/hubs/pages.json       one entry per page: slug, title, description, headings, FAQ, extra JSON-LD
//   data/hubs/<slug>.html      the page body, placed under the page heading
// Output: <slug>.html at the site root (served at /<slug>).
import { readFileSync, writeFileSync } from "node:fs";

const SITE = "https://srisrithakur.com";
const SHELL = readFileSync("tools/prayers/shell.html", "utf8");
const CSS = readFileSync("tools/hubs/hubs.css", "utf8");
const DATA = JSON.parse(readFileSync("data/hubs/pages.json", "utf8"));

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const strip = (s) => String(s).replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
const jsonForScript = (v) => JSON.stringify(v, null, 1).replace(/</g, "\\u003c");
const FONTS = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&family=Noto+Serif+Bengali:wght@400;500&family=Noto+Sans+Devanagari:wght@400;500&display=swap">`;
const PERSON = { "@type": "Person", name: "Sri Sri Thakur Anukulchandra", alternateName: ["Anukulchandra Chakravarty", "Thakur Anukul Chandra"], birthDate: "1888-09-14", deathDate: "1969-01-27", sameAs: "https://en.wikipedia.org/wiki/Anukulchandra_Chakravarty" };

const built = [];
for (const p of DATA.pages) {
  const url = `${SITE}/${p.slug}`;
  const og = SITE + (p.ogImage || DATA.ogImage);
  const ogAlt = p.ogImageAlt || DATA.ogImageAlt;
  let body = readFileSync(`data/hubs/${p.slug}.html`, "utf8");

  // FAQ entries live in pages.json so the visible answers and the FAQPage data never drift apart.
  if (p.faq) {
    const faqHtml = `<div class="faq">${p.faq.map((f) => `<details><summary>${f.q}</summary><p>${f.a}</p></details>`).join("")}</div>`;
    if (!body.includes("{{FAQ}}")) throw new Error(`${p.slug}: page has faq entries but no {{FAQ}} marker`);
    body = body.replace("{{FAQ}}", faqHtml);
  }

  const headMeta = [
    `<title>${esc(p.title)} | Sri Sri Thakur</title>`,
    `<meta name="description" content="${esc(p.description)}">`,
    `<meta name="robots" content="index, follow, max-image-preview:large">`,
    `<link rel="canonical" href="${url}">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:site_name" content="Sri Sri Thakur">`,
    `<meta property="og:title" content="${esc(p.title)}">`,
    `<meta property="og:description" content="${esc(p.description)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${og}">`,
    `<meta property="og:image:alt" content="${esc(ogAlt)}">`,
    `<meta property="og:locale" content="en_IN">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(p.title)}">`,
    `<meta name="twitter:description" content="${esc(p.description)}">`,
    `<meta name="twitter:image" content="${og}">`,
  ].join("\n");

  const graph = [
    { "@type": p.schemaType || "WebPage", "@id": `${url}#page`, url, name: p.title, description: p.description, inLanguage: "en",
      isPartOf: { "@type": "WebSite", name: "Sri Sri Thakur", url: `${SITE}/` }, about: PERSON, dateModified: DATA.dateModified,
      breadcrumb: { "@id": `${url}#breadcrumb` }, ...(p.schema || {}) },
    { "@type": "BreadcrumbList", "@id": `${url}#breadcrumb`, itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: p.crumb, item: url } ] },
  ];
  if (p.faq) graph.push({ "@type": "FAQPage", "@id": `${url}#faq`, inLanguage: "en",
    mainEntity: p.faq.map((f) => ({ "@type": "Question", name: strip(f.q), acceptedAnswer: { "@type": "Answer", text: strip(f.a) } })) });
  const jsonld = `<script type="application/ld+json">\n${jsonForScript({ "@context": "https://schema.org", "@graph": graph })}\n</script>`;

  const main = `<main id="main" class="hub-page">
<div class="wrap">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><span aria-current="page">${p.crumb}</span></nav>
  <div class="page-head hub-head">
    <p class="eyebrow">${p.eyebrow}</p>
    <h1>${p.h1.replace(/Sri Sri/g, "Sri&nbsp;Sri")}</h1>
    <p class="lede">${p.lede}</p>
  </div>
</div>
${body.trim()}
</main>`;

  const fill = {
    LANG: "en", HEAD_META: headMeta, FONTS, JSONLD: jsonld, EXTRA_CSS: CSS, MAIN: main,
    MORNING_HREF: "/satsang-morning-prayer-english", EVENING_HREF: "/satsang-evening-prayer-english",
    MORNING_CURRENT: "", EVENING_CURRENT: "",
    LYRICS_JS: "{}", PAGE_JS: JSON.stringify(url), NAV_DEFAULT_JS: '"en"', T_COPIED_JS: '"Copied"', T_COPYFAIL_JS: '"Could not copy"',
  };
  let html = SHELL.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => {
    if (!(k in fill)) throw new Error(`No value for ${m}`);
    return fill[k];
  });
  // The shell marks Prayers as the current section; only the prayers page keeps that.
  if (p.slug !== "prayers") html = html.replace('class="nav-dd-btn is-current"', 'class="nav-dd-btn"');
  html = html.replace("<head>", "<head>\n<!-- Generated by tools/build-hub-pages.mjs. Edit data/hubs or tools/hubs, not this file. -->");
  if (/—/.test(main + headMeta)) throw new Error(`Em dash found in ${p.slug}`);
  writeFileSync(`${p.slug}.html`, html);
  built.push(`${p.slug}.html`);
}
console.log(`Built ${built.length} content pages: ${built.join(", ")}`);
