import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'
import anitomy from 'anitomyscript'
import { writable } from 'simple-store-svelte'
import { get } from 'svelte/store'
import * as preferences from '../src/lib/components/ui/player/subtitle-preferences.ts'
import * as profiles from '../src/lib/components/ui/player/subtitle-profiles.ts'
import * as alignment from '../src/lib/components/ui/player/subtitle-alignment.ts'
import * as matcher from '../src/lib/components/ui/player/subtitle-matcher.ts'
import * as mining from '../src/lib/modules/mining/subtitle.ts'

// Run the actual controller with only browser/native side effects replaced.
const source = await readFile(new URL('../src/lib/components/ui/player/subtitles.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }, transformers: { before: [() => node => ts.factory.updateSourceFile(node, node.statements.filter(statement => !ts.isImportDeclaration(statement)))] } }).outputText.replace('export default class Subtitles', 'class Subtitles')
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { resolve, promise } }
const tick = () => new Promise(resolve => setTimeout(resolve, 5))
const ass = (offset = 0) => '[Script Info]\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n' + [2, 8, 17, 29].map(start => `Dialogue: 0,0:00:${String(start + offset).padStart(2, '0')}.00,0:00:${String(start + offset + 2).padStart(2, '0')}.00,Default,,0,0,0,,こんにちは`).join('\n')
class HashMap extends Map { add (key, value) { this.set(JSON.stringify(key), value) } has (key) { return super.has(JSON.stringify(key)) } [Symbol.iterator] () { return this.values() } }
class Renderer {
  ready = Promise.resolve()
  rendered = ''
  _canvas = { style: { visibility: '' } }
  renderer = { setTrack: async text => { this.rendered = text }, createEvent: async () => {}, setDefaultFont: async () => {}, addFonts: async () => {}, styleOverride: async () => {}, disableStyleOverride: async () => {} }
  resize = async () => {}
  destroy () { this._destroyed = true }
}
class Worker {
  onmessage
  postMessage () {}
  terminate () {}
}
async function setup (options = {}) {
  const storage = options.storage ?? new Map()
  globalThis.localStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) }
  const settings = writable({ subtitleStyle: 'none', subtitleLanguage: 'jpn', audioLanguage: 'jpn', subtitleAutoRetiming: true, playerSubtitleSelection: null, ...options.settings })
  const query = deferred()
  const embedded = deferred()
  const cancellations = []
  const sampleStarts = []
  const sampleCallbacks = []
  const cache = options.cache ?? new Map()
  const native = { subtitleCacheList: async (hash, id) => cache.get(hash + ':' + id) ?? [], subtitleCachePut: async (hash, id, file) => cache.set(hash + ':' + id, [...(cache.get(hash + ':' + id) ?? []), file]), tracks: () => embedded.promise, subtitles: async () => {}, attachments: async () => [], subtitleSampleStart: async (request, callback) => { sampleStarts.push(request); sampleCallbacks.push(callback) }, subtitleSampleCancel: async id => cancellations.push(id), subtitleSampleUpdate: async () => {} }
  const dependencies = { ...preferences, ...profiles, ...alignment, ...matcher, ...mining, JASSUB: Renderer, TimingWorker: Worker, modernWasmUrl: '', wasmUrl: '', workerUrl: '', writable, get, loadCustomSubtitleFont: async () => undefined, extensions: { subtitlesQuery: () => query.promise }, native, settings, anitomyscript: anitomy, fontRx: /\.ttf$/, subRx: /\.(ass|srt)$/, subtitleExtensions: ['ass', 'srt'], HashMap, toTS: String }
  const Subtitles = new Function(...Object.keys(dependencies), `${compiled}\nreturn Subtitles`)(...Object.values(dependencies))
  const name = `[Video] Show - ${options.episode ?? '01'} [1080p].mkv`
  const parsed = (await anitomy([name]))[0]
  const controller = new Subtitles(undefined, [], { file: { name, hash: options.hash ?? 'torrent', id: Number(options.episode ?? 1), metadata: { parseObject: parsed } }, media: { id: options.show ?? 1 }, episode: Number(options.episode ?? 1) })
  if (!options.delayEmbedded) embedded.resolve([])
  query.resolve(options.results ?? [])
  await tick()
  return { controller, storage, cancellations, query, embedded, cache, sampleStarts, sampleCallbacks }
}
async function add (controller, episode = '01', group = 'Subs') {
  await controller.addSingleSubtitleFile(new File([ass()], `[${group}] Show - ${episode}.ass`), 'jimaku', `group:${group.toLowerCase()}`)
  return [...controller.externalTracks.keys()].at(-1)
}
test('restores selected release and manual offset on the next episode without persisting fallback', async () => {
  const first = await setup()
  const id = await add(first.controller)
  assert.equal(String(first.controller.current.value), id)
  first.controller.setManualDelay(1.7)
  first.controller.destroy()
  const second = await setup({ storage: first.storage, episode: '02' })
  const fallback = await add(second.controller, '02', 'Other')
  assert.equal(String(second.controller.current.value), fallback)
  const preferred = await add(second.controller, '02')
  assert.equal(String(second.controller.current.value), preferred)
  assert.equal(second.controller.manualDelay.value, 1.7)
  assert.equal(second.controller.memory.shows['1'].profile, 'group:subs')
  second.controller.destroy()
})
test('off stays off despite late external tracks, and show preferences are isolated', async () => {
  const first = await setup()
  await add(first.controller)
  await first.controller.selectCaptions(-1, true)
  first.controller.destroy()
  const second = await setup({ storage: first.storage, episode: '02' })
  await add(second.controller, '02')
  assert.equal(second.controller.current.value, -1)
  second.controller.destroy()
  const other = await setup({ storage: first.storage, show: 2 })
  await add(other.controller)
  assert.notEqual(other.controller.current.value, -1)
  other.controller.destroy()
})
test('accepted correction waits for a gap, updates mining and renderer, then freezes', async () => {
  const { controller } = await setup()
  const id = await add(controller)
  controller.updatePlayback({ time: 2.5, duration: 600, buffered: 40, stalled: false }, false, false)
  controller.pending = { track: id, offset: 5 }
  await controller.applyPending()
  assert.equal(controller.externalTracks.get(id).offset, 0)
  controller.updatePlayback({ time: 5, duration: 600, buffered: 40, stalled: false }, false, false)
  await tick()
  assert.equal(controller.externalTracks.get(id).offset, 5)
  assert.equal(controller.getMiningCues()[0].start, 7)
  assert.match(controller.jassub.rendered, /0:00:07.00/)
  assert.equal(controller.frozen, true)
  assert.equal(controller.alignmentStatus.value, 'confirmed')
  controller.destroy()
})
test('manual adjustment cancels queued timing and stale sampling cannot override it', async () => {
  const { controller, cancellations } = await setup()
  const id = await add(controller)
  controller.sampleId = 'old'
  controller.pending = { track: id, offset: 5 }
  controller.setManualDelay(-0.5)
  await controller.applyPending()
  assert.equal(controller.pending, undefined)
  assert.equal(controller.externalTracks.get(id).offset, 0)
  assert.equal(controller.manualDelay.value, -0.5)
  assert.deepEqual(cancellations, ['old'])
  controller.destroy()
})
test('zero correction removes a cached shift and never truncates the final subtitle', async () => {
  const { controller } = await setup()
  const id = await add(controller)
  const state = controller.externalTracks.get(id)
  state.offset = 5
  controller._tracks.value[id].meta.header = alignment.shiftAssDialogue(state.originalHeader, 5)
  controller.pending = { track: id, offset: 0 }
  await controller.applyPending()
  assert.equal(state.offset, 0)
  assert.equal(controller.getMiningCues()[0].start, 2)
  assert.ok(controller.jassub.rendered.endsWith('こんにちは'))
  controller.destroy()
})
test('episode-only manual timing does not leak into the next episode', async () => {
  const first = await setup()
  const id = await add(first.controller)
  await first.controller.selectCaptions(id, true)
  first.controller.setManualDelay(1)
  first.controller.setManualDelay(3, true)
  first.controller.destroy()
  const second = await setup({ storage: first.storage, episode: '02' })
  await add(second.controller, '02')
  assert.equal(second.controller.manualDelay.value, 1)
  second.controller.destroy()
})
test('a slow first download does not block another subtitle or resurrect a destroyed episode', async () => {
  const originalFetch = globalThis.fetch
  const slow = deferred()
  globalThis.fetch = url => url === 'slow' ? slow.promise : Promise.resolve(new Response(ass()))
  try {
    const { controller } = await setup({ results: [
      { extension: 'jimaku', language: '[Slow] Show - 01.ass', url: 'slow' },
      { extension: 'jimaku', language: '[Fast] Show - 01.ass', url: 'fast' }
    ] })
    await tick()
    assert.equal(controller.externalTracks.size, 1)
    assert.equal([...controller.externalTracks.values()][0].profile, 'group:fast')
    assert.notEqual(controller.current.value, -1)
    controller.destroy()
    slow.resolve(new Response(ass()))
    await tick()
    assert.equal(controller.externalTracks.size, 0)
  } finally { globalThis.fetch = originalFetch }
})
test('cached originals restore without provider downloads and stay isolated by video', async () => {
  const first = await setup()
  await add(first.controller)
  first.controller.destroy()
  const originalFetch = globalThis.fetch
  globalThis.fetch = () => assert.fail('cached candidate must not download again')
  try {
    const second = await setup({ cache: first.cache, results: [{ extension: 'jimaku', language: '[Subs] Show - 01.ass', url: 'download' }] })
    await tick()
    assert.equal(second.controller.externalTracks.size, 1)
    assert.equal([...second.controller.externalTracks.values()][0].originalHeader, ass())
    second.controller.destroy()
    const next = await setup({ cache: first.cache, episode: '02' })
    assert.equal(next.controller.externalTracks.size, 0)
    next.controller.destroy()
  } finally { globalThis.fetch = originalFetch }
})
test('late native metadata preserves explicit off', async () => {
  const { controller, embedded } = await setup({ delayEmbedded: true })
  await add(controller)
  await controller.selectCaptions(-1, true)
  embedded.resolve([])
  await tick()
  assert.equal(controller.current.value, -1)
  assert.equal(controller.manualLock, true)
  controller.destroy()
})
test('late embedded preference replaces an automatic fallback only during a safe gap', async () => {
  const preference = { off: false, source: 'embedded', language: 'eng', profile: 'dialogue', forced: false, name: 'Dialogue', number: '2' }
  const { controller, embedded } = await setup({ delayEmbedded: true, settings: { playerSubtitleSelection: preference } })
  const fallback = await add(controller)
  controller.updatePlayback({ time: 2.5, duration: 600, buffered: 40, stalled: false }, false, false)
  embedded.resolve([{ number: 2, name: 'Dialogue', language: 'eng', type: 'ass', header: ass(), forced: false, default: true }])
  await tick()
  assert.equal(String(controller.current.value), fallback)
  controller.updatePlayback({ time: 5, duration: 600, buffered: 40, stalled: false }, false, false)
  await tick()
  assert.equal(String(controller.current.value), '2')
  controller.destroy()
})
test('English filenames have stable language identities across episodes and candidates', async () => {
  const first = await setup({ settings: { subtitleLanguage: 'eng' } })
  await first.controller.addSingleSubtitleFile(new File([ass().replaceAll('こんにちは', 'Hello')], '[ActualGroup] Show - 01.eng.ass'), 'jimaku')
  const id = [...first.controller.externalTracks.keys()][0]
  await first.controller.selectCaptions(id, true)
  assert.equal(first.controller.preference.language, 'eng')
  first.controller.destroy()
  const second = await setup({ storage: first.storage, episode: '02' })
  await second.controller.addSingleSubtitleFile(new File([ass().replaceAll('こんにちは', 'Hello')], '[ActualGroup] Show - 02.eng.ass'), 'jimaku')
  assert.equal(preferences.matchesSubtitlePreference(second.controller.preference, [...second.controller.identities.values()][0]), true)
  second.controller.destroy()
})
test('explicit edited local imports replace cached content and concurrent identical loads stay singular', async () => {
  const { controller } = await setup()
  const file = new File([ass()], 'local.jpn.ass')
  await controller.addSingleSubtitleFile(file, 'local', undefined, 0, false)
  const id = [...controller.externalTracks.keys()][0]
  const changed = new File([ass(1)], file.name)
  await Promise.all([controller.addSingleSubtitleFile(changed, 'local', undefined, 0, true, true), controller.addSingleSubtitleFile(changed, 'local', undefined, 0, true, true)])
  assert.equal(controller.externalTracks.size, 1)
  assert.equal(String(controller.current.value), id)
  assert.equal(controller.externalTracks.get(id).originalHeader, ass(1))
  assert.equal(controller.getMiningCues()[0].start, 3)
  assert.equal(controller.manualLock, true)
  controller.destroy()
})

