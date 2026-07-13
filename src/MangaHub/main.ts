import {
  BasicRateLimiter,
  ContentRating,
  CookieStorageInterceptor,
  DiscoverSectionType,
  type Form,
} from "@paperback/types";
import type {
  Chapter,
  ChapterDetails,
  ChapterProviding,
  CloudflareBypassRequestProviding,
  Cookie,
  DiscoverSection,
  DiscoverSectionItem,
  DiscoverSectionProviding,
  Extension,
  MangaProviding,
  Metadata,
  PagedResults,
  Request as PaperbackRequest,
  SearchQuery,
  SearchResultItem,
  SearchResultsProviding,
  SettingsFormProviding,
  SourceManga,
  TagSection,
} from "@paperback/types";

import {
  cacheCoverUrl,
  clearCachedCoverUrl,
  getCachedCoverUrl,
  resolveAniListCoverUrl,
} from "./anilist";
import {
  GRAPHQL_URL,
  MangaHubInterceptor,
  scheduleRequestSafely,
  SOURCE_UNREACHABLE_MESSAGE,
} from "./network";
import type { MangaHubSearchMeta } from "./search";
import { GENRE_OPTIONS, MangaHubSearchForm } from "./search";
import {
  FILTERED_SECTION_ORDER_OPTIONS,
  getBaseUrlOverride,
  getExcludedGenres,
  getFilteredSectionOrder,
  getIncludedGenres,
  getIncludedRatings,
  getRequireAllIncludedGenres,
  getUseGenericTitle,
  MangaHubSettingsForm,
} from "./settings";

// ----------------------------------------------------------------
// Constants
// ----------------------------------------------------------------

const IMAGE_CDN = "https://imgx.mghcdn.com";
const THUMB_CDN = "https://thumb.mghcdn.com";
const NO_COVER = "https://placehold.co/160x240?text=No+Cover";
const PER_PAGE = 30;
const ACCESS_KEY_STATE = "mangahub.accessKey";
// Bounds how many extra pages a single filtered fetch will pull in to try to
// fill a full batch — without this, a very strict genre/rating combo could
// otherwise keep fetching indefinitely for a single scroll.
const MAX_FILTER_FETCH_ATTEMPTS = 10;

// Per-manga content rating, derived from its own genre tag ids — this is
// distinct from (and doesn't affect) the source-level contentRating set in
// the MangaHub instantiation below, which per the SDK docs gates whether the
// whole source is visible to a user at all, not any individual manga's rating.
const ADULT_GENRES = new Set(["pornographic", "adult", "smut", "r-18", "loli", "shota", "hentai"]);
const MATURE_GENRES = new Set([
  "erotica",
  "ecchi",
  "mature",
  "suggestive",
  "sexual-violence",
  "gore",
  "incest",
]);

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
];

// ----------------------------------------------------------------
// API response types
// ----------------------------------------------------------------

interface GqlError {
  message?: string;
}

interface MangaHubMangaDto {
  id?: number;
  title?: string;
  slug?: string;
  status?: string;
  image?: string;
  author?: string;
  artist?: string;
  genres?: string;
  description?: string;
  alternativeTitle?: string;
  latestChapter?: number;
  chapters?: MangaHubChapterDto[];
}

interface MangaHubChapterDto {
  number: number;
  title?: string;
  date?: string;
}

interface MangaHubChapterPagesDto {
  pages?: string;
}

interface MangaHubGqlResponse {
  data?: {
    search?: { rows?: MangaHubMangaDto[] };
    manga?: MangaHubMangaDto;
    chapter?: MangaHubChapterPagesDto;
    latest?: MangaHubMangaDto[];
    popular?: { rows?: MangaHubMangaDto[] };
    newManga?: { rows?: MangaHubMangaDto[] };
    completed?: { rows?: MangaHubMangaDto[] };
  };
  errors?: GqlError[];
}

interface MangaHubPagesPayload {
  p: string;
  i: string[];
}

// Genre labels (not ids) are already lowercased when stored here. An empty
// includedRatings means no rating filter at all; otherwise only manga whose
// derived rating is in the set pass.
interface ContentFilter {
  excluded: ReadonlySet<string>;
  included: ReadonlySet<string>;
  requireAll: boolean;
  includedRatings: ReadonlySet<ContentRating>;
}

// ----------------------------------------------------------------
// Extension
// ----------------------------------------------------------------

interface MangaHubConfig {
  name: string;
  baseUrl: string;
  mangaSource: string;
  contentRating?: ContentRating;
  langCode?: string;
}

