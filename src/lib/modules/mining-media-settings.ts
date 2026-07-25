export const DEFAULT_MINING_MEDIA_SETTINGS = {
  imageMode: 'static',
  staticImageFormat: 'webp',
  animatedImageFormat: 'webp',
  quality: 'balanced',
  maxHeight: 720,
  animationFps: 12,
  syncAnimationToWordAudio: false
} as const

export function migrateMiningMediaSettings<T extends Record<string, unknown>> (value: T): T {
  if (value.miningAnkiAnimatedImageFormat !== 'gif') return value
  return {
    ...value,
    miningAnkiAnimatedImageFormat: DEFAULT_MINING_MEDIA_SETTINGS.animatedImageFormat
  }
}
