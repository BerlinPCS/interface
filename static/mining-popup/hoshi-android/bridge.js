/*
 * Hayase host adapter for the vendored Hoshi Reader Android popup runtime.
 * This file is Hayase-owned and intentionally kept separate from popup.js.
 */
(function () {
  'use strict'

  const SOURCE = 'hayase-mining-popup'
  const VERSION = 1
  let nonce = null
  let popupId = null
  let resultSetId = null
  let nextRequestId = 1
  let initialized = false
  let runtimeCapabilities = {}
  let backCount = 0
  let forwardCount = 0
  const backResultSets = []
  const forwardResultSets = []
  const pending = new Map()
  const browserFetch = window.fetch.bind(window)

  function envelope (message) {
    return { source: SOURCE, version: VERSION, nonce, ...message }
  }

  function post (message) {
    if (!nonce) return
    window.parent.postMessage(envelope(message), '*')
  }

  function postPopupEvent (type, body = {}) {
    if (!popupId) return
    post({ type, popupId, ...body })
  }

  function request (method, payload) {
    if (!popupId || !resultSetId) return Promise.reject(new Error('Popup is not ready'))
    const requestId = String(nextRequestId++)
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(requestId)
        reject(new Error(`${method} request timed out`))
      }, 10000)
      pending.set(requestId, { resolve, reject, timeout })
      post({
        type: 'request',
        popupId,
        resultSetId,
        requestId,
        method,
        payload
      })
    })
  }

  window.fetch = async function (resource, options) {
    const value = typeof resource === 'string' ? resource : resource?.url
    if (typeof value === 'string' && value.startsWith('hayase-audio-request://')) {
      const target = new URL(value).searchParams.get('url')
      const audioUrl = target ? await request('resolveAudioSource', target) : null
      return new Response(JSON.stringify({
        type: 'audioSourceList',
        audioSources: typeof audioUrl === 'string' && audioUrl
          ? [{ name: 'Hayase', url: audioUrl }]
          : []
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }
    return browserFetch(resource, options)
  }

  function rejectPending (reason) {
    for (const item of pending.values()) {
      clearTimeout(item.timeout)
      item.reject(new Error(reason))
    }
    pending.clear()
  }

  function historyChanged () {
    postPopupEvent('historyChanged', { backCount, forwardCount })
  }

  window.webkit = {
    messageHandlers: {
      openLink: { postMessage: url => request('openExternalLink', url) },
      textSelected: { postMessage: selection => postPopupEvent('selectionChanged', { selection }) },
      tapOutside: { postMessage: () => postPopupEvent('tapOutside') },
      swipeDismiss: { postMessage: () => postPopupEvent('dismiss') },
      playWordAudio: { postMessage: content => { request('playWordAudio', content).catch(() => {}) } },
      shellReady: { postMessage: () => {} },
      contentReady: { postMessage: () => postPopupEvent('contentReady') },
      popupScrolled: { postMessage: () => postPopupEvent('scrolled') },
      mineEntry: { postMessage: content => runtimeCapabilities.mining ? request('mineEntry', content) : Promise.resolve(false) },
      duplicateCheck: { postMessage: expression => runtimeCapabilities.mining ? request('duplicateCheck', expression) : Promise.resolve(false) },
      getEntry: { postMessage: index => request('getEntry', index) },
      lookupRedirect: {
        postMessage: async query => {
          const result = await request('lookupRedirect', query)
          if (!result || typeof result !== 'object') return 0
          const count = Number.isInteger(result.count) ? result.count : 0
          if (count > 0 && typeof result.resultSetId === 'string') {
            backResultSets.push(resultSetId)
            forwardResultSets.length = 0
            resultSetId = result.resultSetId
            backCount++
            forwardCount = 0
            historyChanged()
          }
          return count
        }
      }
    }
  }

  function applySettings (settings, capabilities) {
    runtimeCapabilities = capabilities
    window.scanNonJapaneseText = settings.scanNonJapaneseText
    window.scanLength = settings.scanLength
    window.collapseMode = settings.collapseMode === 'collapseAll' ? 'Collapse All' : 'Expand All'
    window.expandFirstDictionary = settings.expandFirstDictionary
    window.collapsedDictionaries = []
    window.compactGlossaries = settings.compactGlossaries
    window.showExpressionTags = settings.showExpressionTags
    window.harmonicFrequency = settings.harmonicFrequency
    window.deduplicatePitchAccents = settings.deduplicatePitchAccents
    window.compactPitchAccents = settings.compactPitchAccents
    window.dictionaryStyles = settings.dictionaryStyles
    window.audioSources = capabilities.audio ? (settings.audioSources || []) : []
    window.audioRequestEndpoint = capabilities.audio ? 'hayase-audio-request://resolve' : ''
    window.audioEnableAutoplay = capabilities.audio && settings.audioEnableAutoplay
    window.audioPlaybackMode = settings.audioPlaybackMode
    window.needsAudio = false
    window.allowDupes = false
    window.useAnkiConnect = capabilities.mining
    window.embedMedia = false
    window.compactGlossariesAnki = settings.compactGlossaries
    window.customCSS = settings.customCss
    window.swipeThreshold = 0
    window.disablePopupImageViewportMaxHeight = true
    window.dictionaryMediaRequestEndpoint = capabilities.dictionaryMedia ? 'hayase-dictionary-media://media' : ''

    const root = document.documentElement
    root.dataset.hoshiColorScheme = settings.darkMode ? 'dark' : 'light'
    root.style.zoom = String(settings.scale)

    let customStyle = document.getElementById('popup-custom-css')
    if (!customStyle) {
      customStyle = document.createElement('style')
      customStyle.id = 'popup-custom-css'
      document.head.appendChild(customStyle)
    }
    customStyle.textContent = settings.customCss

    let capabilityStyle = document.getElementById('hayase-popup-capability-css')
    if (!capabilityStyle) {
      capabilityStyle = document.createElement('style')
      capabilityStyle.id = 'hayase-popup-capability-css'
      document.head.appendChild(capabilityStyle)
    }
    capabilityStyle.textContent = capabilities.mining
      ? ''
      : '.button-slot[data-kind="mine"] { display: none !important; }'
  }

  function reset () {
    rejectPending('Popup reset')
    popupId = null
    resultSetId = null
    backCount = 0
    forwardCount = 0
    backResultSets.length = 0
    forwardResultSets.length = 0
    window.hoshiSelection?.clearSelection()
    window.resetPopupResults?.()
    window.closeOverlay?.()
  }

  function render (message) {
    rejectPending('Popup results replaced')
    popupId = message.popupId
    resultSetId = message.resultSetId
    backCount = 0
    forwardCount = 0
    backResultSets.length = 0
    forwardResultSets.length = 0
    window.closeOverlay?.()
    window.replacePopupResults?.(
      message.entryCount,
      message.initialEntry ? [message.initialEntry] : []
    )
    historyChanged()
  }

  window.addEventListener('message', event => {
    if (event.source !== window.parent) return
    const message = event.data
    if (!message || message.source !== SOURCE || message.version !== VERSION) return

    if (message.type === 'initialize') {
      if (initialized && message.nonce !== nonce) return
      nonce = message.nonce
      initialized = true
      applySettings(message.settings, message.capabilities)
      post({ type: 'ready' })
      return
    }
    if (!initialized || message.nonce !== nonce) return

    if (message.type === 'reply') {
      const item = pending.get(message.requestId)
      if (!item) return
      pending.delete(message.requestId)
      clearTimeout(item.timeout)
      if (message.ok) item.resolve(message.value)
      else item.reject(new Error(message.error || 'Popup request failed'))
      return
    }
    if (message.type === 'render') {
      render(message)
      return
    }
    if (message.popupId !== popupId) return
    if (message.type === 'reset') {
      reset()
    } else if (message.type === 'clearSelection') {
      window.hoshiSelection?.clearSelection()
    } else if (message.type === 'navigateBack') {
      window.navigateBack?.()
      if (backCount > 0) {
        forwardResultSets.push(resultSetId)
        resultSetId = backResultSets.pop() || resultSetId
        backCount--
        forwardCount++
        historyChanged()
      }
    } else if (message.type === 'navigateForward') {
      window.navigateForward?.()
      if (forwardCount > 0) {
        backResultSets.push(resultSetId)
        resultSetId = forwardResultSets.pop() || resultSetId
        forwardCount--
        backCount++
        historyChanged()
      }
    } else if (message.type === 'focus') {
      window.focus()
    }
  })

  function installContentReadyObserver () {
    const container = document.getElementById('entries-container')
    let observer = null
    let postedForPopup = null

    window.hoshiPopupObserveContentReady = function () {
      postedForPopup = null
      observer?.disconnect()
      const ready = () => {
        if (!popupId || postedForPopup === popupId) return false
        if (window.entryCount && !container.querySelector('.entry .glossary-content')) return false
        postedForPopup = popupId
        postPopupEvent('contentReady')
        return true
      }
      if (ready()) return
      observer = new MutationObserver(() => {
        if (ready()) observer.disconnect()
      })
      observer.observe(container, { childList: true, subtree: true })
    }

    function postScrollState () {
      if (!popupId) return
      const root = document.scrollingElement || document.documentElement
      const scrollTop = root.scrollTop || window.scrollY || 0
      postPopupEvent('scrollState', { atTop: scrollTop <= 1, scrollTop })
    }
    window.addEventListener('scroll', postScrollState, { passive: true })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installContentReadyObserver, { once: true })
  } else {
    installContentReadyObserver()
  }

  window.addEventListener('error', event => {
    post({ type: 'runtimeError', popupId: popupId || undefined, message: event.message || 'Popup runtime error' })
  })
  window.addEventListener('unhandledrejection', event => {
    const message = event.reason instanceof Error ? event.reason.message : String(event.reason)
    post({ type: 'runtimeError', popupId: popupId || undefined, message })
  })
})()
