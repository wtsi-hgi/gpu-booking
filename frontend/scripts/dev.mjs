// Start `next dev`, adding HTTPS flags when GPU_BOOKING_TLS_CERT/KEY are set.
import { spawn } from 'node:child_process'

import { devTlsArgs } from './dev-tls.mjs'

let tlsArgs
try {
  tlsArgs = devTlsArgs()
} catch (error) {
  console.error(`Error: ${error.message}`)
  process.exit(1)
}

const port =
  process.env.GPU_BOOKING_FRONTEND_PORT || process.env.FRONTEND_PORT || '3000'

const child = spawn('next', ['dev', '-H', '0.0.0.0', '-p', port, ...tlsArgs], {
  stdio: 'inherit',
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}

child.on('error', (error) => {
  console.error(`Error: failed to start next dev: ${error.message}`)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0))
})
