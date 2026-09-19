import assert from 'node:assert/strict'
import test from 'node:test'
import { matchSubtitleWindows, distinctCues, dialogueCue } from '../src/lib/components/ui/player/subtitle-matcher.ts'
import { matchesSubtitlePreference, subtitlePairKey, exactSubtitleKey, safeSubtitleGap, readSubtitleMemory, writeSubtitleMemory } from '../src/lib/components/ui/player/subtitle-preferences.ts'
import { advanceAlignment, initialAlignmentProgress } from '../src/lib/components/ui/player/subtitle-profiles.ts'

const starts = [2, 5.4, 11.7, 16.1, 24, 31.3, 38.8, 47, 54.9]
const windows = [0, 240].map((start, index) => ({ id: String(index), start, end: start + 60, cues: starts.map((t, i) => ({ start: start + t + index * i * 0.17, end: start + t + index * i * 0.17 + 1.3 })) }))
const target = (offsets = [5, 5]) => windows.flatMap((window, i) => window.cues.map(cue => ({ start: cue.start - offsets[i], end: cue.end - offsets[i] })))
test('accepts independent windows and returns evidence for positive, negative and zero timing', () => {
  for (const offset of [0, 5, -7.3]) {
    const result = matchSubtitleWindows(windows, target([offset, offset]))
    assert.equal(result.accepted, true, JSON.stringify(result))
    assert.equal(result.offset, offset)
    assert.equal(result.windows.length, 2)
  }
})
test('rejects duplicate, overlapping, sparse and periodic evidence', () => {
  assert.equal(matchSubtitleWindows([windows[0], windows[0]], target()).accepted, false)
  const periodic = [0, 240].map(start => ({ id: String(start), start, end: start + 60, cues: Array.from({ length: 15 }, (_, i) => ({ start: start + i * 4, end: start + i * 4 + 1 })) }))
  assert.equal(matchSubtitleWindows(periodic, Array.from({ length: 100 }, (_, i) => ({ start: i * 4, end: i * 4 + 1 }))).accepted, false)
  const duplicates = windows.map(window => ({ ...window, cues: Array(20).fill(window.cues[0]) }))
  assert.equal(matchSubtitleWindows(duplicates, target()).accepted, false)
  assert.equal(distinctCues(duplicates[0].cues).length, 1)
})
test('rejects different cuts and unrelated timing', () => {
  assert.equal(matchSubtitleWindows(windows, target([5, 15])).reason, 'inconsistent-windows')
  assert.equal(matchSubtitleWindows(windows, [{ start: 900, end: 901 }]).accepted, false)
  assert.equal(dialogueCue('{\\k20}song', 'Default'), false)
  assert.equal(dialogueCue('駅', 'Signs'), false)
  assert.equal(dialogueCue('hello', 'Default'), true)
})
test('zero correction actually restores the applied timeline', () => {
  const update = advanceAlignment(initialAlignmentProgress({ offset: 5, updatedAt: 1 }), 0, 12)
  assert.equal(update.applyOffset, true)
  assert.equal(update.progress.offset, 0)
})
test('selection uses stable identity and offsets distinguish video releases and unknown profiles', () => {
  const preference = { off: false, source: 'jimaku', language: 'ja', profile: 'group:example', forced: false, name: 'Show 01' }
  const next = { ...preference, language: 'jpn', name: 'Show 02', number: '1007' }
  assert.equal(matchesSubtitlePreference(preference, next), true)
  assert.equal(matchesSubtitlePreference({ off: true }, next), false)
  assert.equal(matchesSubtitlePreference(preference, { ...next, source: 'embedded' }), false)
  assert.equal(subtitlePairKey(1, 'ep1', 'release', preference, 'a'), subtitlePairKey(1, 'ep2', 'release', preference, 'b'))
  assert.notEqual(subtitlePairKey(1, 'ep1', undefined, preference, 'a'), subtitlePairKey(1, 'ep2', undefined, preference, 'a'))
  assert.notEqual(subtitlePairKey(1, 'ep1', 'known-video-release', { off: false, source: 'embedded', language: 'eng' }, 'embedded:2'), subtitlePairKey(1, 'ep2', 'known-video-release', { off: false, source: 'embedded', language: 'eng' }, 'embedded:2'))
  assert.notEqual(exactSubtitleKey('videoA', 'subs'), exactSubtitleKey('videoB', 'subs'))
})
test('safe application checks both timelines and the full 250 ms gap', () => {
  assert.equal(safeSubtitleGap([{ start: 1, end: 3 }], [], 2, 0), false)
  assert.equal(safeSubtitleGap([], [{ start: 0, end: 1 }], 5, 5), false)
  assert.equal(safeSubtitleGap([], [{ start: 5.2, end: 6 }], 5, 0), false)
  assert.equal(safeSubtitleGap([], [{ start: 5.3, end: 6 }], 5, 0), true)
})
test('show preferences, release offsets and episode overrides survive reload without reading legacy cache', () => {
  const values = new Map([['jimaku-subtitle-offsets-v1', '{"1:release":{"offset":88,"updatedAt":1}}']])
  globalThis.localStorage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) }
  const memory = readSubtitleMemory()
  assert.deepEqual(memory.exact, {})
  memory.shows['1'] = { off: true }
  memory.manual.pair = 2
  memory.episodes.episode = -1
  writeSubtitleMemory(memory)
  assert.deepEqual(readSubtitleMemory(), memory)
  delete globalThis.localStorage
})

