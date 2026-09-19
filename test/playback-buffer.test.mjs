import assert from 'node:assert/strict'
import test from 'node:test'

import { ALL_FORMATS, Input } from 'mediabunny'

import { PlaybackBuffer, boundedPlaybackFetch, PLAYBACK_RANGE_BYTES, torrentPlaybackSource } from '../src/lib/components/ui/player/bunny/playback-buffer.ts'
const tick = () => new Promise(resolve => setTimeout(resolve, 10))

test('caps open-ended and large byte ranges while preserving bounded requests and cancellation', async () => {
  const requests = []
  const controller = new AbortController()
  const fetcher = boundedPlaybackFetch(async request => { requests.push(request); return new Response() }, controller.signal)
  await fetcher('http://localhost/video', { headers: { Range: 'bytes=100-' } })
  await fetcher('http://localhost/video', { headers: { Range: 'bytes=9-19', Authorization: 'local-test' } })
  assert.equal(requests[0].headers.get('Range'), `bytes=100-${99 + PLAYBACK_RANGE_BYTES}`)
  assert.equal(requests[1].headers.get('Range'), 'bytes=9-19')
  assert.equal(requests[1].headers.get('Authorization'), 'local-test')
  controller.abort()
  assert.ok(requests.every(request => request.signal.aborted))
})

test('credits complete video GOPs and the slower audio track, then stops at a bounded reserve', async () => {
  const ranges = []
  const calls = []
  const reader = video => ({
    video,
    first: async time => ({ timestamp: Math.floor(time / 2) * 2, duration: 1, type: 'key' }),
    next: async packet => {
      calls.push(video ? 'video' : 'audio')
      const timestamp = packet.timestamp + 1
      return { timestamp, duration: 1, type: timestamp % 2 === 0 ? 'key' : 'delta' }
    }
  })
  const buffer = new PlaybackBuffer(async () => ({ readers: [reader(true), reader(false)], close () {} }), 100, value => ranges.push(value))
  try {
    buffer.update(0, false)
    await tick()
    assert.deepEqual(ranges.at(-1), [{ start: 0, end: 35 }])
    assert.ok(ranges.some(range => range[0]?.end === 2))
    assert.ok(calls.length < 75)
    const count = calls.length
    await tick()
    assert.equal(calls.length, count)
    buffer.update(1, false)
    await tick()
    assert.equal(ranges.at(-1)[0].end, 36)
  } finally { buffer.destroy() }
})

test('stall, seek and destruction abort outstanding prefetch without publishing obsolete evidence', async () => {
  const sessions = []
  const ranges = []
  const buffer = new PlaybackBuffer(async signal => {
    let resolve
    const pending = new Promise(r => { resolve = r })
    sessions.push({ signal, resolve })
    return { readers: [{ video: true, first: () => pending, next: () => pending }], close () {} }
  }, 100, value => ranges.push(value))
  buffer.update(0, true)
  await tick()
  assert.equal(sessions.length, 0)
  buffer.update(0, false)
  await tick()
  buffer.update(0, true)
  assert.equal(sessions[0].signal.aborted, true)
  sessions[0].resolve({ timestamp: 50, duration: 1, type: 'key' })
  await tick()
  assert.deepEqual(ranges.at(-1), [])
  buffer.update(50, false)
  await tick()
  buffer.update(10, false)
  await tick()
  assert.equal(sessions[1].signal.aborted, true)
  assert.equal(sessions.length, 3)
  buffer.destroy()
  assert.equal(sessions[2].signal.aborted, true)
})



test('servers ignoring ranges cannot turn prefetch into an unrestricted file read', async () => {
  let cancelled = false
  const source = torrentPlaybackSource('http://localhost/video', 100000, undefined, async () => new Response(new ReadableStream({ cancel () { cancelled = true } }), { status: 200 }))
  const input = new Input({ source, formats: ALL_FORMATS })
  try {
    await assert.rejects(input.getFormat(), /invalid bounded range/)
    assert.equal(cancelled, true)
  } finally { input.dispose() }
})