test('cache-only analysis starts below playback reserve and missing data waits without repeated sessions', async () => {
  const { controller, sampleStarts, sampleCallbacks } = await setup()
  await add(controller)
  controller.updatePlayback({ time: 198.637391, duration: 1420.053, buffered: 19.543609, stalled: false }, true, false)
  controller.analyseAlignment()
  assert.equal(sampleStarts.length, 1)
  assert.equal(sampleStarts[0].availableOnly, true)
  const initialSequence = controller.workerSequence
  sampleCallbacks[0]({ sessionId: sampleStarts[0].sessionId, done: true, reason: 'buffering', tracks: [], bytesFetched: 0, bytesParsed: 16 })
  for (const buffered of [0, 10, 20]) {
    controller.updatePlayback({ time: 0, duration: 600, buffered, stalled: false }, false, false)
    controller.analyseAlignment()
    assert.equal(sampleStarts.length, 1)
  }
  assert.match(controller.getTimingDiagnostics().reason, /not downloaded yet/)
  assert.ok(controller.workerSequence > initialSequence, 'available evidence is evaluated even while new downloads wait')
  controller.updatePlayback({ time: 0, duration: 600, buffered: 30, stalled: false }, false, false)
  controller.analyseAlignment()
  assert.equal(sampleStarts.length, 2)
  assert.equal(sampleStarts[1].availableOnly, false)
  await controller.selectCaptions(-1, true)
  controller.updatePlayback({ time: 0, duration: 600, buffered: 40, stalled: false }, false, false)
  controller.analyseAlignment()
  assert.equal(sampleStarts.length, 2)
  controller.destroy()
})
test('manual retry aligns downloaded data while paused below 30 seconds buffered', async () => {
  const { controller, sampleStarts, sampleCallbacks } = await setup()
  const id = await add(controller)
  await controller.selectCaptions(id, true)
  controller.updatePlayback({ time: 198.637391, duration: 1420.053, buffered: 19.543609, stalled: false }, true, false)
  await controller.retryTiming()
  controller.analyseAlignment()
  assert.equal(sampleStarts.length, 1)
  assert.equal(sampleStarts[0].availableOnly, true)
  sampleCallbacks[0]({ sessionId: sampleStarts[0].sessionId, done: true, reason: 'complete', tracks: [], bytesFetched: 0, bytesParsed: 2000 })
  controller.analyseAlignment()
  controller.worker.onmessage({ data: { id: controller.workerSequence, results: [{ id, accepted: true, offset: -1.1, confidence: 0.9, windows: [], reason: 'accepted' }] } })
  await tick()
  assert.equal(controller.alignmentStatus.value, 'confirmed')
  assert.equal(controller.externalTracks.get(id).offset, -1.1)
  assert.equal(controller.getTimingDiagnostics().sample.bytesFetched, 0)
  controller.destroy()
})
test.after(() => { delete globalThis.localStorage })

