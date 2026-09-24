import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test from 'node:test'

// Mock AniList while exercising the real parser and complete playback resolver.
const anilistURL = 'data:text/javascript,' + encodeURIComponent(`
  export const media = new Map()
  export const searched = []
  export const requested = []
  export const client = {
    async searchCompound(titles) {
      searched.push(...titles)
      return titles.map(({key}) => [key, media.get(key) ?? media.get('default')])
    },
    async single(id) {
      requested.push(id)
      return {data: {Media: media.get(id)}}
    }
  }
  export const episodes = media => media.episodes ?? 0
  export const removeDiacritics = title => title
`)
const utilsURL = 'data:text/javascript,' + encodeURIComponent(`
  export {default as anitomyscript} from ${JSON.stringify(import.meta.resolve('anitomyscript'))}
  export const videoRx = /\\.mkv$/i
`)
const hooks = registerHooks({
  resolve (specifier, context, nextResolve) {
    if (specifier === '$lib/modules/anilist') return { url: anilistURL, shortCircuit: true }
    if (specifier === '$lib/utils') return { url: utilsURL, shortCircuit: true }
    return nextResolve(specifier, context)
  }
})
const { resolveFilesPoorly } = await import('../src/lib/components/ui/player/resolver.ts')
hooks.deregister()
const { media, searched, requested } = await import(anilistURL)

function season (id, count, prequel, sequel) {
  const edges = []
  if (prequel) edges.push({ relationType: 'PREQUEL', node: { id: prequel, format: 'TV' } })
  if (sequel) edges.push({ relationType: 'SEQUEL', node: { id: sequel, format: 'TV' } })
  const value = { id, episodes: count, format: 'TV', relations: { edges } }
  media.set(id, value)
  return value
}
const s1p1 = season(39535, 11, null, 127720)
season(127720, 12, 39535, 146065)
const s2p1 = season(146065, 13, 127720, 166873)
const s2p2 = season(166873, 12, 146065)
media.set('default', s2p1)

function batch (title, start, end) {
  return Array.from({ length: end - start + 1 }, (_, i) => ({
    name: `[MTBB] ${title} - ${String(i + start).padStart(2, '0')} (BD 1080p) [00000000].mkv`,
    path: `${title}/${i + start}.mkv`,
    url: `http://localhost/${i + start}`
  }))
}
function resolve (files, media, episode) {
  return resolveFilesPoorly(Promise.resolve({ files, media, episode, id: 'test-torrent' }))
}

test('MTBB S2 batch maps both cours and included episode 00 to AniList', async () => {
  const files = batch('Mushoku Tensei S2', 0, 24)
  const result = await resolve(files, s2p2, 1)
  assert.equal(result.target.name, files[13].name)
  assert.equal(result.target.metadata.media.id, s2p2.id)
  assert.equal(result.targetAnimeFiles.length, 12)
  assert.deepEqual(result.resolvedFiles.map(({ metadata }) => [metadata.media.id, metadata.episode]), [
    ...Array.from({ length: 13 }, (_, i) => [s2p1.id, i + 1]),
    ...Array.from({ length: 12 }, (_, i) => [s2p2.id, i + 1])
  ])
  assert.deepEqual(result.target.metadata.parseObject.episode_number, ['13'])
  assert.ok(!requested.includes(s1p1.id), 'must not walk back into Season 1')
  assert.ok(searched.some(({ title }) => title === 'Mushoku Tensei 2nd Season'))
  const last = await resolve(files, s2p2, 12)
  assert.equal(last.target.name, files[24].name)
  const part1 = await resolve(files, s2p1, 13)
  assert.equal(part1.target.name, files[12].name)
})

test('one-based releases are not shifted when no episode 00 is present', async () => {
  const files = batch('Mushoku Tensei s02', 1, 25)
  const result = await resolve(files, s2p2, 1)
  assert.equal(result.target.name, files[13].name)
  assert.equal(result.target.metadata.media.id, s2p2.id)
  assert.equal(result.targetAnimeFiles.length, 12)
})

test('other shows with separate episode 00 specials keep their numbering', async () => {
  const first = season(100, 12, null, 101)
  const second = season(101, 12, 100)
  media.set('Other Show S2', first)
  const files = batch('Other Show S2', 0, 24)
  const result = await resolve(files, second, 1)
  assert.equal(result.target.name, files[13].name)
  assert.equal(result.resolvedFiles[0].metadata.episode, 0)
  assert.equal(result.resolvedFiles[1].metadata.episode, 1)
})

test('absolute numbering without a season marker still traverses seasons', async () => {
  media.set('Mushoku Tensei', s1p1)
  const files = batch('Mushoku Tensei', 1, 23)
  const result = await resolve(files, media.get(127720), 1)
  assert.equal(result.target.name, files[11].name)
  assert.equal(result.target.metadata.media.id, 127720)
})

test('explicit S02E numbering resolves forward to the second cour', async () => {
  const files = batch('Mushoku Tensei', 1, 25).map((file, i) => ({
    ...file, name: `Mushoku Tensei S02E${String(i + 1).padStart(2, '0')}.mkv`
  }))
  media.set('Mushoku TenseiS02', s2p1)
  const result = await resolve(files, s2p2, 1)
  assert.equal(result.target.name, files[13].name)
  assert.equal(result.target.metadata.media.id, s2p2.id)
})
