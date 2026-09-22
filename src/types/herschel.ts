export interface HerschelSKU {
  images: string[]
  extendedReturnIncluded: boolean
  color: string
  imagePath: string
  title: string
  sizeDisplay: string
  isOneSize: boolean
  salePercentDisplay: string
  algoliaObjectID: string
  isListed: boolean
  isComingSoon: boolean
  size: string
  price: string
  isGiftWithPurchase: boolean
  inStock: boolean
  isFinalSale: boolean
  id: string
  forceShow: boolean
  sku: string
  isOnSale: boolean
  shopifyVariantId: string
  showBackInStock: boolean
  shopifyProductId: string
  variantRank: number
}

export interface HerschelProductState {
  products: Array<{
    path: string
  }>
}
