import assert from 'node:assert/strict'
import test from 'node:test'

import { episodeAirDateMs, episodeByAirDate } from '../src/lib/modules/extensions/episode-mapping.ts'

function mappedEpisodes (episodes) {
  return new Map(Object.entries(episodes).map(([key, value]) => [
    key,
    { ...value, airdatems: episodeAirDateMs(value) }
  ]))
}

test('prefers TVDB UTC dates over AniDB prerelease dates', () => {
  const episodes = mappedEpisodes({
    1: {
      episode: '1',
      tvdbId: 10997827,
      airDateUtc: '2026-07-07T12:30:00Z',
      airdate: '2026-06-21'
    },
    2: {
      episode: '2',
      tvdbId: 11875657,
      airDateUtc: '2026-07-14T12:30:00Z',
      airdate: '2026-07-14'
    }
  })

  const resolved = episodeByAirDate(new Date('2026-07-07T12:30:00Z'), episodes, 1)
  assert.equal(resolved?.tvdbId, 10997827)
})

test('falls back to AniDB dates when TVDB dates are unavailable', () => {
  const episodes = mappedEpisodes({
    1: { episode: '1', airdate: '2026-07-07' },
    2: { episode: '2', airdate: '2026-07-14' }
  })

  assert.equal(episodeByAirDate(new Date('2026-07-14'), episodes, 2)?.episode, '2')
})

test('falls back to the numbered episode when dates are unusable', () => {
  const episodes = mappedEpisodes({
    1: { episode: '1', airDateUtc: 'invalid' },
    2: { episode: '2' }
  })

  assert.equal(episodeByAirDate(new Date('2026-07-07'), episodes, 1)?.episode, '1')
})
