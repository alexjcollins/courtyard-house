import { createHash, createHmac } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"

async function loadEnvFile(fileName) {
  const filePath = path.join(process.cwd(), fileName)

  try {
    const content = await readFile(filePath, "utf8")
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith("#")) continue

      const separatorIndex = line.indexOf("=")
      if (separatorIndex === -1) continue

      const key = line.slice(0, separatorIndex).trim()
      if (!key || process.env[key]) continue

      let value = line.slice(separatorIndex + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }

      process.env[key] = value
    }
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return
    }

    throw error
  }
}

function fail(message) {
  throw new Error(`Data validation failed: ${message}`)
}

function encodeRfc3986(value) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex")
}

function hmac(key, value) {
  return createHmac("sha256", key).update(value).digest()
}

function formatAmzDate(now = new Date()) {
  return now.toISOString().replace(/[:-]|\.\d{3}/g, "")
}

function getSigningKey(secretAccessKey, dateStamp, region) {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp)
  const regionKey = hmac(dateKey, region)
  const serviceKey = hmac(regionKey, "s3")
  return hmac(serviceKey, "aws4_request")
}

function getSpacesConfig() {
  const bucket = process.env.SPACES_BUCKET?.trim()
  const endpointValue = process.env.SPACES_URL?.trim()
  const accessKeyId = process.env.SPACES_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.SPACES_SECRET_ACCESS_KEY?.trim()

  if (!bucket || !endpointValue || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Spaces storage is required. Set SPACES_BUCKET, SPACES_URL, SPACES_ACCESS_KEY_ID, and SPACES_SECRET_ACCESS_KEY.",
    )
  }

  const endpoint = new URL(endpointValue)
  const hostStyle = endpoint.hostname.startsWith(`${bucket}.`)
    ? "virtual-hosted"
    : "path"
  const configuredRegion = process.env.SPACES_REGION?.trim()
  const hostSegments = endpoint.hostname.split(".")
  const inferredRegion =
    hostSegments[hostSegments[0] === bucket ? 1 : 0]

  return {
    bucket,
    endpoint,
    accessKeyId,
    secretAccessKey,
    region: configuredRegion || inferredRegion || "lon1",
    hostStyle,
    endpointPathSegments: endpoint.pathname.split("/").filter(Boolean),
  }
}

function getObjectPathSegments(config, key) {
  return [
    ...config.endpointPathSegments,
    ...(config.hostStyle === "path" ? [config.bucket] : []),
    ...key.split("/").filter(Boolean),
  ]
}

function getCanonicalUri(config, key) {
  return `/${getObjectPathSegments(config, key).map(encodeRfc3986).join("/")}`
}

function getObjectUrl(config, key) {
  const url = new URL(config.endpoint.origin)
  url.pathname = getCanonicalUri(config, key)
  return url.toString()
}

function createSignedHeaders(config, key, now = new Date()) {
  const amzDate = formatAmzDate(now)
  const dateStamp = amzDate.slice(0, 8)
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`
  const canonicalUri = getCanonicalUri(config, key)
  const payloadHash = sha256Hex("")
  const canonicalHeaders =
    `host:${config.endpoint.host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date"
  const canonicalRequest = [
    "GET",
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
  const signature = createHmac(
    "sha256",
    getSigningKey(config.secretAccessKey, dateStamp, config.region),
  )
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

async function readJson(key) {
  const config = getSpacesConfig()
  const signed = createSignedHeaders(config, key)
  const response = await fetch(signed.url, {
    method: "GET",
    headers: signed.headers,
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Could not read ${key} from Spaces (${response.status}): ${body}`)
  }

  return response.json()
}

await loadEnvFile(".env")
await loadEnvFile(".env.local")

const categoriesFile = await readJson("data/categories.json")

const categoryBudgetTotal = categoriesFile.categories.reduce(
  (sum, category) => sum + Number(category.budgetExVat || 0),
  0,
)

if (categoryBudgetTotal !== categoriesFile.totals.baselineBuildBudgetExVat) {
  fail(
    `category budgets total ${categoryBudgetTotal}, expected baseline ${categoriesFile.totals.baselineBuildBudgetExVat}`,
  )
}

if (
  Number(categoriesFile.globalContingency.budgetExVat || 0) !==
  Number(categoriesFile.totals.contingencyExVat || 0)
) {
  fail(
    `contingency ${categoriesFile.globalContingency.budgetExVat} does not match totals.contingencyExVat ${categoriesFile.totals.contingencyExVat}`,
  )
}

if (
  Number(categoriesFile.totals.envelopeExVat || 0) !==
  categoryBudgetTotal + Number(categoriesFile.globalContingency.budgetExVat || 0)
) {
  fail(
    `envelope total ${categoriesFile.totals.envelopeExVat} does not equal baseline plus contingency ${categoryBudgetTotal + Number(categoriesFile.globalContingency.budgetExVat || 0)}`,
  )
}

console.log("Data validation passed.")
