export interface VariantParam {
  pid: string
  color: string
  size?: string
}

export interface LacosteVariantData {
  product: LacosteProduct
}

export interface LacosteProduct {
  id: string
  name: string
  color: LacosteColor
  size: LacosteSize
  gallery: LacosteGallery
  pricing: LacostePricing
  description: LacosteDescription
  variations: LacosteVariations
}

export interface LacosteColor {
  id: string
  label: string
  flatUrl: string
  url: string
}

export interface LacosteSize {
  id: string
  label: string
}

export interface LacosteGallery {
  images: LacosteImage[]
}

export interface LacosteImage {
  desktopUrl: string
  type: string
  alt: string
}

export interface LacostePricing {
  salesPrice?: LacostePriceValue
  standardPrice?: LacostePriceValue
  isSales: boolean
  discount?: LacosteDiscount
  currency: string
}

export interface LacostePriceValue {
  value: number
}

export interface LacosteDiscount {
  value: number
  roundValue: number
}

export interface LacosteDescription {
  description: string
  descriptions: LacosteDescriptionBlock[]
}

export interface LacosteDescriptionBlock {
  title: string
  texts?: string[]
  list?: string[]
}

export interface LacosteVariations {
  color: LacosteColorVariation
  size: LacosteSizeVariation
}

export interface LacosteColorVariation {
  list: LacosteVariationItem[]
}

export interface LacosteSizeVariation {
  list: LacosteVariationItem[]
}

export interface LacosteVariationItem {
  id: string
}

export interface LacosteProductVariations {
  data: LacosteProductVariationData[]
}

export interface LacosteProductVariationData {
  productId: string
  variations: LacosteVariations
}

export interface LacosteSearchResponse {
  results: LacosteSearchResult[]
}

export interface LacosteSearchResult {
  hits: LacosteSearchHit[]
}

export interface LacosteSearchHit {
  urlMaster: string
}
