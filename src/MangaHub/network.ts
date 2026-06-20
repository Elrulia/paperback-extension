/* SPDX-License-Identifier: GPL-3.0-or-later */

import { CloudflareError, PaperbackInterceptor, type Request, type Response } from "@paperback/types";

export const MANGAHUB_DOMAIN = "https://mangahub.io";
export const API_DOMAIN = "https://api.mghcdn.com";


export class MainInterceptor extends PaperbackInterceptor {
  override async interceptRequest(request: Request): Promise<Request> {
    request.headers = {
      ...request.headers,
      "user-agent": await Application.getDefaultUserAgent(),
      referer: `${MANGAHUB_DOMAIN}/`,
    };

    request.cookies = {
      ...request.cookies,
    };

    return request;
  }

  override async interceptResponse(
    _request: Request,
    response: Response,
    data: ArrayBuffer,
  ): Promise<ArrayBuffer> {
    const cfMitigated = response.headers?.["cf-mitigated"];
    if (cfMitigated === "challenge") {
      throw new CloudflareError(
        {
          url: MANGAHUB_DOMAIN,
          method: "GET",
          headers: {
            referer: `${MANGAHUB_DOMAIN}/`,
            origin: `${MANGAHUB_DOMAIN}/`,
            "user-agent": await Application.getDefaultUserAgent(),
          },
        },
        "Cloudflare detected, bypass it to continue!",
      );
    }

    // MangaHub sets mhub_access via Set-Cookie on every mangahub.io response.
    // Extract it here so getMhubToken() can use it as the x-mhub-access header.
    const setCookie =
      (response.headers?.["set-cookie"] as string | undefined) ??
      (response.headers?.["Set-Cookie"] as string | undefined) ??
      "";
    if (setCookie) {
      console.log("[MH] set-cookie:", setCookie.slice(0, 80));
    }
    const tokenMatch = setCookie.match(/mhub_access=([a-f0-9-]+)/i);
    if (tokenMatch?.[1]) {
      Application.setState(tokenMatch[1], "mhubToken");
      console.log("[MH] token from set-cookie:", tokenMatch[1].slice(0, 8) + "...");
    }

    return data;
  }
}
