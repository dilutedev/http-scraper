import * as cheerio from "cheerio"
import { logger } from "./logger"
import { BaseHTTPScraper } from "./base"
import { ProductNotFoundError } from "./errors"
import { doHTTPScraperRequest } from "./request"
import type { HTTPScraperVariant } from "./types/base"
import type { SizeVariant } from "./types/hugoboss"

export class HugoBoss extends BaseHTTPScraper {
  async findItems(query: string): Promise<HTTPScraperVariant[]> {
    let productURL: string

    if (!query.startsWith("https")) {
      productURL = await this.search(query)
    } else {
      productURL = query
    }

    const html = await doHTTPScraperRequest(productURL, {
      method: "GET",
      headers: this.getRequestHeaders(),
    })
    const $ = cheerio.load(html)

    const colorURLs: string[] = []
    $("a[data-pid][data-colorid]").each((index, element) => {
      const href = $(element).attr("href")
      if (href && !colorURLs.includes(href)) {
        colorURLs.push(href)
      }
    })

    const variants: HTTPScraperVariant[] = []

    const promises = colorURLs.map((colorURL) =>
      this.getSizes(colorURL).catch((error) => {
        logger.error(error)
        return []
      })
    )

    const results = await Promise.allSettled(promises)
    results.forEach((result) => {
      if (result.status === "fulfilled") {
        variants.push(...result.value)
      }
    })

    return variants
  }

  async getItem(url: string): Promise<HTTPScraperVariant | null> {
    throw new ProductNotFoundError()
  }

  async listProducts(withLimit: boolean): Promise<string[]> {
    const siteMaps = ["/us/sitemap_0.xml", "/us/sitemap_1.xml"]
    let products: string[] = []

    const promises = siteMaps.map(async (siteMap) => {
      try {
        const xml = await doHTTPScraperRequest(
          `https://www.hugoboss.com${siteMap}`,
          {
            method: "GET",
          },
        )
        const $ = cheerio.load(xml, { xmlMode: true })

        const siteMapProducts: string[] = []
        $("loc").each((index, element) => {
          const productURL = $(element).text().trim()
          if (productURL.includes(".html")) {
            siteMapProducts.push(productURL)
          }
        })

        return siteMapProducts
      } catch (error: any) {
        logger.error({
          message: `Failed to process HugoBoss sitemap: ${
            error instanceof Error ? error.message : String(error)
          }`,
          module: "hugoboss",
          stack_trace: error instanceof Error ? error.stack : undefined,
          payload: { operation: "listProducts" },
        })
        return []
      }
    })

    const results = await Promise.allSettled(promises)
    results.forEach((result) => {
      if (result.status === "fulfilled") {
        products.push(...result.value)
      }
    })

    if (withLimit && products.length > 10) {
      products = products.slice(0, 10)
    }

    return products
  }

  key(): string {
    return "hugoboss"
  }

  async search(query: string): Promise<string> {
    const trimmedQuery = query.trim()
    if (trimmedQuery && /\d+/.test(trimmedQuery)) {
      return `https://api.hugoboss.us/us/en/${query}.html`
    }

    const searchURL = `https://www.hugoboss.com/ca/en/search?q=${encodeURIComponent(query)}`

    const html = await doHTTPScraperRequest(searchURL, {
      method: "GET",
      headers: {
        ...this.getRequestHeaders(),
        "x-requested-with": "XMLHttpRequest",
      },
    })
    const $ = cheerio.load(html)

    const href = $("#search-result-items a[data-url]").attr("data-url")

    if (!href) {
      throw new Error(`could not find a product matching query ${query}`)
    }

    return `https://www.hugoboss.com${href}`
  }

