import { statSync, accessSync, constants } from 'node:fs'

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

/**
 * Returns the extra `next dev` arguments that serve over HTTPS with the
 * operator-supplied certificate, or an empty list when TLS is not configured.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {string[]}
 */
export function devTlsArgs(env = process.env) {
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

  return [
    '--experimental-https',
    '--experimental-https-key',
    key,
    '--experimental-https-cert',
    cert,
  ]
}
