import {
  AdvancedSearchForm,
  type JSONObject,
  Section,
  SelectRow,
  ToggleRow,
} from "@paperback/types";

export interface MangaHubSearchMeta extends JSONObject {
  genre: string[];
  excludedGenre: string[];
  requireAllGenres: boolean;
}

export const GENRE_OPTIONS: { id: string; label: string }[] = [
  { id: "4-koma", label: "4-Koma" },
  { id: "ability", label: "Ability" },
  { id: "academy", label: "Academy" },
  { id: "acting", label: "Acting" },
  { id: "action", label: "Action" },
  { id: "adaptation", label: "Adaptation" },
  { id: "adult", label: "Adult" },
  { id: "adventure", label: "Adventure" },
  { id: "aliens", label: "Aliens" },
  { id: "animal", label: "Animal" },
  { id: "animals", label: "Animals" },
  { id: "anthology", label: "Anthology" },
  { id: "apocalypse", label: "Apocalypse" },
  { id: "award-winning", label: "Award Winning" },
  { id: "awakened", label: "Awakened" },
  { id: "based-on-a-novel", label: "Based on a Novel" },
  { id: "basketball", label: "Basketball" },
  { id: "blood", label: "Blood" },
  { id: "bodyswap", label: "Bodyswap" },
  { id: "boys-love", label: "Boys' Love" },
  { id: "bully", label: "Bully" },
  { id: "business", label: "Business" },
  { id: "cartoon", label: "Cartoon" },
  { id: "cheat", label: "Cheat" },
  { id: "cheat-systems", label: "Cheat Systems" },
  { id: "chef", label: "Chef" },
  { id: "childhood-friends", label: "Childhood Friends" },
  { id: "college-life", label: "College Life" },
  { id: "comic", label: "Comic" },
  { id: "comedy", label: "Comedy" },
  { id: "cooking", label: "Cooking" },
  { id: "counterattack", label: "Counterattack" },
  { id: "crazy-mc", label: "Crazy MC" },
  { id: "crime", label: "Crime" },
  { id: "crossdressing", label: "Crossdressing" },
  { id: "cultivation", label: "Cultivation" },
  { id: "delinquents", label: "Delinquents" },
  { id: "demon", label: "Demon" },
  { id: "demons", label: "Demons" },
  { id: "disaster", label: "Disaster" },
  { id: "doujinshi", label: "Doujinshi" },
  { id: "dragon", label: "Dragon" },
  { id: "drama", label: "Drama" },
  { id: "dungeons", label: "Dungeons" },
  { id: "ecchi", label: "Ecchi" },
  { id: "english", label: "English" },
  { id: "erotica", label: "Erotica" },
  { id: "evolution", label: "Evolution" },
  { id: "fan-colored", label: "Fan Colored" },
  { id: "fantasy", label: "Fantasy" },
  { id: "fantasy-harem", label: "Fantasy Harem" },
  { id: "fantasy-manhwa", label: "Fantasy Manhwa" },
  { id: "fight", label: "Fight" },
  { id: "fighting", label: "Fighting" },
  { id: "food", label: "Food" },
  { id: "full-color", label: "Full Color" },
  { id: "gacha", label: "Gacha" },
  { id: "game", label: "Game" },
  { id: "gaming", label: "Gaming" },
  { id: "gender-bender", label: "Gender Bender" },
  { id: "genderswap", label: "Genderswap" },
  { id: "genius", label: "Genius" },
  { id: "genius-mc", label: "Genius MC" },
  { id: "ghosts", label: "Ghosts" },
  { id: "girls-love", label: "Girls' Love" },
  { id: "goddess", label: "Goddess" },
  { id: "gore", label: "Gore" },
  { id: "gyaru", label: "Gyaru" },
  { id: "harem", label: "Harem" },
  { id: "harlequin", label: "Harlequin" },
  { id: "hentai", label: "Hentai" },
  { id: "hero", label: "Hero" },
  { id: "historical", label: "Historical" },
  { id: "horror", label: "Horror" },
  { id: "hunter", label: "Hunter" },
  { id: "hunters", label: "Hunters" },
  { id: "incest", label: "Incest" },
  { id: "isekai", label: "Isekai" },
  { id: "japanese", label: "Japanese" },
  { id: "josei", label: "Josei" },
  { id: "kids", label: "Kids" },
  { id: "loli", label: "Loli" },
  { id: "long-strip", label: "Long Strip" },
  { id: "magic", label: "Magic" },
  { id: "magic-manga", label: "Magic Manga" },
  { id: "magical-girls", label: "Magical Girls" },
  { id: "magician", label: "Magician" },
  { id: "mafia", label: "Mafia" },
  { id: "mahjong", label: "Mahjong" },
  { id: "male-protagonist", label: "Male Protagonist" },
  { id: "male-protagonists", label: "Male Protagonists" },
  { id: "manga", label: "Manga" },
  { id: "manga-adaptation", label: "Manga Adaptation" },
  { id: "manhua", label: "Manhua" },
  { id: "manhua-shounen", label: "Manhua Shounen" },
  { id: "manhwa", label: "Manhwa" },
  { id: "martial-arts", label: "Martial Arts" },
  { id: "mature", label: "Mature" },
  { id: "mc", label: "MC" },
  { id: "mecha", label: "Mecha" },
  { id: "medical", label: "Medical" },
  { id: "military", label: "Military" },
  { id: "mma", label: "MMA" },
  { id: "modern-era", label: "Modern Era" },
  { id: "monster-girls", label: "Monster Girls" },
  { id: "monster-world", label: "Monster World" },
  { id: "monsters", label: "Monsters" },
  { id: "murim", label: "Murim" },
  { id: "music", label: "Music" },
  { id: "mystery", label: "Mystery" },
  { id: "ninja", label: "Ninja" },
  { id: "novel", label: "Novel" },
  { id: "office-workers", label: "Office Workers" },
  { id: "official-colored", label: "Official Colored" },
  { id: "oneshot", label: "Oneshot" },
  { id: "op", label: "OP" },
  { id: "overpowered", label: "Overpowered" },
  { id: "pets", label: "Pets" },
  { id: "philosophical", label: "Philosophical" },
  { id: "player", label: "Player" },
  { id: "police", label: "Police" },
  { id: "pornographic", label: "Pornographic" },
  { id: "post-apocalyptic", label: "Post-Apocalyptic" },
  { id: "psychological", label: "Psychological" },
  { id: "r-18", label: "R-18" },
  { id: "reborn", label: "Reborn" },
  { id: "rebirth", label: "Rebirth" },
  { id: "regression", label: "Regression" },
  { id: "reincarnation", label: "Reincarnation" },
  { id: "returner", label: "Returner" },
  { id: "revenge", label: "Revenge" },
  { id: "reverse-harem", label: "Reverse Harem" },
  { id: "reverse-isekai", label: "Reverse Isekai" },
  { id: "romance", label: "Romance" },
  { id: "royal-family", label: "Royal Family" },
  { id: "royalty", label: "Royalty" },
  { id: "russian", label: "Russian" },
  { id: "ruthless-protagonist", label: "Ruthless Protagonist" },
  { id: "safe", label: "Safe" },
  { id: "samurai", label: "Samurai" },
  { id: "school-life", label: "School Life" },
  { id: "sci-fi", label: "Sci-Fi" },
  { id: "seinen", label: "Seinen" },
  { id: "self-published", label: "Self-Published" },
  { id: "sexual-violence", label: "Sexual Violence" },
  { id: "shonen", label: "Shonen" },
  { id: "shota", label: "Shota" },
  { id: "shoujo", label: "Shoujo" },
  { id: "shoujo-ai", label: "Shoujo Ai" },
  { id: "shounen", label: "Shounen" },
  { id: "shounen-ai", label: "Shounen Ai" },
  { id: "showbiz", label: "Showbiz" },
  { id: "slice-of-life", label: "Slice of Life" },
  { id: "slime", label: "Slime" },
  { id: "smart-mc", label: "Smart MC" },
  { id: "smut", label: "Smut" },
  { id: "space", label: "Space" },
  { id: "sports", label: "Sports" },
  { id: "stream", label: "Stream" },
  { id: "suggestive", label: "Suggestive" },
  { id: "super-power", label: "Super Power" },
  { id: "superhero", label: "Superhero" },
  { id: "supernatural", label: "Supernatural" },
  { id: "superpowers-system", label: "Superpowers System" },
  { id: "survival", label: "Survival" },
  { id: "swords", label: "Swords" },
  { id: "system", label: "System" },
  { id: "tamer", label: "Tamer" },
  { id: "thriller", label: "Thriller" },
  { id: "time-travel", label: "Time Travel" },
  { id: "tower", label: "Tower" },
  { id: "tower-climbing", label: "Tower Climbing" },
  { id: "traditional-games", label: "Traditional Games" },
  { id: "tragedy", label: "Tragedy" },
  { id: "urban-fantasy", label: "Urban Fantasy" },
  { id: "vampires", label: "Vampires" },
  { id: "video-games", label: "Video Games" },
  { id: "villain", label: "Villain" },
  { id: "villainess", label: "Villainess" },
  { id: "violence", label: "Violence" },
  { id: "virtual-reality", label: "Virtual Reality" },
  { id: "vrmmo", label: "VRMMO" },
  { id: "weak-to-strong", label: "Weak-to-Strong" },
  { id: "web-comic", label: "Web Comic" },
  { id: "webtoon", label: "Webtoon" },
  { id: "webtoons", label: "Webtoons" },
  { id: "wuxia", label: "Wuxia" },
  { id: "xianxia", label: "Xianxia" },
  { id: "xuanhuan", label: "Xuanhuan" },
  { id: "yakuzas", label: "Yakuzas" },
  { id: "yaoi", label: "Yaoi" },
  { id: "yuri", label: "Yuri" },
  { id: "zombies", label: "Zombies" },
];

