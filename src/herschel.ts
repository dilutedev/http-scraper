import * as cheerio from "cheerio"
import { logger } from "./logger"
import { BaseHTTPScraper } from "./base"
import { ProductNotFoundError } from "./errors"
import { doHTTPScraperRequest } from "./request"
import type { HTTPScraperVariant } from "./types/base"
import type { HerschelProductState, HerschelSKU } from "./types/herschel"

export class Herschel extends BaseHTTPScraper {
  async findItems(query: string): Promise<HTTPScraperVariant[]> {
    if (!query.startsWith("https")) {
      const productURL = await this.search(query)
      query = productURL
    }

    const sizeURLs = await this.getSizeURLs(query)
    const variants: HTTPScraperVariant[] = []

    const promises = sizeURLs.map((sizeURL) =>
      this.getSizeVariants(sizeURL).catch((error) => {
        logger.error({
          message: `Failed to get Herschel variant from ${sizeURL}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          module: "herschel",
          stack_trace: error instanceof Error ? error.stack : undefined,
          payload: { sizeURL, operation: "findItems" },
        })
        return null
      })
    )

    const results = await Promise.allSettled(promises)
    results.forEach((result) => {
      if (result.status === "fulfilled" && result.value) {
        variants.push(...result.value)
      }
    })

    return variants
  }

  async getItem(url: string): Promise<HTTPScraperVariant | null> {
    throw new ProductNotFoundError()
  }

  key(): string {
    return "herschel"
  }

  async listProducts(withLimit: boolean): Promise<string[]> {
    const categoryLinks = await this.getPrimaryCategoryLinks()

    if (categoryLinks.length === 0) {
      throw new Error("unable to find any categories for herschel")
    }

    const products: string[] = []

    const promises = categoryLinks.map((categoryLink) =>
      this.getCategoryProducts(categoryLink).catch((error) => {
        logger.error({
          message: `Failed to get Herschel products for ${categoryLink}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          module: "herschel",
          stack_trace: error instanceof Error ? error.stack : undefined,
          payload: { categoryLink, operation: "listProducts" },
        })
        return []
      })
    )

    const results = await Promise.allSettled(promises)
    results.forEach((result) => {
      if (result.status === "fulfilled") {
        products.push(...result.value)
      }
    })

    return products
  }

  async search(query: string): Promise<string> {
    const html = await doHTTPScraperRequest(
      `${this.getDomain("")}/search?query=${query}`,
      {
        method: "GET",
      },
    )
    const $ = cheerio.load(html)

    if ($("h3.out-of-stock").length > 0) {
      throw new ProductNotFoundError()
    }

    const href = $(
      "section.search-results-container div.product-card-grid a",
    ).attr("href")

    if (!href) {
      throw new ProductNotFoundError()
    }

    return this.getDomain("") + href
  }

  private async getSizeVariants(
    sizeURL: string,
  ): Promise<HTTPScraperVariant[]> {
    const html = await doHTTPScraperRequest(sizeURL, { method: "GET" })
    const $ = cheerio.load(html)

    const productDescription = $(".product-details__content .product-overview__descriptive-text")
      .text()
      .trim() || ""
    const productFeatures = $(".product-details__content .features-list").text().trim() || ""

    const descriptionText = `${productDescription}\n\nFeatures\n${productFeatures}`
    const productID = $("[data-product-id]").attr("data-product-id")

    if (!productID) {
      throw new ProductNotFoundError()
    }

    const herschelSKUs = await this.extractHerschelSKUs(html)
    const currency = $("afterpay-placement, [data-currency]").first().attr("data-currency")
      || ""

    const variants: HTTPScraperVariant[] = []
    for (const sku of herschelSKUs) {
      const variant = this.convertHerschelSKUToVariant(
        sku,
        productID,
        sizeURL,
        descriptionText,
        currency,
      )
      if (variant) {
        variants.push(variant)
      }
    }

    return variants
  }

  private async getSizeURLs(primaryURL: string): Promise<string[]> {
    const html = await doHTTPScraperRequest(primaryURL, { method: "GET" })
    const $ = cheerio.load(html)

    const sizeUrls: string[] = []
    $("ul.size-component-selector li.regular-links").each((index, element) => {
      const anchor = $(element).find("a")
      const href = anchor.attr("href")
      if (href) {
        sizeUrls.push(this.getDomain(primaryURL) + href)
      }
    })

    if (sizeUrls.length === 0) {
      sizeUrls.push(primaryURL)
    }

    return sizeUrls
  }

