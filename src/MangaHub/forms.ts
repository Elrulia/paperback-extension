import {
  AdvancedSearchForm,
  type JSONObject,
  Section,
  SelectRow,
} from "@paperback/types";

export interface MangaHubSearchMeta extends JSONObject {
  orderBy: string[];
  genre: string[];
}

export const ORDER_BY_OPTIONS: { id: string; label: string }[] = [
  { id: "POPULAR", label: "Popular" },
  { id: "LATEST", label: "Updates" },
  { id: "ALPHABET", label: "A-Z" },
  { id: "NEW", label: "New" },
  { id: "COMPLETED", label: "Completed" },
];

export const GENRE_OPTIONS: { id: string; label: string }[] = [
  { id: "action",            label: "Action" },
  { id: "adaptation",        label: "Adaptation" },
  { id: "adult",             label: "Adult" },
  { id: "adventure",         label: "Adventure" },
  { id: "aliens",            label: "Aliens" },
  { id: "animals",           label: "Animals" },
  { id: "anthology",         label: "Anthology" },
  { id: "award-winning",     label: "Award Winning" },
  { id: "4-koma",            label: "4-Koma" },
  { id: "cartoon",           label: "Cartoon" },
  { id: "cheat-systems",     label: "Cheat Systems" },
  { id: "comic",             label: "Comic" },
  { id: "comedy",            label: "Comedy" },
  { id: "cooking",           label: "Cooking" },
  { id: "crime",             label: "Crime" },
  { id: "crossdressing",     label: "Crossdressing" },
  { id: "cultivation",       label: "Cultivation" },
  { id: "delinquents",       label: "Delinquents" },
  { id: "demons",            label: "Demons" },
  { id: "doujinshi",         label: "Doujinshi" },
  { id: "drama",             label: "Drama" },
  { id: "dungeons",          label: "Dungeons" },
  { id: "ecchi",             label: "Ecchi" },
  { id: "english",           label: "English" },
  { id: "fantasy",           label: "Fantasy" },
  { id: "food",              label: "Food" },
  { id: "full-color",        label: "Full Color" },
  { id: "game",              label: "Game" },
  { id: "gender-bender",     label: "Gender Bender" },
  { id: "ghosts",            label: "Ghosts" },
  { id: "gore",              label: "Gore" },
  { id: "harem",             label: "Harem" },
  { id: "harlequin",         label: "Harlequin" },
  { id: "historical",        label: "Historical" },
  { id: "horror",            label: "Horror" },
  { id: "isekai",            label: "Isekai" },
  { id: "josei",             label: "Josei" },
  { id: "kids",              label: "Kids" },
  { id: "loli",              label: "Loli" },
  { id: "magic",             label: "Magic" },
  { id: "magical-girls",     label: "Magical Girls" },
  { id: "manga",             label: "Manga" },
  { id: "manhua",            label: "Manhua" },
  { id: "manhwa",            label: "Manhwa" },
  { id: "martial-arts",      label: "Martial Arts" },
  { id: "mature",            label: "Mature" },
  { id: "mecha",             label: "Mecha" },
  { id: "medical",           label: "Medical" },
  { id: "military",          label: "Military" },
  { id: "monster-girls",     label: "Monster Girls" },
  { id: "monsters",          label: "Monsters" },
  { id: "music",             label: "Music" },
  { id: "mystery",           label: "Mystery" },
  { id: "ninja",             label: "Ninja" },
  { id: "office-workers",    label: "Office Workers" },
  { id: "oneshot",           label: "Oneshot" },
  { id: "overpowered",       label: "Overpowered" },
  { id: "philosophical",     label: "Philosophical" },
  { id: "police",            label: "Police" },
  { id: "post-apocalyptic",  label: "Post-Apocalyptic" },
  { id: "psychological",     label: "Psychological" },
  { id: "r-18",              label: "R-18" },
  { id: "rebirth",           label: "Rebirth" },
  { id: "reincarnation",     label: "Reincarnation" },
  { id: "revenge",           label: "Revenge" },
  { id: "reverse-harem",     label: "Reverse Harem" },
  { id: "romance",           label: "Romance" },
  { id: "russian",           label: "Russian" },
  { id: "samurai",           label: "Samurai" },
  { id: "school-life",       label: "School Life" },
  { id: "sci-fi",            label: "Sci-Fi" },
  { id: "seinen",            label: "Seinen" },
  { id: "shoujo",            label: "Shoujo" },
  { id: "shoujo-ai",         label: "Shoujo Ai" },
  { id: "shounen",           label: "Shounen" },
  { id: "shounen-ai",        label: "Shounen Ai" },
  { id: "slice-of-life",     label: "Slice of Life" },
  { id: "smut",              label: "Smut" },
  { id: "sports",            label: "Sports" },
  { id: "super-power",       label: "Super Power" },
  { id: "superhero",         label: "Superhero" },
  { id: "supernatural",      label: "Supernatural" },
  { id: "survival",          label: "Survival" },
  { id: "system",            label: "System" },
  { id: "thriller",          label: "Thriller" },
  { id: "time-travel",       label: "Time Travel" },
  { id: "traditional-games", label: "Traditional Games" },
  { id: "tragedy",           label: "Tragedy" },
  { id: "vampires",          label: "Vampires" },
  { id: "video-games",       label: "Video Games" },
  { id: "villainess",        label: "Villainess" },
  { id: "violence",          label: "Violence" },
  { id: "webtoon",           label: "Webtoon" },
  { id: "webtoons",          label: "Webtoons" },
  { id: "wuxia",             label: "Wuxia" },
  { id: "xianxia",           label: "Xianxia" },
  { id: "xuanhuan",          label: "Xuanhuan" },
  { id: "yaoi",              label: "Yaoi" },
  { id: "yuri",              label: "Yuri" },
  { id: "zombies",           label: "Zombies" },
];

export class MangaHubSearchForm extends AdvancedSearchForm {
  override readonly requiresExplicitSubmission = true;

  private orderBy: string[];
  private genre: string[];

  constructor(initialMeta?: MangaHubSearchMeta) {
    super();
    this.orderBy = initialMeta?.orderBy ?? [];
    this.genre = initialMeta?.genre ?? [];
  }

  async updateOrderBy(value: string[]): Promise<void> {
    this.orderBy = value;
    this.reloadForm();
  }

  async updateGenre(value: string[]): Promise<void> {
    this.genre = value;
    this.reloadForm();
  }

  getSearchQueryMetadata(): MangaHubSearchMeta {
    return {
      orderBy: this.orderBy,
      genre: this.genre,
    } satisfies MangaHubSearchMeta;
  }

  override getSections() {
    return [
      Section({ id: "order" }, [
        SelectRow("order_by", {
          title: "Order By",
          value: this.orderBy,
          options: ORDER_BY_OPTIONS.map((opt) => ({ id: opt.id, title: opt.label })),
          minItemCount: 0,
          maxItemCount: 1,
          onValueChange: Application.Selector<
            MangaHubSearchForm,
            (value: string[]) => Promise<void>
          >(this, "updateOrderBy"),
        }),
      ]),
      Section({ id: "genre", header: "Genre" }, [
        SelectRow("genre_select", {
          title: "Genre",
          value: this.genre,
          options: GENRE_OPTIONS.map((opt) => ({ id: opt.id, title: opt.label })),
          minItemCount: 0,
          maxItemCount: 10,
          onValueChange: Application.Selector<
            MangaHubSearchForm,
            (value: string[]) => Promise<void>
          >(this, "updateGenre"),
        }),
      ]),
    ];
  }
}
