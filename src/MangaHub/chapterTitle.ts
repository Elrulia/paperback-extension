// Meaningless language/upload tags some MangaHub chapter titles are left with
// after the redundant chapter-number restatement is stripped off (e.g. the
// raw title "7.3-eng-li" is just chapter 7.3 restated plus this tag) — not a
// real chapter title, so dropped entirely rather than shown as extra text.
export const NOISE_CHAPTER_TITLE_SUFFIXES = new Set(["eng-li"]);

/**
 * Strips a leading restatement of this exact chapter's own number, keeping
 * only genuine extra text (a real title, or a scan-group credit like
 * "ASURA SCANS") if any remains — known meaningless tags (see
 * NOISE_CHAPTER_TITLE_SUFFIXES) are dropped too. Zero-padded numbers are
 * matched too (e.g. "Ch.029" for chapter 29). The trailing (?![0-9a-z])
 * guards against matching a mere numeric prefix of an unrelated token —
 * chapter 2 must not match inside "20th Century" (another digit follows) or
 * "2nd Season" (a letter follows, which would otherwise mangle it into "nd
 * Season").
 *
 * A "Chapter"/"Ch." word before the number (e.g. "Ch.029: Foo") is an
 * unambiguous signal, so that form is always stripped regardless of what
 * follows. A bare number with no such word (e.g. "7.3-eng-li") has no such
 * signal, so it's only treated as a restatement when nothing of substance is
 * left afterwards — otherwise a real title that coincidentally starts with
 * this chapter's own number (e.g. "5 Days Later" for chapter 5) would
 * wrongly lose its leading number.
 *
 * A leading "Vol.X" marker is always dropped (e.g. "Vol.15 - Chapter 71"
 * becomes just ""): MangaHub's volume data is too inconsistent to surface
 * (present on some chapters in a run and not others, sometimes with a volume
 * number that doesn't even match its neighbors) to be worth repeating on
 * every single chapter.
 */
export function stripRedundantChapterPrefix(rawTitle: string, chapterNumber: number): string {
  const volRegex = /^vol\.?\s*\d+\s*[-:]?\s*/i;
  const [intPart, fracPart] = chapterNumber.toString().split(".");
  // MangaHub slugs (and, it turns out, some raw titles) spell a decimal
  // chapter number with a dash instead of a dot, e.g. "41-5-eng-li" for
  // chapter 41.5 — so both separators are accepted here.
  const numberBody = fracPart !== undefined ? `0*${intPart}[.-]${fracPart}` : `0*${intPart}`;
  const wordedRegex = new RegExp(
    `^(?:chapter|ch\\.?)\\s*\\.?\\s*${numberBody}(?![0-9a-z])\\s*[:.,-]?\\s*`,
    "i",
  );
  const bareRegex = new RegExp(`^${numberBody}(?![0-9a-z])\\s*[:.,-]?\\s*`, "i");

  let title = rawTitle.trim().replace(volRegex, "").trim();

  const wordedMatch = title.match(wordedRegex);
  if (wordedMatch) {
    title = title.slice(wordedMatch[0].length).trim();
  } else {
    const bareMatch = title.match(bareRegex);
    if (bareMatch) {
      const remainder = title.slice(bareMatch[0].length).trim();
      if (remainder.length === 0 || NOISE_CHAPTER_TITLE_SUFFIXES.has(remainder.toLowerCase())) {
        title = remainder;
      }
    }
  }
  if (NOISE_CHAPTER_TITLE_SUFFIXES.has(title.toLowerCase())) {
    title = "";
  }

  return title;
}
