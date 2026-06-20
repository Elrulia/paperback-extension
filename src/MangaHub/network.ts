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
      // Use the challenged domain so saveCloudflareBypassCookies stores
      // cf_clearance for the right domain (mangahub.io vs api.mghcdn.com).
      const origin = request.url.match(/^https?:\/\/[^/]+/)?.[0] ?? MANGAHUB_DOMAIN;
      throw new CloudflareError(
        {
          url: `${origin}/`,
          method: "GET",
          headers: { "user-agent": SAFARI_UA },
        },
        "Open the page to bypass Cloudflare",
      );
    }

    return data;
  }
}
