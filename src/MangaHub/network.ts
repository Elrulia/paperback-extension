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

    // iOS strips Set-Cookie from response.headers, but Paperback populates
    // response.cookies from it before passing to interceptors.
    const mhubCookie = response.cookies.find((c) => c.name === "mhub_access");
    if (mhubCookie?.value) {
      Application.setState(mhubCookie.value, "mhubToken");
    }

    return data;
  }
}