export class MangaHubSearchForm extends AdvancedSearchForm {
  override readonly requiresExplicitSubmission = true;

  private genre: string[];
  private excludedGenre: string[];
  private requireAllGenres: boolean;

  constructor(initialMeta?: MangaHubSearchMeta) {
    super();
    this.genre = initialMeta?.genre ?? [];
    this.excludedGenre = initialMeta?.excludedGenre ?? [];
    this.requireAllGenres = initialMeta?.requireAllGenres ?? false;
  }

  async updateGenre(value: string[]): Promise<void> {
    this.genre = value;
    this.reloadForm();
  }

  async updateExcludedGenre(value: string[]): Promise<void> {
    this.excludedGenre = value;
    this.reloadForm();
  }

  async updateRequireAllGenres(value: boolean): Promise<void> {
    this.requireAllGenres = value;
    this.reloadForm();
  }

  getSearchQueryMetadata(): MangaHubSearchMeta {
    return {
      genre: this.genre,
      excludedGenre: this.excludedGenre,
      requireAllGenres: this.requireAllGenres,
    } satisfies MangaHubSearchMeta;
  }

  override getSections() {
    return [
      Section(
        {
          id: "genre",
          header: "Genre",
          footer:
            'MangaHub\'s own search only matches any of the picked genres server-side; excluded genres and "require all" are applied to the results afterward on our end. If a genre is picked in both lists, excluded wins.',
        },
        [
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
          ToggleRow("require_all_genres", {
            title: "Require all selected genres",
            subtitle: "Off matches any of them; on requires all — can be slow to find matches.",
            value: this.requireAllGenres,
            onValueChange: Application.Selector<
              MangaHubSearchForm,
              (value: boolean) => Promise<void>
            >(this, "updateRequireAllGenres"),
          }),
          SelectRow("excluded_genre_select", {
            title: "Excluded genre",
            value: this.excludedGenre,
            items: GENRE_OPTIONS.map((opt) => ({ id: opt.id, title: opt.label })),
            layout: "list",
            minItemCount: 0,
            maxItemCount: GENRE_OPTIONS.length,
            onValueChange: Application.Selector<
              MangaHubSearchForm,
              (value: string[]) => Promise<void>
            >(this, "updateExcludedGenre"),
          }),
        ],
      ),
    ];
  }
}
