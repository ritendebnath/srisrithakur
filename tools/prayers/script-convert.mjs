// Converts Devanagari text into Bengali, Assamese or Odia script, letter by letter.
// The words do not change, only the script they are written in. No dependencies.
//
// The Indic scripts share one Unicode layout, so most letters map by a fixed offset
// (Bengali/Assamese +0x80, Odia +0x200). On top of that, each target follows its own
// spelling conventions, all of them purely orthographic:
//   - ya:  word-initial and in conjuncts stays the letter ya; elsewhere it becomes the
//          glide form (Bengali/Assamese য়, Odia ୟ). Odia also writes ya-phala with ୟ.
//   - va:  Bengali writes ব everywhere. Assamese writes ৱ between vowels (দেৱ, জীৱন) and ব
//          at the start of a word, in a conjunct or before i/ii (গোবিন্দ). Odia writes ବ, and ୱ
//          when subjoined (ସ୍ୱ) but not after reph (ସର୍ବ). Assamese va is partly lexical, so a native-script file wins.
//   - ra:  Assamese uses ৰ.
//   - Final or pre-sibilant t+virama becomes khanda ta (ৎ) in Bengali and Assamese.
//   - Anusvara in Hindi and Bengali text (mode "hi"/"bn"): before a stop it becomes the
//     matching nasal conjunct (गोविंद -> গোবিন্দ, संत -> সন্ত); before a nasal, a vowel or the
//     end of a word it is nasalisation and becomes chandrabindu (में -> মেঁ, नहीं -> নহীঁ);
//     before य र ल व श ष स ह it stays anusvara. Sanskrit (mode "sa") keeps anusvara as is.
//   - Candra e (ॅ), used when Bengali is written in Devanagari (बॅलो), is dropped so the
//     inherent vowel reads as in the original (বলো).
//   - Om becomes ওঁ / ଓଁ. Danda (। ॥), digits in Latin, punctuation and spaces pass through.

const DEVA_START = 0x0900, DEVA_END = 0x097f;
const isDeva = (c) => c >= DEVA_START && c <= DEVA_END;
const VIRAMA = 0x094d, NUKTA = 0x093c, ANUSVARA = 0x0902;
const isConsonant = (c) => (c >= 0x0915 && c <= 0x0939) || (c >= 0x0958 && c <= 0x095f);
// A Devanagari "letter-ish" char: anything that can be part of a word.
const isWordChar = (c) => isDeva(c) && c !== 0x0964 && c !== 0x0965 && !(c >= 0x0966 && c <= 0x096f);

const VARGA_NASAL = new Map();
[[0x0915, 0x0918, 0x0919], [0x091a, 0x091d, 0x091e], [0x091f, 0x0922, 0x0923], [0x0924, 0x0927, 0x0928], [0x092a, 0x092d, 0x092e]]
  .forEach(([from, to, nasal]) => { for (let c = from; c <= to; c++) VARGA_NASAL.set(c, nasal); });

const TARGETS = {
  bengali: { offset: 0x80, ya: 0x09af, yaGlide: 0x09df, ra: 0x09b0, va: 0x09ac, khandaTa: true, om: "ওঁ" },
  assamese: { offset: 0x80, ya: 0x09af, yaGlide: 0x09df, ra: 0x09f0, va: 0x09ac, vaMedial: 0x09f1, khandaTa: true, om: "ওঁ" },
  odia: { offset: 0x200, ya: 0x0b2f, yaGlide: 0x0b5f, yaPhala: 0x0b5f, ra: 0x0b30, va: 0x0b2c, vaSubjoined: 0x0b71, khandaTa: false, om: "ଓଁ" },
};

// Devanagari letters with no direct counterpart, mapped to the closest Devanagari letter first.
const FOLD = new Map([
  [0x0904, 0x090f], [0x090d, 0x090f], [0x090e, 0x090f], [0x0911, 0x0913], [0x0912, 0x0913],
  [0x0946, 0x0947], [0x0949, 0x094b], [0x094a, 0x094b],
  [0x0929, 0x0928], [0x0931, 0x0930], [0x0934, 0x0933],
  [0x0958, 0x0915], [0x0959, 0x0916], [0x095a, 0x0917], [0x095b, 0x091c], [0x095e, 0x092b],
]);
const NASALS = new Set([0x0919, 0x091e, 0x0923, 0x0928, 0x092e]);
const KHANDA_TA_BEFORE = new Set([0x0938, 0x0915, 0x092a, 0x0916, 0x092b, 0x0936, 0x0937, 0x0939]);

