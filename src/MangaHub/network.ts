/* SPDX-License-Identifier: GPL-3.0-or-later */

import { CloudflareError, PaperbackInterceptor, type Request, type Response } from "@paperback/types";

export const MANGAHUB_DOMAIN = "https://mangahub.io";
export const API_DOMAIN = "https://api.mghcdn.com";
export const GRAPHQL_URL = `${API_DOMAIN}/graphql`;

export class MainInterceptor extends PaperbackInterceptor {
  constructor(
    id: string,
    private readonly getAccessKey: () => string,
    private readonly getUserAgent: () => string,
  ) {
    super(id);
  }

  override async interceptRequest(request: Request): Promise<Request> {
    const ua = this.getUserAgent() || (await Application.getDefaultUserAgent());
    const headers: Record<string, string> = {
      ...request.headers,
      "user-agent": ua,
      referer: `${MANGAHUB_DOMAIN}/`,
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

    request.headers = headers;
    return request;
  }

  override async interceptResponse(
    request: Request,
    response: Response,
    data: ArrayBuffer,
  ): Promise<ArrayBuffer> {
    if (response.headers?.["cf-mitigated"] === "challenge") {
      throw new CloudflareError({
        url: request.url,
        method: request.method ?? "GET",
        headers: { "user-agent": await Application.getDefaultUserAgent() },
      });
    }
    return data;
  }
}
