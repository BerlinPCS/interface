import { ALL_FORMATS, EncodedPacketSink, Input, CustomSource } from 'mediabunny'

export const PLAYBACK_RANGE_BYTES = 1024 * 1024
export const PLAYBACK_BUFFER_SECONDS = 35

/** Keep every playback HTTP request finite, including large demuxer reads. */
export function boundedPlaybackFetch (fetcher: typeof fetch = fetch, signal?: AbortSignal): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init)
    const match = /^bytes=(\d+)-(\d*)$/.exec(request.headers.get('Range') ?? 'bytes=0-')
    if (!match) throw new Error('Unsupported playback byte range')
    const start = Number(match[1])
    const end = Math.min(match[2] ? Number(match[2]) : Infinity, start + PLAYBACK_RANGE_BYTES - 1)
    request.headers.set('Range', `bytes=${start}-${end}`)
    return await fetcher(new Request(request, { signal: signal ? AbortSignal.any([request.signal, signal]) : request.signal }))
  }
}

/** Explicit finite reads avoid UrlSource's open-ended network prefetch and EOF
 * assumptions. The native torrent file provides the authoritative total size. */
export function torrentPlaybackSource (url: string, size: number, signal?: AbortSignal, fetcher: typeof fetch = fetch) {
  const lifetime = new AbortController()
  const scopedFetch = boundedPlaybackFetch(fetcher, signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal)
  return new CustomSource({
    getSize: () => size,
    maxCacheSize: 8 * 1024 * 1024,
    prefetchProfile: 'fileSystem',
    dispose: () => lifetime.abort(),
    read: (start, end) => {
      const range = new AbortController()
      let cursor = start
      return new ReadableStream<Uint8Array>({
        async pull (controller) {
          const last = Math.min(end, cursor + PLAYBACK_RANGE_BYTES) - 1
          const response = await scopedFetch(url, { headers: { Range: `bytes=${cursor}-${last}` }, signal: range.signal })
          const contentRange = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('Content-Range') ?? '')
          if (response.status !== 206 || !contentRange || Number(contentRange[1]) !== cursor || Number(contentRange[2]) > last || Number(contentRange[3]) !== size) {
            await response.body?.cancel()
            throw new Error('Torrent server returned an invalid bounded range')
          }
          const bytes = new Uint8Array(await response.arrayBuffer())
          if (!bytes.length || bytes.length !== Number(contentRange[2]) - cursor + 1) throw new Error('Incomplete playback range')
          cursor += bytes.length
          controller.enqueue(bytes)
          if (cursor >= end) controller.close()
        },
        cancel: () => range.abort()
      }, { highWaterMark: 0 })
    }
  })
}

interface Packet { timestamp: number, duration: number, type: string }
export interface PacketReader {
  first: (time: number) => Promise<Packet | null>
  next: (packet: Packet) => Promise<Packet | null>
  video: boolean
}
export interface BufferSession { readers: PacketReader[], close: () => void }
export type BufferSessionFactory = (signal: AbortSignal) => Promise<BufferSession>

/** Measures verified, encoded media fetched through the torrent HTTP server.
 * The piece store retains these bytes even if the source evicts its memory cache.
 * A video GOP is only credited when its following key packet has arrived. */
export class PlaybackBuffer {
  private generation = 0
  private controller?: AbortController
  private close?: () => void
  private timer?: ReturnType<typeof setTimeout>
  private wake?: () => void
  private time = 0
  private active = false
  private destroyed = false
  private failed = false
  private start = 0
  private readonly factory: BufferSessionFactory
  private readonly duration: number
  private readonly publish: (ranges: Array<{ start: number, end: number }>) => void
  constructor (factory: BufferSessionFactory, duration: number, publish: (ranges: Array<{ start: number, end: number }>) => void) { this.factory = factory; this.duration = duration; this.publish = publish }

