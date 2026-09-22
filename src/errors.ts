export class ProductNotFoundError extends Error {
  constructor(message: string = "product not found") {
    super(message)
    this.name = "ProductNotFoundError"
  }
}

export class OutOfStockError extends Error {
  constructor(message: string = "item out of stock") {
    super(message)
    this.name = "OutOfStockError"
  }
}

export class HttpScraperNotFoundError extends Error {
  constructor(message: string = "no http scraper found for specified key") {
    super(message)
    this.name = "HttpScraperNotFoundError"
  }
}

export class AkamaiBotError extends Error {
  constructor(message = "akamai bot triggered") {
    super(message)
    this.name = "AkamaiBotError"
  }
}

export class PerimeterXBotError extends Error {
  constructor(message = "perimeterx bot triggered") {
    super(message)
    this.name = "PerimeterXBotError"
  }
}
