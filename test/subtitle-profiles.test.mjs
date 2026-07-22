import assert from 'node:assert/strict'
import test from 'node:test'

import anitomy from 'anitomyscript'

import {
  advanceAlignment,
  alignmentCacheKey,
  alignmentStatus,
  cachedSubtitleAlignment,
  initialAlignmentProgress,
  rankJimakuCandidates,
  readSubtitleAlignmentCache,
  saveSubtitleAlignment,
  SUBTITLE_ALIGNMENT_CACHE_KEY,
  subtitleReleaseProfile,
  writeSubtitleAlignmentCache
} from '../src/lib/components/ui/player/subtitle-profiles.ts'

async function candidates (filenames) {
  const parsed = await anitomy(filenames)
  return filenames.map((filename, index) => ({
    value: filename,
    filename,
    profile: subtitleReleaseProfile(filename, parsed[index]),
    episodeNumbers: parsed[index].episode_number,
    index
  }))
}

test('derives release groups and distinct provider profiles', async () => {
  const filenames = [
    '[NanakoRaws] Show S03E01 (1080p).ass',
    '[NanakoRaws] Show S03E02 (1080p).srt',
    '番組.S03E01.題名.WEBRip.DMMTV.ja[cc].srt',
    '番組.S03E02.次回.WEBRip.DMMTV.ja[cc].srt',
    '番組.S03E02.次回.WEBRip.Netflix.ja[cc].srt'
  ]
  const parsed = await anitomy(filenames)
  const profiles = filenames.map((filename, index) => subtitleReleaseProfile(filename, parsed[index]))

  assert.equal(profiles[0], 'group:nanakoraws')
  assert.equal(profiles[0], profiles[1])
  assert.equal(profiles[2], profiles[3])
  assert.notEqual(profiles[2], profiles[4])
  assert.doesNotMatch(profiles[2], /group:cc/)
})

test('reads, scopes, validates, and writes confirmed offsets', () => {
  const values = new Map([[SUBTITLE_ALIGNMENT_CACHE_KEY, JSON.stringify({
    [alignmentCacheKey(1, 'group:nanako')]: { offset: -2.7, updatedAt: 10 },
    broken: { offset: 999, updatedAt: 10 }
  })]])
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  }
  const cache = readSubtitleAlignmentCache(storage)

  assert.deepEqual(cachedSubtitleAlignment(cache, 1, 'group:nanako'), { offset: -2.7, updatedAt: 10 })
  assert.equal(cachedSubtitleAlignment(cache, 2, 'group:nanako'), undefined)
  assert.equal(cache.broken, undefined)

  saveSubtitleAlignment(cache, 1, 'group:zero', 0, 20)
  writeSubtitleAlignmentCache(cache, storage)
  assert.equal(JSON.parse(values.get(SUBTITLE_ALIGNMENT_CACHE_KEY))[alignmentCacheKey(1, 'group:zero')].offset, 0)
  assert.deepEqual(readSubtitleAlignmentCache({ getItem: () => '{not json' }), {})
})

test('applies estimates immediately but confirms only at a later cue milestone', () => {
  let progress = initialAlignmentProgress()
  assert.equal(alignmentStatus(progress), 'timing')

  let update = advanceAlignment(progress, -2.7, 4)
  assert.equal(update.applyOffset, true)
  assert.equal(update.confirmedNow, false)
  progress = update.progress
  assert.equal(alignmentStatus(progress), 'provisional')

  update = advanceAlignment(progress, -2.7, 4)
  assert.equal(update.progress.matchingEstimates, 1)
  assert.equal(update.confirmedNow, false)

  update = advanceAlignment(progress, -2.6, 8)
  progress = update.progress
  assert.equal(update.confirmedNow, true)
  assert.equal(alignmentStatus(progress), 'confirmed')

  update = advanceAlignment(progress, 1.5, 12)
  progress = update.progress
  assert.equal(update.applyOffset, true)
  assert.equal(alignmentStatus(progress), 'provisional')

  update = advanceAlignment(progress, 1.5, 16)
  assert.equal(update.confirmedNow, true)
  assert.equal(alignmentStatus(update.progress), 'confirmed')
})

test('cached offsets are provisional until a live estimate verifies them', () => {
  let progress = initialAlignmentProgress({ offset: 0, updatedAt: 1 })
  assert.equal(alignmentStatus(progress), 'provisional')

  progress = advanceAlignment(progress, 0, 4).progress
  assert.equal(alignmentStatus(progress), 'provisional')

  const update = advanceAlignment(progress, 0.1, 8)
  assert.equal(update.confirmedNow, true)
  assert.equal(update.applyOffset, false)
  assert.equal(alignmentStatus(update.progress), 'confirmed')
})

test('ranks cached exact candidates first and explicit ranges last', async () => {
  const parsed = await candidates([
    '[Fresh] Show S03E01.ass',
    '[Known] Show S03E01.ass',
    '[Older] Show S03E01.ass',
    '[NanakoRaws] Mushoku Tensei S03E01-02 (AT-X 1080p HEVC AAC).ass',
    '[shincaps] Mushoku Tensei III ~Isekai Ittara Honki Dasu~ - 01-02 (AT-X 1440x1080 MPEG2 AAC).ass',
    'unparseable subtitle.srt'
  ])
  const cache = {}
  saveSubtitleAlignment(cache, 7, 'group:known', -2, 50)
  saveSubtitleAlignment(cache, 7, 'group:older', -1, 40)

  assert.deepEqual(rankJimakuCandidates(parsed, cache, 7, false).map(candidate => candidate.value), [
    '[Known] Show S03E01.ass',
    '[Older] Show S03E01.ass',
    '[Fresh] Show S03E01.ass',
    'unparseable subtitle.srt',
    '[NanakoRaws] Mushoku Tensei S03E01-02 (AT-X 1080p HEVC AAC).ass',
    '[shincaps] Mushoku Tensei III ~Isekai Ittara Honki Dasu~ - 01-02 (AT-X 1440x1080 MPEG2 AAC).ass'
  ])
  assert.equal(rankJimakuCandidates(parsed, cache, 7, true).at(-1).value, 'unparseable subtitle.srt')
})
