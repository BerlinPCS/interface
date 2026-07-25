import assert from 'node:assert/strict'
import test from 'node:test'

import {
  RECOMMENDED_MINING_DICTIONARY_CSS,
  RECOMMENDED_MINING_DICTIONARY_OUTER_CSS
} from '../src/lib/modules/mining-dictionary.ts'

test('recommended popup CSS keeps dictionary labels unchanged', () => {
  assert.doesNotMatch(RECOMMENDED_MINING_DICTIONARY_CSS, /\.dict-label/)
  assert.match(RECOMMENDED_MINING_DICTIONARY_CSS, /\.frequency-dict-label/)
  assert.match(RECOMMENDED_MINING_DICTIONARY_CSS, /\.pitch-dict-label/)
})

test('recommended outer CSS uses the Hoshi popup selector', () => {
  assert.match(RECOMMENDED_MINING_DICTIONARY_OUTER_CSS, /^iframe\.hoshi-popup/)
  assert.doesNotMatch(RECOMMENDED_MINING_DICTIONARY_OUTER_CSS, /yomitan/i)
})
