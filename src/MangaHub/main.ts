import {
  BasicRateLimiter,
  CloudflareError,
  ContentRating,
  CookieStorageInterceptor,
  DiscoverSectionType,
  Form,
  PaperbackInterceptor,
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
  Response as PaperbackResponse,
  SearchQuery,
  SearchResultItem,
  SearchResultsProviding,
  SettingsFormProviding,
  SourceManga,
  TagSection,
} from "@paperback/types";
import type { MangaHubSearchMeta } from "./forms";
import { MangaHubSearchForm } from "./forms";
import { getBaseUrlOverride, getUseGenericTitle, MangaHubSettingsForm } from "./settings";

interface MangaHubConfig {
  name: string;
  baseUrl: string;
  mangaSource: string;
  contentRating?: ContentRating;
  langCode?: string;
}

const GRAPHQL_URLS = ["https://api.mghcdn.com/graphql"];
const IMAGE_CDN = "https://imgx.mghcdn.com";
const THUMB_CDN = "https://thumb.mghcdn.com";
const PER_PAGE = 30;
const ACCESS_KEY_STATE = "mangahub.accessKey";
const RELOAD_KEY_STATE = "mangahub.reloadKey";

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
];

interface GqlError { message?: string }
interface MangaHubMangaDto {
  title?: string; slug?: string; status?: string; image?: string;
  author?: string; artist?: string; genres?: string; description?: string;
  alternativeTitle?: string; latestChapter?: number; chapters?: MangaHubChapterDto[];
}
interface MangaHubChapterDto { number: number; title?: string; date?: string }
interface MangaHubChapterPagesDto { pages?: string }
interface MangaHubGqlResponse {
  data?: {
    search?: { rows?: MangaHubMangaDto[] };
    manga?: MangaHubMangaDto;
    chapter?: MangaHubChapterPagesDto;
  };
  errors?: GqlError[];
}
interface MangaHubPagesPayload { p: string; i: string[] }

class MangaHubInterceptor extends PaperbackInterceptor {
  constructor(
    id: string,
    private readonly getBaseUrl: () => string,
    private readonly getAccessKey: () => string,
    private readonly getUserAgent: () => string,
  ) {
    super(id);
  }

