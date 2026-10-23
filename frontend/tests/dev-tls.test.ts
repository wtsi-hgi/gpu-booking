import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { devTlsArgs } from '../scripts/dev-tls.mjs'

const repoRoot = path.resolve(__dirname, '..', '..')

let dir: string
let cert: string
let key: string

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'gpu-booking-dev-tls-'))
  cert = path.join(dir, 'host.crt')
  key = path.join(dir, 'host.key')
  writeFileSync(cert, 'cert')
  writeFileSync(key, 'key')
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

  it('returns next dev experimental-https args for a readable pair', () => {
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
})