test('diagnostics explain manual locks, missing candidates and buffer waits, and bound logs', async () => {
  const { controller } = await setup()
  const id = await add(controller)
  controller.updatePlayback({ time: 0, duration: 1000, buffered: 0, stalled: false }, false, false)
  assert.match(controller.getTimingDiagnostics().reason, /Checking already-downloaded pieces/)
  await controller.selectCaptions(id, true)
  assert.match(controller.getTimingDiagnostics().reason, /manual selection/)
  assert.equal(controller.getTimingDiagnostics().candidates[0].active, true)
  for (let i = 0; i < 250; i++) controller.logTiming(`event ${i}`)
  assert.equal(controller.getTimingDiagnostics().log.length, 200)
  await controller.retryTiming()
  assert.equal(controller.manualLock, false)
  assert.match(controller.getTimingDiagnostics().reason, /Checking already-downloaded pieces/)
  controller.externalTracks.clear()
  assert.match(controller.getTimingDiagnostics().reason, /No external subtitle candidate/)
  controller.destroy()
})

test('mixed Chinese/Japanese files are excluded on import and cache restoration', async () => {
  const { controller } = await setup()
  await controller.addSingleSubtitleFile(new File([ass()], '[Group] Show - 01 [CHS, JPN].ass'), 'jimaku')
  await controller.addSingleSubtitleFile(new File([ass()], '[Group] Show - 01 [CHT_JP].ass'), 'local', undefined, 0, true, true)
  assert.equal(controller.externalTracks.size, 0)
  const id = await add(controller)
  assert.equal(String(controller.current.value), id)
  assert.equal(controller.getTimingDiagnostics().revision, 'downloaded-first-v5-early-evidence')
  assert.ok(controller.timingLog.some(entry => entry.message.includes('Excluded mixed')))
  controller.destroy()
  const cache = new Map([['torrent:1', [{ name: '[Group] Show - 01 [CHS, JPN].ass', source: 'jimaku', text: ass(), rank: 0 }]]])
  const restored = await setup({ cache })
  assert.equal(restored.controller.externalTracks.size, 0)
  restored.controller.destroy()
})