  private async getSizes(colorURL: string): Promise<HTTPScraperVariant[]> {
    const html = await doHTTPScraperRequest(
      `https://www.hugoboss.com${colorURL}`,
      {
        method: "GET",
        headers: this.getRequestHeaders(),
      },
    )
    const $ = cheerio.load(html)

    const sizes: SizeVariant[] = []

    $("button[data-size]").each((index, element) => {
      const id = $(element).attr("data-pid")
      let title = $(element).attr("data-size")

      if (id) {
        if (!title || title === "") {
          title = "One Size"
        }

        const exists = sizes.some(
          (size) => size.id === id && size.title === title,
        )
        if (!exists) {
          sizes.push({ title, id })
        }
      }
    })

    const variants: HTTPScraperVariant[] = []

    const promises = sizes.map((size) =>
      this.getVariant(size.id, size.title).catch((error) => {
        logger.error(error)
        return null
      })
    )

    const results = await Promise.allSettled(promises)
    results.forEach((result) => {
      if (result.status === "fulfilled" && result.value) {
        variants.push(result.value)
      }
    })

    return variants
  }

  private async getVariant(
    pid: string,
    size: string,
  ): Promise<HTTPScraperVariant> {
    if (size === "") {
      size = "One Size"
    }

    const html = await doHTTPScraperRequest(
      `https://www.hugoboss.com/on/demandware.store/Sites-CA-Site/en_CA/Product-Stage?pid=${
        encodeURIComponent(pid)
      }`,
      {
        method: "GET",
        headers: {
          ...this.getRequestHeaders(),
          "x-requested-with": "XMLHttpRequest",
        },
      },
    )
    const $ = cheerio.load(html)

    let ldJSON: any = {}
    const jsonLdScript = $('script[type="application/ld+json"]').first()
    if (jsonLdScript.length) {
      try {
        ldJSON = JSON.parse(jsonLdScript.html() || "{}")
      } catch (error: any) {
        logger.error({
          message: "Failed to parse JSON-LD",
          module: "hugoboss-scraper",
        })
      }
    }

    let originalPrice = 0
    let discountedPrice = 0

    const pricingDiv = $("div[data-pricing]").first()
    if (pricingDiv.length) {
      const standardPrice = pricingDiv.attr("data-standard-price")
      const promoPrice = pricingDiv.attr("data-promotion-price")

      if (standardPrice) {
        originalPrice = parseFloat(standardPrice)
      }
      if (promoPrice) {
        discountedPrice = parseFloat(promoPrice)
      }
    }

    if (originalPrice === 0 && ldJSON.offers?.price) {
      originalPrice = ldJSON.offers.price
    }

    if (discountedPrice === 0) {
      discountedPrice = originalPrice
    }

    const images: string[] = []
    $("picture.pdp-images__adaptive-picture.js-slide").each(
      (index, element) => {
        const source = $(element).find("source")
        const imageURL = source.attr("srcset")
        if (imageURL && !images.includes(imageURL)) {
          images.push(imageURL)
        }
      },
    )

    const variant: HTTPScraperVariant = {
      title: ldJSON.name || "",
      price: originalPrice,
      discount: originalPrice > 0
        ? ((originalPrice - discountedPrice) / originalPrice) * 100
        : 0,
      image_url: images[0] || "",
      url: ldJSON.url || "",
      description_text: {
        en: ldJSON.description || "",
      },
      altImages: images,
      color: ldJSON.color || "",
      size: size,
      style_number: ldJSON.mpn ? ldJSON.mpn.split("_")[0] : undefined,
      style_id: pid,
      brand_name: ldJSON.brand?.name,
      barcode: ldJSON.sku,
      currency: ldJSON.offers?.priceCurrency || "",
      available_inventory: 0,
    }

    return variant
  }

  async getCategories(): Promise<string[]> {
    throw new Error("Method not implemented")
  }

  async getProducts(categoryIdentifier: string): Promise<string[]> {
    throw new Error("Method not implemented")
  }

  private getRequestHeaders(): Record<string, string> {
    return {
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "accept-language": "en-US,en;q=0.9",
      "cache-control": "no-cache",
      pragma: "no-cache",
      priority: "u=0, i",
      referer: "https://www.hugoboss.com/ca/en/search?q=627918147827",
      "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"macOS"',
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "same-origin",
      "sec-fetch-user": "?1",
      "upgrade-insecure-requests": "1",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    }
  }
}
