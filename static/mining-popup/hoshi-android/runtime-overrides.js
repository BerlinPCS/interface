/*
 * Hayase-specific URL overrides for the vendored Android popup.
 * Kept separate so popup.js remains byte-for-byte verifiable.
 */
(function () {
  'use strict'

  const applyVisualState = window.applyButtonSlotVisualState
  if (typeof applyVisualState !== 'function') return

  window.applyButtonSlotVisualState = function (slot) {
    applyVisualState(slot)
    if (!slot) return
    const kind = slot.dataset.kind
    const state = slot.dataset.state || 'default'
    const iconName = kind === 'audio'
      ? (state === 'error' ? 'volume_off' : 'volume_up')
      : (state === 'duplicate' ? 'check_box' : 'add_box')
    slot.style.setProperty('--button-icon-url', `url("./icons/${iconName}.svg")`)
  }
})()
