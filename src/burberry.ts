import { load } from "cheerio"
import pMap from "p-map"
import { logger } from "./logger"
import { BaseHTTPScraper } from "./base"
import { ProductNotFoundError } from "./errors"
import { doHTTPScraperRequest } from "./request"
import type { HTTPScraperVariant } from "./types/base"

export class Burberry extends BaseHTTPScraper {
  async findItems(query: string): Promise<HTTPScraperVariant[]> {
    if (!query.startsWith("https")) {
      query = await this.search(query)
    }

    return await this.fetchVariantsFromURL(
      query.replaceAll("https://ca.burberry.com", ""),
      true,
    )
  }

  key(): string {
    return "burberry"
  }

  async search(query: string): Promise<string> {
    const parsedUrl = new URL("https://ca.burberry.com/web-api/pages/")

    parsedUrl.searchParams.set("query", query)
    parsedUrl.searchParams.set("pagePath", "/search")
    parsedUrl.searchParams.set("language", "en")
    parsedUrl.searchParams.set("country", "CA")

    const body = await doHTTPScraperRequest(parsedUrl.toString(), {})
    const { data } = JSON.parse(body)
    const productUrl = this.extractProducts(data.components.products).at(0)
    if (!productUrl) {
      throw new ProductNotFoundError(
        `Query ${query} did not match any burberry products`,
      )
    }

    return productUrl
  }

  async getCategories(): Promise<string[]> {
    const body = await doHTTPScraperRequest("https://ca.burberry.com/", {})
    const $ = load(body)
    const categoryUrls = new Set<string>()

    $('ul[data-test="main-nav"] li').each((_, li) => {
      $(li)
        .find('ul[style="flex-direction:column"] li')
        .each((_, li2) => {
          const href = $(li2).find('a[data-test="l2-nav-link"]').attr("href")
          if (!href) return

          categoryUrls.add(href)
        })
    })

    return Array.from(categoryUrls)
  }

  async getProducts(categoryIdentifier: string): Promise<string[]> {
    let hasNext = true
    let consecutiveErrorCount = 0

    const parsedUrl = new URL("https://ca.burberry.com/web-api/pages/products")
    const limit = 100
    const { id, productUrls } = await this.getCategoryID(categoryIdentifier)

    if (productUrls.length == 0 || id == "/") {
      return productUrls
    }

    let offset = productUrls.length

    parsedUrl.searchParams.set("location", id)
    parsedUrl.searchParams.set("country", "CA")
    parsedUrl.searchParams.set("language", "en")
    parsedUrl.searchParams.set("limit", `${limit}`)

    do {
      try {
        parsedUrl.searchParams.set("offset", `${offset}`)
        const body = await doHTTPScraperRequest(parsedUrl.toString(), {})
        const { data } = JSON.parse(body)
        const newProductUrls = this.extractProducts(data.products)

        productUrls.push(...newProductUrls)
        consecutiveErrorCount = 0
        offset += newProductUrls.length
        hasNext = newProductUrls.length > 0
      } catch (err: any) {
        consecutiveErrorCount++
        logger.error(err, "http-scraper", {
          scraperKey: this.key(),
          categoryIdentifier,
        })
      }

      if (consecutiveErrorCount > 2) {
        break
      }
    } while (hasNext)

    return Array.from(new Set(productUrls))
  }

  async fetchVariantsFromURL(
    urlSlug: string,
    parseChildren: boolean,
  ): Promise<HTTPScraperVariant[]> {
    const parsedUrl = new URL("https://ca.burberry.com/web-api/pages")
    parsedUrl.searchParams.set("pagePath", urlSlug)
    parsedUrl.searchParams.set("language", "en")
    parsedUrl.searchParams.set("country", "CA")

    const body = await doHTTPScraperRequest(parsedUrl.toString(), {})
    const { data } = JSON.parse(body)

    const {
      properties: {
        product,
        productExtended: { productFamilyItems },
      },
    } = data ?? {}

    const productDescription = `${product.description}\n${product.features}`
      || `\n${product.materialComposition}`
      || `\n${product.measurements}`
      || ""

    const { media } = productFamilyItems.find((x: any) => x.id == product.id) ?? {}

    const variants = product.sizes.map((size: any): HTTPScraperVariant => {
      return {
        barcode: size.sku,
        title: product.name,
        price: product.price.current?.value || product.price.old?.value,
        url: `https://ca.burberry.com${urlSlug}`,
        size: size.label || "One Size",
        color: product.color,
        image_url: media?.imageDefault || media?.imageFallback,
        description_text: { en: productDescription },
        altImages: media?.sources?.map((source: any) => {
          return source.srcSet
            .split(",")
            .at(-1)
            .trim()
            .split(" ")
            .at(0)
            .trim()
        }) || [],
        style_id: size.sku,
        style_number: product.id,
        brand_name: "Burberry",
        currency: product.price.current.currency,
        available_inventory: size.stockQuantity,
      }
    })

    if (parseChildren) {
      const otherVariants = productFamilyItems
        .filter((x: any) => x.id != product.id)
        .map((x: any) => x.url)

      const mapper = async (variantSlug: string) => {
        return await this.fetchVariantsFromURL(variantSlug, false)
      }

      const allVariants = await pMap(otherVariants, mapper)
      variants.push(...allVariants)
    }

    return variants
  }

  async getCategoryID(
    categoryIdentifier: string,
  ): Promise<{ id: string; productUrls: string[] }> {
    const parsedUrl = new URL("https://ca.burberry.com/web-api/pages")
    parsedUrl.searchParams.set("pagePath", categoryIdentifier)
    parsedUrl.searchParams.set("language", "en")
    parsedUrl.searchParams.set("country", "CA")

    const body = await doHTTPScraperRequest(parsedUrl.toString(), {})
    const { data, error } = JSON.parse(body)
    if (error) {
      throw new Error(error)
    }

    const { components } = data ?? {}
    const { products, catalogBreadcrumbs } = components ?? {}

    return {
      id: `/${catalogBreadcrumbs.map((x: any) => x.id).join("/")}`,
      productUrls: this.extractProducts(products),
    }
  }

  private extractProducts(products: any[]): string[] {
    const productUrls: string[] = []
    if (!Array.isArray(products)) {
      return []
    }

    for (const product of products) {
      if (product.products) {
        const subProducts = this.extractProducts(product.products)
        productUrls.push(...subProducts)
        continue
      }

      if (product.items && Array.isArray(product.items)) {
        for (const item of product.items) {
          productUrls.push(`https://ca.burberry.com${item.url}`)
        }
      }
    }
    return Array.from(new Set(productUrls))
  }
}
