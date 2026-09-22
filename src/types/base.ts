export interface HTTPScraperVariantDescriptionText {
  [key: string]: string
}

export interface HTTPScraperVariantParam {
  [key: string]: string
}

export interface HTTPScraperVariant {
  barcode: string
  title: string
  price?: number
  discount?: number
  extra_discount?: number
  image_url: string
  url: string
  description_text: HTTPScraperVariantDescriptionText
  altImages: string[]
  color: string
  size: string
  style_number?: string
  style_id: string
  brand_name?: string
  currency: string
  available_inventory: number
  measurement?: { [key: string]: any }
}
