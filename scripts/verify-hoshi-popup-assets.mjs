import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const root = new URL('../static/mining-popup/hoshi-android/', import.meta.url)
const manifest = JSON.parse(await readFile(new URL('UPSTREAM.json', root), 'utf8'))
const failures = []

for (const [path, expected] of Object.entries(manifest.files)) {
  const content = await readFile(new URL(path, root))
  const actual = createHash('sha256').update(content).digest('hex')
  if (actual !== expected) failures.push(`${path}: expected ${expected}, got ${actual}`)
}

if (failures.length) {
  throw new Error(`Vendored Hoshi popup assets differ from UPSTREAM.json:\n${failures.join('\n')}`)
}

console.log(`Verified ${Object.keys(manifest.files).length} Hoshi popup assets from ${manifest.commit}.`)
