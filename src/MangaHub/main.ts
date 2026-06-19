/* SPDX-License-Identifier: GPL-3.0-or-later */

import {
  BasicRateLimiter,
  ContentRating,
  DiscoverSectionType,
  type Chapter,
  type ChapterDetails,
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

import { MainInterceptor } from "./network";
import type MangaHubConfig from "./pbconfig";

const BASE_URL = "https://mangahub.io";
const API_URL = "https://api.mghcdn.com/graphql";
const IMG_CDN = "https://imgx.mghcdn.com/";
const NO_COVER = "https://mangahub.io/SharingImage.png";

async function fetchCheerio(url: string) {
  const [, data] = await Application.scheduleRequest({ url, method: "GET" });
  return cheerio.load(Application.arrayBufferToUTF8String(data));
}

function extractSlug(href: string): string {
  return href
    .replace(/^https?:\/\/mangahub\.io\/manga\//, "")
    .replace(/^\/manga\//, "")
    .replace(/\/$/, "");
}

function parseMediaMangaItems(
  $: cheerio.CheerioAPI,
  type: "prominentCarouselItem" | "simpleCarouselItem",
): DiscoverSectionItem[] {
  const items: DiscoverSectionItem[] = [];
  $(".media-manga").each((_, el) => {
    const titleLink = $(el).find(".media-heading a").first();
    const href = titleLink.attr("href") ?? "";
    const mangaId = extractSlug(href);
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

export class MangaHubExtension implements ExtensionImpl<typeof MangaHubConfig> {
  mainRateLimiter = new BasicRateLimiter("main", {
    numberOfRequests: 10,
    bufferInterval: 1,
    ignoreImages: true,
  });

  mainInterceptor = new MainInterceptor("main");

  async initialise(): Promise<void> {
    this.mainRateLimiter.registerInterceptor();
    this.mainInterceptor.registerInterceptor();
  }

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    return [
      {
        id: "popular",
        title: "Popular Manga",
        type: DiscoverSectionType.prominentCarousel,
      },
      {
        id: "latest",
        title: "Latest Updates",
        type: DiscoverSectionType.simpleCarousel,
      },
    ];
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata: number | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    void metadata;

    switch (section.id) {
      case "popular": {
        const $ = await fetchCheerio(`${BASE_URL}/popular`);
        return { items: parseMediaMangaItems($, "prominentCarouselItem") };
      }
      case "latest": {
        const $ = await fetchCheerio(`${BASE_URL}/updates`);
        return { items: parseMediaMangaItems($, "simpleCarouselItem") };
      }
      default:
        return { items: [] };
    }
  }

  async getSearchResults(
    query: SearchQuery<JSONValue>,
    metadata: JSONValue | undefined,
    _sortingOption?: SortingOption,
  ): Promise<PagedResults<SearchResultItem>> {
    const page = (metadata as { page?: number } | undefined)?.page ?? 1;
    const q = encodeURIComponent(query.title ?? "");
    const $ = await fetchCheerio(
      `${BASE_URL}/search/page/${page}?q=${q}&order=POPULAR&genre=all&state=all&story_status=both`,
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
      if (mangaId && title) {
        items.push({ mangaId, title, imageUrl, subtitle });
      }
    });

    const hasNextPage = $("ul.pager li.next").length > 0;
    return {
      items,
      metadata: hasNextPage ? { page: page + 1 } : undefined,
    };
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
    // Remove ALL child elements (small alt-titles + span badges like "Hot") to get plain title
    const primaryTitle = h1.clone().children().remove().end().text().trim();
    const thumbnailUrl = $("img.manga-thumb").first().attr("src") ?? "";

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
        contentRating: ContentRating.EVERYONE,
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

    // _3pfyN = free chapters; _1AxFv = premium (skip)
    $("li._287KE a._3pfyN").each((_, el) => {
      const href = $(el).attr("href") ?? "";
      const match = href.match(/\/chapter-([\d.]+)(?:[?#].*)?$/);
      if (!match?.[1]) return;

      const chapterId = match[1];
      if (seen.has(chapterId)) return;
      seen.add(chapterId);

      const chapNum = parseFloat(chapterId);
      chapters.push({
        chapterId,
        sourceManga,
        langCode: "en",
        chapNum,
        volume: 0,
        sortingIndex: chapNum,
      });
    });

    return chapters;
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const slug = chapter.sourceManga.mangaId;
    const num = chapter.chapterId;

    const [, data] = await Application.scheduleRequest({
      url: API_URL,
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-mhub-access": "00000000-0000-0000-0000-000000000000",
        origin: BASE_URL,
      },
      body: JSON.stringify({
        query: `{ chapter(x: m01, slug: "${slug}", number: ${num}) { pages } }`,
      }),
    });

    const json = JSON.parse(Application.arrayBufferToUTF8String(data)) as {
      data?: { chapter?: { pages?: string } | null };
    };

    const pagesJson = json.data?.chapter?.pages;
    const pages: string[] = [];

    if (pagesJson) {
      const parsed = JSON.parse(pagesJson) as { p: string; i: string[] };
      for (const img of parsed.i) {
        pages.push(`${IMG_CDN}${parsed.p}${img}`);
      }
    }

    return { id: num, mangaId: slug, pages };
  }
}

export const MangaHub = new MangaHubExtension();
