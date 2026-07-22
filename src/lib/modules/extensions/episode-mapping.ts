import type { Episode } from '../anizip/types'

export type MappedEpisode = Episode & { airdatems?: number }

export function episodeAirDateMs (episode: Episode): number | undefined {
  for (const date of [episode.airDateUtc, episode.airDate, episode.airdate]) {
    if (!date) continue
    const timestamp = +new Date(date)
    if (Number.isFinite(timestamp)) return timestamp
  }
}

export function episodeByAirDate (alDate: Date | undefined, episodes: Map<string, MappedEpisode>, episode: number): MappedEpisode | undefined {
  if (!alDate || !Number.isFinite(+alDate)) return episodes.get('' + episode)

  const datedEpisodes = [...episodes.values()].filter(value => Number.isFinite(value.airdatems))
  if (!datedEpisodes.length) return episodes.get('' + episode)

  // Multiple episodes can have the same air-date distance. Resolve those ties
  // using the requested episode number so batch releases remain deterministic.
  const closestDistance = Math.min(...datedEpisodes.map(value => Math.abs(value.airdatems! - +alDate)))
  const closestEpisodes = datedEpisodes.filter(value => Math.abs(value.airdatems! - +alDate) === closestDistance)

  return closestEpisodes.reduce((prev, curr) => {
    return Math.abs(Number(curr.episode) - episode) < Math.abs(Number(prev.episode) - episode) ? curr : prev
  })
}
