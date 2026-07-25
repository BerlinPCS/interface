import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const source = await readFile(
  new URL('../static/mining-popup/hoshi-android/runtime-overrides.js', import.meta.url),
  'utf8'
)

test('popup button icons use sandbox-safe embedded SVG masks', () => {
  const window = {
    addEventListener: () => {},
    applyButtonSlotVisualState: () => {}
  }
  const document = {
    addEventListener: () => {},
    readyState: 'loading'
  }

  vm.runInNewContext(source, { document, encodeURIComponent, MutationObserver: class {}, window })

  let iconUrl
  window.applyButtonSlotVisualState({
    dataset: { enabled: 'true', kind: 'mine', state: 'default' },
    style: {
      setProperty: (name, value) => {
        if (name === '--button-icon-url') iconUrl = value
      }
    }
  })

  assert.match(iconUrl, /^url\("data:image\/svg\+xml,/)
  assert.doesNotMatch(iconUrl, /appassets|\/icons\//)
})
