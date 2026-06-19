/* SPDX-License-Identifier: GPL-3.0-or-later */

import { AdvancedSearchForm, Section, SelectRow, type SearchQuery } from "@paperback/types";

export type MangaHubSearchMetadata = {
  genres: string[];
  status: string;
};

const GENRE_OPTIONS = [
  { id: "all", title: "All Genres" },
  { id: "4-koma", title: "4-Koma" },
  { id: "academy", title: "Academy" },
  { id: "action", title: "Action" },
  { id: "adaptation", title: "Adaptation" },
  { id: "adult", title: "Adult" },
  { id: "adventure", title: "Adventure" },
  { id: "aliens", title: "Aliens" },
  { id: "animals", title: "Animals" },
  { id: "award-winning", title: "Award Winning" },
  { id: "boys-love", title: "Boys Love" },
  { id: "cheat-systems", title: "Cheat Systems" },
  { id: "comedy", title: "Comedy" },
  { id: "comic", title: "Comic" },
  { id: "cooking", title: "Cooking" },
  { id: "crazy-mc", title: "Crazy MC" },
  { id: "crime", title: "Crime" },
  { id: "crossdressing", title: "Crossdressing" },
  { id: "cultivation", title: "Cultivation" },
  { id: "delinquents", title: "Delinquents" },
  { id: "demons", title: "Demons" },
  { id: "dragon", title: "Dragon" },
  { id: "drama", title: "Drama" },
  { id: "dungeons", title: "Dungeons" },
  { id: "ecchi", title: "Ecchi" },
  { id: "erotica", title: "Erotica" },
  { id: "fantasy", title: "Fantasy" },
  { id: "full-color", title: "Full Color" },
  { id: "game", title: "Game" },
  { id: "gender-bender", title: "Gender Bender" },
  { id: "genderswap", title: "Genderswap" },
  { id: "ghosts", title: "Ghosts" },
  { id: "girls-love", title: "Girls Love" },
  { id: "gore", title: "Gore" },
  { id: "gyaru", title: "Gyaru" },
  { id: "harem", title: "Harem" },
  { id: "historical", title: "Historical" },
  { id: "horror", title: "Horror" },
  { id: "incest", title: "Incest" },
  { id: "isekai", title: "Isekai" },
  { id: "josei", title: "Josei" },
  { id: "loli", title: "Loli" },
  { id: "long-strip", title: "Long Strip" },
  { id: "mafia", title: "Mafia" },
  { id: "magic", title: "Magic" },
  { id: "magical-girls", title: "Magical Girls" },
  { id: "manga", title: "Manga" },
  { id: "manhua", title: "Manhua" },
  { id: "manhwa", title: "Manhwa" },
  { id: "martial-arts", title: "Martial Arts" },
  { id: "mature", title: "Mature" },
  { id: "mecha", title: "Mecha" },
  { id: "medical", title: "Medical" },
  { id: "military", title: "Military" },
  { id: "monster-girls", title: "Monster Girls" },
  { id: "monsters", title: "Monsters" },
  { id: "murim", title: "Murim" },
  { id: "music", title: "Music" },
  { id: "mystery", title: "Mystery" },
  { id: "ninja", title: "Ninja" },
  { id: "office-workers", title: "Office Workers" },
  { id: "official-colored", title: "Official Colored" },
  { id: "overpowered", title: "Overpowered" },
  { id: "philosophical", title: "Philosophical" },
  { id: "police", title: "Police" },
  { id: "pornographic", title: "Pornographic" },
  { id: "post-apocalyptic", title: "Post Apocalyptic" },
  { id: "psychological", title: "Psychological" },
  { id: "r-18", title: "R-18" },
  { id: "rebirth", title: "Rebirth" },
  { id: "regression", title: "Regression" },
  { id: "reincarnation", title: "Reincarnation" },
  { id: "returner", title: "Returner" },
  { id: "revenge", title: "Revenge" },
  { id: "reverse-harem", title: "Reverse Harem" },
  { id: "romance", title: "Romance" },
  { id: "safe", title: "Safe" },
  { id: "samurai", title: "Samurai" },
  { id: "school-life", title: "School Life" },
  { id: "sci-fi", title: "Sci-Fi" },
  { id: "seinen", title: "Seinen" },
  { id: "sexual-violence", title: "Sexual Violence" },
  { id: "shota", title: "Shota" },
  { id: "shoujo", title: "Shoujo" },
  { id: "shoujo-ai", title: "Shoujo Ai" },
  { id: "shounen", title: "Shounen" },
  { id: "shounen-ai", title: "Shounen Ai" },
  { id: "slice-of-life", title: "Slice of Life" },
  { id: "smut", title: "Smut" },
  { id: "sports", title: "Sports" },
  { id: "suggestive", title: "Suggestive" },
  { id: "super-power", title: "Super Power" },
  { id: "superhero", title: "Superhero" },
  { id: "supernatural", title: "Supernatural" },
  { id: "survival", title: "Survival" },
  { id: "thriller", title: "Thriller" },
  { id: "time-travel", title: "Time Travel" },
  { id: "tragedy", title: "Tragedy" },
  { id: "vampires", title: "Vampires" },
  { id: "video-games", title: "Video Games" },
  { id: "villainess", title: "Villainess" },
  { id: "virtual-reality", title: "Virtual Reality" },
  { id: "web-comic", title: "Web Comic" },
  { id: "webtoons", title: "Webtoons" },
  { id: "wuxia", title: "Wuxia" },
  { id: "yaoi", title: "Yaoi" },
  { id: "yuri", title: "Yuri" },
  { id: "zombies", title: "Zombies" },
];

const STATUS_OPTIONS = [
  { id: "both", title: "All" },
  { id: "ongoing", title: "Ongoing" },
  { id: "completed", title: "Completed" },
];

export class MangaHubSearchForm extends AdvancedSearchForm {
  private genres: string[];
  private status: string;

  constructor(query: SearchQuery<MangaHubSearchMetadata>) {
    super();
    this.genres = query.metadata?.genres ?? ["all"];
    this.status = query.metadata?.status ?? "both";
  }

  override getSections() {
    return [
      Section("filters", [
        SelectRow("genre", {
          title: "Genre",
          value: this.genres,
          options: GENRE_OPTIONS,
          minItemCount: 0,
          maxItemCount: 10,
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
    this.genres = value.length > 0 ? value : ["all"];
  }

  async handleStatusChange(value: string[]): Promise<void> {
    this.status = value[0] ?? "both";
  }

  override getSearchQueryMetadata(): MangaHubSearchMetadata {
    return { genres: this.genres, status: this.status };
  }
}
