import assert from 'node:assert/strict'
import test from 'node:test'

import {
  BUNDLED_AUDIO_CODECS,
  bundledAudioCodec,
  hasBundledAudioDecoder,
  shouldTryCompatibilityPlayer
} from '../src/lib/components/ui/player/audio-codec-support.ts'

test('recognizes MediaBunny and WebCodecs names for bundled audio decoders', () => {
  assert.deepEqual(BUNDLED_AUDIO_CODECS, ['ac3', 'eac3', 'dts', 'truehd'])
  assert.equal(bundledAudioCodec('ac-3'), 'ac3')
  assert.equal(bundledAudioCodec('ec-3'), 'eac3')
  assert.equal(bundledAudioCodec('dtsc'), 'dts')
  assert.equal(bundledAudioCodec('MLP'), 'truehd')
  assert.equal(hasBundledAudioDecoder('aac'), false)
})

test('only attempts automatic compatibility playback once', () => {
  assert.equal(shouldTryCompatibilityPlayer(false, false), true)
  assert.equal(shouldTryCompatibilityPlayer(true, false), false)
  assert.equal(shouldTryCompatibilityPlayer(false, true), false)
})
