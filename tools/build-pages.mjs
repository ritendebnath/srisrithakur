// Builds one static HTML file per section (teachings.html, life.html, ...) from index.html,
// so each URL has its own title, description and canonical tag in the raw HTML.
// Cloudflare Pages serves /teachings from teachings.html.
// Run after editing index.html:  node tools/build-pages.mjs
// (A GitHub Action runs this automatically on every push that changes index.html.)
import { readFileSync, writeFileSync } from "node:fs";

const SITE = "https://srisrithakur.com";
const src = readFileSync("index.html", "utf8");

const m = src.match(/const META=(\{[\s\S]*?\});\n/);
if (!m) throw new Error("META block not found in index.html");
const META = Function(`"use strict";return (${m[1]})`)();

const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const swap = (html, re, value, label) => {
  if (!re.test(html)) throw new Error(`${label} not found`);
  return html.replace(re, value);
};

const built = [];
for (const [route, [title, desc]] of Object.entries(META)) {
  if (route === "home") continue;
  const url = `${SITE}/${route}`;
  let h = src;
  h = swap(h, /<head>/, `<head>\n<!-- Generated from index.html by tools/build-pages.mjs. Edit index.html, not this file. -->`, "head");
  h = swap(h, /<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`, "title");
  h = swap(h, /<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(desc)}">`, "description");
  h = swap(h, /<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(title)}">`, "og:title");
  h = swap(h, /<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(desc)}">`, "og:description");
  h = swap(h, /<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`, "og:url");
  h = swap(h, /<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`, "canonical");
  // Show this section (not the home section) in the raw HTML, before any script runs.
  h = swap(h, /<section class="view" data-view="home">/, `<section class="view" data-view="home" hidden>`, "home section");
  h = swap(h, new RegExp(`<section class="view" data-view="${route}" hidden>`), `<section class="view" data-view="${route}">`, `${route} section`);
  writeFileSync(`${route}.html`, h);
  built.push(`${route}.html`);
}
console.log(`Built ${built.length} pages: ${built.join(", ")}`);
