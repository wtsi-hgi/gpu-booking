import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { devTlsArgs } from '../scripts/dev-tls.mjs'

const repoRoot = path.resolve(__dirname, '..', '..')

let dir: string
let cert: string
let key: string
let otherKey: string

// Writes a self-signed certificate and its key into dir, as `name`.crt/.key.
function makeCertPair(name: string): [string, string] {
  const certPath = path.join(dir, `${name}.crt`)
  const keyPath = path.join(dir, `${name}.key`)
  const result = spawnSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'ec',
      '-pkeyopt',
      'ec_paramgen_curve:P-256',
      '-nodes',
      '-days',
      '30',
      '-subj',
      '/CN=localhost',
      '-keyout',
      keyPath,
      '-out',
      certPath,
    ],
    { encoding: 'utf8' }
  )
  if (result.status !== 0) {
    throw new Error(`openssl failed: ${result.stderr}`)
  }
  return [certPath, keyPath]
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'gpu-booking-dev-tls-'))
  ;[cert, key] = makeCertPair('host')
  ;[, otherKey] = makeCertPair('other')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('devTlsArgs', () => {
  it('returns no extra args when neither TLS variable is set', () => {
    expect(devTlsArgs({})).toEqual([])
    expect(
      devTlsArgs({ GPU_BOOKING_TLS_CERT: '', GPU_BOOKING_TLS_KEY: '' })
    ).toEqual([])
  })

  it('returns next dev experimental-https args for a valid matching pair', () => {
    expect(
      devTlsArgs({ GPU_BOOKING_TLS_CERT: cert, GPU_BOOKING_TLS_KEY: key })
    ).toEqual([
      '--experimental-https',
      '--experimental-https-key',
      key,
      '--experimental-https-cert',
      cert,
    ])
  })

  it('rejects only one of the pair being set', () => {
    expect(() => devTlsArgs({ GPU_BOOKING_TLS_CERT: cert })).toThrow(
      /GPU_BOOKING_TLS_CERT and GPU_BOOKING_TLS_KEY must be set together/
    )
    expect(() => devTlsArgs({ GPU_BOOKING_TLS_KEY: key })).toThrow(
      /must be set together/
    )
  })

  it('rejects missing, unreadable, or non-file paths', () => {
    expect(() =>
      devTlsArgs({
        GPU_BOOKING_TLS_CERT: path.join(dir, 'missing.crt'),
        GPU_BOOKING_TLS_KEY: key,
      })
    ).toThrow(/GPU_BOOKING_TLS_CERT is not a readable file: .*missing\.crt/)

    expect(() =>
      devTlsArgs({ GPU_BOOKING_TLS_CERT: cert, GPU_BOOKING_TLS_KEY: dir })
    ).toThrow(/GPU_BOOKING_TLS_KEY is not a readable file/)

    if (process.getuid?.() !== 0) {
      chmodSync(key, 0o000)
      expect(() =>
        devTlsArgs({ GPU_BOOKING_TLS_CERT: cert, GPU_BOOKING_TLS_KEY: key })
      ).toThrow(/GPU_BOOKING_TLS_KEY is not a readable file/)
    }
  })

  it('rejects a key that does not match the certificate', () => {
    expect(() =>
      devTlsArgs({ GPU_BOOKING_TLS_CERT: cert, GPU_BOOKING_TLS_KEY: otherKey })
    ).toThrow(
      /GPU_BOOKING_TLS_KEY \(.*other\.key\) does not match the certificate/
    )
  })

  it('rejects the certificate given as the key', () => {
    expect(() =>
      devTlsArgs({ GPU_BOOKING_TLS_CERT: cert, GPU_BOOKING_TLS_KEY: cert })
    ).toThrow(
      /GPU_BOOKING_TLS_KEY \(.*host\.crt\) is not a PEM private key; did you point it at the certificate\?/
    )
  })

  it('rejects the key given as the certificate', () => {
    expect(() =>
      devTlsArgs({ GPU_BOOKING_TLS_CERT: key, GPU_BOOKING_TLS_KEY: key })
    ).toThrow(/GPU_BOOKING_TLS_CERT \(.*host\.key\) is not a PEM X\.509/)
  })

  it('rejects an expired certificate', () => {
    const later = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000)
    expect(() =>
      devTlsArgs(
        { GPU_BOOKING_TLS_CERT: cert, GPU_BOOKING_TLS_KEY: key },
        later
      )
    ).toThrow(/GPU_BOOKING_TLS_CERT \(.*host\.crt\) expired on /)
  })
})

