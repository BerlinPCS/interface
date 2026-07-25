/*
 * Hayase-specific URL overrides for the vendored Android popup.
 * Kept separate so popup.js remains byte-for-byte verifiable.
 */
(function () {
  'use strict'

  const iconPaths = {
    add_box: 'M19,3H5c-1.1,0 -2,0.9 -2,2v14c0,1.1 0.9,2 2,2h14c1.1,0 2,-0.9 2,-2V5c0,-1.1 -0.9,-2 -2,-2zM16,13h-3v3c0,0.55 -0.45,1 -1,1s-1,-0.45 -1,-1v-3H8c-0.55,0 -1,-0.45 -1,-1s0.45,-1 1,-1h3V8c0,-0.55 0.45,-1 1,-1s1,0.45 1,1v3h3c0.55,0 1,0.45 1,1s-0.45,1 -1,1z',
    check_box: 'M19,3H5c-1.1,0 -2,0.9 -2,2v14c0,1.1 0.9,2 2,2h14c1.1,0 2,-0.9 2,-2V5c0,-1.1 -0.9,-2 -2,-2zM10.71,16.29c-0.39,0.39 -1.03,0.39 -1.42,0l-3.58,-3.58c-0.39,-0.39 -0.39,-1.03 0,-1.42s1.03,-0.39 1.42,0L10,14.17l6.88,-6.88c0.39,-0.39 1.03,-0.39 1.42,0s0.39,1.03 0,1.42l-7.59,7.58z',
    close: 'M18.3,5.71C17.91,5.32 17.28,5.32 16.89,5.71L12,10.59L7.11,5.7C6.72,5.31 6.09,5.31 5.7,5.7C5.31,6.09 5.31,6.72 5.7,7.11L10.59,12L5.7,16.89C5.31,17.28 5.31,17.91 5.7,18.3C6.09,18.69 6.72,18.69 7.11,18.3L12,13.41L16.89,18.3C17.28,18.69 17.91,18.69 18.3,18.3C18.69,17.91 18.69,17.28 18.3,16.89L13.41,12L18.3,7.11C18.68,6.73 18.68,6.09 18.3,5.71Z',
    menu_book: 'M12 6.1A6.7 6.7 0 0 0 6.8 4H3v14h3.8c1.9 0 3.7.8 5.2 2 1.5-1.2 3.3-2 5.2-2H21V4h-3.8A6.7 6.7 0 0 0 12 6.1Zm-1 10.8A8.5 8.5 0 0 0 6.8 16H5V6h1.8c1.6 0 3.1.7 4.2 1.8Zm8-.9h-1.8c-1.5 0-2.9.3-4.2.9V7.8A5 5 0 0 1 17.2 6H19Z',
    volume_off: 'M16.5,12c0,-1.77 -1,-3.29 -2.5,-4.03v2.21l2.45,2.45c0.03,-0.2 0.05,-0.41 0.05,-0.63zM19,12c0,0.94 -0.2,1.82 -0.54,2.64l1.51,1.51C20.62,14.91 21,13.5 21,12c0,-4.28 -2.99,-7.86 -7,-8.77v2.06c2.89,0.86 5,3.54 5,6.71zM4.27,3L3,4.27 7.73,9H4c-0.55,0 -1,0.45 -1,1v4c0,0.55 0.45,1 1,1h3l3.29,3.29c0.63,0.63 1.71,0.18 1.71,-0.71v-4.73l4.25,4.25c-0.67,0.52 -1.42,0.93 -2.25,1.18v2.06c1.38,-0.31 2.63,-0.95 3.69,-1.81L19.73,21 21,19.73 4.27,3zM12,5.41c0,-0.89 -1.08,-1.34 -1.71,-0.71l-0.41,0.41L12,7.23V5.41z',
    volume_up: 'M3,9v6c0,0.55 0.45,1 1,1h3l3.29,3.29c0.63,0.63 1.71,0.18 1.71,-0.71V5.41c0,-0.89 -1.08,-1.34 -1.71,-0.71L7,8H4c-0.55,0 -1,0.45 -1,1zM16.5,12c0,-1.77 -1,-3.29 -2.5,-4.03v8.05c1.5,-0.73 2.5,-2.25 2.5,-4.02zM14,3.23v2.06c2.89,0.86 5,3.54 5,6.71s-2.11,5.85 -5,6.71v2.06c4.01,-0.91 7,-4.49 7,-8.77s-2.99,-7.86 -7,-8.77z'
  }
  const iconUrls = Object.fromEntries(Object.entries(iconPaths).map(([name, path]) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${path}"/></svg>`
    return [name, `url("data:image/svg+xml,${encodeURIComponent(svg)}")`]
  }))

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
      slot.style.setProperty('--button-icon-url', iconUrls[iconName])
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
