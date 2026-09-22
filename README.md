# http-scraper

TypeScript scrapers for extracting product and variant data (price, size, color,
stock, images, description) from retailer storefronts, by reverse-engineering
each site's own internal/storefront APIs rather than scraping rendered HTML
where possible.

## Included crawlers

- **Burberry** (`src/burberry.ts`) — storefront JSON API, recursive category/product
  extraction, parallel variant-family resolution.
- **Lacoste** (`src/lacoste.ts`) — Algolia-backed search fallback across regional
  indices, Salesforce Commerce Cloud (SFCC) product/variation API.
- **Tommy Hilfiger** (`src/tommy.ts`) — SFCC variation API, color/size matrix
  expansion, paginated category crawl via `Search-UpdateGrid`.
- **Hugo Boss** (`src/hugoboss.ts`) — sitemap-driven discovery, JSON-LD +
  DOM-attribute price/variant extraction.
- **Herschel** (`src/herschel.ts`) — inline `<script>` state extraction
  (`productState`, `skus`) via regex + JSON parsing.

## Design

- `src/base.ts` — abstract `BaseHTTPScraper` all crawlers extend, with a shared
  concurrent category → product crawl (`listProducts`).
- `src/request.ts` — shared HTTP layer using [`impit`](https://github.com/apify/impit)
  for browser-fingerprint impersonation (bypasses naive bot detection), plus
  basic bot-wall detection (Akamai, PerimeterX).
- `src/errors.ts` — typed error classes (`ProductNotFoundError`,
  `AkamaiBotError`, etc.) so callers can branch on failure mode instead of
  string-matching messages.
- Each crawler implements `findItems`, `search`, `getCategories`, and
  `getProducts`, returning a normalized `HTTPScraperVariant` shape.

## Usage

```ts
import { Lacoste } from "./src/lacoste"

const scraper = new Lacoste()
const variants = await scraper.findItems("https://www.lacoste.com/us/...")
```

## Install

```sh
npm install
npm run build
```
