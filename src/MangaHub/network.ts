import { CloudflareError, PaperbackInterceptor } from "@paperback/types";
import type { Request as PaperbackRequest, Response as PaperbackResponse } from "@paperback/types";

// api.mghcdn.com started rejecting third-party requests in November 2026
// ("This app does not have permission to access the website content"); the
// GraphQL API now only answers on the site's own origin, same as the
// chapter-crypto endpoint below.
export const GRAPHQL_PATH = "/graphql";
export const CHAPTER_CRYPTO_PATH = "/api/chapter-crypto";

export const SOURCE_UNREACHABLE_MESSAGE =
  "MangaHub is unreachable right now. The site may be down or blocking requests — please try again later.";

/**
 * Application.scheduleRequest only rejects for connection-level failures
 * (DNS, timeout, refused). When Cloudflare is up but the origin is down, the
 * request still resolves normally with a 5xx status and an HTML error body
 * instead of JSON, so callers must also check the response themselves.
 */
export async function scheduleRequestSafely(
  request: PaperbackRequest,
): Promise<[PaperbackResponse, ArrayBuffer]> {
  try {
    return await Application.scheduleRequest(request);
  } catch (err) {
    if (err instanceof CloudflareError) throw err;
    throw new Error(SOURCE_UNREACHABLE_MESSAGE);
  }
}

export class MangaHubInterceptor extends PaperbackInterceptor {
  // Plain fields + constructor assignment instead of TS parameter-property
  // shorthand: Node's type-stripping test runner (unlike the paperback-cli
  // bundler) can't parse that syntax, and this file is reachable from
  // chapterCrypto.test.ts via chapterCrypto.ts's import of scheduleRequestSafely.
  private readonly getBaseUrl: () => string;
  private readonly getAccessKey: () => string;
  private readonly getUserAgent: () => string;

  constructor(
    id: string,
    getBaseUrl: () => string,
    getAccessKey: () => string,
    getUserAgent: () => string,
  ) {
    super(id);
    this.getBaseUrl = getBaseUrl;
    this.getAccessKey = getAccessKey;
    this.getUserAgent = getUserAgent;
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

    if (request.url.includes(GRAPHQL_PATH)) {
      headers["content-type"] = "application/json";
      headers["accept"] = "application/json";
      const key = this.getAccessKey();
      if (key) headers["x-mhub-access"] = key;
    } else if (request.url.includes(CHAPTER_CRYPTO_PATH)) {
      headers["accept"] = "application/json";
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
