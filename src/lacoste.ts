import { load } from "cheerio"
import pMap, { pMapSkip } from "p-map"
import { logger } from "./logger"
import { BaseHTTPScraper } from "./base"
import { ProductNotFoundError } from "./errors"
import { doHTTPScraperRequest } from "./request"
import type { HTTPScraperVariant } from "./types/base"
import type {
  LacosteProductVariations,
  LacosteSearchResponse,
  LacosteVariantData,
  VariantParam,
} from "./types/lacoste"

export class Lacoste extends BaseHTTPScraper {
  async findItems(query: string): Promise<HTTPScraperVariant[]> {
    if (!query.startsWith("http")) {
      const productURL = await this.search(query)
      query = productURL
    }

    const domain = this.getDomainFromURL(query)
    const productID = this.extractProductIDFromURL(query)

    if (!productID) {
      throw new ProductNotFoundError()
    }

    const variantParams = await this.listVariants(productID, domain)

    if (variantParams.length === 0) {
      return []
    }

    const mapper = async (variant: VariantParam) => {
      try {
        return await this.getVariant(variant, domain)
      } catch (err: any) {
        logger.error(err, "http-scraper", {
          scraperKey: this.key(),
          variant,
        })
        return pMapSkip
      }
    }

    const variants = await pMap(variantParams, mapper, { concurrency: 10 })

    if (variants.length > 0) {
      const description = variants[0].description_text.en
      for (const variant of variants) {
        variant.description_text.en = description
      }
    }

    return variants
  }

  key(): string {
    return "lacoste"
  }

  async search(query: string): Promise<string> {
    const searchQueries = [
      this.buildSearchQuery(
        query,
        "products_us_en",
        "lacoste-us-sales",
        "lacoste-us",
      ),
      this.buildSearchQuery(
        query,
        "products_ca_en",
        "lacoste-ca-sales",
        "lacoste-ca",
      ),
    ]

    for (const searchQuery of searchQueries) {
      try {
        const responseText = await doHTTPScraperRequest(
          "https://cu0iyshi42-1.algolianet.com/1/indexes/*/queries?x-algolia-agent=Algolia%20for%20vanilla%20JavaScript%20(lite)%203.30.0%3BJS%20Helper%202.19.0&x-algolia-application-id=CU0IYSHI42&x-algolia-api-key=7e20c005d05fe8f113d8b7e079bf34a1",
          {
            method: "POST",
            body: searchQuery,
            headers: this.getSearchHeaders(),
          },
        )

        const searchResponse: LacosteSearchResponse = JSON.parse(responseText)

        if (
          searchResponse.results.length > 0
          && searchResponse.results[0].hits.length > 0
        ) {
          return searchResponse.results[0].hits[0].urlMaster
        }
      } catch (err: any) {
        logger.error(err, "http-scraper", {
          scraperKey: this.key(),
          operation: "search",
          query,
        })
      }
    }

    throw new ProductNotFoundError()
  }

  async getCategories(): Promise<string[]> {
    return ["https://www.lacoste.com/us/sitemap_0-product.xml"]
  }

  async getProducts(categoryUrl: string): Promise<string[]> {
    const body = await doHTTPScraperRequest(categoryUrl, {})
    const $ = load(body)

    const products = new Set<string>()

    $("loc").each((_, el) => {
      const productURL = $(el).text().trim()
      if (productURL.includes(".html")) {
        products.add(productURL)
      }
    })

    return Array.from(products)
  }

  private getDomainFromURL(url: string): string {
    if (url.includes("/us/")) {
      return "Sites-FlagShip-Site/en_US"
    }
    if (url.includes("/gb/")) {
      return "Sites-GB-Site/en"
    }
    return "Sites-FlagShipCA-Site/en_CA"
  }

  private extractProductIDFromURL(url: string): string {
    const parts = url.split("/")
    for (const part of parts) {
      if (part.includes(".html")) {
        return part.split(".")[0]
      }
    }
    return ""
  }

  private async listVariants(
    productID: string,
    domain: string,
  ): Promise<VariantParam[]> {
    const url = new URL(
      `https://www.lacoste.com/on/demandware.store/${domain}/Product-Api`,
    )
    url.searchParams.set("format", "json")
    url.searchParams.set("full", "true")
    url.searchParams.set("type", "variations")
    url.searchParams.set("productIds", productID)

    const responseText = await doHTTPScraperRequest(url.toString(), {
      method: "GET",
      headers: this.getAPIHeaders(),
    })

    const response: LacosteProductVariations = JSON.parse(responseText)

    if (response.data.length === 0) {
      throw new Error(`Cannot get variations for product id ${productID}`)
    }

    const product = response.data[0]
    const colors = product.variations.color.list
    const sizes = product.variations.size.list

    const variantParams: VariantParam[] = []
    const effectiveColors = colors.length > 0 ? colors : [{ id: "" }]

    for (const color of effectiveColors) {
      if (sizes.length > 0) {
        for (const size of sizes) {
          variantParams.push({
            pid: productID,
            color: color.id,
            size: size.id,
          })
        }
      } else {
        variantParams.push({
          pid: productID,
          color: color.id,
        })
      }
    }

    return variantParams
  }

