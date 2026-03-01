import { createHash, createHmac } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"

const DATA_FILE_NAMES = [
  "project.json",
  "categories.json",
  "lineItems.json",
  "procurement.json",
  "payments.json",
  "decisions.json",
  "ideas.json",
  "inspiration.json",
  "timeline.json",
  "fundingModel.json",
]

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
      "Missing Spaces config. Expected SPACES_BUCKET, SPACES_URL, SPACES_ACCESS_KEY_ID, and SPACES_SECRET_ACCESS_KEY.",
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

function createSignedHeaders(config, method, key, payloadHash, now = new Date()) {
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

async function putObject(config, key, content) {
  const signed = createSignedHeaders(config, "PUT", key, sha256Hex(content))
  const response = await fetch(signed.url, {
    method: "PUT",
    headers: {
      ...signed.headers,
      "content-type": "application/json; charset=utf-8",
    },
    body: content,
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`PUT ${key} failed (${response.status}): ${body}`)
  }
}

async function getObject(config, key) {
  const signed = createSignedHeaders(config, "GET", key, sha256Hex(""))
  const response = await fetch(signed.url, {
    method: "GET",
    headers: signed.headers,
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`GET ${key} failed (${response.status}): ${body}`)
  }

  return response.text()
}

async function main() {
  await loadEnvFile(".env")
  await loadEnvFile(".env.local")

  const config = getSpacesConfig()
  const dataDirectory = path.join(process.cwd(), "data")
  const requestedFiles = process.argv.slice(2)
  const filesToSeed =
    requestedFiles.length > 0
      ? requestedFiles.map((fileName) => {
          if (!DATA_FILE_NAMES.includes(fileName)) {
            throw new Error(
              `Unknown data file "${fileName}". Expected one of: ${DATA_FILE_NAMES.join(", ")}`,
            )
          }

          return fileName
        })
      : DATA_FILE_NAMES

  console.log(
    `Seeding ${filesToSeed.length} data file${filesToSeed.length === 1 ? "" : "s"} to ${getObjectUrl(config, "data/")}`,
  )

  for (const fileName of filesToSeed) {
    const localPath = path.join(dataDirectory, fileName)
    const content = await readFile(localPath, "utf8")
    const key = `data/${fileName}`

    await putObject(config, key, content)
    const remoteContent = await getObject(config, key)

    if (remoteContent !== content) {
      throw new Error(`Seed verification failed for ${fileName}. Remote content mismatch.`)
    }

    console.log(`Seeded ${key}`)
  }

  console.log("Spaces data seed complete.")
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
