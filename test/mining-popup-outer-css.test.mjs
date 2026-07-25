import assert from 'node:assert/strict'
import test from 'node:test'

import { scopeMiningPopupOuterCss } from '../src/lib/modules/mining-popup-outer-css.ts'

test('outer popup CSS scopes the Hoshi selector to one popup', () => {
  const result = scopeMiningPopupOuterCss(`
iframe.hoshi-popup {
  background: rgba(45, 45, 55, 0.85) !important;
}
`, '[data-mining-popup-id="popup-1"]')

  assert.match(result, /^@scope \(\[data-mining-popup-id="popup-1"\]\)/)
  assert.match(result, /:scope \{/)
  assert.doesNotMatch(result, /iframe\.hoshi-popup/)
})

test('outer popup CSS leaves descendant selectors scoped to the popup', () => {
  const result = scopeMiningPopupOuterCss(
    '.action-bar { background: transparent; }',
    '[data-mining-popup-id="popup-2"]'
  )

  assert.match(result, /\.action-bar \{ background: transparent; \}/)
})
