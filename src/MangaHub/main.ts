/* SPDX-License-Identifier: GPL-3.0-or-later */

import {
  BasicRateLimiter,
  CloudflareError,
  ContentRating,
  CookieStorageInterceptor,
  DiscoverSectionType,
  type AdvancedSearchForm,
  type Chapter,
  type ChapterDetails,
  type Cookie,
  type DiscoverSection,
  type DiscoverSectionItem,
  type ExtensionImpl,
  type JSONValue,
  type PagedResults,
  type SearchQuery,
  type SearchResultItem,
  type SortingOption,
  type SourceManga,
  type TagSection,
} from "@paperback/types";
import * as cheerio from "cheerio";

import { MangaHubSearchForm, type MangaHubSearchMetadata } from "./forms";
import { MainInterceptor } from "./network";
import type MangaHubConfig from "./pbconfig";

const BASE_URL = "https://mangahub.io";
const API_URL = "https://api.mghcdn.com/graphql";
const IMG_CDN = "https://imgx.mghcdn.com/";
const THUMB_CDN = "https://thumb.mghcdn.com/";
const NO_COVER =
  "https://elrulia.github.io/paperback-extension/0.9/stable/MangaHub/static/no-cover.png";

async function fetchCheerio(url: string) {
  const [, data] = await Application.scheduleRequest({ url, method: "GET" });
  return cheerio.load(Application.arrayBufferToUTF8String(data));
}