  private async getPrimaryCategoryLinks(): Promise<string[]> {
    const html = await doHTTPScraperRequest(this.getDomain(""), {
      method: "GET",
    })
    const $ = cheerio.load(html)

    const primaryLinks: string[] = []
    $("div.nav-modal-container a").each((index, element) => {
      if (!$(element).text().includes("Shop All")) {
        return
      }

      const href = $(element).attr("href")
      if (href) {
        const primaryLink = this.getDomain("") + href
        if (!primaryLinks.includes(primaryLink)) {
          primaryLinks.push(primaryLink)
        }
      }
    })

    return primaryLinks
  }

  private async getCategoryProducts(categoryLink: string): Promise<string[]> {
    const html = await doHTTPScraperRequest(categoryLink, { method: "GET" })

    const products = await this.extractProductURLsFromProductState(
      categoryLink,
      html,
    )
    return products
  }

  private async extractProductURLsFromProductState(
    productURL: string,
    htmlContent: string,
  ): Promise<string[]> {
    const match = htmlContent.match(
      /var productState = {\n?.*results:\s?({.*}),\n?.*(start|end)/,
    )

    if (!match || match.length < 2) {
      throw new Error("could not find productState in HTML")
    }

    const jsonData = match[1]
    try {
      const productState: HerschelProductState = JSON.parse(jsonData)
      const productURLs: string[] = []

      for (const product of productState.products) {
        if (product.path) {
          productURLs.push(this.getDomain(productURL) + product.path)
        }
      }

      return productURLs
    } catch (error: any) {
      throw new Error(`failed to parse productState JSON: ${error}`)
    }
  }

  private async extractHerschelSKUs(
    htmlContent: string,
  ): Promise<HerschelSKU[]> {
    const match = htmlContent.match(/var skus = (\[.*?\]);/)

    if (!match || match.length < 2) {
      throw new Error("could not find skus array in HTML")
    }

    const jsonData = match[1]
    try {
      const skus: HerschelSKU[] = JSON.parse(jsonData)
      return skus
    } catch (error: any) {
      throw new Error(`failed to parse SKUs JSON: ${error}`)
    }
  }

  private convertHerschelSKUToVariant(
    sku: HerschelSKU,
    productID: string,
    productURL: string,
    description: string,
    currency: string,
  ): HTTPScraperVariant | null {
    if (!sku.inStock || sku.shopifyProductId !== productID) {
      return null
    }

    const images: string[] = []
    for (const img of sku.images) {
      if (img.startsWith("/")) {
        images.push(this.getDomain(productURL) + img)
      } else {
        images.push(img)
      }
    }

    let price = 0.0
    if (sku.price) {
      const parsedPrice = parseFloat(sku.price)
      if (!isNaN(parsedPrice)) {
        price = parsedPrice
      }
    }

    let discount = 0.0
    if (sku.salePercentDisplay && sku.isOnSale) {
      const percentStr = sku.salePercentDisplay.replace("% OFF", "")
      const parsedPercent = parseFloat(percentStr)
      if (!isNaN(parsedPercent)) {
        discount = parsedPercent
      }
    }

    const availableInventory = sku.inStock ? 1 : 0

    let imageURL = ""
    if (sku.imagePath) {
      imageURL = this.getDomain(productURL) + sku.imagePath
    }

    if (discount > 0) {
      price = Math.floor(price / (1 - discount / 100))
    }

    return {
      title: sku.title,
      price,
      discount,
      image_url: imageURL,
      url: productURL,
      description_text: { en: description },
      altImages: images,
      color: sku.color,
      size: sku.sizeDisplay,
      style_number: sku.sku,
      style_id: sku.id,
      brand_name: "Herschel",
      currency,
      available_inventory: availableInventory,
      barcode: sku.shopifyVariantId,
    }
  }

  private getDomain(urlPath: string): string {
    if (!urlPath) {
      return "https://herschel.com"
    }

    try {
      const parsedURL = new URL(urlPath)
      return `https://${parsedURL.hostname}`
    } catch {
      return "https://herschel.com"
    }
  }

  async getCategories(): Promise<string[]> {
    throw new Error("Method not implemented")
  }

  async getProducts(categoryIdentifier: string): Promise<string[]> {
    throw new Error("Method not implemented")
  }
}
