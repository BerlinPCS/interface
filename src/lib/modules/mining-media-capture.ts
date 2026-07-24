import { ALL_FORMATS, AudioBufferSink, Input, UrlSource } from 'mediabunny'

export interface MiningCapturedMedia {
  kind: 'screenshot' | 'audio'
  filename: string
  mimeType: string
  data: string
}

export interface MiningAudioCaptureOptions {
  sourceUrl: string
  start: number
  end: number
  trackId?: string
  maxDuration?: number
}

export async function captureMiningScreenshot (
  source: CanvasImageSource,
  width: number,
  height: number,
  subtitleOverlay?: CanvasImageSource
): Promise<MiningCapturedMedia> {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('The video frame is not ready for screenshot capture.')
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Screenshot capture is unavailable.')
  try {
    drawMiningScreenshotFrame(context, source, width, height, subtitleOverlay)
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not encode the screenshot.')), 'image/png')
    })
    return {
      kind: 'screenshot',
      filename: `hayase_screenshot_${Date.now()}.png`,
      mimeType: 'image/png',
      data: await blobToBase64(blob)
    }
  } finally {
    canvas.remove()
  }
}

export function drawMiningScreenshotFrame (
  context: Pick<CanvasRenderingContext2D, 'drawImage'>,
  source: CanvasImageSource,
  width: number,
  height: number,
  subtitleOverlay?: CanvasImageSource
) {
  context.drawImage(source, 0, 0, width, height)
  if (subtitleOverlay) context.drawImage(subtitleOverlay, 0, 0, width, height)
}

export async function captureMiningAudio ({
  sourceUrl,
  start,
  end,
  trackId,
  maxDuration = 30
}: MiningAudioCaptureOptions): Promise<MiningCapturedMedia> {
  const safeStart = Math.max(0, Number(start) || 0)
  const safeEnd = Math.min(Number(end) || 0, safeStart + Math.max(0.1, maxDuration))
  if (!sourceUrl || safeEnd <= safeStart) throw new Error('The subtitle has no capturable audio range.')

  const input = new Input({ source: new UrlSource(sourceUrl), formats: ALL_FORMATS })
  const tracks = await input.getAudioTracks()
  const track = tracks.find(candidate => String(candidate.id) === trackId) ?? await input.getPrimaryAudioTrack()
  if (!track) throw new Error('The video has no decodable audio track.')

  const chunks = []
  const sink = new AudioBufferSink(track)
  for await (const chunk of sink.buffers(safeStart, safeEnd)) chunks.push(chunk)
  if (!chunks.length) throw new Error('No audio was decoded for this subtitle.')

  const wav = encodeWavRange(chunks, safeStart, safeEnd)
  return {
    kind: 'audio',
    filename: `hayase_sentence_${Date.now()}.wav`,
    mimeType: 'audio/wav',
    data: bytesToBase64(new Uint8Array(wav))
  }
}

export function encodeWavRange (
  chunks: Array<{ buffer: AudioBuffer, timestamp: number, duration: number }>,
  start: number,
  end: number
): ArrayBuffer {
  const first = chunks[0]
  if (!first) throw new Error('No audio buffers were supplied.')
  const sampleRate = first.buffer.sampleRate
  const channels = Math.min(8, first.buffer.numberOfChannels)
  if (!sampleRate || !channels) throw new Error('The decoded audio format is invalid.')

  const slices = chunks.map(({ buffer, timestamp }) => {
    if (buffer.sampleRate !== sampleRate || buffer.numberOfChannels !== channels) {
      throw new Error('The decoded audio format changed during capture.')
    }
    const from = Math.max(0, Math.ceil((start - timestamp) * sampleRate))
    const to = Math.min(buffer.length, Math.floor((end - timestamp) * sampleRate))
    return { buffer, from, to: Math.max(from, to) }
  }).filter(slice => slice.to > slice.from)
  const frames = slices.reduce((total, slice) => total + slice.to - slice.from, 0)
  if (!frames) throw new Error('The requested audio range was empty.')

  const bytesPerSample = 2
  const dataLength = frames * channels * bytesPerSample
  const output = new ArrayBuffer(44 + dataLength)
  const view = new DataView(output)
  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataLength, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * channels * bytesPerSample, true)
  view.setUint16(32, channels * bytesPerSample, true)
  view.setUint16(34, bytesPerSample * 8, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataLength, true)

  let offset = 44
  for (const { buffer, from, to } of slices) {
    const channelData = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel))
    for (let frame = from; frame < to; ++frame) {
      for (let channel = 0; channel < channels; ++channel) {
        const sample = Math.max(-1, Math.min(1, channelData[channel]![frame] ?? 0))
        view.setInt16(offset, sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff), true)
        offset += bytesPerSample
      }
    }
  }
  return output
}

function writeAscii (view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; ++index) view.setUint8(offset + index, value.charCodeAt(index))
}

async function blobToBase64 (blob: Blob) {
  return bytesToBase64(new Uint8Array(await blob.arrayBuffer()))
}

function bytesToBase64 (bytes: Uint8Array) {
  const chunkSize = 0x8000
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}
