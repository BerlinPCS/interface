import type { AnitomyResult } from 'anitomyscript'

export type SubtitleAlignmentStatus = 'hidden' | 'timing' | 'provisional' | 'confirmed'

export interface SubtitleAlignmentProgress {
  offset?: number
  candidateOffset?: number
  matchingEstimates: number
  lastCueCount: number
  confirmed: boolean
}

export interface SubtitleAlignmentCacheEntry {
  offset: number
  updatedAt: number
}

export type SubtitleAlignmentCache = Record<string, SubtitleAlignmentCacheEntry>

export interface JimakuCandidate<T = unknown> {
  value: T
  filename: string
  profile?: string
  episodeNumbers: string[]
  index: number
}

export const SUBTITLE_ALIGNMENT_CACHE_KEY = 'jimaku-subtitle-offsets-v1'

const ALIGNMENT_TOLERANCE = 0.2
const MAX_OFFSET = 120
const GENERIC_GROUPS = new Set([
  'cc', 'closedcaptions', 'eng', 'english', 'ja', 'japanese', 'jpn', 'sub', 'subs', 'subtitle', 'webrip', 'webdl'
])

function normalizeToken (value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

function escapeRegExp (value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function credibleGroup (value: string | undefined) {
  if (!value || value.length > 64) return
  const normalized = normalizeToken(value)
  if (!normalized || GENERIC_GROUPS.has(normalized) || /^\d{3,4}p$/.test(normalized)) return
  return normalized
}

function removeParsedTerms (filename: string, terms: Array<string | undefined>) {
  let result = filename
  for (const term of terms) {
    if (!term) continue
    result = result.replace(new RegExp(escapeRegExp(term), 'giu'), ' ')
  }
  return result
}

export function subtitleReleaseProfile (filename: string, parsed: Partial<AnitomyResult>): string | undefined {
  const leadingGroup = filename.match(/^\s*\[([^\]]+)]/)?.[1]
  const group = credibleGroup(leadingGroup) ?? credibleGroup(parsed.release_group?.[0])
  if (group) return `group:${group}`

  const dot = filename.lastIndexOf('.')
  let signature = dot > 0 ? filename.slice(0, dot) : filename
  signature = signature
    .replace(/s\d{1,3}\s*e\d+(?:\s*[-~+]\s*\d+)?/giu, ' ')
    .replace(/\b(?:episode|ep|e)\s*\d+(?:\s*[-~+]\s*\d+)?\b/giu, ' ')
  signature = removeParsedTerms(signature, [
    ...parsed.anime_title ?? [],
    ...parsed.episode_title ?? [],
    ...parsed.episode_number ?? [],
    ...parsed.anime_season ?? []
  ])
  signature = signature
    .replace(/\[(?:cc|eng|english|ja|jpn|japanese)\]/giu, ' ')
    .replace(/(?:^|[. _-])(?:eng|english|ja|jpn|japanese)(?=$|[. _-])/giu, ' ')

  const normalized = signature.normalize('NFKC').toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(token => token && !GENERIC_GROUPS.has(token) && !/^\d+$/.test(token))
    .join('-')

  return normalized ? `profile:${normalized}` : undefined
}

export function alignmentCacheKey (mediaId: number, profile: string) {
  return `${mediaId}:${profile}`
}

function validCacheEntry (value: unknown): value is SubtitleAlignmentCacheEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<SubtitleAlignmentCacheEntry>
  return typeof entry.offset === 'number' && Number.isFinite(entry.offset) && Math.abs(entry.offset) <= MAX_OFFSET &&
    typeof entry.updatedAt === 'number' && Number.isFinite(entry.updatedAt) && entry.updatedAt >= 0
}

function availableLocalStorage (): Storage | undefined {
  try {
    return Reflect.get(globalThis, 'localStorage')
  } catch {
    return undefined
  }
}