test('every accepted group is retimed and cached before switching, with no repeated shifts', async () => {
  const { controller, storage } = await setup()
  const first = await add(controller, '01', 'Preferred')
  await controller.addSingleSubtitleFile(new File([ass(2)], '[Alternative] Show - 01.ass'), 'jimaku', 'group:alternative')
  const second = [...controller.externalTracks.keys()].at(-1)
  const rejected = await add(controller, '01', 'Unrelated')
  controller.preference = controller.identities.get(first)
  controller.updatePlayback({ time: 2.5, duration: 600, buffered: 40, stalled: false }, false, false)
  controller.analyseAlignment()
  controller.worker.onmessage({ data: { id: controller.workerSequence, results: [
    { id: first, accepted: true, offset: 5, confidence: 1, windows: [], reason: 'accepted' },
    { id: second, accepted: true, offset: -1, confidence: 0.9, windows: [], reason: 'accepted' },
    { id: rejected, accepted: false, confidence: 0, windows: [], reason: 'insufficient-evidence' }
  ] } })
  await tick()
  assert.equal(controller.externalTracks.get(first).offset, 0, 'active line waits for a safe gap')
  assert.equal(controller.externalTracks.get(second).offset, -1)
  assert.equal(controller.externalTracks.get(rejected).offset, 0)
  assert.equal(controller.getMiningCues(second)[0].start, 3)
  await controller.selectCaptions(second, true)
  assert.match(controller.jassub.rendered, /0:00:03.00/)
  assert.equal(controller.alignmentStatus.value, 'confirmed')
  await controller.selectCaptions(first, true)
  assert.equal(controller.getMiningCues()[0].start, 7)
  await controller.selectCaptions(second, true)
  assert.equal(controller.getMiningCues()[0].start, 3)
  assert.match(controller.jassub.rendered, /0:00:03.00/)
  controller.destroy()
  const restored = await setup({ storage })
  await restored.controller.addSingleSubtitleFile(new File([ass(2)], '[Alternative] Show - 01.ass'), 'jimaku', 'group:alternative')
  const restoredSecond = [...restored.controller.externalTracks.keys()].at(-1)
  assert.equal(restored.controller.externalTracks.get(restoredSecond).offset, -1)
  restored.controller.destroy()
})

