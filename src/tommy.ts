import { load } from "cheerio"
import pMap, { pMapSkip } from "p-map"
import { logger } from "./logger"
import { BaseHTTPScraper } from "./base"
import { ProductNotFoundError } from "./errors"
import { doHTTPScraperRequest } from "./request"
import type { HTTPScraperVariant } from "./types/base"
import type { GetVariantParams, TommyProductVariant } from "./types/tommy"

export class Tommy extends BaseHTTPScraper {
  private domain = "ca.tommy.com"

  async findItems(query: string): Promise<HTTPScraperVariant[]> {
    if (!query.startsWith("https")) {
      const productURL = await this.search(query)
      query = productURL
    }

    if (query.includes("ca.tommy.com")) {
      this.domain = "ca.tommy.com"
    } else if (query.includes("usa.tommy.com")) {
      this.domain = "usa.tommy.com"
    }

    const html = await doHTTPScraperRequest(query, {
      method: "GET",
    })
    const $ = load(html)

    const colors: string[] = []
    const sizes: string[] = []
    const variantParams: GetVariantParams[] = []
    const styleNumber = this.extractSKU(html)

    $('ul[data-display-id="colorCode"]').each((i, s) => {
      $(s)
        .find("li")
        .each((i, li) => {
          const attrValue = $(li).find("input").attr("data-attr-value")
          if (attrValue) {
            colors.push(attrValue)
          }
        })
    })

    $('div[data-display-id="size"]').each((i, s) => {
      $(s)
        .find("input")
        .each((i, input) => {
          const attrValue = $(input).attr("data-attr-value")
          if (attrValue) {
            sizes.push(attrValue)
          }
        })
    })

    for (const color of colors) {
      for (const size of sizes) {
        variantParams.push({
          size,
          style: styleNumber,
          color,
        })
      }

      if (sizes.length === 0) {
        variantParams.push({
          style: styleNumber,
          color,
        })
      }
    }

    const mapper = async (variant: GetVariantParams) => {
      try {
        return await this.getVariant(variant)
      } catch (err: any) {
        logger.error(err, "http-scraper", {
          scraperKey: this.key(),
          variant,
        })
        return pMapSkip
      }
    }

    const variants = await pMap(variantParams, mapper, { concurrency: 10 })
    return variants
  }

  private async getVariant(
    params: GetVariantParams,
  ): Promise<HTTPScraperVariant> {
    const urlParams = new URLSearchParams({
      pid: params.style,
      quantity: "1",
      [`dwvar_${params.style}_colorCode`]: params.color,
    })

    if (params.size) {
      urlParams.set(`dwvar_${params.style}_size`, params.size)
    }

    const responseText = await doHTTPScraperRequest(
      `${this.getDWURL()}${urlParams.toString()}`,
      {
        method: "GET",
      },
    )

    const { product }: TommyProductVariant = JSON.parse(responseText)

    let colorName = ""
    let sizeName = "One Size"

    for (const v of product.variationAttributes) {
      switch (v.id) {
        case "colorCode":
          colorName = v.displayValue
          break

        case "size":
          sizeName = v.displayValue
          break
      }
    }

    const images: string[] = []
    for (const image of product.images.large) {
      images.push(`${image.url}?wid=576&hei=759`)
    }

    const { price } = product
    let discount = 0.0
    if (price.sales && price.list) {
      discount = ((price.list.value - price.sales.value) / price.list.value) * 100
    }

    if (price.list == null) {
      price.list = price.sales
    }

    if (price.list == null) {
      price.list = {
        value: 0,
        currency: "CAD",
        decimalPrice: "",
        formatted: "",
      }
    }

    return {
      title: product.productName,
      url: `https://${this.domain}${product.selectedProductUrl}`,
      style_number: params.style,
      barcode: product.id,
      price: price.list.value,
      size: sizeName,
      color: colorName,
      altImages: images,
      image_url: images[0],
      currency: price.list.currency,
      style_id: params.style,
      discount,
      description_text: { en: product.longDescription },
      available_inventory: 0,
    }
  }

  key(): string {
    return "tommy"
  }

  async search(query: string): Promise<string> {
    const searchURL =
      `https://ca.tommy.com/on/demandware.store/Sites-PVHTHCA-Site/en_CA/SearchServices-GetSuggestions?q=${
        encodeURIComponent(query)
      }`

    const html = await doHTTPScraperRequest(searchURL, {
      method: "GET",
    })

    if (html.includes("Sorry, we couldn't find what you are looking for.")) {
      throw new ProductNotFoundError()
    }

    const $ = load(html)
    const href = $('a[class="feature-product"]').attr("href")

    if (!href) {
      throw new ProductNotFoundError()
    }

    return `https://ca.tommy.com${href}`
  }

  private extractSKU(content: string): string {
    const match = content.match(/"sku":".*","aggregateRating"/)
    if (!match) {
      return ""
    }

    const parts = match[0].split(",")
    if (parts.length === 0) {
      return ""
    }

    const firstPart = parts[0]
    const subParts = firstPart.split(":")
    if (subParts.length === 0) {
      return ""
    }

    let sku = subParts[subParts.length - 1]
    sku = sku.replace(/"/g, "")
    return sku
  }

  private getDWURL(): string {
    if (this.domain === "ca.tommy.com") {
      return "https://ca.tommy.com/on/demandware.store/Sites-PVHTHCA-Site/en_CA/Product-Variation?"
    }
    return "https://usa.tommy.com/on/demandware.store/Sites-PVHTHUS-Site/en_US/Product-Variation?"
  }

  async getCategories(): Promise<string[]> {
    return ["https://ca.tommy.com/en/sitemap-products_sitemap_0.xml"]
  }

  async getProducts(categoryCgid: string): Promise<string[]> {
    let hasNext = true
    let consecutiveErrorCount = 0
    const size = 16
    let start = 0
    const products = new Set<string>()

    if (categoryCgid.endsWith("xml")) {
      const body = await doHTTPScraperRequest(categoryCgid, {})
      const $ = load(body)

      $("loc").each((_, el) => {
        products.add($(el).text().trim())
      })

      return Array.from(products)
    }

    do {
      try {
        const body = await doHTTPScraperRequest(
          `https://ca.tommy.com/on/demandware.store/Sites-PVHTHCA-Site/en_CA/Search-UpdateGrid?cgid=${categoryCgid}&start=${start}&sz=${size}&srule=new-arrival`,
          {
            timeout: 3 * 60 * 1_000,
          },
        )
        const $ = load(body)
        const productsLength = $("a.ds-product-name").length
        $("a.ds-product-name").each((_, el) => {
          let href = $(el).attr("href")?.trim()
          if (href?.startsWith("/")) {
            href = `https://ca.tommy.com${href}`
          }

          if (href) {
            products.add(href)
          }
        })

        start += size
        hasNext = productsLength > 0
          && ($('[name="urlshowmore"]').attr("value") || "") != ""
        consecutiveErrorCount = 0
      } catch (err: any) {
        logger.error(err, "http-scraper", categoryCgid)
        consecutiveErrorCount++
      }

      if (consecutiveErrorCount > 2) {
        break
      }
    } while (hasNext)

    return Array.from(products)
  }
}