export function convertDevanagari(text, target, mode = "hi") {
  const t = TARGETS[target];
  if (!t) throw new Error(`Unknown target script: ${target}`);
  // Work on code points; decompose precomposed nukta letters so one rule handles both forms.
  const src = [];
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if (c === 0x095c) src.push(0x0921, NUKTA);
    else if (c === 0x095d) src.push(0x0922, NUKTA);
    else if (c === 0x095f) src.push(0x092f, NUKTA);
    else src.push(FOLD.get(c) ?? c);
  }
  const out = [];
  for (let i = 0; i < src.length; i++) {
    const c = src[i], prev = src[i - 1], next = src[i + 1];
    if (!isDeva(c)) { out.push(String.fromCodePoint(c)); continue; }
    const wordStart = prev === undefined || !isWordChar(prev);
    if (c === 0x0950) { out.push(t.om); continue; }
    if (c === 0x0964 || c === 0x0965) { out.push(String.fromCodePoint(c)); continue; }
    if (c === NUKTA) continue; // folded into ड़ ढ़ य़ below; other nukta marks have no use in these scripts
    if (next === NUKTA && (c === 0x0921 || c === 0x0922)) {
      out.push(String.fromCodePoint(c === 0x0921 ? (t.offset === 0x80 ? 0x09dc : 0x0b5c) : (t.offset === 0x80 ? 0x09dd : 0x0b5d)));
      continue;
    }
    if (c === 0x092f) { // ya
      if (next === NUKTA) { out.push(String.fromCodePoint(t.yaGlide)); continue; }
      if (prev === VIRAMA) { out.push(String.fromCodePoint(t.yaPhala || t.ya)); continue; }
      if (wordStart || next === VIRAMA) { out.push(String.fromCodePoint(t.ya)); continue; }
      out.push(String.fromCodePoint(t.yaGlide));
      continue;
    }
    if (c === 0x0930) { out.push(String.fromCodePoint(t.ra)); continue; }
    if (c === 0x0935) { // va
      if (prev === VIRAMA && t.vaSubjoined && src[i - 2] !== 0x0930) { out.push(String.fromCodePoint(t.vaSubjoined)); continue; } // ସ୍ୱ, but reph keeps ବ (ସର୍ବ)
      if (t.vaMedial && !wordStart && prev !== VIRAMA && next !== VIRAMA && next !== 0x093f && next !== 0x0940) { out.push(String.fromCodePoint(t.vaMedial)); continue; }
      out.push(String.fromCodePoint(t.va));
      continue;
    }
    if (c === 0x0945) continue; // candra e: see header
    if (c === ANUSVARA && mode !== "sa") {
      if (next !== undefined && VARGA_NASAL.has(next)) {
        out.push(String.fromCodePoint(VARGA_NASAL.get(next) + t.offset, VIRAMA + t.offset));
        continue;
      }
      if (next === undefined || !isConsonant(next) || NASALS.has(next)) {
        out.push(String.fromCodePoint(0x0901 + t.offset));
        continue;
      }
    }
    if (t.khandaTa && c === 0x0924 && next === VIRAMA) {
      const after = src[i + 2];
      if (after === undefined || !isWordChar(after) || KHANDA_TA_BEFORE.has(after)) {
        out.push("ৎ");
        i++; // skip the virama
        continue;
      }
    }
    if (c === 0x0933 && t.offset === 0x80) { out.push(String.fromCodePoint(0x09b2)); continue; } // ळ -> ল
    if (c === 0x093d || (c >= 0x0901 && c <= 0x0903) || (c >= 0x0905 && c <= 0x0939) || (c >= 0x093e && c <= 0x094d) || (c >= 0x0960 && c <= 0x0963) || (c >= 0x0966 && c <= 0x096f)) {
      out.push(String.fromCodePoint(c + t.offset));
      continue;
    }
    // Anything else in the Devanagari block (rare signs) is dropped rather than shown as a missing glyph.
  }
  // NFC, as recommended for web text (য় ড় ঢ় ଡ଼ are stored as letter + nukta).
  return out.join("").normalize("NFC");
}
