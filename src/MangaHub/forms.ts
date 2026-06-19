/* SPDX-License-Identifier: GPL-3.0-or-later */

import { AdvancedSearchForm, Section, SelectRow, type SearchQuery } from "@paperback/types";

export type MangaHubSearchMetadata = {
  genre: string;
  status: string;
};

const GENRE_OPTIONS = [
  { id: "all", title: "All Genres" },
  { id: "action", title: "Action" },
  { id: "adventure", title: "Adventure" },
  { id: "comedy", title: "Comedy" },
  { id: "drama", title: "Drama" },
  { id: "ecchi", title: "Ecchi" },
  { id: "fantasy", title: "Fantasy" },
  { id: "harem", title: "Harem" },
  { id: "horror", title: "Horror" },
  { id: "isekai", title: "Isekai" },
  { id: "mystery", title: "Mystery" },
  { id: "psychological", title: "Psychological" },
  { id: "romance", title: "Romance" },
  { id: "school-life", title: "School Life" },
  { id: "sci-fi", title: "Sci-Fi" },
  { id: "seinen", title: "Seinen" },
  { id: "shoujo", title: "Shoujo" },
  { id: "shounen", title: "Shounen" },
  { id: "slice-of-life", title: "Slice of Life" },
  { id: "sports", title: "Sports" },
  { id: "supernatural", title: "Supernatural" },
  { id: "thriller", title: "Thriller" },
  { id: "tragedy", title: "Tragedy" },
];

const STATUS_OPTIONS = [
  { id: "both", title: "All" },
  { id: "ongoing", title: "Ongoing" },
  { id: "completed", title: "Completed" },
];

export class MangaHubSearchForm extends AdvancedSearchForm {
  private genre: string;
  private status: string;

  constructor(query: SearchQuery<MangaHubSearchMetadata>) {
    super();
    this.genre = query.metadata?.genre ?? "all";
    this.status = query.metadata?.status ?? "both";
  }

  override getSections() {
    return [
      Section("filters", [
        SelectRow("genre", {
          title: "Genre",
          value: [this.genre],
          options: GENRE_OPTIONS,
          minItemCount: 1,
          maxItemCount: 1,
          onValueChange: Application.Selector(this as MangaHubSearchForm, "handleGenreChange"),
        }),
        SelectRow("status", {
          title: "Status",
          value: [this.status],
          options: STATUS_OPTIONS,
          minItemCount: 1,
          maxItemCount: 1,
          onValueChange: Application.Selector(this as MangaHubSearchForm, "handleStatusChange"),
        }),
      ]),
    ];
  }

  async handleGenreChange(value: string[]): Promise<void> {
    this.genre = value[0] ?? "all";
  }

  async handleStatusChange(value: string[]): Promise<void> {
    this.status = value[0] ?? "both";
  }

  override getSearchQueryMetadata(): MangaHubSearchMetadata {
    return { genre: this.genre, status: this.status };
  }
}