export function readSubtitleAlignmentCache (storage: Pick<Storage, 'getItem'> | undefined = availableLocalStorage()): SubtitleAlignmentCache {
  if (!storage) return {}
  try {
    const parsed: unknown = JSON.parse(storage.getItem(SUBTITLE_ALIGNMENT_CACHE_KEY) ?? '{}')
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, SubtitleAlignmentCacheEntry] => validCacheEntry(entry[1])))
  } catch {
    return {}
  }
}

export function writeSubtitleAlignmentCache (cache: SubtitleAlignmentCache, storage: Pick<Storage, 'setItem'> | undefined = availableLocalStorage()) {
  if (!storage) return
  try {
    storage.setItem(SUBTITLE_ALIGNMENT_CACHE_KEY, JSON.stringify(cache))
  } catch {
    // Alignment remains session-local when storage is unavailable.
  }
}

export function cachedSubtitleAlignment (cache: SubtitleAlignmentCache, mediaId: number, profile: string | undefined) {
  return profile ? cache[alignmentCacheKey(mediaId, profile)] : undefined
}

export function saveSubtitleAlignment (cache: SubtitleAlignmentCache, mediaId: number, profile: string, offset: number, updatedAt = Date.now()) {
  cache[alignmentCacheKey(mediaId, profile)] = { offset, updatedAt }
}

export function initialAlignmentProgress (cached?: SubtitleAlignmentCacheEntry): SubtitleAlignmentProgress {
  return {
    offset: cached?.offset,
    candidateOffset: cached?.offset,
    matchingEstimates: cached ? 1 : 0,
    lastCueCount: 0,
    confirmed: false
  }
}

export function alignmentStatus (progress: SubtitleAlignmentProgress): Exclude<SubtitleAlignmentStatus, 'hidden'> {
  if (progress.confirmed) return 'confirmed'
  return progress.offset === undefined ? 'timing' : 'provisional'
}

export function advanceAlignment (progress: SubtitleAlignmentProgress, estimate: number, cueCount: number) {
  if (cueCount <= progress.lastCueCount) {
    return { progress, applyOffset: false, confirmedNow: false }
  }

  const agrees = progress.candidateOffset !== undefined && Math.abs(progress.candidateOffset - estimate) <= ALIGNMENT_TOLERANCE + Number.EPSILON * 10
  if (!agrees) {
    const next = {
      offset: estimate,
      candidateOffset: estimate,
      matchingEstimates: 1,
      lastCueCount: cueCount,
      confirmed: false
    }
    return {
      progress: next,
      applyOffset: progress.offset === undefined || Math.abs(progress.offset - estimate) > ALIGNMENT_TOLERANCE,
      confirmedNow: false
    }
  }

  const matchingEstimates = progress.matchingEstimates + 1
  const confirmed = progress.confirmed || (cueCount >= 8 && matchingEstimates >= 2)
  return {
    progress: {
      ...progress,
      matchingEstimates,
      lastCueCount: cueCount,
      confirmed
    },
    applyOffset: false,
    confirmedNow: confirmed && !progress.confirmed
  }
}

export function rankJimakuCandidates<T> (candidates: Array<JimakuCandidate<T>>, cache: SubtitleAlignmentCache, mediaId: number, playingMultiEpisode: boolean) {
  return [...candidates].sort((a, b) => {
    const aMulti = !playingMultiEpisode && a.episodeNumbers.length > 1
    const bMulti = !playingMultiEpisode && b.episodeNumbers.length > 1
    if (aMulti !== bMulti) return Number(aMulti) - Number(bMulti)

    const aCached = cachedSubtitleAlignment(cache, mediaId, a.profile)
    const bCached = cachedSubtitleAlignment(cache, mediaId, b.profile)
    if (!!aCached !== !!bCached) return Number(!!bCached) - Number(!!aCached)
    if (aCached && bCached && aCached.updatedAt !== bCached.updatedAt) return bCached.updatedAt - aCached.updatedAt
    return a.index - b.index
  })
}
