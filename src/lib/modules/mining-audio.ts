export const HOSHI_DEFAULT_AUDIO_SOURCE_URL = 'https://hoshi-reader.manhhaoo-do.workers.dev/?term={term}&reading={reading}'
export const HAYASE_LOCAL_AUDIO_SOURCE_URL = 'hayase-local-audio-source://get/?term={term}&reading={reading}'

export type MiningAudioPlaybackMode = 'interrupt' | 'duck' | 'mix'

export interface MiningAudioSource {
  id: string
  name: string
  url: string
  enabled: boolean
  builtIn?: 'default' | 'local'
}

export interface MiningLocalAudioState {
  available: boolean
  sizeBytes: number
  sources: string[]
  sourceOrder: string[]
  error?: string
}

export const DEFAULT_MINING_AUDIO_SOURCES: MiningAudioSource[] = [{
  id: 'hoshi-default',
  name: 'Default',
  url: HOSHI_DEFAULT_AUDIO_SOURCE_URL,
  enabled: true,
  builtIn: 'default'
}]

export function enabledMiningAudioTemplates (sources: MiningAudioSource[]): string[] {
  return normalizeMiningAudioSources(sources)
    .filter(source => source.enabled)
    .map(source => source.url)
}

export function normalizeMiningAudioSources (value: unknown): MiningAudioSource[] {
  if (!Array.isArray(value)) return DEFAULT_MINING_AUDIO_SOURCES.map(source => ({ ...source }))
  const result: MiningAudioSource[] = []
  const urls = new Set<string>()
  for (const item of value) {
    if (!isRecord(item) || typeof item.name !== 'string' || typeof item.url !== 'string') continue
    const name = item.name.trim()
    const url = item.url.trim()
    if (!name || !url || name.length > 100 || url.length > 4096 || urls.has(url)) continue
    const builtIn = item.builtIn === 'default' || item.builtIn === 'local'
      ? item.builtIn
      : undefined
    result.push({
      id: typeof item.id === 'string' && item.id ? item.id : crypto.randomUUID(),
      name,
      url,
      enabled: item.enabled !== false,
      builtIn
    })
    urls.add(url)
  }
  if (!urls.has(HOSHI_DEFAULT_AUDIO_SOURCE_URL)) {
    result.push({ ...DEFAULT_MINING_AUDIO_SOURCES[0]! })
  }
  return result
}

export function withLocalMiningAudioSource (
  sources: MiningAudioSource[],
  enabled: boolean
): MiningAudioSource[] {
  const normalized = normalizeMiningAudioSources(sources)
  const localIndex = normalized.findIndex(source => source.url === HAYASE_LOCAL_AUDIO_SOURCE_URL)
  const withoutLocal = normalized.filter(source => source.url !== HAYASE_LOCAL_AUDIO_SOURCE_URL)
  if (!enabled) return withoutLocal
  if (localIndex >= 0) {
    return normalized.map((source, index) =>
      index === localIndex ? { ...source, enabled: true, builtIn: 'local' } : source
    )
  }
  return [{
    id: 'hayase-local',
    name: 'Local',
    url: HAYASE_LOCAL_AUDIO_SOURCE_URL,
    enabled: true,
    builtIn: 'local'
  }, ...withoutLocal]
}

function isRecord (value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