describe('TLS misconfiguration fails before any server starts', () => {
  it('pnpm dev script exits with a clear error when only the cert is set', () => {
    const result = spawnSync(
      process.execPath,
      [path.join(repoRoot, 'frontend', 'scripts', 'dev.mjs')],
      {
        env: {
          ...process.env,
          GPU_BOOKING_TLS_CERT: cert,
          GPU_BOOKING_TLS_KEY: '',
        },
        encoding: 'utf8',
      }
    )

    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/must be set together/)
  })

  it('run-dev.sh exits with a clear error when the key file is unreadable', () => {
    const result = spawnSync(path.join(repoRoot, 'run-dev.sh'), [], {
      cwd: dir,
      env: {
        ...process.env,
        GPU_BOOKING_TLS_CERT: cert,
        GPU_BOOKING_TLS_KEY: path.join(dir, 'missing.key'),
      },
      encoding: 'utf8',
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/GPU_BOOKING_TLS_KEY is not a readable file/)
    expect(result.stdout).not.toMatch(/Starting backend/)
  })

  it('run-dev.sh exits with a clear error when only the key is set', () => {
    const result = spawnSync(path.join(repoRoot, 'run-dev.sh'), [], {
      cwd: dir,
      env: {
        ...process.env,
        GPU_BOOKING_TLS_CERT: '',
        GPU_BOOKING_TLS_KEY: key,
      },
      encoding: 'utf8',
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/must be set together/)
    expect(result.stdout).not.toMatch(/Starting backend/)
  })

  it('run-dev.sh exits with a clear error when the key is the certificate', () => {
    const result = spawnSync(path.join(repoRoot, 'run-dev.sh'), [], {
      cwd: dir,
      env: {
        ...process.env,
        GPU_BOOKING_TLS_CERT: cert,
        GPU_BOOKING_TLS_KEY: cert,
      },
      encoding: 'utf8',
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(
      /GPU_BOOKING_TLS_KEY \(.*host\.crt\) is not a PEM private key; did you point it at the certificate\?/
    )
    expect(result.stdout).not.toMatch(/Starting backend/)
  })
})

// Each run-dev.sh run waits a second or two for the fake backend to exit.
describe('run-dev.sh ports and startup failures', { timeout: 30_000 }, () => {
  // A copy of run-dev.sh beside a fake backend that logs a message and exits,
  // so the script fails its first readiness wait without starting servers.
  function runCopy(
    dotenv: string,
    env: Record<string, string> = {},
    args: string[] = []
  ) {
    const root = path.join(dir, 'repo')
    mkdirSync(path.join(root, 'backend'), { recursive: true })
    copyFileSync(
      path.join(repoRoot, 'run-dev.sh'),
      path.join(root, 'run-dev.sh')
    )
    const backend = path.join(root, 'backend', 'run_uvicorn.sh')
    writeFileSync(
      backend,
      '#!/usr/bin/env bash\necho "fake backend failed on port $GPU_BOOKING_BACKEND_PORT"\nexit 1\n'
    )
    chmodSync(backend, 0o755)
    writeFileSync(path.join(root, '.env'), dotenv)
    const baseEnv: Record<string, string | undefined> = { ...process.env }
    for (const name of [
      'GPU_BOOKING_FRONTEND_PORT',
      'GPU_BOOKING_BACKEND_PORT',
      'FRONTEND_PORT',
      'BACKEND_PORT',
      'GPU_BOOKING_TLS_CERT',
      'GPU_BOOKING_TLS_KEY',
    ]) {
      delete baseEnv[name]
    }
    return spawnSync(path.join(root, 'run-dev.sh'), args, {
      cwd: root,
      env: { ...baseEnv, ...env },
      encoding: 'utf8',
      timeout: 30_000,
    })
  }

  it('reads ports from the repo-root .env and shows the failing log', () => {
    const result = runCopy(
      'OTHER=$(touch pwned)\nGPU_BOOKING_FRONTEND_PORT=4123\nexport GPU_BOOKING_BACKEND_PORT=9123\r\n'
    )

    expect(result.stdout).toMatch(/Starting backend on port 9123/)
    expect(result.stdout).toMatch(
      /Starting frontend on http:\/\/localhost:4123/
    )
    expect(result.stdout).toMatch(/Backend process exited early/)
    expect(result.stdout).toMatch(/Last 20 lines of logs\/backend\.log:/)
    expect(result.stdout).toMatch(/fake backend failed on port 9123/)
    expect(result.status).not.toBe(0)
    expect(existsSync(path.join(dir, 'repo', 'pwned'))).toBe(false)
  })

  it('lets the environment and flags override .env ports', () => {
    const dotenv =
      'GPU_BOOKING_FRONTEND_PORT=4123\nGPU_BOOKING_BACKEND_PORT=9123\n'

    const fromEnv = runCopy(dotenv, {
      GPU_BOOKING_FRONTEND_PORT: '4555',
      GPU_BOOKING_BACKEND_PORT: '9555',
    })
    expect(fromEnv.stdout).toMatch(/Starting backend on port 9555/)
    expect(fromEnv.stdout).toMatch(/localhost:4555/)

    const fromFlags = runCopy(dotenv, { GPU_BOOKING_BACKEND_PORT: '9555' }, [
      '--frontend-port',
      '4777',
      '--backend-port',
      '9777',
    ])
    expect(fromFlags.stdout).toMatch(/Starting backend on port 9777/)
    expect(fromFlags.stdout).toMatch(/localhost:4777/)
  })

  it('rejects a non-numeric .env port before starting anything', () => {
    const result = runCopy('GPU_BOOKING_BACKEND_PORT="9123"\n')

    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/BACKEND_PORT must be a port number/)
    expect(result.stdout).not.toMatch(/Starting backend/)
  })
})
