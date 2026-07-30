export const BUNDLED_AUDIO_CODECS = ['ac3', 'eac3', 'dts', 'truehd'] as const

export type BundledAudioCodec = (typeof BUNDLED_AUDIO_CODECS)[number]

const BUNDLED_AUDIO_CODEC_ALIASES: Record<string, BundledAudioCodec> = {
  ac3: 'ac3',
  'ac-3': 'ac3',
  eac3: 'eac3',
  'ec-3': 'eac3',
  dts: 'dts',
  dtsc: 'dts',
  dtse: 'dts',
  dtsh: 'dts',
  dtsl: 'dts',
  truehd: 'truehd',
  mlp: 'truehd'
}

export function bundledAudioCodec (codec: string): BundledAudioCodec | undefined {
  return BUNDLED_AUDIO_CODEC_ALIASES[codec.toLowerCase()]
}

export function hasBundledAudioDecoder (codec: string): boolean {
  return bundledAudioCodec(codec) !== undefined
}

export function shouldTryCompatibilityPlayer (compatibilityPlayerActive: boolean, alreadyTried: boolean): boolean {
  return !compatibilityPlayerActive && !alreadyTried
}
