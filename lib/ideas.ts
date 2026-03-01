import "server-only"

import { writePrivateObject } from "@/lib/storage"

export type IdeaIngestionImage = {
  key: string
  alt?: string
  sourceUrl: string
}

export type IdeaIngestionResult = {
  sourceUrl: string
  title: string
  supplierName?: string
  brand?: string
  description?: string
  siteName?: string
  estimatedTotalExVat?: number
  currency?: string
  priceText?: string
  images: IdeaIngestionImage[]
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
  }

function getMetaContent(html: string, names: string[]): string | undefined {
  for (const name of names) {
    const patterns = [
      new RegExp(
        `<meta[^>]+(?:property|name|itemprop)=["']${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]+content=["']([^"']+)["'][^>]*>`,
        "i",
      ),
      new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name|itemprop)=["']${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`,
        "i",
      ),
    ]

    for (const pattern of patterns) {
      const match = html.match(pattern)
      if (match?.[1]) {
        return decodeHtml(match[1].trim())
      }
    }
  }

  return undefined
}

function getDocumentTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (!match?.[1]) return undefined
  return decodeHtml(stripTags(match[1]))
}

function parseJsonLdBlocks(html: string): Array<Record<string, unknown>> {
  return [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .flatMap((match) => {
      const raw = match[1]?.trim()
      if (!raw) return []

      try {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) return parsed.filter(Boolean)
        return parsed ? [parsed] : []
      } catch {
        return []
      }
    })
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
}

function getJsonLdProductEntry(html: string): Record<string, unknown> | undefined {
  return parseJsonLdBlocks(html).find((entry) => {
    const type = entry["@type"]
    if (typeof type === "string") {
      return type.toLowerCase().includes("product")
    }
    if (Array.isArray(type)) {
      return type.some((value) => String(value).toLowerCase().includes("product"))
    }
    return false
  })
}

function toAbsoluteUrl(value: string, baseUrl: string): string | undefined {
  try {
    return new URL(value, baseUrl).toString()
  } catch {
    return undefined
  }
}

function uniqueDefined(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter(Boolean) as string[])]
}

function inferSupplierName(url: URL, siteName?: string): string {
  if (siteName) return siteName
  const host = url.hostname.replace(/^www\./, "")
  return host.split(".")[0]?.replace(/[-_]/g, " ") || host
}

function extractPriceText(html: string): string | undefined {
  return (
    getMetaContent(html, [
      "product:price:amount",
      "og:price:amount",
      "twitter:data1",
      "price",
    ]) ||
    undefined
  )
}

function parsePrice(value?: string): number | undefined {
  if (!value) return undefined
  const match = value.replace(/,/g, "").match(/(\d+(?:\.\d{1,2})?)/)
  if (!match) return undefined
  return Number(match[1])
}

function inferCurrency(html: string, url: URL, jsonLdProduct?: Record<string, unknown>): string {
  const metaCurrency = getMetaContent(html, [
    "product:price:currency",
    "og:price:currency",
    "priceCurrency",
  ])
  if (metaCurrency) return metaCurrency.toUpperCase()

  const offers = jsonLdProduct?.offers
  if (offers && typeof offers === "object" && !Array.isArray(offers)) {
    const value = offers.priceCurrency
    if (typeof value === "string" && value.trim()) {
      return value.toUpperCase()
    }
  }

  if (url.hostname.endsWith(".co.uk")) return "GBP"
  return "GBP"
}

function sanitizeFileSegment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "item"
}

function extensionForContentType(contentType: string, sourceUrl: string): string {
  const normalized = contentType.toLowerCase()
  if (normalized.includes("jpeg")) return "jpg"
  if (normalized.includes("png")) return "png"
  if (normalized.includes("webp")) return "webp"
  if (normalized.includes("gif")) return "gif"
  if (normalized.includes("svg")) return "svg"

  try {
    const pathname = new URL(sourceUrl).pathname
    const match = pathname.match(/\.([a-zA-Z0-9]+)$/)
    if (match?.[1]) return match[1].toLowerCase()
  } catch {}

  return "jpg"
}

