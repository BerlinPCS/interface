/** Stable identities are separate from display names and episode-local track IDs. */
export interface SubtitlePreference {
  off: boolean
  source?: string
  language?: string
  profile?: string
  forced?: boolean
  name?: string
  number?: string
}
export interface SubtitleMemory {
  shows: Record<string, SubtitlePreference>
  manual: Record<string, number>
  episodes: Record<string, number>
  exact: Record<string, { offset: number, updatedAt: number }>
  hints: Record<string, { offset: number, updatedAt: number }>
}
const KEY = 'subtitle-memory-v2'
export function normalizeSubtitleLanguage (language = '') {
  const code = language.trim().toLowerCase()
  const aliases: Record<string, string> = { ja: 'jpn', en: 'eng', ko: 'kor', zh: 'chi', zho: 'chi' }
  return aliases[code] ?? code
}
export function matchesSubtitlePreference (preference: SubtitlePreference | null | undefined, track: SubtitlePreference) {
  if (!preference || preference.off) return false
  if (normalizeSubtitleLanguage(preference.language) !== normalizeSubtitleLanguage(track.language)) return false
  if (preference.source && preference.source !== track.source) return false
  if (preference.forced !== undefined && preference.forced !== track.forced) return false
  return preference.profile ? preference.profile === track.profile : preference.name === track.name
}
export function subtitlePairKey (show: number, video: string, videoProfile: string | undefined, subtitle: SubtitlePreference, fingerprint: string) {
  return JSON.stringify([show, videoProfile && subtitle.profile ? videoProfile : video, subtitle.source, subtitle.language, subtitle.forced, subtitle.profile ?? fingerprint])
}
export function exactSubtitleKey (video: string, fingerprint: string) { return JSON.stringify([video, fingerprint]) }
export async function subtitleFingerprint (text: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}
export function readSubtitleMemory (): SubtitleMemory {
  const empty = { shows: {}, manual: {}, episodes: {}, exact: {}, hints: {} }
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    const offsets = (input: unknown) => Object.fromEntries(Object.entries(input && typeof input === 'object' ? input : {}).filter(([, offset]) => typeof offset === 'number' && Number.isFinite(offset) && Math.abs(offset) <= 120))
    const results = (input: unknown) => Object.fromEntries(Object.entries(input && typeof input === 'object' ? input : {}).filter(([, entry]) => {
      const result = entry as { offset?: number, updatedAt?: number }
      return result && typeof result.offset === 'number' && Number.isFinite(result.offset) && Math.abs(result.offset) <= 120 && typeof result.updatedAt === 'number' && Number.isFinite(result.updatedAt)
    }))
    const memory: SubtitleMemory = { shows: Object.fromEntries(Object.entries(value.shows ?? {}).filter(([, pref]) => pref && typeof pref === 'object' && typeof (pref as SubtitlePreference).off === 'boolean' && ['source', 'language', 'profile', 'name', 'number'].every(key => Reflect.get(pref, key) === undefined || typeof Reflect.get(pref, key) === 'string'))) as Record<string, SubtitlePreference>, manual: offsets(value.manual), episodes: offsets(value.episodes), exact: results(value.exact), hints: results(value.hints) }
    return memory
  } catch { return empty }
}
export function writeSubtitleMemory (memory: SubtitleMemory) {
  try { localStorage.setItem(KEY, JSON.stringify(memory)) } catch { /* Session-only when storage is unavailable. */ }
}
export function safeSubtitleGap (oldCues: Array<{ start: number, end: number }>, nextCues: Array<{ start: number, end: number }>, time: number, offset: number) {
  return !oldCues.some(cue => cue.start < time + 0.25 && cue.end > time) && !nextCues.some(cue => cue.start + offset < time + 0.25 && cue.end + offset > time)
}