type MangaHubImplementation = Extension &
  SearchResultsProviding &
  MangaProviding &
  ChapterProviding &
  CloudflareBypassRequestProviding &
  SettingsFormProviding &
  DiscoverSectionProviding;

export class MangaHubExtension implements MangaHubImplementation {
  readonly sourceName: string;
  readonly defaultBaseUrl: string;
  readonly mangaSource: string;
  readonly contentRating: ContentRating;
  readonly langCode: string;

  static readonly MAX_SEARCH_PAGES = 5;

  private accessKey = "";
  private currentUserAgent = "";
  private homeCache: MangaHubGqlResponse["data"] | null = null;

  get baseUrl(): string {
    return getBaseUrlOverride(this.sourceName) ?? this.defaultBaseUrl;
  }

  requestManager: MangaHubInterceptor;
  cookieStorageInterceptor = new CookieStorageInterceptor({ storage: "stateManager" });
  globalRateLimiter = new BasicRateLimiter("rateLimiter", {
    numberOfRequests: 10,
    bufferInterval: 3,
    ignoreImages: true,
  });

  constructor(config: MangaHubConfig) {
    this.sourceName = config.name;
    this.defaultBaseUrl = config.baseUrl.replace(/\/+$/, "");
    this.mangaSource = config.mangaSource;
    this.contentRating = config.contentRating ?? ContentRating.EVERYONE;
    this.langCode = config.langCode ?? "🇬🇧";
    this.requestManager = new MangaHubInterceptor(
      "main",
      () => this.baseUrl,
      () => this.accessKey,
      () => this.currentUserAgent,
    );
  }

  async getSettingsForm(): Promise<Form> {
    return new MangaHubSettingsForm(this.sourceName, this.defaultBaseUrl);
  }

  async initialise(): Promise<void> {
    this.requestManager.registerInterceptor();
    this.cookieStorageInterceptor.registerInterceptor();
    this.globalRateLimiter.registerInterceptor();

    const stored = Application.getState(ACCESS_KEY_STATE);
    if (typeof stored === "string" && stored.length > 0) this.accessKey = stored;
  }

  // ----------------------------------------------------------------
  // API key management
  // ----------------------------------------------------------------

  private async refreshAccessKey(mangaSlug?: string): Promise<void> {
    this.currentUserAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]!;

    // Clear ALL stored cookies before refresh so CookieStorageInterceptor
    // does not inject stale cookies into the request (mirrors Netsky 0.8).
    const savedCookies = [...this.cookieStorageInterceptor.cookies];
    for (const cookie of savedCookies) {
      try {
        this.cookieStorageInterceptor.deleteCookie(cookie);
      } catch {
        /* no domain */
      }
    }

    const chapterPath = mangaSlug
      ? `${this.baseUrl}/chapter/${mangaSlug}/chapter-1?reloadKey=1`
      : `${this.baseUrl}/chapter/the-last-human/chapter-1?reloadKey=1`;

    const [response] = await scheduleRequestSafely({
      url: chapterPath,
      method: "GET",
      headers: {
        cookie: "mhub_access=; Path=/",
        "x-mhub-access": "mhub_access=; Path=/",
      },
    });

    // Restore non-mhub_access cookies (e.g. Cloudflare cookies) after refresh.
    for (const cookie of savedCookies) {
      if (cookie.name !== "mhub_access") {
        try {
          this.cookieStorageInterceptor.setCookie(cookie);
        } catch {
          /* ignore */
        }
      }
    }

    // Try raw Set-Cookie header first (like Netsky 0.8), fall back to parsed cookies.
    let key = "";
    const rawSetCookie =
      (response.headers as Record<string, string>)?.["set-cookie"] ??
      (response.headers as Record<string, string>)?.["Set-Cookie"] ??
      "";
    const headerMatch = /mhub_access=([^;]+)/.exec(rawSetCookie);
    if (headerMatch?.[1]) {
      key = headerMatch[1];
    } else {
      for (const cookie of response.cookies ?? []) {
        if (cookie.name === "mhub_access" && cookie.value) {
          key = cookie.value;
          break;
        }
      }
    }

