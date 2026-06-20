/* SPDX-License-Identifier: GPL-3.0-or-later */

import { CloudflareError, PaperbackInterceptor, type Request, type Response } from "@paperback/types";

// Use a browser-like UA so Cloudflare's bot-score doesn't challenge the request
// before it even reaches the origin server.
const SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

export class MainInterceptor extends PaperbackInterceptor {
  override async interceptRequest(request: Request): Promise<Request> {
    return {
      ...request,
      headers: {
        "user-agent": SAFARI_UA,
        referer: "https://mangahub.io/",
        "accept-language": "en-US,en;q=0.9",
        ...request.headers,
      },
    };
  }

  override async interceptResponse(
    request: Request,
    response: Response,
    data: ArrayBuffer,
  ): Promise<ArrayBuffer> {
    if (response.headers?.["cf-mitigated"] === "challenge") {
      // Extract the scheme+host so we redirect to the right domain's challenge
      // (mangahub.io for HTML pages, api.mghcdn.com for API requests).
      const origin = request.url.match(/^https?:\/\/[^/]+/)?.[0] ?? "https://mangahub.io";
      throw new CloudflareError({
        url: `${origin}/`,
        method: "GET",
        headers: { "user-agent": SAFARI_UA },
      });
    }
    return data;
  }
}
