import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  calculateMiningPopupPosition,
  getMiningLookupRequest
} from '../src/lib/modules/mining-dictionary.ts'

const cue = {
  id: 'cue',
  trackId: 'track',
  start: 0,
  end: 1,
  readOrder: 0,
  rawText: '今日は日本語です。次',
  plainText: '今日は日本語です。次'
}

test('builds an offline lookup request with full subtitle text and a UTF-16 offset', () => {
  assert.deepEqual(getMiningLookupRequest(cue, { utf16Offset: 3 }, 64, true, 100), {
    text: cue.plainText,
    offset: 3,
    scanLength: 64,
    maxResults: 50
  })
  assert.equal(getMiningLookupRequest(cue, { utf16Offset: 3 }, 0, true, 0)?.scanLength, 1)
})

test('can reject lookup tails without Japanese text', () => {
  const englishCue = { ...cue, rawText: 'hello world', plainText: 'hello world' }
  assert.equal(getMiningLookupRequest(englishCue, { utf16Offset: 0 }, 16, false, 5), undefined)
  assert.equal(getMiningLookupRequest(englishCue, { utf16Offset: 0 }, 16, true, 5)?.text, 'hello world')
})

test('never contains a web dictionary or network fallback', async () => {
  const source = await readFile(new URL('../src/lib/modules/mining-dictionary.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /\bfetch\s*\(/)
  assert.doesNotMatch(source, /jisho\.org/i)
})

test('places the popup below when space permits and above near the bottom edge', () => {
  assert.deepEqual(
    calculateMiningPopupPosition(
      { left: 300, right: 320, top: 100, bottom: 120 },
      { width: 1000, height: 800 },
      320,
      250
    ),
    { left: 300, top: 124, width: 320, height: 250, placement: 'below' }
  )
  const above = calculateMiningPopupPosition(
    { left: 900, right: 920, top: 700, bottom: 720 },
    { width: 1000, height: 800 },
    320,
    250
  )
  assert.deepEqual(above, { left: 674, top: 446, width: 320, height: 250, placement: 'above' })
})
