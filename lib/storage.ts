import "server-only"

import { createHash, createHmac } from "node:crypto"

const defaultSignedUrlTtlSeconds = 900
const maxSignedUrlTtlSeconds = 60 * 60 * 24 * 7

type SpacesConfig = {
  bucket: string
  endpoint: URL
  accessKeyId: string
  secretAccessKey: string
  region: string
  hostStyle: "virtual-hosted" | "path"
  endpointPathSegments: string[]
}

export type StorageStatus = {
  backend: "spaces"
  dataLocation: string
  privateFilesSupported: boolean
  signedUrlTtlSeconds: number
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

function normalizeObjectKey(key: string): string {
  const normalized = key.trim().replace(/^\/+/, "")

  if (!normalized) {
    throw new Error("Object key is required.")
  }

  if (
    normalized
      .split("/")
      .some((segment) => segment === ".." || segment === ".")
  ) {
    throw new Error("Object key cannot contain relative path segments.")
  }

  return normalized
}

function formatAmzDate(now = new Date()): string {
  return now.toISOString().replace(/[:-]|\.\d{3}/g, "")
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function sha256HexBytes(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex")
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest()
}

function getSigningKey(secretAccessKey: string, dateStamp: string, region: string): Buffer {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp)
  const regionKey = hmac(dateKey, region)
  const serviceKey = hmac(regionKey, "s3")
  return hmac(serviceKey, "aws4_request")
}

function getSpacesRegion(bucket: string, endpoint: URL): string {
  const configuredRegion = process.env.SPACES_REGION?.trim()
  if (configuredRegion) {
    return configuredRegion
  }

  const hostSegments = endpoint.hostname.split(".")
  const regionIndex = hostSegments[0] === bucket ? 1 : 0
  const candidate = hostSegments[regionIndex]

  if (candidate) {
    return candidate
  }

  throw new Error("Could not derive the Spaces region. Set SPACES_REGION explicitly.")
}

function getSpacesConfig(): SpacesConfig | null {
  const bucket = process.env.SPACES_BUCKET?.trim()
  const endpointValue = process.env.SPACES_URL?.trim()
  const accessKeyId = process.env.SPACES_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.SPACES_SECRET_ACCESS_KEY?.trim()

  if (!bucket && !endpointValue && !accessKeyId && !secretAccessKey) {
    return null
  }

  if (!bucket || !endpointValue || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Spaces configuration is incomplete. Expected SPACES_BUCKET, SPACES_URL, SPACES_ACCESS_KEY_ID, and SPACES_SECRET_ACCESS_KEY.",
    )
  }

  const endpoint = new URL(endpointValue)
  const hostStyle = endpoint.hostname.startsWith(`${bucket}.`)
    ? "virtual-hosted"
    : "path"

  return {
    bucket,
    endpoint,
    accessKeyId,
    secretAccessKey,
    region: getSpacesRegion(bucket, endpoint),
    hostStyle,
    endpointPathSegments: endpoint.pathname.split("/").filter(Boolean),
  }
}

function requireSpacesConfig(): SpacesConfig {
  const config = getSpacesConfig()

  if (!config) {
    throw new Error(
      "Spaces storage is required. Set SPACES_BUCKET, SPACES_URL, SPACES_ACCESS_KEY_ID, and SPACES_SECRET_ACCESS_KEY.",
    )
  }

  return config
}

function getObjectPathSegments(config: SpacesConfig, key: string): string[] {
  return [
    ...config.endpointPathSegments,
    ...(config.hostStyle === "path" ? [config.bucket] : []),
    ...normalizeObjectKey(key).split("/"),
  ]
}

function getCanonicalUri(config: SpacesConfig, key: string): string {
  return `/${getObjectPathSegments(config, key).map(encodeRfc3986).join("/")}`
}

function getObjectUrl(config: SpacesConfig, key: string): string {
  const url = new URL(config.endpoint.origin)
  url.pathname = getCanonicalUri(config, key)
  return url.toString()
}

