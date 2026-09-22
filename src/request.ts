import { Impit, type ImpitResponse, type RequestInit } from "impit"
import { CookieJar } from "tough-cookie"
import { AkamaiBotError, PerimeterXBotError, ProductNotFoundError } from "./errors"

export async function doHTTPScraperRequest(
  url: string,
  options: RequestInit,
): Promise<string> {
  const response = await doBaseRequest(url, options)

  if (response.status === 404) {
    throw new ProductNotFoundError()
  }

  const body = await response.text()
  const serverHeader = response.headers.get("Server")
  if (serverHeader === "AkamaiGHost" || response.status === 403 || body.includes("var chlgeId")) {
    throw new AkamaiBotError(`Bot protection detected for ${url}`)
  }

  if (response.url.includes("PX-Show")) {
    throw new PerimeterXBotError(`Bot protection detected for ${url}`)
  }

  if (response.status > 399) {
    throw new Error(`Request to ${url} failed with status ${response.status}`)
  }

  return body
}

async function doBaseRequest(
  url: string,
  request: RequestInit,
): Promise<ImpitResponse> {
  const impit = new Impit({
    browser: "chrome",
    ignoreTlsErrors: true,
    cookieJar: new CookieJar(),
  })

  const response = await impit.fetch(url, request)
  if (response.status == 103) {
    return await doBaseRequest(url, request)
  }

  return response
}
