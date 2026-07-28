import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const popup = await readFile(
  new URL('../static/mining-popup/hoshi-android/popup.js', import.meta.url),
  'utf8'
)
const css = await readFile(
  new URL('../static/mining-popup/hoshi-android/popup.css', import.meta.url),
  'utf8'
)

test('popup renders nasal and devoiced mora indicators from rich pitch entries', () => {
  assert.match(popup, /function createPitchHtml\(reading, pitchValue, nasalPositions = \[\], devoicePositions = \[\]\)/)
  assert.match(popup, /nasalSet\.has\(i \+ 1\)/)
  assert.match(popup, /devoiceSet\.has\(i \+ 1\)/)
  assert.match(popup, /pronunciation-nasal-indicator/)
  assert.match(popup, /pronunciation-devoice-indicator/)
  assert.match(css, /\.pronunciation-nasal-indicator/)
  assert.match(css, /\.pronunciation-devoice-indicator/)
})

test('popup uses string pitch patterns for graphs, positions, and categories', () => {
  assert.match(popup, /function getDownstepPositions\(pitchString\)/)
  assert.match(popup, /function pitchAccentValue\(accent\)/)
  assert.match(popup, /typeof pitchAccentValue === 'string'/)
})
