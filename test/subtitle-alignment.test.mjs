import assert from 'node:assert/strict'
import test from 'node:test'

import {
  findSubtitleAlignment,
  parseAssCues,
  shouldAttemptSubtitleAlignment,
  shiftAssDialogue
} from '../src/lib/components/ui/player/subtitle-alignment.ts'

const starts = [3, 7.5, 13, 18.2, 26, 31.4, 39, 48.5, 57, 63.8, 72, 84]
const cues = (offset = 0) => starts.map((start, index) => ({
  start: start + offset,
  end: start + offset + 0.8 + (index % 3) * 0.35
}))

test('finds positive, negative, and zero offsets', () => {
  assert.equal(findSubtitleAlignment(cues(), cues(-5))?.offset, 5)
  assert.equal(findSubtitleAlignment(cues(), cues(7.3))?.offset, -7.300000000000001)
  assert.equal(findSubtitleAlignment(cues(), cues())?.offset, 0)
})

test('requires at least four reference and target cues', () => {
  assert.equal(findSubtitleAlignment(cues().slice(0, 3), cues(-5)), undefined)
  assert.equal(findSubtitleAlignment(cues(), cues(-5).slice(0, 3)), undefined)
})

test('rejects unrelated cues while allowing an aggressive ambiguous estimate', () => {
  const unrelated = starts.map((_, index) => ({ start: index * 2, end: index * 2 + 0.2 }))
  assert.equal(findSubtitleAlignment(cues(), unrelated), undefined)

  const periodic = Array.from({ length: 12 }, (_, index) => ({ start: index * 4, end: index * 4 + 1 }))
  assert.equal(findSubtitleAlignment(periodic, periodic)?.offset, 0)
})

test('tries aggressively at first and continues checking as cues arrive', () => {
  assert.equal(shouldAttemptSubtitleAlignment(3), false)
  for (const count of [4, 8, 12, 16, 24, 32, 48, 64, 96]) assert.equal(shouldAttemptSubtitleAlignment(count), true)
  for (const count of [5, 20, 40, 80]) assert.equal(shouldAttemptSubtitleAlignment(count), false)
})

test('parses reordered ASS fields and preserves commas in dialogue text', () => {
  const ass = `[Script Info]\r\n[Events]\r\nFormat: Layer, End, Start, Style, Text\r\nDialogue: 0,0:00:03.50,0:00:02.00,Default,hello, world\r\nComment: 0,0:00:09.00,0:00:08.00,Default,ignore me\r\nDialogue: malformed\r\n`
  assert.deepEqual(parseAssCues(ass), [{ start: 2, end: 3.5 }])

  const shifted = shiftAssDialogue(ass, 1.25)
  assert.match(shifted, /Dialogue: 0,0:00:04\.75,0:00:03\.25,Default,hello, world/)
  assert.match(shifted, /Comment: 0,0:00:09\.00,0:00:08\.00,Default,ignore me/)
  assert.ok(shifted.includes('\r\n'))
})

test('parses and shifts Hayase SRT conversions without an explicit event format', () => {
  const ass = `[Events]\n\nDialogue: 0,0:00:03.50,0:00:05.00,Default,,0,0,0,,hello, world`

  assert.deepEqual(parseAssCues(ass), [{ start: 3.5, end: 5 }])
  assert.match(shiftAssDialogue(ass, -2.5), /Dialogue: 0,0:00:01\.00,0:00:02\.50,Default,,0,0,0,,hello, world/)
})

test('clamps shifted timestamps at zero and always shifts from the supplied original', () => {
  const ass = `[Events]\nFormat: Layer, Start, End, Style, Text\nDialogue: 0,0:00:01.00,0:00:02.50,Default,test\n`
  const shifted = shiftAssDialogue(ass, -2)
  assert.match(shifted, /Dialogue: 0,0:00:00\.00,0:00:00\.50,Default,test/)
  assert.equal(shiftAssDialogue(ass, -2), shifted)
})
