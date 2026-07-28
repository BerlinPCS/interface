export interface MiningMediaEstimateInput {
  captureImage: boolean
  captureAudio: boolean
  imageMode: 'static' | 'animated'
  staticFormat: 'png' | 'jpeg' | 'webp' | 'avif'
  animatedFormat: 'webp' | 'avif'
  quality: 'fast' | 'balanced' | 'high'
  maxHeight: number
  fps: number
  paddingBefore: number
  paddingAfter: number
}

export interface MiningMediaEstimate {
  durationSeconds: number
  imageBytes: number
  audioBytes: number
  totalBytes: number
  animationBytesPerSecond: number
  creationSeconds: number
}

const SAMPLE_SENTENCE_SECONDS = 5
const ASPECT_RATIO = 16 / 9
const MP3_BITRATE = { fast: 64, balanced: 96, high: 128 } as const
const STATIC_BYTES_PER_PIXEL = {
  png: 1.2,
  jpeg: 0.18,
  webp: 0.13,
  avif: 0.075
} as const
const ANIMATED_BYTES_PER_PIXEL_FRAME = {
  webp: 0.024,
  avif: 0.012
} as const
const STATIC_QUALITY_FACTOR = {
  png: { fast: 1.12, balanced: 1, high: 0.92 },
  jpeg: { fast: 0.72, balanced: 1, high: 1.35 },
  webp: { fast: 0.72, balanced: 1, high: 1.42 },
  avif: { fast: 0.68, balanced: 1, high: 1.5 }
} as const
const ANIMATED_QUALITY_FACTOR = {
  webp: { fast: 0.72, balanced: 1, high: 1.42 },
  avif: { fast: 0.68, balanced: 1, high: 1.5 }
} as const
const STATIC_ENCODE_SECONDS_720P = {
  png: { fast: 0.25, balanced: 0.45, high: 0.75 },
  jpeg: { fast: 0.15, balanced: 0.2, high: 0.3 },
  webp: { fast: 0.18, balanced: 0.3, high: 0.55 },
  avif: { fast: 0.35, balanced: 0.8, high: 1.7 }
} as const
const ANIMATED_ENCODE_SECONDS_720P = {
  webp: { fast: 1.5, balanced: 2.4, high: 3.8 },
  avif: { fast: 1.8, balanced: 2.8, high: 5 }
} as const

/**
 * Estimates generated player media for a representative five-second subtitle.
 * Image coefficients are deliberately approximate because content complexity
 * has a large effect on image codecs.
 */
export function estimateMiningMedia (input: MiningMediaEstimateInput): MiningMediaEstimate {
  const height = clamp(input.maxHeight, 240, 2160)
  const fps = clamp(Math.round(input.fps), 1, 30)
  const durationSeconds = SAMPLE_SENTENCE_SECONDS +
    clamp(input.paddingBefore, 0, 5) +
    clamp(input.paddingAfter, 0, 5)
  const pixels = height * Math.round(height * ASPECT_RATIO)
  let animationBytesPerSecond = 0
  let imageBytes = 0
  if (input.captureImage) {
    if (input.imageMode === 'animated') {
      const format = input.animatedFormat
      animationBytesPerSecond = pixels * fps *
        ANIMATED_BYTES_PER_PIXEL_FRAME[format] *
        ANIMATED_QUALITY_FACTOR[format][input.quality]
      imageBytes = animationBytesPerSecond * durationSeconds
    } else {
      const format = input.staticFormat
      imageBytes = pixels *
        STATIC_BYTES_PER_PIXEL[format] *
        STATIC_QUALITY_FACTOR[format][input.quality]
    }
  }

  const audioBytes = input.captureAudio
    ? durationSeconds * MP3_BITRATE[input.quality] * 1000 / 8
    : 0
  const workloadScale = pixels / (1280 * 720)
  const imageEncodeSeconds = !input.captureImage
    ? 0
    : input.imageMode === 'animated'
      ? ANIMATED_ENCODE_SECONDS_720P[input.animatedFormat][input.quality] *
        Math.pow(workloadScale * (fps / 12) * (durationSeconds / SAMPLE_SENTENCE_SECONDS), 0.85)
      : STATIC_ENCODE_SECONDS_720P[input.staticFormat][input.quality] *
        Math.pow(workloadScale, 0.8)
  const audioEncodeSeconds = input.captureAudio ? 0.04 + durationSeconds * 0.006 : 0
  const totalBytes = Math.round(imageBytes + audioBytes)
  const ankiStorageSeconds = totalBytes ? 0.1 + totalBytes / (12 * 1024 * 1024) : 0
  const creationSeconds = 0.1 + imageEncodeSeconds + audioEncodeSeconds + ankiStorageSeconds
  return {
    durationSeconds,
    imageBytes: Math.round(imageBytes),
    audioBytes: Math.round(audioBytes),
    totalBytes,
    animationBytesPerSecond: Math.round(animationBytesPerSecond),
    creationSeconds: Math.round(creationSeconds * 10) / 10
  }
}

export function formatEstimatedBytes (bytes: number) {
  if (bytes < 1024) return `${Math.round(bytes)} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KiB`
  return `${(bytes / 1024 ** 2).toFixed(bytes < 10 * 1024 ** 2 ? 1 : 0)} MiB`
}

export function formatEstimatedDuration (seconds: number) {
  return seconds < 1 ? `${seconds.toFixed(1)}s` : `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`
}

function clamp (value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(Number(value)) ? Number(value) : minimum))
}
