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
      const iconName = kind === 'show-notes'
        ? 'menu_book'
        : kind === 'audio'
        ? (state === 'error' ? 'volume_off' : 'volume_up')
        : (state === 'error' ? 'close' : (state === 'duplicate' ? 'check_box' : 'add_box'))
      slot.style.setProperty('--button-icon-url', `url("./icons/${iconName}.svg")`)
      if (kind === 'mine') {
        slot.title = slot.dataset.error
          ? slot.dataset.error
          : (state === 'duplicate' ? 'Already in Anki' : 'Add to Anki')
      }
    }
  }

  window.addEventListener('hayase-mining-result', event => {
    const expression = event.detail?.expression
    const result = event.detail?.result
    const phase = event.detail?.phase
    if (!expression || !result) return
    const entries = Array.isArray(window.lookupEntries) ? window.lookupEntries : []
    const applyResult = () => entries.forEach((entry, index) => {
      if (entry?.expression !== expression) return
      const slot = document.querySelector(`.button-slot[data-kind="mine"][data-entry-index="${index}"]`)
      if (!slot) return
      const duplicate = result.status === 'duplicate' || (result.status === 'success' && result.duplicate === true)
      const noteExists = duplicate || (phase === 'add' && result.status === 'success')
      const failed = result.status === 'error'
      const enabled = !failed &&
        window.hayaseMiningConfigured &&
        (!duplicate || window.allowDupes) &&
        (phase !== 'add' || window.allowDupes)
      slot.dataset.error = failed ? (result.message || 'Could not add note') : ''
      window.updateButtonSlot?.(slot, {
        state: duplicate || (phase === 'add' && result.status === 'success') ? 'duplicate' : 'default',
        enabled
      })
      if (!window.updateButtonSlot) {
        slot.dataset.state = noteExists ? 'duplicate' : 'default'
        slot.dataset.enabled = String(enabled)
        window.applyButtonSlotVisualState?.(slot)
      }
      const showNotesSlot = document.querySelector(`.button-slot[data-kind="show-notes"][data-entry-index="${index}"]`)
      if (showNotesSlot) {
        showNotesSlot.style.display = noteExists && window.hayaseShowNotes ? '' : 'none'
        showNotesSlot.disabled = !window.hayaseMiningConfigured
      }
    })
    window.setTimeout(applyResult)
    if (phase === 'add') window.setTimeout(applyResult, 1200)
  })

  function installShowNotesButtons () {
    const container = document.getElementById('entries-container')
    if (!container) return
    const update = () => {
      container.querySelectorAll('.button-slot[data-kind="mine"]').forEach(mineSlot => {
        const buttons = mineSlot.parentElement
        const entryIndex = mineSlot.dataset.entryIndex
        if (!buttons || entryIndex == null || buttons.querySelector(`.button-slot[data-kind="show-notes"][data-entry-index="${entryIndex}"]`)) return
        const slot = document.createElement('button')
        slot.type = 'button'
        slot.className = 'button-slot'
        slot.dataset.kind = 'show-notes'
        slot.dataset.entryIndex = entryIndex
        slot.dataset.state = 'default'
        slot.dataset.enabled = String(Boolean(window.hayaseMiningConfigured))
        slot.disabled = !window.hayaseMiningConfigured
        slot.style.display = mineSlot.dataset.state === 'duplicate' && window.hayaseShowNotes ? '' : 'none'
        slot.title = 'Show notes in Anki'
        slot.setAttribute('aria-label', 'Show notes in Anki')
        const icon = document.createElement('span')
        icon.className = 'button-slot-icon'
        slot.appendChild(icon)
        window.applyButtonSlotVisualState?.(slot)
        slot.addEventListener('click', async event => {
          event.preventDefault()
          event.stopPropagation()
          const expression = window.lookupEntries?.[Number(entryIndex)]?.expression
          if (!expression || slot.disabled) return
          slot.disabled = true
          try {
            const result = await window.webkit?.messageHandlers?.showNotes?.postMessage(expression)
            if (result?.status === 'error') slot.title = result.message || 'Could not open Anki notes'
          } finally {
            slot.disabled = !window.hayaseMiningConfigured
          }
        })
        buttons.insertBefore(slot, buttons.firstChild)
        const audioSlot = buttons.querySelector(`.button-slot[data-kind="audio"][data-entry-index="${entryIndex}"]`)
        if (audioSlot && mineSlot.nextElementSibling !== audioSlot) buttons.insertBefore(mineSlot, audioSlot)
      })
    }
    update()
    new MutationObserver(update).observe(container, { childList: true, subtree: true })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installShowNotesButtons, { once: true })
  } else {
    installShowNotesButtons()
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