test('late candidates are evaluated after active timing freezes without changing the active timeline', async () => {
  const { controller } = await setup()
  const first = await add(controller)
  controller.pending = { track: first, offset: 5 }
  await controller.applyPending()
  controller.sampleDone = true
  const second = await add(controller, '01', 'Late')
  controller.applyTrackOffset(second, 3)
  controller.analyseAlignment()
  assert.ok(controller.worker)
  controller.worker.onmessage({ data: { id: controller.workerSequence, results: [
    { id: first, accepted: true, offset: 10, confidence: 1, windows: [], reason: 'accepted' },
    { id: second, accepted: true, offset: 0, confidence: 1, windows: [], reason: 'accepted' }
  ] } })
  assert.equal(controller.externalTracks.get(first).offset, 5)
  assert.equal(controller.externalTracks.get(second).verifiedOffset, 0)
  assert.equal(String(controller.current.value), first)
  await controller.selectCaptions(second, true)
  assert.equal(controller.getMiningCues()[0].start, 2)
  assert.equal(controller.alignmentStatus.value, 'confirmed')
  controller.destroy()
})

test('strong early timing applies in a safe gap without caching, and verification continues', async () => {
  const { controller } = await setup()
  const id = await add(controller)
  controller.updatePlayback({ time: 2.5, duration: 600, buffered: 40, stalled: false }, false, false)
  controller.analyseAlignment()
  const key = preferences.exactSubtitleKey(controller.videoIdentity, controller.externalTracks.get(id).fingerprint)
  controller.worker.onmessage({ data: { id: controller.workerSequence, results: [{ id, accepted: false, earlyOffset: 5, confidence: 0, windows: [], reason: 'insufficient-evidence' }] } })
  await tick()
  assert.equal(controller.externalTracks.get(id).offset, 0)
  controller.updatePlayback({ time: 5, duration: 600, buffered: 40, stalled: false }, false, false)
  await tick()
  assert.equal(controller.externalTracks.get(id).offset, 5)
  assert.equal(controller.alignmentStatus.value, 'provisional')
  assert.equal(controller.frozen, false)
  assert.ok(controller.sampleId)
  assert.equal(controller.memory.exact[key], undefined)
  controller.worker.onmessage({ data: { id: controller.workerSequence, results: [{ id, accepted: true, offset: 5, confidence: 1, windows: [], reason: 'accepted' }] } })
  await tick()
  assert.equal(controller.alignmentStatus.value, 'confirmed')
  assert.equal(controller.memory.exact[key].offset, 5)
  assert.equal(controller.earlyTiming, undefined)
  controller.destroy()
})

