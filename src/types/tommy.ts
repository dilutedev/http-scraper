export interface GetVariantParams {
  style: string
  color: string
  size?: string
}

export interface TommyProductVariant {
  action: string
  queryString: string
  locale: string
  product: TommyProduct
  resources: Resources
}

export interface TommyProduct {
  uuid: string
  id: string
  productName: string
  productType: string
  brand: any
  price: Price
  strikeThrough: boolean
  renderedPrice: string
  salesPriceDefault: string
  orderable: boolean
  images: ProductImages
  minOrderQuantity: number
  maxOrderQuantity: number
  isTeaserProduct: boolean
  variationAttributes: VariationAttribute[]
  longDescription: string
  shortDescription: any
  selectedProductUrl: string
  styleId: string
}

export interface Price {
  sales: List | null
  list: List | null
  html: string
}

export interface List {
  value: number
  currency: string
  formatted: string
  decimalPrice: string
}

export interface ProductImages {
  large: Large[]
  colab: any[]
}

export interface Large {
  alt: string
  url: string
  index: string
  title: string
  absURL: string
}

export interface VariationAttribute {
  attributeId: string
  displayName: string
  id: string
  swatchable: boolean
  displayValue: string
  values: Value[]
}

export interface Value {
  id: string
  description: any
  displayValue: string
  value: string
  selected: boolean
  selectable: boolean
}

export interface Resources {
  infoSelectforstock: string
  assistiveSelectedText: string
}
