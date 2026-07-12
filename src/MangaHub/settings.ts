import {
  ButtonRow,
  Form,
  InputRow,
  LabelRow,
  Section,
  SelectRow,
  ToggleRow,
} from "@paperback/types";

import { GENRE_OPTIONS } from "./search";

const BASE_URL_KEY_PREFIX = "mangahub.baseUrlOverride.";
const GENERIC_TITLE_KEY_PREFIX = "mangahub.useGenericTitle.";
const EXCLUDED_GENRES_KEY_PREFIX = "mangahub.excludedGenres.";
const INCLUDED_GENRES_KEY_PREFIX = "mangahub.includedGenres.";
const REQUIRE_ALL_INCLUDED_KEY_PREFIX = "mangahub.requireAllIncludedGenres.";
const FILTERED_ORDER_KEY_PREFIX = "mangahub.filteredSectionOrder.";

// Labels match the Discover section titles exactly (e.g. "Latest Updates",
// not "Updates") since they're also used to build "<order> (Filtered)".
// POPULAR sources from the same latestPopular() feed as Popular Updates,
// not the smaller Popular section, so it's labeled to match that.
export const FILTERED_SECTION_ORDER_OPTIONS: { id: string; label: string }[] = [
  { id: "LATEST", label: "Latest Updates" },
  { id: "POPULAR", label: "Popular Updates" },
  { id: "ALPHABET", label: "A-Z" },
  { id: "NEW", label: "New Manga" },
  { id: "COMPLETED", label: "Completed" },
];
const DEFAULT_FILTERED_ORDER = "LATEST";

function baseUrlKey(sourceName: string): string {
  return `${BASE_URL_KEY_PREFIX}${sourceName}`;
}

function genericTitleKey(sourceName: string): string {
  return `${GENERIC_TITLE_KEY_PREFIX}${sourceName}`;
}

function excludedGenresKey(sourceName: string): string {
  return `${EXCLUDED_GENRES_KEY_PREFIX}${sourceName}`;
}

function includedGenresKey(sourceName: string): string {
  return `${INCLUDED_GENRES_KEY_PREFIX}${sourceName}`;
}

function requireAllIncludedKey(sourceName: string): string {
  return `${REQUIRE_ALL_INCLUDED_KEY_PREFIX}${sourceName}`;
}

function filteredOrderKey(sourceName: string): string {
  return `${FILTERED_ORDER_KEY_PREFIX}${sourceName}`;
}

export function getBaseUrlOverride(sourceName: string): string | undefined {
  const value = Application.getState(baseUrlKey(sourceName));
  if (typeof value === "string") {
    const trimmed = value.trim().replace(/\/+$/, "");
    if (trimmed.length > 0) return trimmed;
  }
  return undefined;
}

function setBaseUrlOverride(sourceName: string, value: string): void {
  Application.setState(value.trim().replace(/\/+$/, ""), baseUrlKey(sourceName));
}

export function getUseGenericTitle(sourceName: string): boolean {
  const value = Application.getState(genericTitleKey(sourceName));
  return typeof value === "boolean" ? value : false;
}

function setUseGenericTitle(sourceName: string, value: boolean): void {
  Application.setState(value, genericTitleKey(sourceName));
}

export function getExcludedGenres(sourceName: string): string[] {
  const value = Application.getState(excludedGenresKey(sourceName));
  return Array.isArray(value) && value.every((v) => typeof v === "string") ? value : [];
}

function setExcludedGenres(sourceName: string, value: string[]): void {
  Application.setState(value, excludedGenresKey(sourceName));
}

export function getIncludedGenres(sourceName: string): string[] {
  const value = Application.getState(includedGenresKey(sourceName));
  return Array.isArray(value) && value.every((v) => typeof v === "string") ? value : [];
}

function setIncludedGenres(sourceName: string, value: string[]): void {
  Application.setState(value, includedGenresKey(sourceName));
}

export function getRequireAllIncludedGenres(sourceName: string): boolean {
  const value = Application.getState(requireAllIncludedKey(sourceName));
  return typeof value === "boolean" ? value : false;
}

function setRequireAllIncludedGenres(sourceName: string, value: boolean): void {
  Application.setState(value, requireAllIncludedKey(sourceName));
}

export function getFilteredSectionOrder(sourceName: string): string {
  const value = Application.getState(filteredOrderKey(sourceName));
  return typeof value === "string" && value.length > 0 ? value : DEFAULT_FILTERED_ORDER;
}

function setFilteredSectionOrder(sourceName: string, value: string): void {
  Application.setState(value, filteredOrderKey(sourceName));
}

export class MangaHubSettingsForm extends Form {
  private override: string;
  private genericTitle: boolean;
  private excludedGenres: string[];
  private includedGenres: string[];
  private requireAllIncluded: boolean;
  private filteredOrder: string;

  constructor(
    private readonly sourceName: string,
    private readonly defaultBaseUrl: string,
  ) {
    super();
    this.override = getBaseUrlOverride(sourceName) ?? "";
    this.genericTitle = getUseGenericTitle(sourceName);
    this.excludedGenres = getExcludedGenres(sourceName);
    this.includedGenres = getIncludedGenres(sourceName);
    this.requireAllIncluded = getRequireAllIncludedGenres(sourceName);
    this.filteredOrder = getFilteredSectionOrder(sourceName);
  }

