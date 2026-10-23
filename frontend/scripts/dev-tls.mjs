import { X509Certificate, createPrivateKey } from 'node:crypto'
import { statSync, accessSync, constants, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const CERT_VAR = 'GPU_BOOKING_TLS_CERT'
const KEY_VAR = 'GPU_BOOKING_TLS_KEY'

function assertReadableFile(name, path) {
  try {
    if (!statSync(path).isFile()) {
      throw new Error('not a regular file')
    }
    accessSync(path, constants.R_OK)
  } catch (error) {
    throw new Error(
      `${name} is not a readable file: ${path} (${error.message})`
    )
  }
}

function loadCertificate(path, now) {
  let cert
  try {
    cert = new X509Certificate(readFileSync(path))
  } catch {
    throw new Error(
      `${CERT_VAR} (${path}) is not a PEM X.509 certificate; did you point it at the key?`
    )
  }
  if (new Date(cert.validTo) <= now) {
    throw new Error(
      `${CERT_VAR} (${path}) expired on ${cert.validTo}; create a new certificate`
    )
  }
  return cert
}

function loadPrivateKey(path) {
  try {
    return createPrivateKey(readFileSync(path))
  } catch {
    throw new Error(
      `${KEY_VAR} (${path}) is not a PEM private key; did you point it at the certificate?`
    )
  }
}

/**
 * Returns the extra `next dev` arguments that serve over HTTPS with the
 * operator-supplied certificate, or an empty list when TLS is not configured.
 * Throws when the pair is incomplete, unreadable, unparsable, mismatched, or
 * the certificate has expired.
 *
 * @param {Record<string, string | undefined>} [env]
 * @param {Date} [now]
 * @returns {string[]}
 */
export function devTlsArgs(env = process.env, now = new Date()) {
  const cert = env[CERT_VAR] ?? ''
  const key = env[KEY_VAR] ?? ''

  if (cert === '' && key === '') {
    return []
  }
  if (cert === '' || key === '') {
    throw new Error(
      `${CERT_VAR} and ${KEY_VAR} must be set together (set both for HTTPS, or neither for plain HTTP)`
    )
  }

  assertReadableFile(CERT_VAR, cert)
  assertReadableFile(KEY_VAR, key)

  const x509 = loadCertificate(cert, now)
  const privateKey = loadPrivateKey(key)
  if (!x509.checkPrivateKey(privateKey)) {
    throw new Error(
      `${KEY_VAR} (${key}) does not match the certificate in ${CERT_VAR} (${cert})`
    )
  }

  return [
    '--experimental-https',
    '--experimental-https-key',
    key,
    '--experimental-https-cert',
    cert,
  ]
}

// Run directly (as run-dev.sh does) to validate the TLS settings and exit.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    devTlsArgs()
  } catch (error) {
    console.error(`Error: ${error.message}`)
    process.exit(1)
  }
}
