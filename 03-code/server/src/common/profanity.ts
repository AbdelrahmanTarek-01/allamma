/**
 * Small bad-words filter (Egyptian Arabic + English) used for names, public room names and public chat.
 * It masks the offending word with *** and leaves the rest of the text alone.
 *
 * Two kinds of entries, to avoid blocking innocent words:
 *  - EXACT: short or risky words, matched only when the whole word equals them.
 *  - STEMS: longer, unusual roots, matched anywhere inside a word (Arabic words carry prefixes like و/ب/ل).
 * This is a first line of defence, not a promise. Extend the lists as needed (entries are written already normalized).
 */

// Arabic normalization: no diacritics/tatweel, alef forms -> ا, ى -> ي, ة -> ه, repeated letters collapsed.
const normalizeAr = (s: string) =>
  s
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/(.)\1{1,}/g, '$1');

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's' };
const normalizeEn = (s: string) =>
  s.toLowerCase().replace(/[0134577@$]/g, (c) => LEET[c] ?? c).replace(/(.)\1{2,}/g, '$1$1');

// Checked per word, so entries are single words. "نيك" is left out on purpose: it is also the name Nick.
const AR_EXACT = new Set(['كس', 'عرص', 'خول', 'طيز', 'زب', 'متناك', 'شرمط']);
const AR_STEMS = ['شرموط', 'كسمك', 'منيوك', 'قحب', 'يلعن'];
const EN_EXACT = new Set(['asshole', 'dick', 'pussy', 'cunt', 'whore', 'slut', 'bastard', 'nigga', 'fag', 'faggot']);
const EN_STEMS = ['fuck', 'shit', 'bitch', 'nigger']; // "cunt" is exact-only so "Scunthorpe" survives

const hasArabic = (s: string) => /[؀-ۿ]/.test(s);

function isBad(word: string): boolean {
  if (hasArabic(word)) {
    const w = normalizeAr(word.replace(/[^؀-ۿ]/g, ''));
    if (!w) return false;
    return AR_EXACT.has(w) || AR_STEMS.some((s) => w.includes(normalizeAr(s)));
  }
  const w = normalizeEn(word).replace(/[^a-z]/g, '');
  if (!w) return false;
  return EN_EXACT.has(w) || EN_STEMS.some((s) => w.includes(s));
}

/** Masks bad words with ***. Multi-word phrases are caught word by word. */
export function maskBad(text: string): string {
  return text.replace(/\S+/g, (word) => (isBad(word) ? '***' : word));
}
