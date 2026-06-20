/* SPDX-License-Identifier: GPL-3.0-or-later */

import { CloudflareError, PaperbackInterceptor, type Request, type Response } from "@paperback/types";

export const MANGAHUB_DOMAIN = "https://mangahub.io";
export const API_DOMAIN = "https://api.mghcdn.com";

// Use a browser-like UA so Cloudflare's bot-score check passes.
const SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

export class MainInterceptor extends PaperbackInterceptor {
  override async interceptRequest(request: Request): Promise<Request> {
    return {
      ...request,
      headers: {
        "user-agent": SAFARI_UA,
        referer: `${MANGAHUB_DOMAIN}/`,
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
      // Cloudflare challenged the request — open mangahub.io so the user can
      // pass the challenge and set cf_clearance for both domains.
      throw new CloudflareError(
        {
          url: `${MANGAHUB_DOMAIN}/`,
          method: "GET",
          headers: { "user-agent": SAFARI_UA },
        },
        "Open MangaHub to bypass Cloudflare",
      );
    }

    return data;
  }
}
