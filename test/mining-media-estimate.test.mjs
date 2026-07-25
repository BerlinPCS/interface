import assert from 'node:assert/strict'
import test from 'node:test'

import {
  estimateMiningMedia,
  formatEstimatedBytes,
  formatEstimatedDuration
} from '../src/lib/modules/mining-media-estimate.ts'

const base = {
  captureImage: true,
  captureAudio: true,
  imageMode: 'animated',
  staticFormat: 'webp',
  animatedFormat: 'webp',
  quality: 'balanced',
  maxHeight: 720,
  fps: 12,
  paddingBefore: 0,
  paddingAfter: 0
}

test('estimates the default five-second animated WebP and MP3 capture', () => {
  const estimate = estimateMiningMedia(base)
  assert.equal(estimate.durationSeconds, 5)
  assert.ok(estimate.imageBytes > 1_200_000 && estimate.imageBytes < 1_400_000)
  assert.equal(estimate.audioBytes, 60_000)
  assert.equal(estimate.totalBytes, estimate.imageBytes + estimate.audioBytes)
  assert.equal(formatEstimatedBytes(estimate.totalBytes), '1.3 MiB')
  assert.equal(formatEstimatedDuration(estimate.creationSeconds), '2.8s')
})

test('estimate responds to formats, quality, dimensions, FPS, and padding', () => {
  const fastAvif = estimateMiningMedia({
    ...base,
    animatedFormat: 'avif',
    quality: 'fast',
    maxHeight: 480,
    fps: 8
  })
  const highWebp = estimateMiningMedia({
    ...base,
    animatedFormat: 'webp',
    quality: 'high',
    maxHeight: 1080,
    fps: 24,
    paddingBefore: 1,
    paddingAfter: 1
  })
  assert.ok(highWebp.totalBytes > fastAvif.totalBytes * 20)
  assert.ok(highWebp.creationSeconds > fastAvif.creationSeconds * 5)
  assert.equal(highWebp.durationSeconds, 7)
})

test('static estimates do not scale image size with FPS or sentence duration', () => {
  const first = estimateMiningMedia({
    ...base,
    imageMode: 'static',
    captureAudio: false,
    fps: 1
  })
  const second = estimateMiningMedia({
    ...base,
    imageMode: 'static',
    captureAudio: false,
    fps: 30,
    paddingBefore: 5,
    paddingAfter: 5
  })
  assert.equal(first.imageBytes, second.imageBytes)
  assert.equal(first.audioBytes, 0)
})
