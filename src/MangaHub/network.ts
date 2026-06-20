/* SPDX-License-Identifier: GPL-3.0-or-later */

import { CloudflareError, PaperbackInterceptor, type Request, type Response } from "@paperback/types";

export const MANGAHUB_DOMAIN = "https://mangahub.io";
export const API_DOMAIN = "https://api.mghcdn.com";

// Cached on first request so we only await the async UA API once per session.
let cachedUA: string | undefined;

export class MainInterceptor extends PaperbackInterceptor {
  override async interceptRequest(request: Request): Promise<Request> {
    if (!cachedUA) {
      cachedUA = await Application.getDefaultUserAgent();
    }
    return {
      ...request,
      headers: {
        "user-agent": cachedUA,
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
      throw new CloudflareError(
        { url: `${MANGAHUB_DOMAIN}/`, method: "GET" },
        "Open MangaHub to verify and continue",
      );
    }

    // MangaHub assigns a per-session token via Set-Cookie on every mangahub.io
    // response. The SPA reads "mhub_access" and sends it as x-mhub-access on API
    // calls. Cache the value so we use the real token instead of the null GUID.
    // Handle both "set-cookie" (Paperback-normalised) and "Set-Cookie" (raw iOS).
    const setCookie =
      (response.headers?.["set-cookie"] as string | undefined) ??
      (response.headers?.["Set-Cookie"] as string | undefined) ??
      "";
    const tokenMatch = setCookie.match(/mhub_access=([a-f0-9]+)/i);
    if (tokenMatch?.[1]) {
      Application.setState(tokenMatch[1], "mhubToken");
    }

    return data;
  }
}
