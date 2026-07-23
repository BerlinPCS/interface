import assert from 'node:assert/strict'
import test from 'node:test'

import {
  beginMiningPlaybackSession,
  createMiningCue,
  extractMiningPlainText,
  findActiveMiningCues,
  findMiningCueAt,
  miningCueSeekTime,
  navigateMiningCue,
  parseAssMiningCues,
  segmentMiningGraphemes,
  shouldResumeAfterMining,
  sortAndDeduplicateMiningCues
} from '../src/lib/modules/mining.ts'

const cue = (start, end, readOrder, rawText = `cue ${readOrder}`) => createMiningCue({
  trackId: '1',
  start,
  end,
  readOrder,
  rawText
})

test('extracts visible subtitle text without normalizing Japanese', () => {
  assert.equal(
    extractMiningPlainText('{\\an8}食{\\k20}べる\\N<i>猫</i> &amp; 犬\\hです'),
    '食べる\n猫 & 犬\u00a0です'
  )
  assert.equal(extractMiningPlainText('{\\p1}m 0 0 l 10 10{\\p0}字幕'), '字幕')
  assert.equal(extractMiningPlainText('ＡＢＣ'), 'ＡＢＣ')
})

test('parses reordered ASS fields and ignores comments and empty events', () => {
  const ass = `[Script Info]
[Events]
Format: Name, End, Start, Style, Text
Dialogue: Alice,0:00:03.50,0:00:02.00,Default,hello, world
Comment: Bob,0:00:05.00,0:00:04.00,Default,ignore
Dialogue: Bob,0:00:06.00,0:00:05.00,Sign,{\\p1}m 0 0 l 1 1`
  assert.deepEqual(parseAssMiningCues(ass, '7').map(({ start, end, speaker, style, plainText }) => ({
    start,
    end,
    speaker,
    style,
    plainText
  })), [{
    start: 2,
    end: 3.5,
    speaker: 'Alice',
    style: 'Default',
    plainText: 'hello, world'
  }])
})

test('sorts, deduplicates, resolves overlaps, and falls back around gaps', () => {
  const cues = sortAndDeduplicateMiningCues([
    cue(5, 7, 2),
    cue(1, 3, 0),
    cue(5, 8, 1),
    cue(5, 8, 1)
  ].filter(Boolean))

  assert.deepEqual(cues.map(value => value.readOrder), [0, 1, 2])
  assert.equal(findMiningCueAt(cues, 5.5)?.readOrder, 1)
  assert.equal(findMiningCueAt(cues, 4)?.readOrder, 0)
  assert.equal(findMiningCueAt(cues, 0)?.readOrder, 0)
  assert.deepEqual(findActiveMiningCues(cues, 5.5).map(value => value.readOrder), [1, 2])
  assert.deepEqual(findActiveMiningCues(cues, 4), [])
})

test('navigates one cue at a time and clamps at both ends', () => {
  const cues = [cue(1, 2, 0), cue(3, 4, 1), cue(5, 6, 2)].filter(Boolean)
  assert.equal(navigateMiningCue(cues, cues[1]?.id, -1)?.id, cues[0]?.id)
  assert.equal(navigateMiningCue(cues, cues[1]?.id, 1)?.id, cues[2]?.id)
  assert.equal(navigateMiningCue(cues, cues[0]?.id, -1)?.id, cues[0]?.id)
  assert.equal(navigateMiningCue(cues, cues[2]?.id, 1)?.id, cues[2]?.id)
  assert.equal(navigateMiningCue(cues, undefined, 1)?.id, cues[0]?.id)
  assert.equal(navigateMiningCue(cues, undefined, -1, 0), undefined)
  assert.equal(navigateMiningCue(cues, undefined, 1, 0)?.id, cues[0]?.id)
  assert.equal(navigateMiningCue(cues, undefined, -1, 4.5)?.id, cues[1]?.id)
  assert.equal(navigateMiningCue(cues, undefined, 1, 4.5)?.id, cues[2]?.id)
  assert.equal(navigateMiningCue(cues, undefined, 1, 7), undefined)
  assert.equal(miningCueSeekTime(cues[1], 0.4), 2.6)
  assert.equal(miningCueSeekTime(cues[0], 2), 0)
})

test('restores the playback state from before mining mode', () => {
  const session = beginMiningPlaybackSession(false, true)
  assert.equal(session.wasPlaying, true)
  assert.equal(session.autoPaused, true)
  assert.equal(shouldResumeAfterMining(session), true)
  assert.equal(shouldResumeAfterMining(beginMiningPlaybackSession(true, true)), false)
  assert.equal(shouldResumeAfterMining(beginMiningPlaybackSession(false, false)), true)
})

test('segments graphemes while retaining UTF-16 offsets', () => {
  assert.deepEqual(segmentMiningGraphemes('食𠮷か\u3099\n ').map(grapheme => ({
    text: grapheme.text,
    offset: grapheme.utf16Offset,
    length: grapheme.utf16Length,
    lineBreak: grapheme.lineBreak,
    whitespace: grapheme.whitespace
  })), [
    { text: '食', offset: 0, length: 1, lineBreak: false, whitespace: false },
    { text: '𠮷', offset: 1, length: 2, lineBreak: false, whitespace: false },
    { text: 'か\u3099', offset: 3, length: 2, lineBreak: false, whitespace: false },
    { text: '\n', offset: 5, length: 1, lineBreak: true, whitespace: true },
    { text: ' ', offset: 6, length: 1, lineBreak: false, whitespace: true }
  ])
})
