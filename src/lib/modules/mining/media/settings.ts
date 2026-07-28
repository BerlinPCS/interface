export const DEFAULT_MINING_MEDIA_SETTINGS = {
  imageMode: 'animated',
  staticImageFormat: 'webp',
  animatedImageFormat: 'webp',
  quality: 'fast',
  maxHeight: 720,
  animationFps: 8,
  syncAnimationToWordAudio: true
} as const

export function migrateMiningMediaSettings<T extends Record<string, unknown>> (value: T): T {
  if (value.miningAnkiAnimatedImageFormat !== 'gif') return value
  return {
    ...value,
    miningAnkiAnimatedImageFormat: DEFAULT_MINING_MEDIA_SETTINGS.animatedImageFormat
  }
}
