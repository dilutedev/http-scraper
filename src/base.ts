import pMap from "p-map"
import { logger } from "./logger"
import type { HTTPScraperVariant } from "./types/base"

export abstract class BaseHTTPScraper {
  abstract findItems(query: string): Promise<HTTPScraperVariant[]>
  abstract key(): string
  abstract search(query: string): Promise<string>
  abstract getCategories(): Promise<string[]>
  abstract getProducts(categoryIdentifier: string): Promise<string[]>

  async listProducts(_: boolean): Promise<string[]> {
    const categoryUrls = await this.getCategories()
    const mapper = async (categoryUrl: string): Promise<string[]> => {
      try {
        return await this.getProducts(categoryUrl)
      } catch (err: any) {
        logger.error(err, "http-scraper", {
          scraperKey: this.key(),
          categoryUrl,
        })
        throw err
      }
    }

    const productUrls = await pMap(categoryUrls, mapper, {
      concurrency: 20,
      stopOnError: true,
    })
    return Array.from(new Set(productUrls.flat()))
  }
}