  private async getVariant(
    param: VariantParam,
    domain: string,
  ): Promise<HTTPScraperVariant> {
    const url = new URL(
      `https://www.lacoste.com/on/demandware.store/${domain}/Product-PartialsData`,
    )
    url.searchParams.set("pid", param.pid)
    url.searchParams.set("color", param.color)
    if (param.size) {
      url.searchParams.set("size", param.size)
    }
    url.searchParams.set("format", "json")
    url.searchParams.set("full", "true")

    const responseText = await doHTTPScraperRequest(url.toString(), {
      method: "GET",
      headers: this.getAPIHeaders(),
    })

    const response: LacosteVariantData = JSON.parse(responseText)
    const product = response.product

    let description = ""
    for (const desc of product.description.descriptions) {
      if (desc.list) {
        for (const item of desc.list) {
          description += `${item}\n `
        }
      }

      if (desc.texts && desc.title !== "Model's measurement") {
        for (const item of desc.texts) {
          description += `${item}\n `
        }
      }
    }

    if (!description) {
      description = product.description.description
    }

    const images: string[] = []
    for (const img of product.gallery.images) {
      images.push(`https:${img.desktopUrl}`)
    }

    let discount = 0
    if (product.pricing.discount) {
      discount = product.pricing.discount.roundValue
    }

    let price = 0
    if (product.pricing.standardPrice) {
      price = product.pricing.standardPrice.value
    } else if (product.pricing.salesPrice) {
      price = product.pricing.salesPrice.value
    }

    const size = product.size.label || "One Size"

    return {
      barcode: product.id,
      title: product.name,
      url: product.color.url,
      discount,
      price,
      color: product.color.label,
      size,
      image_url: `https:${product.color.flatUrl}`,
      altImages: images,
      style_number: param.pid,
      style_id: param.pid,
      description_text: { en: description },
      currency: product.pricing.currency,
      available_inventory: 0,
    }
  }

  private buildSearchQuery(
    query: string,
    indexName: string,
    priceBook1: string,
    priceBook2: string,
  ): string {
    const timestamp = Date.now()
    return JSON.stringify({
      requests: [
        {
          indexName,
          params: `query=${
            encodeURIComponent(query)
          }&hitsPerPage=32&page=0&analyticsTags=mobile&attributesToRetrieve=%5B%22pid%22%2C%22name%22%2C%22colors%22%2C%22imagesHttp%22%2C%22imagesHttps%22%2C%22price%22%2C%22badges%22%2C%22urlMaster%22%2C%22urlSwatchPattern%22%2C%22urlSwatchImg%22%2C%22priceBookId%22%2C%22isCustomizable%22%2C%22categoryLabel%22%2C%22genderLabel%22%2C%22productId%22%2C%22manufacturer%22%2C%22colorId%22%2C%22colorLabel%22%2C%22categoryName%22%5D&distinct=true&responseFields=%5B%22hits%22%2C%22facets%22%2C%22page%22%2C%22nbPages%22%2C%22query%22%2C%22nbHits%22%2C%22userData%22%5D&clickAnalytics=true&filters=(%20priceBookId%3A%20${priceBook1}%20OR%20priceBookId%3A%20${priceBook2})%20AND%20(price.onlineFrom%20%3C%3D%20${timestamp}%20AND%20price.onlineTo%20%3E%3D%20${timestamp})&facets=%5B%22categoryLabel%22%2C%22universeLabel%22%2C%22genderLabel%22%2C%22searchColorName%22%2C%22sizes%22%2C%22sleeve%22%5D&tagFilters=`,
        },
      ],
    })
  }

  private getAPIHeaders(): { [key: string]: string } {
    return {
      authority: "www.lacoste.com",
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9",
      "cache-control": "no-cache",
      pragma: "no-cache",
      referer:
        "https://www.lacoste.com/ca/en/lacoste/men/clothing/t-shirts/men-s-v-neck-pima-cotton-jersey-t-shirt/TH6710-52.html?color=132",
      "sec-ch-ua": '"Not.A/Brand";v="8", "Chromium";v="114", "Google Chrome";v="114"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"macOS"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.83 Safari/537.36",
    }
  }

  private getSearchHeaders(): { [key: string]: string } {
    return {
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      Origin: "https://www.lacoste.com",
      Pragma: "no-cache",
      Referer: "https://www.lacoste.com/",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "cross-site",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
      "sec-ch-ua": '"Google Chrome";v="119", "Chromium";v="119", "Not?A_Brand";v="24"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"macOS"',
    }
  }
}