function parseChapterDate(text: string): Date {
  const t = text.trim();

  // Absolute: MM-DD-YYYY
  const abs = t.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (abs) {
    return new Date(parseInt(abs[3]!), parseInt(abs[1]!) - 1, parseInt(abs[2]!));
  }

  if (/^today$/i.test(t)) return new Date();
  if (/^yesterday$/i.test(t)) return new Date(Date.now() - 86_400_000);
  if (/^less than/i.test(t)) return new Date();

  // Relative: "X hours/days/weeks/months/years ago"
  const rel = t.match(/^(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago$/i);
  if (rel) {
    const n = parseInt(rel[1]!);
    const unit = rel[2]!.toLowerCase();
    const msMap: Record<string, number> = {
      second: 1_000,
      minute: 60_000,
      hour: 3_600_000,
      day: 86_400_000,
      week: 7 * 86_400_000,
      month: 30 * 86_400_000,
      year: 365 * 86_400_000,
    };
    const ms = msMap[unit];
    if (ms !== undefined) return new Date(Date.now() - n * ms);
  }

  return new Date();
}

function extractSlug(href: string): string {
  return href
    .replace(/^https?:\/\/mangahub\.io\/manga\//, "")
    .replace(/^\/manga\//, "")
    .replace(/\/$/, "");
}

function parseSliderItems($: cheerio.CheerioAPI): DiscoverSectionItem[] {
  const items: DiscoverSectionItem[] = [];
  $(".manga-slider .manga-slide").each((_, el) => {
    const anchor = $(el).find("a.m-link-overlay").first();
    const href = anchor.attr("href") ?? "";
    const mangaId = extractSlug(href);
    const title = $(el).find("strong a").first().text().trim();
    const style = $(el).find(".m-slide-background").attr("style") ?? "";
    const imgMatch = style.match(/url\(([^)]+)\)/);
    const imageUrl = imgMatch?.[1] ?? NO_COVER;
    if (mangaId && title) {
      items.push({ mangaId, title, imageUrl, type: "prominentCarouselItem" });
    }
  });
  return items;
}

function parseMediaMangaItems(
  $: cheerio.CheerioAPI,
  type: "prominentCarouselItem" | "simpleCarouselItem",
  dedupe = false,
): DiscoverSectionItem[] {
  const items: DiscoverSectionItem[] = [];
  const seen = new Set<string>();
  $(".media-manga").each((_, el) => {
    const titleLink = $(el).find(".media-heading a").first();
    const href = titleLink.attr("href") ?? "";
    const mangaId = extractSlug(href);
    if (dedupe && seen.has(mangaId)) return;
    seen.add(mangaId);
    const title = titleLink.clone().children().remove().end().text().trim();
    const img = $(el).find(".media-left img");
    const rawUrl = img.attr("src") ?? img.attr("data-src") ?? "";
    const imageUrl = rawUrl.startsWith("http") ? rawUrl : NO_COVER;
    if (mangaId && title) {
      items.push({ mangaId, title, imageUrl, type });
    }
  });
  return items;
}

const ADULT_GENRES = new Set(["pornographic", "adult", "smut", "r-18"]);
const MATURE_GENRES = new Set(["erotica", "ecchi", "mature", "suggestive", "sexual-violence", "gore", "incest", "loli", "shota"]);

function deriveContentRating(genreIds: Set<string>): ContentRating {
  for (const id of genreIds) {
    if (ADULT_GENRES.has(id)) return ContentRating.ADULT;
  }
  for (const id of genreIds) {
    if (MATURE_GENRES.has(id)) return ContentRating.MATURE;
  }
  return ContentRating.EVERYONE;
}

export class MangaHubExtension implements ExtensionImpl<typeof MangaHubConfig> {
  mainRateLimiter = new BasicRateLimiter("main", {
    numberOfRequests: 2,
    bufferInterval: 8,
    ignoreImages: true,
  });

  cookieStorageInterceptor = new CookieStorageInterceptor({ storage: "stateManager" });
  mainInterceptor = new MainInterceptor("main");

  async initialise(): Promise<void> {
    this.mainRateLimiter.registerInterceptor();
    this.cookieStorageInterceptor.registerInterceptor();
    this.mainInterceptor.registerInterceptor();
    // Eagerly refresh the token on startup so chapter loads don't start with
    // the null GUID fallback (which exhausts its rate limit in ~1 chapter).
    //void this.refreshMhubToken();
  }

  // Paperback calls this after the user completes the WebView bypass session.
  async saveCloudflareBypassCookies(cookies: Cookie[]): Promise<void> {
    console.log("[MH] bypass cookies:", JSON.stringify(cookies.map((c) => ({ name: c.name, domain: c.domain, hasValue: !!c.value }))));

    for (const cookie of cookies) {
      try {
        this.cookieStorageInterceptor.deleteCookie(cookie);
      } catch (e) {
        console.log("[MH] deleteCookie crash on:", cookie.name, String(e));
      }
    }

    for (const cookie of cookies) {
      this.cookieStorageInterceptor.setCookie(cookie);
      if (cookie.name === "mhub_access" && cookie.value) {
        Application.setState(cookie.value, "mhubToken");
        console.log("[MH] saved mhub_access:", cookie.value.slice(0, 8) + "...");
      }
    }

    const stateAfter = (Application.getState("mhubToken") as string | undefined);
    console.log("[MH] state after bypass:", stateAfter?.slice(0, 8) ?? "NOT SET");
    if (!stateAfter) {
      throw new Error(`Bypass complete but mhub_access NOT found in cookies. Got: ${cookies.map((c) => c.name).join(", ")}`);
    }
  }

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    return [
      { id: "latest", title: "Latest Updates", type: DiscoverSectionType.simpleCarousel },
      { id: "new", title: "New Manga", type: DiscoverSectionType.simpleCarousel },
      { id: "popular", title: "Popular Manga", type: DiscoverSectionType.prominentCarousel },
      { id: "popular-updates", title: "Popular Updates", type: DiscoverSectionType.simpleCarousel },
      { id: "completed", title: "Completed Manga", type: DiscoverSectionType.simpleCarousel },
    ];
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata: JSONValue | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    if (section.id === "latest") {
      const page = (metadata as number | undefined) ?? 1;
      return this.fetchLatestViaApi(page);
    }

    const page = (metadata as number | undefined) ?? 1;

    let url: string;
    let dedupe = false;
    switch (section.id) {
      case "popular":
        url = `${BASE_URL}/popular/page/${page}`;
        break;
      case "popular-updates": {
        const $ = await fetchCheerio(`${BASE_URL}/`);
        return { items: parseSliderItems($) };
      }
      case "new":
        url = `${BASE_URL}/search/page/${page}?order=NEW&genre=all`;
        dedupe = true;
        break;
      case "completed":
        url = `${BASE_URL}/search/page/${page}?order=COMPLETED`;
        dedupe = true;
        break;
      default:
        return { items: [] };
    }

    const type = section.id === "popular" ? "prominentCarouselItem" : "simpleCarouselItem";
    const $ = await fetchCheerio(url);
    const items = parseMediaMangaItems($, type, dedupe);
    const hasNext = $("ul.pager li.next").length > 0;
    return { items, metadata: hasNext ? page + 1 : undefined };
  }

  // Fetches up to 2000 recent entries from the API, deduplicates by numeric manga
  // id (matching MangaHub's own client-side logic), then paginates locally.
  async fetchLatestViaApi(page: number): Promise<PagedResults<DiscoverSectionItem>> {
    const token = await this.getMhubToken();

    const [, data] = await Application.scheduleRequest({
      url: API_URL,
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "x-mhub-access": token,
        origin: BASE_URL,
      },
      body: JSON.stringify({
        query: `{ latest(x: m01, limit: 2000) { id title slug image } }`,
      }),
    });

    const json = JSON.parse(Application.arrayBufferToUTF8String(data)) as {
      data?: { latest?: { id: number; slug: string; title: string; image: string }[] | null };
    };

    const all = json.data?.latest ?? [];

    const seenId = new Set<number>();
    const deduped = all.filter((entry) => {
      if (seenId.has(entry.id)) return false;
      seenId.add(entry.id);
      return true;
    });

    const PAGE_SIZE = 30;
    const offset = (page - 1) * PAGE_SIZE;
    const pageItems = deduped.slice(offset, offset + PAGE_SIZE);
    const hasNext = offset + PAGE_SIZE < deduped.length;

    const items: DiscoverSectionItem[] = pageItems.map((entry) => ({
      mangaId: entry.slug,
      title: entry.title,
      imageUrl: entry.image.startsWith("http") ? entry.image : `${THUMB_CDN}${entry.image}`,
      type: "simpleCarouselItem" as const,
    }));

    return { items, metadata: hasNext ? page + 1 : undefined };
  }

  async getSortingOptions(_query: SearchQuery<JSONValue>): Promise<SortingOption[]> {
    return [
      { id: "POPULAR", label: "Popular" },
      { id: "LATEST", label: "Latest" },
      { id: "ALPHABET", label: "A-Z" },
      { id: "NEW", label: "New" },
      { id: "COMPLETED", label: "Completed" },
    ];
  }

  async getAdvancedSearchForm(query: SearchQuery<JSONValue>): Promise<AdvancedSearchForm> {
    return new MangaHubSearchForm(query as SearchQuery<MangaHubSearchMetadata>);
  }

  async getSearchResults(
    query: SearchQuery<JSONValue>,
    metadata: JSONValue | undefined,
    sortingOption?: SortingOption,
  ): Promise<PagedResults<SearchResultItem>> {
    const page = (metadata as { page?: number } | undefined)?.page ?? 1;
    const q = encodeURIComponent((query.title ?? "").replace(/"/g, '\\"'));
    const order = sortingOption?.id ?? "POPULAR";
    const { genres = ["all"] } = (query.metadata as MangaHubSearchMetadata | undefined) ?? {};
    const genreParam = genres.includes("all") ? "all" : genres.join(",");

    const $ = await fetchCheerio(
      `${BASE_URL}/search/page/${page}?q=${q}&order=${order}&genre=${genreParam}&state=all`,
    );

    const items: SearchResultItem[] = [];
    $(".media-manga").each((_, el) => {
      const titleLink = $(el).find(".media-heading a").first();
      const href = titleLink.attr("href") ?? "";
      const mangaId = extractSlug(href);
      const title = titleLink.clone().children().remove().end().text().trim();
      const img = $(el).find(".media-left img");
      const rawUrl = img.attr("src") ?? img.attr("data-src") ?? "";
      const imageUrl = rawUrl.startsWith("http") ? rawUrl : NO_COVER;
      const subtitle = $(el).find(".media-body span a").first().text().trim();
      if (mangaId && title) items.push({ mangaId, title, imageUrl, subtitle });
    });

    const hasNextPage = $("ul.pager li.next").length > 0;
    return { items, metadata: hasNextPage ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const $ = await fetchCheerio(`${BASE_URL}/manga/${mangaId}`);

    const h1 = $("h1").first();
    const secondaryTitles = h1
      .find("small")
      .text()
      .split(";")
      .map((t) => t.trim())
      .filter(Boolean);
    const primaryTitle = h1.clone().children().remove().end().text().trim();
    const rawThumb = $("img.manga-thumb").first().attr("src") ?? "";
    const thumbnailUrl = rawThumb.startsWith("http") ? rawThumb : NO_COVER;

    const rawSynopsis = $("meta[property='og:description']").attr("content") ?? "";
    const colonIdx = rawSynopsis.indexOf(": ");
    const synopsis = colonIdx >= 0 ? rawSynopsis.slice(colonIdx + 2).trim() : rawSynopsis.trim();

    let author: string | undefined;
    let status = "ONGOING";
    $("._3SlhO").each((_, labelEl) => {
      const label = $(labelEl).text().replace(":", "").trim();
      const value = $(labelEl).next("span").text().trim();
      if (label === "Author" && value) author = value;
      if (label === "Status" && value) status = value.toUpperCase();
    });

    const seenGenres = new Set<string>();
    const genreTagSection: TagSection = {
      id: "genres",
      title: "Genres",
      tags: [],
    };
    $("a.label.genre-label").each((_, el) => {
      const genre = $(el).text().trim();
      const id = genre
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");
      if (!seenGenres.has(id)) {
        seenGenres.add(id);
        genreTagSection.tags.push({ id, title: genre });
      }
    });

    return {
      mangaId,
      mangaInfo: {
        primaryTitle,
        secondaryTitles,
        thumbnailUrl,
        synopsis,
        author,
        contentRating: deriveContentRating(seenGenres),
        status,
        tagGroups: [genreTagSection],
      },
    };
  }

  async getChapters(sourceManga: SourceManga, sinceDate?: Date): Promise<Chapter[]> {
    void sinceDate;
    const $ = await fetchCheerio(`${BASE_URL}/manga/${sourceManga.mangaId}`);

    const chapters: Chapter[] = [];
    const seen = new Set<string>();

    $("li._287KE a._3pfyN").each((_, el) => {
      const href = $(el).attr("href") ?? "";
      const match = href.match(/\/chapter-([\d.]+)(?:[?#].*)?$/);
      if (!match?.[1]) return;

      const chapterId = match[1];
      if (seen.has(chapterId)) return;
      seen.add(chapterId);

      const chapNum = parseFloat(chapterId);
      const dateText = $(el).find("small.UovLc").text().trim();
      chapters.push({
        chapterId,
        sourceManga,
        langCode: "en",
        chapNum,
        volume: 0,
        sortingIndex: chapNum,
        publishDate: parseChapterDate(dateText),
      });
    });

    return chapters;
  }

  async getMhubToken(): Promise<string> {
    const token = (Application.getState("mhubToken") as string | undefined) ?? "00000000-0000-0000-0000-000000000000";
    console.log("[MH] getMhubToken:", token.slice(0, 8) + "...");
    return token;
  }

  // Clears the cached token and refetches mangahub.io so interceptResponse can
  // extract a fresh mhub_access from Set-Cookie. Mirrors 0.8 refreshAPIKey().
  async refreshMhubToken(): Promise<void> {
    Application.setState(undefined, "mhubToken");
    await Application.scheduleRequest({ url: `${BASE_URL}/`, method: "GET" });
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const slug = chapter.sourceManga.mangaId;
    const num = chapter.chapterId;

    const fetchPages = async (token: string): Promise<{ pages?: string; errMsg?: string }> => {
      const [, data] = await Application.scheduleRequest({
        url: API_URL,
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "x-mhub-access": token,
          origin: BASE_URL,
        },
        body: JSON.stringify({
          query: `{ chapter(x: m01, slug: "${slug}", number: ${num}) { pages } }`,
        }),
      });
      const json = JSON.parse(Application.arrayBufferToUTF8String(data)) as {
        data?: { chapter?: { pages?: string } | null };
        errors?: { message: string }[];
      };
      return { pages: json.data?.chapter?.pages, errMsg: json.errors?.[0]?.message };
    };

    let result = await fetchPages(await this.getMhubToken());

    if (result.errMsg) {
      // First attempt failed. Try a silent token refresh (mirrors 0.8 refreshAPIKey)
      // before falling back to the user-visible bypass dialog.
      await this.refreshMhubToken();
      result = await fetchPages(await this.getMhubToken());
    }

    if (result.errMsg) {
      const debugToken = await this.getMhubToken();
      throw new CloudflareError(
        { url: `${BASE_URL}/chapter/${slug}/chapter-${num}?reloadKey=1`, method: "GET" },
        `${result.errMsg} | token=${debugToken.slice(0, 8)}`,
      );
    }

    const pages: string[] = [];
    if (result.pages) {
      const parsed = JSON.parse(result.pages) as { p: string; i: string[] };
      for (const img of parsed.i) {
        pages.push(`${IMG_CDN}${parsed.p}${img}`);
      }
    }

    return { id: num, mangaId: slug, pages };
  }
}

export const MangaHub = new MangaHubExtension();