async function storeIdeaImages(
  ideaId: string,
  title: string,
  imageUrls: string[],
): Promise<IdeaIngestionImage[]> {
  const savedImages: IdeaIngestionImage[] = []

  for (const [index, imageUrl] of imageUrls.slice(0, 3).entries()) {
    try {
      const response = await fetch(imageUrl, {
        headers: {
          "user-agent":
            "Mozilla/5.0 (compatible; CourtyardHouseBot/1.0; +https://courtyard-house.local)",
          accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
        redirect: "follow",
        cache: "no-store",
      })

      if (!response.ok) continue

      const contentType = response.headers.get("content-type") || "image/jpeg"
      if (!contentType.toLowerCase().startsWith("image/")) continue

      const bytes = new Uint8Array(await response.arrayBuffer())
      if (bytes.byteLength === 0 || bytes.byteLength > 8 * 1024 * 1024) continue

      const extension = extensionForContentType(contentType, imageUrl)
      const key = `files/ideas/${ideaId}/${sanitizeFileSegment(title)}-${index + 1}.${extension}`

      await writePrivateObject(key, bytes, contentType)
      savedImages.push({
        key,
        alt: title,
        sourceUrl: imageUrl,
      })
    } catch {
      continue
    }
  }

  return savedImages
}

export async function ingestIdeaUrl(
  ideaId: string,
  sourceUrl: string,
): Promise<IdeaIngestionResult> {
  const normalizedUrl = new URL(sourceUrl)
  const response = await fetch(normalizedUrl, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (compatible; CourtyardHouseBot/1.0; +https://courtyard-house.local)",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-GB,en;q=0.8",
    },
    redirect: "follow",
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`Could not read source page (${response.status}).`)
  }

  const html = await response.text()
  const jsonLdProduct = getJsonLdProductEntry(html)
  const sourcePageUrl = response.url || normalizedUrl.toString()

  const title =
    getMetaContent(html, ["og:title", "twitter:title"]) ||
    (typeof jsonLdProduct?.name === "string" ? jsonLdProduct.name : undefined) ||
    getDocumentTitle(html) ||
    "Untitled idea"

  const description =
    getMetaContent(html, ["description", "og:description", "twitter:description"]) ||
    (typeof jsonLdProduct?.description === "string" ? stripTags(jsonLdProduct.description) : undefined)

  const siteName =
    getMetaContent(html, ["og:site_name", "application-name"]) ||
    (typeof jsonLdProduct?.brand === "string" ? jsonLdProduct.brand : undefined)

  const priceText =
    (typeof jsonLdProduct?.offers === "object" &&
    jsonLdProduct.offers &&
    !Array.isArray(jsonLdProduct.offers) &&
    typeof jsonLdProduct.offers.price === "string"
      ? jsonLdProduct.offers.price
      : undefined) ||
    extractPriceText(html)

  const imageCandidates = uniqueDefined([
    ...[
      getMetaContent(html, ["og:image", "twitter:image", "image"]),
      typeof jsonLdProduct?.image === "string" ? jsonLdProduct.image : undefined,
    ].map((value) => (value ? toAbsoluteUrl(value, sourcePageUrl) : undefined)),
    ...(Array.isArray(jsonLdProduct?.image)
      ? jsonLdProduct.image.map((value) =>
          typeof value === "string" ? toAbsoluteUrl(value, sourcePageUrl) : undefined,
        )
      : []),
  ])

  const images = await storeIdeaImages(ideaId, title, imageCandidates)
  const sourcePage = new URL(sourcePageUrl)

  return {
    sourceUrl: sourcePageUrl,
    title,
    supplierName: inferSupplierName(sourcePage, siteName),
    brand:
      typeof jsonLdProduct?.brand === "string"
        ? jsonLdProduct.brand
        : undefined,
    description,
    siteName,
    estimatedTotalExVat: parsePrice(priceText),
    currency: inferCurrency(html, sourcePage, jsonLdProduct),
    priceText,
    images,
  }
}
