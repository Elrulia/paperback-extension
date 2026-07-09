const ANILIST_URL = "https://graphql.anilist.co";
const CACHE_PREFIX = "mangahub.cover:";

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

/** MangaHub has its own cover now — drop any stale fallback so we stop preferring it. */
export function clearCachedCoverUrl(slug: string): void {
  Application.setState("", cacheKey(slug));
}

/** Permanently remembers a resolved fallback cover, whichever source it came from. */
export function cacheCoverUrl(slug: string, url: string): void {
  Application.setState(url, cacheKey(slug));
}

async function searchAniListCover(title: string): Promise<string | undefined> {
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
    return json.data?.Media?.coverImage?.extraLarge ?? json.data?.Media?.coverImage?.large;
  } catch {
    return undefined;
  }
}

/**
 * Searches AniList by title, trying each candidate in order (primary title,
 * then alternates) and stopping at the first hit — AniList's title wording
 * can diverge enough from MangaHub's that the primary title alone misses a
 * match. Never throws; a lookup failure just means no fallback was found.
 * Caching is the caller's responsibility (this is the last resort after a
 * same-id MangaHub listing has already been tried).
 */
export async function resolveAniListCoverUrl(
  titleCandidates: string[],
): Promise<string | undefined> {
  for (const title of titleCandidates) {
    if (!title) continue;
    const url = await searchAniListCover(title);
    if (url) return url;
  }
  return undefined;
}
