import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const popup = await readFile(
  new URL('../static/mining-popup/hoshi-android/popup.js', import.meta.url),
  'utf8'
)
const bridge = await readFile(
  new URL('../static/mining-popup/hoshi-android/bridge.js', import.meta.url),
  'utf8'
)

test('popup exposes clickable kanji and renders kanji dictionary results', () => {
  assert.match(popup, /className: 'kanji-char'/)
  assert.match(popup, /function updateKanjiAvailability/)
  assert.match(popup, /kanjiLookup\.postMessage/)
  assert.match(popup, /kanji-char\[data-kanji-entry="true"\]/)
  assert.match(popup, /function buildKanjiEntry/)
  assert.match(popup, /kanjiRedirect\.postMessage/)
  assert.match(bridge, /request\('kanjiLookup', character\)/)
  assert.match(bridge, /request\('kanjiRedirect', character\)/)
})