  override async interceptRequest(request: PaperbackRequest): Promise<PaperbackRequest> {
    const baseUrl = this.getBaseUrl();
    const overrideUA = this.getUserAgent();
    const headers: Record<string, string> = {
      ...(request.headers as Record<string, string>),
      referer: `${baseUrl}/`,
      origin: baseUrl,
      "user-agent": overrideUA || (await Application.getDefaultUserAgent()),
      "accept-language": "en-US,en;q=0.5",
    };

    if (GRAPHQL_URLS.some((u) => request.url.startsWith(u))) {
      headers["content-type"] = "application/json";
      headers["accept"] = "application/json";
      const key = this.getAccessKey();
      if (key) headers["x-mhub-access"] = key;
    } else {
      headers["accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
    }

    return { ...request, headers };
  }

  override async interceptResponse(
    request: PaperbackRequest,
    response: PaperbackResponse,
    data: ArrayBuffer,
  ): Promise<ArrayBuffer> {
    if ((response.headers as Record<string, string>)?.["cf-mitigated"] === "challenge") {
      throw new CloudflareError({
        url: request.url,
        method: request.method ?? "GET",
        headers: { "user-agent": await Application.getDefaultUserAgent() },
      });
    }
    return data;
  }
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
  private useReloadKeyParam = false;
  private endpointIndex = 0;

  get baseUrl(): string {
    return getBaseUrlOverride(this.sourceName) ?? this.defaultBaseUrl;
  }

  private get graphqlUrl(): string {
    return GRAPHQL_URLS[this.endpointIndex] ?? GRAPHQL_URLS[0]!;
  }

  requestManager: MangaHubInterceptor;
  cookieStorageInterceptor = new CookieStorageInterceptor({ storage: "stateManager" });
  globalRateLimiter = new BasicRateLimiter("rateLimiter", {
    numberOfRequests: 3,
    bufferInterval: 6,
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
    const reload = Application.getState(RELOAD_KEY_STATE);
    if (typeof reload === "boolean") this.useReloadKeyParam = reload;
  }

  // ----------------------------------------------------------------
  // API key management
  // ----------------------------------------------------------------

  private async refreshAccessKey(mangaSlug?: string): Promise<void> {
    this.currentUserAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]!;

    const previousKey = this.findStoredCookieKey();

    for (const cookie of this.cookieStorageInterceptor.cookies) {
      if (cookie.name === "mhub_access") this.cookieStorageInterceptor.deleteCookie(cookie);
    }

    const now = Date.now();
    const recentlyValue = encodeURIComponent(
      `{"${now - this.randomInteger(0, 1200)}":{"mangaID":${this.randomInteger(1, 30000)},"number":1}}`,
    );
    this.cookieStorageInterceptor.setCookie({
      name: "recently",
      value: recentlyValue,
      domain: this.cookieDomain(),
      path: "/",
    });

    let path = mangaSlug ? `${this.baseUrl}/manga/${mangaSlug}` : `${this.baseUrl}/`;
    if (this.useReloadKeyParam) path += (path.includes("?") ? "&" : "?") + "reloadKey=1";

    const [response] = await Application.scheduleRequest({ url: path, method: "GET" });

    let key = "";
    for (const cookie of response.cookies ?? []) {
      if (cookie.name === "mhub_access" && cookie.value) { key = cookie.value; break; }
    }
    if (!key) key = this.findStoredCookieKey();

    if (!key || key === previousKey) {
      this.useReloadKeyParam = !this.useReloadKeyParam;
      Application.setState(this.useReloadKeyParam, RELOAD_KEY_STATE);
    }

    if (key) {
      this.accessKey = key;
      Application.setState(key, ACCESS_KEY_STATE);
    }
  }

  private findStoredCookieKey(): string {
    for (const cookie of this.cookieStorageInterceptor.cookies) {
      if (cookie.name === "mhub_access" && cookie.value) return cookie.value;
    }
    return "";
  }

  private randomInteger(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private cookieDomain(): string {
    return this.baseUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  }

  private async graphQL(query: string, mangaSlug?: string): Promise<MangaHubGqlResponse> {
    if (!this.accessKey) await this.refreshAccessKey(mangaSlug);

    let lastError: Error | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await this.postGraphQL(query);
      const errorText = this.gqlErrorText(result);
      const rateLimited = /rate\s*limit|api\s*key/.test(errorText);

      if (!errorText) return result;

      if (rateLimited) {
        lastError = new Error(errorText);
        if (attempt >= 1 && GRAPHQL_URLS.length > 1) {
          this.endpointIndex = (this.endpointIndex + 1) % GRAPHQL_URLS.length;
        }
        await new Promise((r) => setTimeout(r, (attempt + 1) * 3000));
        await this.refreshAccessKey(mangaSlug);
        continue;
      }

      throw new Error(errorText);
    }

    throw lastError ?? new Error("MangaHub: request failed");
  }

  private gqlErrorText(result: MangaHubGqlResponse): string {
    if (result.errors && result.errors.length > 0) {
      return result.errors.map((e) => e.message ?? "").join(" ").toLowerCase().trim();
    }
    return "";
  }

  private async postGraphQL(query: string): Promise<MangaHubGqlResponse> {
    const [response, data] = await Application.scheduleRequest({
      url: this.graphqlUrl,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (response.status === 404) throw new Error("Content not found");
    const jsonStr = Application.arrayBufferToUTF8String(data);
    try {
      return JSON.parse(jsonStr) as MangaHubGqlResponse;
    } catch {
      return {};
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
      { id: "popular_section", title: "Popular", type: DiscoverSectionType.featured },
      { id: "latest_section", title: "Latest Updates", type: DiscoverSectionType.simpleCarousel },
    ];
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata: Metadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    let order: string;
    let itemType: "featuredCarouselItem" | "simpleCarouselItem";
    switch (section.id) {
      case "popular_section": order = "POPULAR"; itemType = "featuredCarouselItem"; break;
      case "latest_section":  order = "LATEST";  itemType = "simpleCarouselItem";  break;
      default: return { items: [] };
    }

    const page = typeof (metadata as { page?: number } | undefined)?.page === "number"
      ? (metadata as { page: number }).page : 1;

    const rows = await this.runSearch("", "all", order, page);

    const items: DiscoverSectionItem[] = [];
    for (const row of rows) {
      const slug = row.slug ?? "";
      const imageUrl = this.thumbUrl(row.image);
      if (!slug || !imageUrl) continue;
      items.push({ type: itemType, mangaId: this.toSafeId(slug), imageUrl, title: row.title ?? "", metadata: undefined });
    }

    return { items, metadata: rows.length === PER_PAGE ? { page: page + 1 } : undefined };
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
    const meta = (query.metadata as { searchMeta?: MangaHubSearchMeta } | undefined)?.searchMeta;
    return new MangaHubSearchForm(meta);
  }

  async getSearchResults(
    query: SearchQuery<Metadata>,
    metadata: Metadata | undefined,
    sortingOption?: { id: string; label: string },
  ): Promise<PagedResults<SearchResultItem>> {
    const titleQuery = (query.title || "").trim();
    const searchMeta = (query.metadata as { searchMeta?: MangaHubSearchMeta } | undefined)?.searchMeta;
    const page = typeof (metadata as { page?: number } | undefined)?.page === "number"
      ? (metadata as { page: number }).page : 1;

    const order = sortingOption?.id || searchMeta?.orderBy?.[0] || "POPULAR";
    const genre = (searchMeta?.genre ?? "").trim() || "all";

    const rows = await this.runSearch(titleQuery, genre, order, page);

    const seen = new Set<string>();
    const results: SearchResultItem[] = [];
    for (const row of rows) {
      const signature = `${row.author ?? ""}|${row.latestChapter ?? ""}|${row.genres ?? ""}`;
      if (seen.has(signature)) continue;
      seen.add(signature);
      const slug = row.slug ?? "";
      const imageUrl = this.thumbUrl(row.image);
      if (!slug || !imageUrl) continue;
      results.push({ mangaId: this.toSafeId(slug), imageUrl, title: row.title ?? "", subtitle: undefined, metadata: undefined });
    }

    const hasNextPage = rows.length === PER_PAGE;
    const reachedPageLimit = page >= MangaHubExtension.MAX_SEARCH_PAGES;
    return { items: results, metadata: hasNextPage && !reachedPageLimit ? { page: page + 1 } : undefined };
  }

  private async runSearch(queryText: string, genre: string, order: string, page: number): Promise<MangaHubMangaDto[]> {
    const offset = (page - 1) * PER_PAGE;
    const gql = `{
      search(x:${this.mangaSource},q:${JSON.stringify(queryText)},genre:${JSON.stringify(genre)},mod:${order},offset:${offset}) {
        rows { title author slug image genres latestChapter }
      }
    }`;
    const result = await this.graphQL(gql);
    return result.data?.search?.rows ?? [];
  }

  // ----------------------------------------------------------------
  // Manga details
  // ----------------------------------------------------------------

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const slug = this.slugFromId(mangaId);
    const gql = `{
      manga(x:${this.mangaSource},slug:${JSON.stringify(slug)}) {
        title slug status image author artist genres description alternativeTitle
      }
    }`;
    const result = await this.graphQL(gql, slug);
    const manga = result.data?.manga ?? {};

    const secondaryTitles: string[] = [];
    if (manga.alternativeTitle?.trim()) secondaryTitles.push(manga.alternativeTitle.trim());

    const genres = (manga.genres ?? "").split(",").map((g) => g.trim()).filter((g) => g.length > 0);
    const tagGroups: TagSection[] = [];
    if (genres.length > 0) {
      tagGroups.push({
        id: "genres",
        title: "Genres",
        tags: genres.map((g) => ({ id: g.toLowerCase().replace(/\s+/g, "-"), title: g })),
      });
    }

    let synopsis = manga.description ?? "";
    if (manga.alternativeTitle?.trim()) synopsis = `${synopsis}\n\nAlternative Name: ${manga.alternativeTitle.trim()}`;

    return {
      mangaId,
      mangaInfo: {
        primaryTitle: manga.title ?? "",
        secondaryTitles,
        thumbnailUrl: this.thumbUrl(manga.image),
        author: this.cleanField(manga.author),
        artist: this.cleanField(manga.artist),
        synopsis: synopsis.trim(),
        contentRating: this.contentRating,
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
        slug chapters { number title date }
      }
    }`;
    const result = await this.graphQL(gql, slug);
    const manga = result.data?.manga ?? {};
    const useGeneric = getUseGenericTitle(this.sourceName);

    const list = [...(manga.chapters ?? [])].reverse();
    const chapters: Chapter[] = [];
    for (const ch of list) {
      const numberString = String(ch.number);
      const chapterId = this.toSafeId(`${slug}/chapter-${numberString}`);
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
    const decoded = this.safeDecode(chapter.chapterId);
    const parts = decoded.split("/");
    const slug = parts[0]!;
    const numberSegment = parts[parts.length - 1]!;
    const number = parseFloat(numberSegment.replace(/^chapter-/, "")) || 0;

    const gql = `{
      chapter(x:${this.mangaSource},slug:${JSON.stringify(slug)},number:${number}) {
        pages mangaID number manga { slug }
      }
    }`;
    const result = await this.graphQL(gql, slug);
    const pagesField = result.data?.chapter?.pages;

    const pages: string[] = [];
    if (pagesField) {
      try {
        const payload = JSON.parse(pagesField) as MangaHubPagesPayload;
        const prefix = payload.p ?? "";
        for (const img of payload.i ?? []) pages.push(`${IMAGE_CDN}/${prefix}${img}`);
      } catch { /* not valid JSON */ }
    }

    return { id: chapter.chapterId, mangaId: chapter.sourceManga.mangaId, pages };
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

  private slugFromId(mangaId: string): string {
    return this.safeDecode(mangaId);
  }

  private safeDecode(value: string): string {
    try { return decodeURIComponent(value); } catch { return value; }
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
      case "ongoing": return "Ongoing";
      case "completed": return "Completed";
      default: return "Unknown";
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
