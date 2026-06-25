import { CloudflareError, PaperbackInterceptor } from "@paperback/types";
import type { Request as PaperbackRequest, Response as PaperbackResponse } from "@paperback/types";

export const GRAPHQL_URL = "https://api.mghcdn.com/graphql";

export class MangaHubInterceptor extends PaperbackInterceptor {
  constructor(
    id: string,
    private readonly getBaseUrl: () => string,
    private readonly getAccessKey: () => string,
    private readonly getUserAgent: () => string,
  ) {
    super(id);
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

    if (request.url.startsWith(GRAPHQL_URL)) {
      headers["content-type"] = "application/json";
      headers["accept"] = "application/json";
      const key = this.getAccessKey();
      if (key) headers["x-mhub-access"] = key;
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
