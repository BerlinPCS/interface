import assert from 'node:assert/strict'
import test from 'node:test'
import { watchedRange } from '../src/lib/modules/mining/watch-sample.ts'

test('accepts playback and rate changes, rejects seeks, stalls, sleep and episode switches', () => {
  assert.deepEqual(watchedRange(1200, 1205, 5, 1, false, true), [1200, 1205])
  assert.deepEqual(watchedRange(1200, 1210, 5, 2, false, true), [1200, 1210])
  for (const args of [
    [20, 1400, 5, 1, false, true], [20, 25, 5, 1, true, true],
    [1200, 100, 5, 1, false, true], [20, 20, 5, 1, false, true],
    [20, 50, 30, 1, false, true], [20, 25, 5, 1, false, false]
  ]) assert.deepEqual(watchedRange(...args), [0, 0])
})
