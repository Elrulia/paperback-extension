import { ButtonRow, Form, InputRow, LabelRow, Section, ToggleRow } from "@paperback/types";

const BASE_URL_KEY_PREFIX = "mangahub.baseUrlOverride.";
const GENERIC_TITLE_KEY_PREFIX = "mangahub.useGenericTitle.";

function baseUrlKey(sourceName: string): string {
  return `${BASE_URL_KEY_PREFIX}${sourceName}`;
}

function genericTitleKey(sourceName: string): string {
  return `${GENERIC_TITLE_KEY_PREFIX}${sourceName}`;
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

export class MangaHubSettingsForm extends Form {
  private override: string;
  private genericTitle: boolean;

  constructor(
    private readonly sourceName: string,
    private readonly defaultBaseUrl: string,
  ) {
    super();
    this.override = getBaseUrlOverride(sourceName) ?? "";
    this.genericTitle = getUseGenericTitle(sourceName);
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
    ];
  }
}
