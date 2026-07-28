import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const settings = await readFile(
  new URL('../src/routes/app/settings/mining/mining-dictionaries-settings.svelte', import.meta.url),
  'utf8'
)

test('dictionary settings show backend health warnings globally and beside each dictionary', () => {
  assert.match(settings, /warningDictionaries = state\.dictionaries\.filter/)
  assert.match(settings, /Hover the warning beside a dictionary for details/)
  assert.match(settings, /dictionary\.warnings\.join\('\\n'\)/)
  assert.match(settings, /TriangleAlert/)
})