test('a rejected early estimate is withdrawn safely, including a correction back to zero', async () => {
  const { controller } = await setup()
  const id = await add(controller)
  controller.analyseAlignment()
  controller.worker.onmessage({ data: { id: controller.workerSequence, results: [{ id, accepted: false, earlyOffset: 5, confidence: 0, windows: [], reason: 'insufficient-evidence' }] } })
  await tick()
  assert.equal(controller.getMiningCues()[0].start, 7)
  controller.updatePlayback({ time: 7.5, duration: 600, buffered: 40, stalled: false }, false, false)
  controller.worker.onmessage({ data: { id: controller.workerSequence, results: [{ id, accepted: false, confidence: 0, windows: [], reason: 'inconsistent-windows' }] } })
  await tick()
  assert.equal(controller.externalTracks.get(id).offset, 5, 'keep current subtitle intact while waiting')
  controller.updatePlayback({ time: 5, duration: 600, buffered: 40, stalled: false }, false, false)
  await tick()
  assert.equal(controller.getMiningCues()[0].start, 2)
  assert.match(controller.jassub.rendered, /0:00:02.00/)
  assert.equal(controller.earlyTiming, undefined)
  assert.equal(controller.earlyTimingAttempted, true)
  assert.equal(controller.frozen, false)
  controller.destroy()
})

