import assert from 'node:assert/strict'
import test from 'node:test'

import {
  addDictionaryLookup,
  addMinedCard,
  addMiningSession,
  addWatchTime,
  createMiningStatistics,
  localDateKey,
  normalizeMiningStatistics
} from '../src/lib/modules/mining/statistics.ts'

test('separates watch time and unique episodes by mining mode', () => {
  const now = new Date(2026, 7, 25, 12).getTime()
  let statistics = createMiningStatistics(now)
  statistics = addWatchTime(statistics, 'standard', 30, 30, 10, 1, 100, now)
  statistics = addWatchTime(statistics, 'standard', 20, 50, 10, 1, 100, now)
  statistics = addWatchTime(statistics, 'mining', 15, 75, 10, 1, 100, now)
  statistics = addWatchTime(statistics, 'mining', 25, 50, 10, 2, 100, now)

  assert.deepEqual(statistics.watchSeconds, { mining: 40, standard: 50 })
  assert.deepEqual(statistics.episodes.standard, ['10:1'])
  assert.deepEqual(statistics.episodes.mining, ['10:1'])
  assert.deepEqual(statistics.completedEpisodes, ['10:1'])
  assert.deepEqual(statistics.activeDates, [localDateKey(now)])
  assert.equal(statistics.daily[localDateKey(now)].miningSeconds, 40)
})

test('does not complete episodes below the 75 percent watch threshold', () => {
  const now = new Date(2026, 7, 25, 12).getTime()
  let statistics = createMiningStatistics(now)
  statistics = addWatchTime(statistics, 'mining', 70, 74, 10, 1, 100, now)

  assert.deepEqual(statistics.episodes.mining, [])
  assert.deepEqual(statistics.completedEpisodes, [])

  statistics = addWatchTime(statistics, 'mining', 1, 1, 10, 1, 100, now)
  assert.deepEqual(statistics.episodes.mining, ['10:1'])
  assert.deepEqual(statistics.completedEpisodes, ['10:1'])
})

test('tracks mining sessions, lookups, kanji lookups, and successful cards', () => {
  const now = new Date(2026, 7, 25, 12).getTime()
  let statistics = createMiningStatistics(now)
  statistics = addMiningSession(statistics, now)
  statistics = addDictionaryLookup(statistics, 'term', now)
  statistics = addDictionaryLookup(statistics, 'kanji', now)
  statistics = addMinedCard(statistics, now)

  assert.equal(statistics.miningSessions, 1)
  assert.equal(statistics.dictionaryLookups, 2)
  assert.equal(statistics.kanjiLookups, 1)
  assert.equal(statistics.cardsMined, 1)
  assert.deepEqual(statistics.activeDates, [localDateKey(now)])
  assert.deepEqual(statistics.daily[localDateKey(now)], {
    miningSeconds: 0,
    standardSeconds: 0,
    dictionaryLookups: 2,
    cardsMined: 1
  })
})

test('normalizes malformed persisted statistics', () => {
  const statistics = normalizeMiningStatistics({
    version: 2,
    watchSeconds: { mining: Number.NaN, standard: 12 },
    episodes: { mining: ['1:1', '1:1', 2], standard: null },
    completedEpisodes: ['1:1'],
    activeDates: ['2026-08-25', '2026-08-25', false],
    dictionaryLookups: -1
  }, 123)

  assert.deepEqual(statistics.watchSeconds, { mining: 0, standard: 12 })
  assert.deepEqual(statistics.episodes.mining, ['1:1'])
  assert.deepEqual(statistics.activeDates, ['2026-08-25'])
  assert.equal(statistics.dictionaryLookups, 0)
  assert.equal(statistics.startedAt, 123)
})

test('discards pre-completion episode and mining session counts when migrating version one data', () => {
  const statistics = normalizeMiningStatistics({
    version: 1,
    episodes: { mining: ['1:1'], standard: ['1:2'] },
    miningSessions: 8,
    watchSeconds: { mining: 12, standard: 34 }
  }, 123)

  assert.deepEqual(statistics.episodes, { mining: [], standard: [] })
  assert.deepEqual(statistics.completedEpisodes, [])
  assert.equal(statistics.miningSessions, 0)
  assert.deepEqual(statistics.watchSeconds, { mining: 12, standard: 34 })
})
