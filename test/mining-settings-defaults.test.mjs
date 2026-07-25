import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_MINING_MEDIA_SETTINGS,
  migrateMiningMediaSettings
} from '../src/lib/modules/mining-media-settings.ts'

test('new mining media settings migrate through persisted-settings defaults', () => {
  const previousSettings = {
    miningAnkiCaptureScreenshot: true,
    miningAnkiCaptureAudio: false
  }
  const migrated = {
    miningAnkiImageMode: DEFAULT_MINING_MEDIA_SETTINGS.imageMode,
    miningAnkiStaticImageFormat: DEFAULT_MINING_MEDIA_SETTINGS.staticImageFormat,
    miningAnkiAnimatedImageFormat: DEFAULT_MINING_MEDIA_SETTINGS.animatedImageFormat,
    miningAnkiMediaQuality: DEFAULT_MINING_MEDIA_SETTINGS.quality,
    miningAnkiImageMaxHeight: DEFAULT_MINING_MEDIA_SETTINGS.maxHeight,
    miningAnkiAnimationFps: DEFAULT_MINING_MEDIA_SETTINGS.animationFps,
    miningAnkiSyncAnimationToWordAudio: DEFAULT_MINING_MEDIA_SETTINGS.syncAnimationToWordAudio,
    miningAnkiCaptureAudio: true,
    ...previousSettings
  }

  assert.equal(migrated.miningAnkiImageMode, 'static')
  assert.equal(migrated.miningAnkiStaticImageFormat, 'webp')
  assert.equal(migrated.miningAnkiAnimatedImageFormat, 'webp')
  assert.equal(migrated.miningAnkiMediaQuality, 'balanced')
  assert.equal(migrated.miningAnkiImageMaxHeight, 720)
  assert.equal(migrated.miningAnkiAnimationFps, 12)
  assert.equal(migrated.miningAnkiSyncAnimationToWordAudio, false)
  assert.equal(migrated.miningAnkiCaptureAudio, false)
})

test('removed GIF capture settings migrate to animated WebP', () => {
  assert.deepEqual(migrateMiningMediaSettings({
    miningAnkiAnimatedImageFormat: 'gif',
    miningAnkiAnimationFps: 24
  }), {
    miningAnkiAnimatedImageFormat: 'webp',
    miningAnkiAnimationFps: 24
  })
  assert.equal(
    migrateMiningMediaSettings({ miningAnkiAnimatedImageFormat: 'avif' })
      .miningAnkiAnimatedImageFormat,
    'avif'
  )
})