  update (time: number, stalled: boolean) {
    if (this.destroyed || this.failed) return
    if (this.active && (time < this.time - 0.5 || time > this.time + 2)) this.stop()
    this.time = time
    if (stalled) { if (this.active) this.stop(); return }
    if (!this.active) {
      this.active = true
      this.start = time
      const generation = ++this.generation
      this.controller = new AbortController()
      this.run(generation, this.controller.signal).catch(error => {
        if (this.generation !== generation) return
        this.failed = true
        console.debug('Playback buffer unavailable', String(error))
        this.stop()
      })
    }
    this.wake?.()
  }

  reset () { this.failed = false; this.stop() }
  destroy () { this.destroyed = true; this.stop() }
  private stop () {
    this.generation++
    this.active = false
    this.controller?.abort()
    this.controller = undefined
    this.close?.()
    this.close = undefined
    this.wake?.()
    clearTimeout(this.timer)
    this.publish([])
  }

  private async run (generation: number, signal: AbortSignal) {
    const session = await this.factory(signal)
    if (generation !== this.generation) { session.close(); return }
    this.close = session.close
    const states = session.readers.map(reader => ({ reader, packet: null as Packet | null, end: this.start, first: true, done: false }))
    if (!states.length) return
    while (generation === this.generation) {
      // Fetch the least-buffered track first. There is one outstanding packet
      // read, rather than an audio prefetch racing far ahead of video (or vice versa).
      const state = states.filter(state => !state.done && state.end < Math.min(this.duration, this.time + PLAYBACK_BUFFER_SECONDS)).sort((a, b) => a.end - b.end)[0]
      if (!state) {
        await new Promise<void>(resolve => {
          this.wake = () => { clearTimeout(this.timer); this.wake = undefined; resolve() }
          this.timer = setTimeout(this.wake, 250)
        })
        continue
      }
      const packet = state.first ? await state.reader.first(this.start) : await state.reader.next(state.packet!)
      if (generation !== this.generation) return
      if (!packet && state.first) throw new Error('Selected playback track has no packets')
      state.first = false
      state.packet = packet
      if (!packet) { state.done = true; state.end = this.duration } else if (Number.isFinite(packet.timestamp) && Number.isFinite(packet.duration)) {
        if (!state.reader.video) state.end = Math.max(state.end, packet.timestamp + packet.duration)
        else if (packet.type === 'key') state.end = Math.max(state.end, packet.timestamp)
        // Do not read arbitrarily far ahead on pathological/very long GOPs.
        if (packet.timestamp > this.time + 60 && state.end < this.time + PLAYBACK_BUFFER_SECONDS) throw new Error('Video keyframe interval exceeds playback buffer window')
      } else throw new Error('Invalid playback packet timestamp')
      const end = Math.min(...states.map(state => state.end))
      this.publish(end > this.start ? [{ start: this.start, end }] : [])
    }
  }
}

export function torrentPlaybackBuffer (url: string, size: number, videoId: string, audioId: string | undefined, duration: number, publish: (ranges: Array<{ start: number, end: number }>) => void) {
  return new PlaybackBuffer(async signal => {
    // Separate input permits seek/stall cancellation without aborting the decoder.
    const input = new Input({ source: torrentPlaybackSource(url, size, signal), formats: ALL_FORMATS })
    const close = () => input.dispose()
    try {
      const tracks = (await input.getTracks()).filter(track => String(track.id) === videoId || (audioId !== undefined && String(track.id) === audioId))
      if (!tracks.some(track => String(track.id) === videoId) || (audioId !== undefined && !tracks.some(track => String(track.id) === audioId))) throw new Error('Missing selected playback track')
      return {
        close,
        readers: tracks.map(track => {
          const sink = new EncodedPacketSink(track)
          return {
            video: track.type === 'video',
            first: async (time: number) => await sink.getKeyPacket(time) ?? await sink.getFirstPacket(),
            next: async (packet: Packet) => await sink.getNextPacket(packet as Parameters<typeof sink.getNextPacket>[0])
          }
        })
      }
    } catch (error) { close(); throw error }
  }, duration, publish)
}
