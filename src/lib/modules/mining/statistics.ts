import { persisted } from 'svelte-persisted-store'
import { get } from 'svelte/store'

export type WatchMode = 'mining' | 'standard'
export type MiningLookupKind = 'term' | 'kanji'

export interface DailyMiningStatistics {
  miningSeconds: number
  standardSeconds: number
  dictionaryLookups: number
  cardsMined: number
}

export interface EpisodeWatchProgress {
  duration: number
  watchedSeconds: Record<WatchMode, number>
}

export interface MiningStatistics {
  version: 2
  startedAt: number
  updatedAt: number
  watchSeconds: Record<WatchMode, number>
  episodes: Record<WatchMode, string[]>
  completedEpisodes: string[]
  episodeProgress: Record<string, EpisodeWatchProgress>
  miningSessions: number
  dictionaryLookups: number
  kanjiLookups: number
  cardsMined: number
  activeDates: string[]
  daily: Record<string, DailyMiningStatistics>
}

const STORAGE_KEY = 'mining-statistics-v1'
const MAX_DAILY_ENTRIES = 120

function finitePositive (value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

function stringArray (value: unknown) {
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string'))] : []
}

export function localDateKey (timestamp = Date.now()) {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function createMiningStatistics (now = Date.now()): MiningStatistics {
  return {
    version: 2,
    startedAt: now,
    updatedAt: now,
    watchSeconds: { mining: 0, standard: 0 },
    episodes: { mining: [], standard: [] },
    completedEpisodes: [],
    episodeProgress: {},
    miningSessions: 0,
    dictionaryLookups: 0,
    kanjiLookups: 0,
    cardsMined: 0,
    activeDates: [],
    daily: {}
  }
}

export function normalizeMiningStatistics (value: unknown, now = Date.now()): MiningStatistics {
  if (!value || typeof value !== 'object') return createMiningStatistics(now)
  const source = value as Partial<MiningStatistics>
  const completionBased = source.version === 2
  const daily = Object.fromEntries(Object.entries(source.daily ?? {})
    .filter(([date, entry]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && entry && typeof entry === 'object')
    .slice(-MAX_DAILY_ENTRIES)
    .map(([date, entry]) => {
      const item = entry as Partial<DailyMiningStatistics>
      return [date, {
        miningSeconds: finitePositive(item.miningSeconds),
        standardSeconds: finitePositive(item.standardSeconds),
        dictionaryLookups: finitePositive(item.dictionaryLookups),
        cardsMined: finitePositive(item.cardsMined)
      }]
    }))

  const episodeProgress = completionBased
    ? Object.fromEntries(Object.entries(source.episodeProgress ?? {}).flatMap(([key, progress]) => {
      if (!/^\d+:\d+$/.test(key) || !progress || typeof progress !== 'object') return []
      const entry = progress as Partial<EpisodeWatchProgress>
      const duration = finitePositive(entry.duration)
      if (!duration) return []
      return [[key, {
        duration,
        watchedSeconds: {
          mining: finitePositive(entry.watchedSeconds?.mining),
          standard: finitePositive(entry.watchedSeconds?.standard)
        }
      }]]
    }))
    : {}

  return {
    version: 2,
    startedAt: finitePositive(source.startedAt) || now,
    updatedAt: finitePositive(source.updatedAt) || now,
    watchSeconds: {
      mining: finitePositive(source.watchSeconds?.mining),
      standard: finitePositive(source.watchSeconds?.standard)
    },
    episodes: {
      mining: completionBased ? stringArray(source.episodes?.mining) : [],
      standard: completionBased ? stringArray(source.episodes?.standard) : []
    },
    completedEpisodes: completionBased ? stringArray(source.completedEpisodes) : [],
    episodeProgress,
    miningSessions: completionBased ? finitePositive(source.miningSessions) : 0,
    dictionaryLookups: finitePositive(source.dictionaryLookups),
    kanjiLookups: finitePositive(source.kanjiLookups),
    cardsMined: finitePositive(source.cardsMined),
    activeDates: stringArray(source.activeDates).sort(),
    daily
  }
}

export function addWatchTime (
  statistics: MiningStatistics,
  mode: WatchMode,
  seconds: number,
  watchedSeconds: number,
  mediaId: number,
  episode: number,
  duration: number,
  now = Date.now()
): MiningStatistics {
  if (!Number.isFinite(seconds) || seconds <= 0) return statistics
  const date = localDateKey(now)
  const episodeKey = `${mediaId}:${episode}`
  const daily = statistics.daily[date] ?? { miningSeconds: 0, standardSeconds: 0, dictionaryLookups: 0, cardsMined: 0 }
  const previousProgress = statistics.episodeProgress[episodeKey]
  const safeDuration = finitePositive(duration) || previousProgress?.duration || 0
  const progress: EpisodeWatchProgress = {
    duration: safeDuration,
    watchedSeconds: {
      mining: previousProgress?.watchedSeconds.mining ?? 0,
      standard: previousProgress?.watchedSeconds.standard ?? 0,
      [mode]: (previousProgress?.watchedSeconds[mode] ?? 0) + finitePositive(watchedSeconds)
    }
  }
  const completionThreshold = safeDuration * 0.75
  const modeCompleted = completionThreshold > 0 && progress.watchedSeconds[mode] >= completionThreshold
  const totalCompleted = completionThreshold > 0 && progress.watchedSeconds.mining + progress.watchedSeconds.standard >= completionThreshold
  const episodes = modeCompleted && !statistics.episodes[mode].includes(episodeKey)
    ? [...statistics.episodes[mode], episodeKey]
    : statistics.episodes[mode]
  const completedEpisodes = totalCompleted && !statistics.completedEpisodes.includes(episodeKey)
    ? [...statistics.completedEpisodes, episodeKey]
    : statistics.completedEpisodes

  return trimDailyStatistics({
    ...statistics,
    updatedAt: now,
    watchSeconds: {
      ...statistics.watchSeconds,
      [mode]: statistics.watchSeconds[mode] + seconds
    },
    episodes: { ...statistics.episodes, [mode]: episodes },
    completedEpisodes,
    episodeProgress: { ...statistics.episodeProgress, [episodeKey]: progress },
    activeDates: statistics.activeDates.includes(date) ? statistics.activeDates : [...statistics.activeDates, date].sort(),
    daily: {
      ...statistics.daily,
      [date]: { ...daily, [`${mode}Seconds`]: daily[`${mode}Seconds`] + seconds }
    }
  })
}

export function addMiningSession (statistics: MiningStatistics, now = Date.now()): MiningStatistics {
  const date = localDateKey(now)
  return {
    ...statistics,
    updatedAt: now,
    miningSessions: statistics.miningSessions + 1,
    activeDates: statistics.activeDates.includes(date) ? statistics.activeDates : [...statistics.activeDates, date].sort()
  }
}

export function addDictionaryLookup (statistics: MiningStatistics, kind: MiningLookupKind, now = Date.now()): MiningStatistics {
  const date = localDateKey(now)
  const daily = statistics.daily[date] ?? { miningSeconds: 0, standardSeconds: 0, dictionaryLookups: 0, cardsMined: 0 }
  return trimDailyStatistics({
    ...statistics,
    updatedAt: now,
    dictionaryLookups: statistics.dictionaryLookups + 1,
    kanjiLookups: statistics.kanjiLookups + Number(kind === 'kanji'),
    activeDates: statistics.activeDates.includes(date) ? statistics.activeDates : [...statistics.activeDates, date].sort(),
    daily: { ...statistics.daily, [date]: { ...daily, dictionaryLookups: daily.dictionaryLookups + 1 } }
  })
}

export function addMinedCard (statistics: MiningStatistics, now = Date.now()): MiningStatistics {
  const date = localDateKey(now)
  const daily = statistics.daily[date] ?? { miningSeconds: 0, standardSeconds: 0, dictionaryLookups: 0, cardsMined: 0 }
  return trimDailyStatistics({
    ...statistics,
    updatedAt: now,
    cardsMined: statistics.cardsMined + 1,
    activeDates: statistics.activeDates.includes(date) ? statistics.activeDates : [...statistics.activeDates, date].sort(),
    daily: { ...statistics.daily, [date]: { ...daily, cardsMined: daily.cardsMined + 1 } }
  })
}

function trimDailyStatistics (statistics: MiningStatistics): MiningStatistics {
  const entries = Object.entries(statistics.daily).sort(([a], [b]) => a.localeCompare(b))
  if (entries.length <= MAX_DAILY_ENTRIES) return statistics
  return { ...statistics, daily: Object.fromEntries(entries.slice(-MAX_DAILY_ENTRIES)) }
}

export const miningStatistics = persisted<MiningStatistics>(STORAGE_KEY, createMiningStatistics(), {
  beforeRead: value => normalizeMiningStatistics(value)
})

export function recordWatchTime (mode: WatchMode, seconds: number, watchedSeconds: number, mediaId: number, episode: number, duration: number) {
  let completedModeEpisode = false
  miningStatistics.update(statistics => {
    const episodeKey = `${mediaId}:${episode}`
    const wasComplete = statistics.episodes[mode].includes(episodeKey)
    const next = addWatchTime(statistics, mode, seconds, watchedSeconds, mediaId, episode, duration)
    completedModeEpisode = !wasComplete && next.episodes[mode].includes(episodeKey)
    return next
  })
  return completedModeEpisode
}

export function recordMiningSession () {
  miningStatistics.update(addMiningSession)
}

export function recordDictionaryLookup (kind: MiningLookupKind = 'term') {
  miningStatistics.update(statistics => addDictionaryLookup(statistics, kind))
}

export function recordMinedCard () {
  miningStatistics.update(addMinedCard)
}

export function currentDayImmersionBaseline () {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date())
  const daily = get(miningStatistics).daily[date]
  return {
    date,
    miningSeconds: daily?.miningSeconds ?? 0,
    standardSeconds: daily?.standardSeconds ?? 0
  }
}