    if (key) {
      this.accessKey = key;
      Application.setState(key, ACCESS_KEY_STATE);
    }
  }

  private async graphQL(query: string, mangaSlug?: string): Promise<MangaHubGqlResponse> {
    if (!this.accessKey) await this.refreshAccessKey(mangaSlug);

    const result = await this.postGraphQL(query);
    const errorText = this.gqlErrorText(result);

    if (!errorText) return result;

    if (/rate\s*limit|api\s*key/.test(errorText)) {
      await this.refreshAccessKey(mangaSlug);
      throw new Error("MangaHub rate limit reached. Please try again. Can take a few retries.");
    }

    throw new Error(errorText);
  }

  private gqlErrorText(result: MangaHubGqlResponse): string {
    if (result.errors && result.errors.length > 0) {
      return result.errors
        .map((e) => e.message ?? "")
        .join(" ")
        .toLowerCase()
        .trim();
    }
    return "";
  }

  private async postGraphQL(query: string): Promise<MangaHubGqlResponse> {
    const [response, data] = await scheduleRequestSafely({
      url: GRAPHQL_URL,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (response.status === 404) throw new Error("Content not found");
    // Cloudflare stays up and returns a normal (non-rejecting) 5xx response
    // with an HTML error page when the MangaHub origin itself is down.
    if (response.status >= 500) throw new Error(SOURCE_UNREACHABLE_MESSAGE);
    const jsonStr = Application.arrayBufferToUTF8String(data);
    try {
      return JSON.parse(jsonStr) as MangaHubGqlResponse;
    } catch {
      // Any other non-JSON body (unexpected error page, truncated response, etc.)
      // must not be treated as a silent empty success.
      throw new Error(SOURCE_UNREACHABLE_MESSAGE);
    }
  }

  // ----------------------------------------------------------------
  // Cloudflare
  // ----------------------------------------------------------------

  async cloudflareBypassCompleted(
    _request: PaperbackRequest,
    cookies: Cookie[],
    _localStorage: Record<string, string>,
  ): Promise<void> {
    for (const cookie of this.cookieStorageInterceptor.cookies) {
      this.cookieStorageInterceptor.deleteCookie(cookie);
    }
    for (const cookie of cookies) {
      if (cookie.expires && cookie.expires.getTime() <= Date.now()) continue;
      this.cookieStorageInterceptor.setCookie(cookie);
    }
  }

  // ----------------------------------------------------------------
  // Discover sections
  // ----------------------------------------------------------------

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    return [
      { id: "popular", title: "Popular", type: DiscoverSectionType.prominentCarousel },
      { id: "latest", title: "Latest Updates", type: DiscoverSectionType.simpleCarousel },
      {
        id: "filtered",
        title: `${this.getFilteredOrderLabel()} (Filtered)`,
        subtitle: "List and genre filters are set in the extension's settings",
        type: DiscoverSectionType.simpleCarousel,
      },
      { id: "newManga", title: "New Manga", type: DiscoverSectionType.simpleCarousel },
      { id: "completed", title: "Completed", type: DiscoverSectionType.simpleCarousel },
    ];
  }

  private async primeHomeCache(): Promise<void> {
    if (this.homeCache) return;
    const gql = `{
      popular: search(x:${this.mangaSource},mod:POPULAR,limit:30) { rows { id title slug image genres } }
      newManga: search(x:${this.mangaSource},mod:NEW,limit:30) { rows { id title slug image genres } }
      completed: search(x:${this.mangaSource},mod:COMPLETED,limit:30) { rows { id title slug image genres } }
    }`;
    const result = await this.graphQL(gql);
    this.homeCache = result.data ?? null;
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata: Metadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const meta = metadata as { page?: number; seenIds?: number[] } | undefined;
    const page = typeof meta?.page === "number" ? meta.page : 1;
    const previousSeenIds = new Set<number>(meta?.seenIds ?? []);

    // Latest always uses search(mod:LATEST) for every page so offsets are consistent.
    // A manga can be indexed under several alias titles sharing one id, and the
    // underlying order can also shift between fetches — seenIds catches both.
    // Filtered works the same way but with a user-configurable order and with
    // excluded genres (from settings) dropped from the results. When filtering
    // leaves a page thin (or empty), more pages are fetched internally — up to
    // MAX_FILTER_FETCH_ATTEMPTS — to try to fill a full batch before returning.
    if (section.id === "latest" || section.id === "filtered") {
      const order = section.id === "filtered" ? getFilteredSectionOrder(this.sourceName) : "LATEST";
      const genreFilter = section.id === "filtered" ? this.getFilteredContentFilter() : undefined;

      let currentPage = page;
      let seenIds = new Set(previousSeenIds);
      const items: DiscoverSectionItem[] = [];
      let hasNextPage = true;
      for (let attempt = 0; attempt < MAX_FILTER_FETCH_ATTEMPTS; attempt++) {
        const rows = await this.runSearch("", "all", order, currentPage);
        const built = this.toDiscoverItems(rows, "simpleCarouselItem", seenIds, genreFilter);
        items.push(...built.items);
        seenIds = built.seenIds;
        currentPage += 1;
        hasNextPage = rows.length === PER_PAGE;
        if (!hasNextPage || items.length >= PER_PAGE) break;
      }
      return {
        items,
        metadata: hasNextPage ? { page: currentPage, seenIds: [...seenIds] } : undefined,
      };
    }

    // Page 1: use the cached single batch query for all other sections.
    if (page === 1) {
      await this.primeHomeCache();

      switch (section.id) {
        case "popular": {
          const rows = this.homeCache?.popular?.rows ?? [];
          const { items, seenIds } = this.toDiscoverItems(rows, "prominentCarouselItem");
          return {
            items,
            metadata: rows.length === PER_PAGE ? { page: 2, seenIds: [...seenIds] } : undefined,
          };
        }
        case "newManga": {
          const rows = this.homeCache?.newManga?.rows ?? [];
          const { items, seenIds } = this.toDiscoverItems(rows, "simpleCarouselItem");
          return {
            items,
            metadata: rows.length === PER_PAGE ? { page: 2, seenIds: [...seenIds] } : undefined,
          };
        }
        case "completed": {
          const rows = this.homeCache?.completed?.rows ?? [];
          const { items, seenIds } = this.toDiscoverItems(rows, "simpleCarouselItem");
          return {
            items,
            metadata: rows.length === PER_PAGE ? { page: 2, seenIds: [...seenIds] } : undefined,
          };
        }
        default:
          return { items: [] };
      }
    }

    // Page 2+: paginate via search.
    const orderMap: Record<string, string> = {
      popular: "POPULAR",
      newManga: "NEW",
      completed: "COMPLETED",
    };
    const order = orderMap[section.id];
    if (!order) return { items: [] };

    const rows = await this.runSearch("", "all", order, page);
    const { items, seenIds } = this.toDiscoverItems(
      rows,
      section.id === "popular" ? "prominentCarouselItem" : "simpleCarouselItem",
      previousSeenIds,
    );
    return {
      items,
      metadata: rows.length === PER_PAGE ? { page: page + 1, seenIds: [...seenIds] } : undefined,
    };
  }

  private toDiscoverItems(
    rows: MangaHubMangaDto[],
    type: "prominentCarouselItem" | "simpleCarouselItem",
    previousSeenIds: ReadonlySet<number> = new Set(),
    genreFilter?: ContentFilter,
  ): { items: DiscoverSectionItem[]; seenIds: Set<number> } {
    const seenSlugs = new Set<string>();
    const seenIds = new Set<number>(previousSeenIds);
    const items: DiscoverSectionItem[] = [];
    for (const row of rows) {
      const slug = row.slug ?? "";
      if (!slug) continue;
      if (genreFilter && !this.passesContentFilter(row.genres, genreFilter)) continue;
      // Only reads a cover already resolved via getMangaDetails — list views
      // never trigger an AniList lookup themselves.
      const imageUrl = this.thumbUrl(row.image) || getCachedCoverUrl(slug);
      if (!imageUrl) continue;
      if (seenSlugs.has(slug)) continue;
      if (row.id !== undefined && seenIds.has(row.id)) continue;
      seenSlugs.add(slug);
      if (row.id !== undefined) seenIds.add(row.id);
      items.push({
        type,
        mangaId: this.toSafeId(slug),
        imageUrl,
        title: row.title ?? "",
        metadata: undefined,
      });
    }
    return { items, seenIds };
  }

  private buildSearchResultsPage(
    rows: MangaHubMangaDto[],
    previousSeenIds: ReadonlySet<number>,
    genreFilter: ContentFilter,
  ): { results: SearchResultItem[]; seenIds: Set<number> } {
    const seenSlugs = new Set<string>();
    const seenIds = new Set<number>(previousSeenIds);
    const results: SearchResultItem[] = [];
    for (const row of rows) {
      const slug = row.slug ?? "";
      if (!slug) continue;
      if (!this.passesContentFilter(row.genres, genreFilter)) continue;
      if (seenSlugs.has(slug)) continue;
      if (row.id !== undefined && seenIds.has(row.id)) continue;
      const mangaHubImageUrl = this.thumbUrl(row.image);
      // Only reads a cover already resolved via getMangaDetails — list views
      // never trigger a lookup of their own.
      const fallbackCoverUrl = mangaHubImageUrl ? undefined : getCachedCoverUrl(slug);
      seenSlugs.add(slug);
      if (row.id !== undefined) seenIds.add(row.id);
      results.push({
        mangaId: this.toSafeId(slug),
        imageUrl: mangaHubImageUrl || fallbackCoverUrl || "",
        title: row.title ?? "",
        subtitle: fallbackCoverUrl
          ? this.isMangaHubHostedUrl(fallbackCoverUrl)
            ? "Alternate MangaHub cover"
            : "Cover via AniList"
          : undefined,
        metadata: undefined,
      });
    }
    return { results, seenIds };
  }

  // ----------------------------------------------------------------
  // Search
  // ----------------------------------------------------------------

  async getSortingOptions() {
    return [
      { id: "POPULAR", label: "Popular" },
      { id: "LATEST", label: "Updates" },
      { id: "ALPHABET", label: "A-Z" },
      { id: "NEW", label: "New" },
      { id: "COMPLETED", label: "Completed" },
    ];
  }

  async getAdvancedSearchForm(query: SearchQuery<Metadata>): Promise<MangaHubSearchForm> {
    const meta = query.metadata as MangaHubSearchMeta | undefined;
    return new MangaHubSearchForm(meta);
  }

  async getSearchResults(
    query: SearchQuery<Metadata>,
    metadata: Metadata | undefined,
    sortingOption?: { id: string; label: string },
  ): Promise<PagedResults<SearchResultItem>> {
    const titleQuery = (query.title || "").trim();
    const searchMeta = query.metadata as MangaHubSearchMeta | undefined;
    const meta = metadata as { page?: number; seenIds?: number[] } | undefined;
    const page = typeof meta?.page === "number" ? meta.page : 1;
    const previousSeenIds = new Set<number>(meta?.seenIds ?? []);

    const order = sortingOption?.id || "POPULAR";
    const genre = searchMeta?.genre?.length ? searchMeta.genre.join(",") : "all";
    // MangaHub's own genre filter only matches ANY of the selected genres
    // server-side, and doesn't support exclusion or rating filtering at all —
    // "require all", excluded genres, and ratings are enforced here afterward.
    const genreFilter: ContentFilter = {
      excluded: this.genreIdsToLabels(searchMeta?.excludedGenre ?? []),
      included: this.genreIdsToLabels(searchMeta?.genre ?? []),
      requireAll: searchMeta?.requireAllGenres ?? false,
      includedRatings: new Set(searchMeta?.includedRatings ?? []) as ReadonlySet<ContentRating>,
    };

    // A manga can be indexed under several alias titles sharing one id, and
    // offset-based pagination against a reshuffling order (e.g. LATEST bumps a
    // manga on every new chapter) can also hand back a manga already seen on an
    // earlier page. seenIds catches both, mirroring the discover section above.
    // When filtering leaves a page thin (or empty), more pages are fetched
    // internally — up to MAX_FILTER_FETCH_ATTEMPTS — to try to fill a full
    // batch before returning.
    let currentPage = page;
    let seenIds = new Set(previousSeenIds);
    const results: SearchResultItem[] = [];
    let hasNextPage = true;
    for (let attempt = 0; attempt < MAX_FILTER_FETCH_ATTEMPTS; attempt++) {
      // Only cap pagination for text searches; genre browsing can scroll indefinitely.
      if (titleQuery.length > 0 && currentPage > MangaHubExtension.MAX_SEARCH_PAGES) {
        hasNextPage = false;
        break;
      }
      const rows = await this.runSearch(titleQuery, genre, order, currentPage);
      const built = this.buildSearchResultsPage(rows, seenIds, genreFilter);
      results.push(...built.results);
      seenIds = built.seenIds;
      currentPage += 1;
      hasNextPage = rows.length === PER_PAGE;
      if (!hasNextPage || results.length >= PER_PAGE) break;
    }

    return {
      items: results,
      metadata: hasNextPage ? { page: currentPage, seenIds: [...seenIds] } : undefined,
    };
  }

  private async runSearch(
    queryText: string,
    genre: string,
    order: string,
    page: number,
  ): Promise<MangaHubMangaDto[]> {
    const offset = (page - 1) * PER_PAGE;
    const gql = `{
      search(x:${this.mangaSource},q:${JSON.stringify(queryText)},genre:${JSON.stringify(genre)},mod:${order},count:true,offset:${offset}) {
        rows { id title slug image genres }
      }
    }`;
    const result = await this.graphQL(gql);
    return result.data?.search?.rows ?? [];
  }

  /**
   * Resolves a stand-in cover for a manga MangaHub has no image for, in order:
   * cache, then another MangaHub listing for an alternate title, then AniList
   * as a last resort. Whichever succeeds is cached permanently.
   *
   * MangaHub sometimes shares one numeric id across alias rows (e.g. multiple
   * title variants of the same series), but sometimes indexes a duplicate as a
   * fully separate listing with its own id instead — alternativeTitle points
   * at it either way. So a listing found by searching for an alternate title
   * is trusted if it shares this manga's id *or* its own title overlaps with
   * the alternate title we searched for (MangaHub lists these as pointing at
   * each other, confirming they're the same series even with different ids).
   * A substring check (not exact equality) because a searched title can itself
   * be a comma-punctuated fragment of the row's real title.
   */
  private async resolveMissingCover(
    slug: string,
    mangaHubId: number | undefined,
    alternateTitles: string[],
    titleCandidates: string[],
  ): Promise<string> {
    const cached = getCachedCoverUrl(slug);
    if (cached) return cached;

    for (const altTitle of alternateTitles) {
      const rows = await this.runSearch(altTitle, "all", "POPULAR", 1);
      const normalizedAltTitle = this.normalizeTitle(altTitle);
      const match = rows.find((r) => {
        if (!r.image) return false;
        if (r.id === mangaHubId) return true;
        const normalizedRowTitle = this.normalizeTitle(r.title);
        return (
          normalizedRowTitle.includes(normalizedAltTitle) ||
          normalizedAltTitle.includes(normalizedRowTitle)
        );
      });
      if (match) {
        const url = this.thumbUrl(match.image);
        cacheCoverUrl(slug, url);
        return url;
      }
    }

    const aniListUrl = await resolveAniListCoverUrl(titleCandidates);
    if (aniListUrl) cacheCoverUrl(slug, aniListUrl);
    return aniListUrl ?? "";
  }

  // ----------------------------------------------------------------
  // Manga details
  // ----------------------------------------------------------------

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const slug = this.slugFromId(mangaId);
    const gql = `{
      manga(x:${this.mangaSource},slug:${JSON.stringify(slug)}) {
        id title slug status image author artist genres description alternativeTitle
      }
    }`;
    const result = await this.graphQL(gql, slug);
    const manga = result.data?.manga ?? {};

    const secondaryTitles: string[] = [];
    if (manga.alternativeTitle?.trim()) secondaryTitles.push(manga.alternativeTitle.trim());

    const genres = (manga.genres ?? "")
      .split(",")
      .map((g) => g.trim())
      .filter((g) => g.length > 0)
      .map((g) => ({
        title: g,
        id: g
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9._\-@()[\]%?#+=/&:]/g, ""),
      }));
    const tagGroups: TagSection[] = [];
    if (genres.length > 0) {
      tagGroups.push({ id: "genres", title: "Genres", tags: genres });
    }

    let synopsis = manga.description ?? "";
    if (manga.alternativeTitle?.trim())
      synopsis = `${synopsis}\n\nAlternative Name: ${manga.alternativeTitle.trim()}`;

    // MangaHub has no cover for some manga. Re-checked on every details fetch:
    // if MangaHub now has one, prefer it and drop any stale fallback; otherwise
    // resolve (and permanently cache) a stand-in cover — preferring another
    // MangaHub listing for the same id over an AniList lookup.
    let thumbnailUrl = this.thumbUrl(manga.image);
    if (thumbnailUrl) {
      clearCachedCoverUrl(slug);
    } else {
      const alternateTitles = this.parseAlternateTitles(manga.alternativeTitle ?? "");
      const titleCandidates = [manga.title ?? "", ...alternateTitles].filter(
        (t, i, arr) => t.length > 0 && arr.indexOf(t) === i,
      );
      thumbnailUrl = await this.resolveMissingCover(
        slug,
        manga.id,
        alternateTitles,
        titleCandidates,
      );
      if (thumbnailUrl) {
        synopsis = this.isMangaHubHostedUrl(thumbnailUrl)
          ? `${synopsis}\n\nNote: cover found via another MangaHub listing for this manga.`
          : `${synopsis}\n\nNote: cover found via AniList.`;
      }
    }

    return {
      mangaId,
      mangaInfo: {
        primaryTitle: manga.title ?? "",
        secondaryTitles,
        thumbnailUrl: thumbnailUrl || NO_COVER,
        author: this.cleanField(manga.author),
        artist: this.cleanField(manga.artist),
        synopsis: synopsis.trim(),
        contentRating: this.deriveContentRating(new Set(genres.map((g) => g.id))),
        status: this.parseStatus(manga.status ?? ""),
        tagGroups,
        shareUrl: this.getMangaShareUrl(mangaId),
      },
    };
  }

  // ----------------------------------------------------------------
  // Chapters
  // ----------------------------------------------------------------

  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const slug = this.slugFromId(sourceManga.mangaId);
    const gql = `{
      manga(x:${this.mangaSource},slug:${JSON.stringify(slug)}) {
        chapters { number title date }
      }
    }`;
    const result = await this.graphQL(gql, slug);
    const manga = result.data?.manga ?? {};
    const useGeneric = getUseGenericTitle(this.sourceName);

    const list = [...(manga.chapters ?? [])].reverse();
    const seenChapNums = new Set<number>();
    const chapters: Chapter[] = [];
    for (const ch of list) {
      if (seenChapNums.has(ch.number)) continue;
      seenChapNums.add(ch.number);
      const numberString = String(ch.number);
      const chapterId = numberString;
      let title: string;
      if (useGeneric) {
        title = `Chapter ${numberString}`;
      } else if (ch.title && /\d/.test(ch.title)) {
        title = ch.title;
      } else if (ch.title?.trim()) {
        title = `Chapter ${numberString} - ${ch.title.trim()}`;
      } else {
        title = `Chapter ${numberString}`;
      }
      chapters.push({
        chapterId,
        sourceManga,
        title,
        volume: 0,
        chapNum: ch.number,
        publishDate: this.parseDate(ch.date),
        langCode: this.langCode,
      });
    }
    return chapters;
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const slug = this.slugFromId(chapter.sourceManga.mangaId);
    const number = parseFloat(chapter.chapterId) || 0;

    const gql = `{
      chapter(x:${this.mangaSource},slug:${JSON.stringify(slug)},number:${number}) {
        pages
      }
    }`;

    const MAX_RETRIES = 2;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await this.graphQL(gql, slug);
        const pagesField = result.data?.chapter?.pages;
        const pages = pagesField ? this.parsePageUrls(pagesField) : [];
        return { id: chapter.chapterId, mangaId: chapter.sourceManga.mangaId, pages };
      } catch (err) {
        const isRateLimit = /rate.?limit|api.?key/i.test(
          err instanceof Error ? err.message : String(err),
        );
        if (!isRateLimit || attempt >= MAX_RETRIES) throw err;
        // graphQL() already refreshed the token; random 5-10s pause before retry
        const delay = Math.floor(Math.random() * 5000) + 5000;
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      }
    }

    throw new Error("unreachable");
  }

  getMangaShareUrl(mangaId: string): string {
    return `${this.baseUrl}/manga/${this.slugFromId(mangaId)}`;
  }

  // ----------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------

  private thumbUrl(image: string | undefined): string {
    if (!image) return "";
    if (/^https?:\/\//.test(image)) return image;
    return `${THUMB_CDN}/${image}`;
  }

  private isMangaHubHostedUrl(url: string): boolean {
    return url.startsWith(THUMB_CDN) || url.startsWith(IMAGE_CDN);
  }

  /**
   * MangaHub's per-manga genres field is free text and isn't always
   * consistent with the canonical genre label — e.g. a manga can be tagged
   * "Boys Love" even though the official genre is "Boys' Love". Apostrophes
   * are stripped so both forms compare equal.
   */
  private normalizeGenreLabel(label: string): string {
    return label
      .toLowerCase()
      .replace(/['’]/g, "")
      .trim()
      .replace(/\s+/g, " ");
  }

  private genreIdsToLabels(ids: readonly string[]): Set<string> {
    const idSet = new Set(ids);
    return new Set(
      GENRE_OPTIONS.filter((opt) => idSet.has(opt.id)).map((opt) =>
        this.normalizeGenreLabel(opt.label),
      ),
    );
  }

  private getFilteredContentFilter(): ContentFilter {
    return {
      excluded: this.genreIdsToLabels(getExcludedGenres(this.sourceName)),
      included: this.genreIdsToLabels(getIncludedGenres(this.sourceName)),
      requireAll: getRequireAllIncludedGenres(this.sourceName),
      includedRatings: new Set(getIncludedRatings(this.sourceName)) as ReadonlySet<ContentRating>,
    };
  }

  private getFilteredOrderLabel(): string {
    const order = getFilteredSectionOrder(this.sourceName);
    return FILTERED_SECTION_ORDER_OPTIONS.find((opt) => opt.id === order)?.label ?? order;
  }

  // Same normalization as the genre tag ids built in getMangaDetails, so a
  // manga's derived content rating is consistent wherever it's computed from.
  private genreTextToIds(genresText: string | undefined): Set<string> {
    return new Set(
      (genresText ?? "")
        .split(",")
        .map((g) => g.trim())
        .filter((g) => g.length > 0)
        .map((g) =>
          g
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9._\-@()[\]%?#+=/&:]/g, ""),
        ),
    );
  }

  private deriveContentRating(genreIds: ReadonlySet<string>): ContentRating {
    for (const id of genreIds) {
      if (ADULT_GENRES.has(id)) return ContentRating.ADULT;
    }
    for (const id of genreIds) {
      if (MATURE_GENRES.has(id)) return ContentRating.MATURE;
    }
    return ContentRating.EVERYONE;
  }

  /**
   * A genre in both excluded and included is treated as excluded only — it's
   * dropped from the inclusion check so it can never "rescue" a manga that
   * should be excluded.
   */
  private passesContentFilter(rowGenres: string | undefined, filter: ContentFilter): boolean {
    const rowGenreSet = new Set(
      (rowGenres ?? "")
        .split(",")
        .map((g) => this.normalizeGenreLabel(g))
        .filter((g) => g.length > 0),
    );
    for (const excluded of filter.excluded) {
      if (rowGenreSet.has(excluded)) return false;
    }
    const effectiveIncluded = [...filter.included].filter((g) => !filter.excluded.has(g));
    if (effectiveIncluded.length > 0) {
      const matchesIncluded = filter.requireAll
        ? effectiveIncluded.every((g) => rowGenreSet.has(g))
        : effectiveIncluded.some((g) => rowGenreSet.has(g));
      if (!matchesIncluded) return false;
    }
    if (filter.includedRatings.size > 0) {
      const rating = this.deriveContentRating(this.genreTextToIds(rowGenres));
      if (!filter.includedRatings.has(rating)) return false;
    }
    return true;
  }

  private normalizeTitle(title: string | undefined): string {
    return (title ?? "").toLowerCase().trim().replace(/\s+/g, " ");
  }

  /**
   * MangaHub separates alternate titles with ";" in some listings and "," in
   * others — and a title can itself legitimately contain a comma (e.g. "After
   * Retiring, I Live..."). Splitting on "," alone would shred a correct title
   * into meaningless fragments, so each ";"-delimited segment is kept whole
   * *and* also split on "," — trying both means a correct comma-containing
   * title is never lost, at the cost of a few extra (harmless) search misses
   * for its fragments.
   */
  private parseAlternateTitles(rawAlternativeTitle: string): string[] {
    const candidates: string[] = [];
    for (const segment of rawAlternativeTitle.split(";")) {
      const trimmedSegment = segment.trim();
      if (!trimmedSegment) continue;
      candidates.push(trimmedSegment);
      if (trimmedSegment.includes(",")) {
        for (const part of trimmedSegment.split(",")) {
          const trimmedPart = part.trim();
          if (trimmedPart) candidates.push(trimmedPart);
        }
      }
    }
    return [...new Set(candidates)];
  }

  private parsePageUrls(pagesJson: string): string[] {
    try {
      const payload = JSON.parse(pagesJson) as MangaHubPagesPayload;
      const prefix = payload.p ?? "";
      return (payload.i ?? []).map((img) => `${IMAGE_CDN}/${prefix}${img}`);
    } catch {
      return [];
    }
  }

  private slugFromId(mangaId: string): string {
    try {
      return decodeURIComponent(mangaId);
    } catch {
      return mangaId;
    }
  }

  private toSafeId(slug: string): string {
    return slug.replace(/[^A-Za-z0-9._\-@()[\]%?#+=/&:]/g, (c) => {
      const enc = encodeURIComponent(c);
      if (enc !== c) return enc;
      return "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0");
    });
  }

  private cleanField(value: string | null | undefined): string | undefined {
    if (!value) return undefined;
    const v = value.trim();
    if (!v || v === "-" || v.toLowerCase() === "n/a") return undefined;
    return v;
  }

  private parseStatus(status: string): string {
    switch (status.toLowerCase()) {
      case "ongoing":
        return "Ongoing";
      case "completed":
        return "Completed";
      default:
        return "Unknown";
    }
  }

  private parseDate(dateText: string | undefined): Date {
    if (!dateText) return new Date();
    const d = new Date(dateText);
    return isNaN(d.getTime()) ? new Date() : d;
  }
}

export const MangaHub = new MangaHubExtension({
  name: "MangaHub",
  baseUrl: "https://mangahub.io",
  mangaSource: "m01",
  contentRating: ContentRating.MATURE,
  langCode: "🇬🇧",
});
