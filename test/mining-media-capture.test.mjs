import assert from 'node:assert/strict'
import test from 'node:test'

import { drawMiningScreenshotFrame, encodeWavRange } from '../src/lib/modules/mining-media-capture.ts'

function audioBuffer (channels, sampleRate = 4) {
  return {
    sampleRate,
    numberOfChannels: channels.length,
    length: channels[0].length,
    getChannelData: channel => Float32Array.from(channels[channel])
  }
}

test('encodes and trims decoded subtitle audio as 16-bit WAV', () => {
  const output = encodeWavRange([
    {
      buffer: audioBuffer([[0, 0.5, -0.5, 1], [0, -0.5, 0.5, -1]]),
      timestamp: 10,
      duration: 1
    }
  ], 10.25, 10.75)
  const view = new DataView(output)

  assert.equal(new TextDecoder().decode(new Uint8Array(output, 0, 4)), 'RIFF')
  assert.equal(new TextDecoder().decode(new Uint8Array(output, 8, 4)), 'WAVE')
  assert.equal(view.getUint16(22, true), 2)
  assert.equal(view.getUint32(24, true), 4)
  assert.equal(view.getUint32(40, true), 8)
  assert.equal(view.getInt16(44, true), 16384)
  assert.equal(view.getInt16(46, true), -16384)
  assert.equal(view.getInt16(48, true), -16384)
  assert.equal(view.getInt16(50, true), 16384)
})

test('rejects an empty audio range', () => {
  assert.throws(() => encodeWavRange([
    { buffer: audioBuffer([[0, 0]]), timestamp: 0, duration: 0.5 }
  ], 2, 3), /empty/)
})

test('draws the subtitle overlay after the video frame when requested', () => {
  const calls = []
  const video = {}
  const subtitles = {}
  drawMiningScreenshotFrame({
    drawImage: (...args) => calls.push(args)
  }, video, 1920, 1080, subtitles)

  assert.deepEqual(calls, [
    [video, 0, 0, 1920, 1080],
    [subtitles, 0, 0, 1920, 1080]
  ])
})
