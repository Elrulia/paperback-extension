import {
  AdvancedSearchForm,
  InputRow,
  type JSONObject,
  Section,
  SelectRow,
} from "@paperback/types";

export interface MangaHubSearchMeta extends JSONObject {
  orderBy: string[];
  genre: string;
}

export const ORDER_BY_OPTIONS: { id: string; label: string }[] = [
  { id: "POPULAR", label: "Popular" },
  { id: "LATEST", label: "Updates" },
  { id: "ALPHABET", label: "A-Z" },
  { id: "NEW", label: "New" },
  { id: "COMPLETED", label: "Completed" },
];

export class MangaHubSearchForm extends AdvancedSearchForm {
  override readonly requiresExplicitSubmission = true;

  private orderBy: string[];
  private genre: string;

  constructor(initialMeta?: MangaHubSearchMeta) {
    super();
    this.orderBy = initialMeta?.orderBy ?? [];
    this.genre = initialMeta?.genre ?? "";
  }

  async updateOrderBy(value: string[]): Promise<void> {
    this.orderBy = value;
    this.reloadForm();
  }

  async updateGenre(value: string): Promise<void> {
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
          options: ORDER_BY_OPTIONS.map((opt) => ({
            id: opt.id,
            title: opt.label,
          })),
          minItemCount: 0,
          maxItemCount: 1,
          onValueChange: Application.Selector<
            MangaHubSearchForm,
            (value: string[]) => Promise<void>
          >(this, "updateOrderBy"),
        }),
      ]),
      Section(
        {
          id: "genre",
          footer:
            "Filter by a single genre slug (e.g. action, romance). Leave empty for all genres.",
        },
        [
          InputRow("genre_input", {
            title: "Genre",
            value: this.genre,
            onValueChange: Application.Selector<
              MangaHubSearchForm,
              (value: string) => Promise<void>
            >(this, "updateGenre"),
          }),
        ],
      ),
    ];
  }
}