  async updateOverride(value: string): Promise<void> {
    this.override = value;
    setBaseUrlOverride(this.sourceName, value);
    this.reloadForm();
  }

  async resetOverride(): Promise<void> {
    this.override = "";
    setBaseUrlOverride(this.sourceName, "");
    this.reloadForm();
  }

  async updateGenericTitle(value: boolean): Promise<void> {
    this.genericTitle = value;
    setUseGenericTitle(this.sourceName, value);
    this.reloadForm();
  }

  async updateExcludedGenres(value: string[]): Promise<void> {
    this.excludedGenres = value;
    setExcludedGenres(this.sourceName, value);
    Application.invalidateDiscoverSections();
    this.reloadForm();
  }

  async updateIncludedGenres(value: string[]): Promise<void> {
    this.includedGenres = value;
    setIncludedGenres(this.sourceName, value);
    Application.invalidateDiscoverSections();
    this.reloadForm();
  }

  async updateRequireAllIncluded(value: boolean): Promise<void> {
    this.requireAllIncluded = value;
    setRequireAllIncludedGenres(this.sourceName, value);
    Application.invalidateDiscoverSections();
    this.reloadForm();
  }

  async updateFilteredOrder(value: string[]): Promise<void> {
    this.filteredOrder = value[0] ?? DEFAULT_FILTERED_ORDER;
    setFilteredSectionOrder(this.sourceName, this.filteredOrder);
    Application.invalidateDiscoverSections();
    this.reloadForm();
  }

  override getSections() {
    const effective =
      this.override.trim().length > 0
        ? this.override.trim().replace(/\/+$/, "")
        : this.defaultBaseUrl;

    return [
      Section(
        {
          id: "base_url",
          footer: `Override the site address if this source has moved to a new domain. Leave empty to use the default. Include the scheme, e.g. ${this.defaultBaseUrl}`,
        },
        [
          InputRow("base_url_input", {
            title: "Base URL",
            value: this.override,
            onValueChange: Application.Selector<
              MangaHubSettingsForm,
              (value: string) => Promise<void>
            >(this, "updateOverride"),
          }),
          LabelRow("base_url_current", {
            title: "Currently using",
            value: effective,
          }),
          ButtonRow("base_url_reset", {
            title: "Reset to default",
            onSelect: Application.Selector<MangaHubSettingsForm, () => Promise<void>>(
              this,
              "resetOverride",
            ),
          }),
        ],
      ),
      Section(
        {
          id: "chapters",
          footer: 'Use a generic chapter title ("Chapter X") instead of the provided one.',
        },
        [
          ToggleRow("use_generic_title", {
            title: "Use generic title",
            value: this.genericTitle,
            onValueChange: Application.Selector<
              MangaHubSettingsForm,
              (value: boolean) => Promise<void>
            >(this, "updateGenericTitle"),
          }),
        ],
      ),
      Section(
        {
          id: "discover_filtered",
          header: "Discover (Filtered)",
          footer:
            "Manga tagged with an excluded genre are always left out. If a genre is picked in both lists, excluded wins. Included genres narrow the section down to only matching manga; leave empty to show everything (minus excluded).",
        },
        [
          SelectRow("excluded_genres_select", {
            title: "Excluded genres",
            value: this.excludedGenres,
            items: GENRE_OPTIONS.map((opt) => ({ id: opt.id, title: opt.label })),
            layout: "list",
            minItemCount: 0,
            maxItemCount: GENRE_OPTIONS.length,
            onValueChange: Application.Selector<
              MangaHubSettingsForm,
              (value: string[]) => Promise<void>
            >(this, "updateExcludedGenres"),
          }),
          SelectRow("included_genres_select", {
            title: "Included genres",
            value: this.includedGenres,
            items: GENRE_OPTIONS.map((opt) => ({ id: opt.id, title: opt.label })),
            layout: "list",
            minItemCount: 0,
            maxItemCount: GENRE_OPTIONS.length,
            onValueChange: Application.Selector<
              MangaHubSettingsForm,
              (value: string[]) => Promise<void>
            >(this, "updateIncludedGenres"),
          }),
          ToggleRow("require_all_included", {
            title: "Require all included genres",
            subtitle:
              "Off matches any of them (like MangaHub's own search); on requires every one.",
            value: this.requireAllIncluded,
            onValueChange: Application.Selector<
              MangaHubSettingsForm,
              (value: boolean) => Promise<void>
            >(this, "updateRequireAllIncluded"),
          }),
          SelectRow("filtered_order_select", {
            title: "Order",
            value: [this.filteredOrder],
            items: FILTERED_SECTION_ORDER_OPTIONS.map((opt) => ({ id: opt.id, title: opt.label })),
            layout: "list",
            minItemCount: 1,
            maxItemCount: 1,
            onValueChange: Application.Selector<
              MangaHubSettingsForm,
              (value: string[]) => Promise<void>
            >(this, "updateFilteredOrder"),
          }),
        ],
      ),
    ];
  }
}