test('manual timing takes precedence over early-estimate expiry', async () => {
  const { controller } = await setup()
  const id = await add(controller)
  controller.pending = { track: id, offset: 5, verified: false, early: 'apply' }
  await controller.applyPending()
  controller.setManualDelay(0.4)
  controller.withdrawEarlyTiming()
  assert.equal(controller.pending, undefined)
  assert.equal(controller.externalTracks.get(id).offset, 5)
  assert.equal(controller.manualDelay.value, 0.4)
  assert.deepEqual(controller.memory.exact, {})
  controller.destroy()
})

test('early fallback expiry restores the previous source without changing saved preference', async () => {
  const { controller } = await setup()
  const first = await add(controller, '01', 'Preferred')
  const second = await add(controller, '01', 'EarlyFallback')
  controller.preference = controller.identities.get(first)
  controller.pending = { track: second, offset: 5, verified: false, early: 'apply' }
  await controller.applyPending()
  assert.equal(String(controller.current.value), second)
  controller.withdrawEarlyTiming()
  await tick()
  assert.equal(String(controller.current.value), first)
  assert.equal(controller.externalTracks.get(second).offset, 0)
  assert.equal(controller.preference.profile, 'group:preferred')
  assert.equal(controller.earlyTiming, undefined)
  assert.deepEqual(controller.memory.exact, {})
  controller.destroy()
})

test('selector distinguishes zero verification, pending timing, early estimates and failed evidence', async () => {
  const { controller } = await setup()
  const id = await add(controller)
  assert.match(controller.getTrackTiming(id).label, /Unverified/)
  controller.applyTrackOffset(id, 0)
  assert.equal(controller.getTrackTiming(id).label, 'Verified · 0.00 s')
  assert.equal(controller.getTrackTiming(id).tone, 'verified')
  const state = controller.externalTracks.get(id)
  state.verifiedOffset = -1
  assert.match(controller.getTrackTiming(id).label, /-1.00 s · awaiting application/)
  state.verifiedOffset = undefined
  controller.earlyTiming = { track: id, offset: -1, previousTrack: id, previousOffset: 0 }
  state.offset = -1
  assert.match(controller.getTrackTiming(id).label, /Temporary · -1.00 s · not yet verified/)
  controller.earlyTiming = undefined
  controller.timingResults = [{ id, accepted: false, reason: 'inconsistent-windows' }]
  assert.match(controller.getTrackTiming(id).label, /windows disagree/)
  assert.equal(controller.getTrackTiming(id).tone, 'warning')
  controller.destroy()
})

test('selector distinguishes carried show adjustments and unapplied automatic release hints', async () => {
  const first = await setup()
  const firstId = await add(first.controller)
  first.controller.applyTrackOffset(firstId, -1)
  first.controller.setManualDelay(1.7)
  first.controller.destroy()
  const second = await setup({ storage: first.storage, episode: '02' })
  const id = await add(second.controller, '02')
  const status = second.controller.getTrackTiming(id)
  assert.match(status.adjustment, /Saved show adjustment · \+1.70 s · carried across episodes/)
  assert.match(status.hint, /-1.00 s · hint only, not applied to this episode/)
  assert.equal(second.controller.externalTracks.get(id).offset, 0)
  assert.notEqual(status.tone, 'verified')
  second.controller.setManualDelay(0.4, true)
  assert.equal(second.controller.getTrackTiming(id).adjustment, 'Episode adjustment · +0.40 s')
  second.controller.destroy()
})