function buildCanonicalQuery(
  values: Array<[string, string]>,
): string {
  return values
    .map(([name, value]) => [encodeRfc3986(name), encodeRfc3986(value)] as const)
    .sort(([leftName, leftValue], [rightName, rightValue]) =>
      leftName === rightName
        ? leftValue.localeCompare(rightValue)
        : leftName.localeCompare(rightName),
    )
    .map(([name, value]) => `${name}=${value}`)
    .join("&")
}

function createSignedHeaders(
  method: "GET" | "PUT",
  key: string,
  payloadHash: string,
  now = new Date(),
) {
  const config = requireSpacesConfig()

  const amzDate = formatAmzDate(now)
  const dateStamp = amzDate.slice(0, 8)
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`
  const canonicalUri = getCanonicalUri(config, key)
  const canonicalHeaders =
    `host:${config.endpoint.host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date"
  const canonicalRequest = [
    method,
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n")
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n")
  const signature = createHmac("sha256", getSigningKey(
    config.secretAccessKey,
    dateStamp,
    config.region,
  ))
    .update(stringToSign)
    .digest("hex")

  return {
    url: getObjectUrl(config, key),
    headers: {
      authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      host: config.endpoint.host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    },
  }
}

async function fetchSpacesText(key: string): Promise<string> {
  const signed = createSignedHeaders("GET", key, sha256Hex(""))
  const response = await fetch(signed.url, {
    method: "GET",
    headers: signed.headers,
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`Spaces read failed for ${key} (${response.status}).`)
  }

  return response.text()
}

async function putSpacesText(
  key: string,
  content: string,
  contentType = "application/json; charset=utf-8",
): Promise<void> {
  await putSpacesBytes(key, content, contentType)
}

async function putSpacesBytes(
  key: string,
  content: string | Uint8Array,
  contentType: string,
): Promise<void> {
  const signed = createSignedHeaders("PUT", key, sha256HexBytes(content))
  const response = await fetch(signed.url, {
    method: "PUT",
    headers: {
      ...signed.headers,
      "content-type": contentType,
    },
    body: content,
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`Spaces write failed for ${key} (${response.status}).`)
  }
}

function createPresignedUrl(
  method: "GET" | "PUT",
  key: string,
  expiresInSeconds = defaultSignedUrlTtlSeconds,
  now = new Date(),
): string {
  const config = requireSpacesConfig()

  const boundedTtl = Math.min(
    Math.max(Math.floor(expiresInSeconds), 1),
    maxSignedUrlTtlSeconds,
  )
  const amzDate = formatAmzDate(now)
  const dateStamp = amzDate.slice(0, 8)
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`
  const canonicalUri = getCanonicalUri(config, key)
  const canonicalQuery = buildCanonicalQuery([
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${config.accessKeyId}/${credentialScope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(boundedTtl)],
    ["X-Amz-SignedHeaders", "host"],
  ])
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    `host:${config.endpoint.host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n")
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n")
  const signature = createHmac("sha256", getSigningKey(
    config.secretAccessKey,
    dateStamp,
    config.region,
  ))
    .update(stringToSign)
    .digest("hex")

  return `${getObjectUrl(config, key)}?${canonicalQuery}&X-Amz-Signature=${signature}`
}

export function getStorageStatus(): StorageStatus {
  const config = requireSpacesConfig()

  return {
    backend: "spaces",
    dataLocation: `${getObjectUrl(config, "data")}/`,
    privateFilesSupported: true,
    signedUrlTtlSeconds: defaultSignedUrlTtlSeconds,
  }
}

export async function readDataFileText(fileName: string): Promise<string> {
  return fetchSpacesText(`data/${fileName}`)
}

export async function writeDataFileText(fileName: string, content: string): Promise<void> {
  await putSpacesText(`data/${fileName}`, content)
}

export async function writePrivateObject(
  key: string,
  content: string | Uint8Array,
  contentType: string,
): Promise<void> {
  await putSpacesBytes(normalizeObjectKey(key), content, contentType)
}

export function createPrivateObjectSignedUrl(
  key: string,
  options?: {
    action?: "download" | "upload"
    expiresInSeconds?: number
  },
): string {
  const action = options?.action === "upload" ? "PUT" : "GET"
  return createPresignedUrl(action, key, options?.expiresInSeconds)
}

export function normalizePrivateObjectKey(key: string): string {
  return normalizeObjectKey(key)
}
