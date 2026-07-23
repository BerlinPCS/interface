import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_MINING_AUDIO_SOURCES,
  enabledMiningAudioTemplates,
  HAYASE_LOCAL_AUDIO_SOURCE_URL,
  normalizeMiningAudioSources,
  withLocalMiningAudioSource
} from '../src/lib/modules/mining-audio.ts'

test('repairs duplicate sources and preserves the built-in default', () => {
  const sources = normalizeMiningAudioSources([
    { id: 'one', name: 'Custom', url: 'https://audio.test/?term={term}', enabled: true },
    { id: 'two', name: 'Duplicate', url: 'https://audio.test/?term={term}', enabled: true }
  ])
  assert.equal(sources.filter(source => source.url === 'https://audio.test/?term={term}').length, 1)
  assert.equal(sources.some(source => source.url === DEFAULT_MINING_AUDIO_SOURCES[0].url), true)
})

test('adds and removes the local source without duplicating it', () => {
  const enabled = withLocalMiningAudioSource(DEFAULT_MINING_AUDIO_SOURCES, true)
  assert.equal(enabled[0].url, HAYASE_LOCAL_AUDIO_SOURCE_URL)
  assert.deepEqual(enabledMiningAudioTemplates(enabled), [
    HAYASE_LOCAL_AUDIO_SOURCE_URL,
    DEFAULT_MINING_AUDIO_SOURCES[0].url
  ])
  assert.equal(withLocalMiningAudioSource(enabled, false).some(source => source.url === HAYASE_LOCAL_AUDIO_SOURCE_URL), false)
})
