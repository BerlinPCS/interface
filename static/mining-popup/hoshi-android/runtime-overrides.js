/*
 * Hayase-specific URL overrides for the vendored Android popup.
 * Kept separate so popup.js remains byte-for-byte verifiable.
 */
(function () {
  'use strict'

  const applyVisualState = window.applyButtonSlotVisualState
  if (typeof applyVisualState === 'function') {
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
  }

  let hoverTimer
  let lastHoverTarget
  let lastHoverOffset = -1

  function clearHoverTimer () {
    if (hoverTimer) window.clearTimeout(hoverTimer)
    hoverTimer = undefined
  }

  function caretOffsetAtPoint (x, y) {
    const range = document.caretRangeFromPoint?.(x, y)
    return range?.startOffset ?? -1
  }

  document.addEventListener('pointermove', event => {
    if (!window.nestedLookupOnHover || event.pointerType !== 'mouse') {
      clearHoverTimer()
      return
    }

    const target = event.target?.nodeType === Node.TEXT_NODE
      ? event.target.parentElement
      : event.target
    if (
      !target?.closest?.('.glossary-content, .expr-tag') ||
      window.isPopupInteractiveTapTarget?.(target)
    ) {
      clearHoverTimer()
      lastHoverTarget = undefined
      lastHoverOffset = -1
      return
    }

    const offset = caretOffsetAtPoint(event.clientX, event.clientY)
    if (target === lastHoverTarget && offset === lastHoverOffset) return
    lastHoverTarget = target
    lastHoverOffset = offset
    clearHoverTimer()
    const x = event.clientX
    const y = event.clientY
    hoverTimer = window.setTimeout(() => {
      hoverTimer = undefined
      if (!window.nestedLookupOnHover) return
      window.handlePopupTap?.(target, x, y)
    }, 140)
  }, { passive: true })

  document.addEventListener('pointerleave', () => {
    clearHoverTimer()
    lastHoverTarget = undefined
    lastHoverOffset = -1
  })
})()
