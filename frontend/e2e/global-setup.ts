import { mkdir } from 'node:fs/promises'
import path from 'node:path'

async function globalSetup() {
  const repoRoot = path.resolve(__dirname, '..', '..')
  const scratchDir = path.join(repoRoot, '.tmp', 'agent', 'playwright')

  await mkdir(scratchDir, { recursive: true })
}

export default globalSetup