test('diagnostics retain matched onsets and window evidence for rejected estimates', () => {
  const input = target().map((cue, i) => ({ ...cue, text: `candidate ${i}` }))
  const references = windows.map(window => ({ ...window, cues: window.cues.map(cue => ({ ...cue, text: 'reference' })) }))
  const result = matchSubtitleWindows([references[0]], input)
  assert.equal(result.accepted, false)
  assert.equal(result.windows[0].windowId, '0')
  assert.equal(result.windows[0].referenceCount, starts.length)
  assert.equal(result.windows[0].pairs.length, result.windows[0].matches)
  assert.equal(result.windows[0].pairs[0].referenceText, 'reference')
  assert.equal(result.windows[0].pairs[0].candidateText, 'candidate 0')
  for (const pair of result.windows[0].pairs) assert.ok(Math.abs(pair.error) < 1e-8)
})

test('cached CC timestamps verify through joint evidence without weakening the individual margin', async () => {
  const { readFile } = await import('node:fs/promises')
  const f = JSON.parse(await readFile(new URL('./fixtures/subtitle-joint-evidence.json', import.meta.url), 'utf8'))
  const cc = matchSubtitleWindows(f.windows, f.closedCaptions)
  const dialogue = matchSubtitleWindows(f.windows, f.dialogue)
  assert.equal(dialogue.accepted, true)
  assert.equal(cc.reason, 'accepted-joint-evidence')
  assert.equal(cc.offset, dialogue.offset)
  assert.equal(cc.windows.filter(window => window.margin >= 0.15).length, 1)
  assert.equal(cc.support, 36 / 43)
  assert.ok(cc.joint.margin > 0.3)
  assert.ok(cc.joint.holdoutMargin > 0.25)
  const ambiguous = matchSubtitleWindows(f.windows.slice(0, 3), f.closedCaptions)
  assert.equal(ambiguous.accepted, false)
  assert.equal(ambiguous.reason, 'ambiguous-offset')
  assert.ok(ambiguous.support > 0.8, 'rejection retains the observed match support')
  assert.equal(matchSubtitleWindows([f.windows[0], f.windows[0], f.windows[0], f.windows[3]], f.closedCaptions).accepted, false)
  const differentCut = f.closedCaptions.map(cue => cue.start >= 600 ? { start: cue.start + 12, end: cue.end + 12 } : cue)
  assert.equal(matchSubtitleWindows(f.windows, differentCut).reason, 'inconsistent-windows')
})

test('one clear scene cannot validate otherwise periodic ambiguous windows', () => {
  const anchor = windows[0]
  const repeating = [240, 600, 960].map(start => ({ id: String(start), start, end: start + 60, cues: Array.from({ length: 15 }, (_, i) => ({ start: start + 2 + i * 4, end: start + 3.3 + i * 4 })) }))
  const target = [...anchor.cues, ...repeating.flatMap(window => Array.from({ length: 76 }, (_, i) => ({ start: window.start - 118 + i * 4, end: window.start - 116.7 + i * 4 })))]
  const result = matchSubtitleWindows([anchor, ...repeating], target)
  assert.equal(result.accepted, false)
  assert.equal(result.reason, 'ambiguous-offset')
  assert.ok(result.joint.holdoutMargin < 0.05)
})

test('joint evidence rejects unrelated timestamp sequences across seeded trials', () => {
  let seed = 1987
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
  const reference = [0, 240, 480, 720].map(start => ({ id: String(start), start, end: start + 60, cues: starts.map(t => ({ start: start + t, end: start + t + 1.3 })) }))
  for (let trial = 0; trial < 30; trial++) {
    const unrelated = Array.from({ length: 150 }, () => { const start = random() * 850; return { start, end: start + 1.3 } })
    assert.equal(matchSubtitleWindows(reference, unrelated).accepted, false, `trial ${trial}`)
  }
})

test('a contradictory window remains a cut warning even with fewer than six matches', () => {
  const third = { id: 'cut', start: 600, end: 660, cues: starts.slice(0, 7).map(start => ({ start: 600 + start, end: 601.3 + start })) }
  const differentCut = [...target(), ...third.cues.slice(0, 5).map(cue => ({ start: cue.start - 15, end: cue.end - 15 }))]
  const result = matchSubtitleWindows([...windows, third], differentCut)
  assert.equal(result.windows[2].matches, 5)
  assert.equal(result.reason, 'inconsistent-windows')
})

test('opening and ending style variants cannot become dialogue evidence', () => {
  for (const style of ['OPStyle', 'EDStyle', 'OP Romaji', 'ED-Kanji', 'OP2', 'Opening English', 'Song Lyrics']) assert.equal(dialogueCue('{\\pos(50,50)\\t(0,100,\\alpha&HFF&)}word', style), false, style)
  for (const style of ['Default', 'Dialogue', 'Top', 'Shopkeeper']) assert.equal(dialogueCue('hello', style), true, style)
})

test('first-window policy accepts the strong Girls Band Cry fixture and rejects Nanako ambiguity', async () => {
  const { readFile } = await import('node:fs/promises')
  const { firstWindowOffset } = await import('../src/lib/components/ui/player/subtitle-matcher.ts')
  const fixture = JSON.parse(await readFile(new URL('./fixtures/subtitle-early-evidence.json', import.meta.url), 'utf8'))
  const estimates = fixture.references.map(windows => matchSubtitleWindows(windows, fixture.strong))
  assert.equal(firstWindowOffset(estimates), 0.1)
  assert.equal(firstWindowOffset(fixture.references.map(windows => matchSubtitleWindows(windows, fixture.ambiguous))), undefined)
  assert.equal(firstWindowOffset([...estimates, { accepted: false, confidence: 0, windows: [{ offset: 4, matches: 12, support: 1, margin: 0.3 }], reason: 'insufficient-evidence' }]), undefined)
  assert.equal(firstWindowOffset([{ ...estimates[1], windows: [...estimates[1].windows, ...estimates[1].windows] }]), undefined)
})
