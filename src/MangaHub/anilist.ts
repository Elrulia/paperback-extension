const ANILIST_URL = "https://graphql.anilist.co";
const CACHE_PREFIX = "mangahub.anilistCover:";

interface AniListResponse {
  data?: {
    Media?: {
      coverImage?: { extraLarge?: string; large?: string };
    };
  };
}

function cacheKey(slug: string): string {
  return `${CACHE_PREFIX}${slug}`;
}

/** Cheap synchronous read for list views (search results, discover carousels) that must never trigger a network call of their own. */
export function getCachedCoverUrl(slug: string): string | undefined {
  const cached = Application.getState(cacheKey(slug));
  return typeof cached === "string" && cached ? cached : undefined;
}

/** MangaHub has its own cover now — drop any stale AniList fallback so we stop preferring it. */
export function clearCachedCoverUrl(slug: string): void {
  Application.setState("", cacheKey(slug));
}

/**
 * Resolves and permanently caches an AniList cover for a manga MangaHub has no
 * image for. Only ever called from getMangaDetails, which is the one place we
 * can afford a lookup per-manga rather than per-list-row. Never throws — a
 * missing fallback cover falls back to the existing placeholder, same as today.
 */
export async function resolveFallbackCoverUrl(
  slug: string,
  title: string,
): Promise<string | undefined> {
  const cached = getCachedCoverUrl(slug);
  if (cached) return cached;
  if (!title) return undefined;

  const query = `query ($search: String) { Media(search: $search, type: MANGA) { coverImage { extraLarge large } } }`;
  try {
    const [response, data] = await Application.scheduleRequest({
      url: ANILIST_URL,
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ query, variables: { search: title } }),
    });
    if (response.status !== 200) return undefined;
    const json = JSON.parse(Application.arrayBufferToUTF8String(data)) as AniListResponse;
    const url = json.data?.Media?.coverImage?.extraLarge ?? json.data?.Media?.coverImage?.large;
    if (url) Application.setState(url, cacheKey(slug));
    return url;
  } catch {
    return undefined;
  }
}
