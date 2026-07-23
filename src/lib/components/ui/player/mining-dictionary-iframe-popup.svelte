<script lang='ts'>
  import ChevronLeft from 'lucide-svelte/icons/chevron-left'
  import ChevronRight from 'lucide-svelte/icons/chevron-right'
  import X from 'lucide-svelte/icons/x'
  import { createEventDispatcher, onDestroy, onMount } from 'svelte'

  import type { MiningAudioPlaybackMode } from '$lib/modules/mining-audio'
  import type { MiningDictionaryEntry, MiningDictionaryLookupResult, MiningPopupPosition } from '$lib/modules/mining-dictionary'

  import {
    makeMiningPopupHostMessage,
    parseMiningPopupFrameMessage,
    type MiningPopupCapabilities,
    type MiningPopupFrameMessage,
    type MiningPopupHostMessage,
    type MiningPopupRuntimeSettings
  } from '$lib/modules/mining-popup-protocol'
  import { MiningPopupResultRegistry } from '$lib/modules/mining-popup-results'
  import native from '$lib/modules/native'

  export let entries: MiningDictionaryEntry[] = []
  export let loading = false
  export let error = ''
  export let position: MiningPopupPosition | undefined = undefined
  export let scale = 1
  export let collapseMode: 'expandAll' | 'collapseAll' = 'expandAll'
  export let expandFirstDictionary = false
  export let compactGlossaries = true
  export let showExpressionTags = false
  export let dictionaryStyles: Record<string, string> = {}
  export let customCss = ''
  export let scanNonJapaneseText = false
  export let scanLength = 16
  export let lookupRedirect: ((query: string) => Promise<MiningDictionaryLookupResult>) | undefined = undefined
  export let audioSources: string[] = []
  export let audioAutoplay = false
  export let audioPlaybackMode: MiningAudioPlaybackMode = 'interrupt'
  export let fixed = false
  export let portalTarget: HTMLElement | undefined = undefined
  export let backgroundMedia: {
    paused: boolean
    volume: number
    pause: () => void
    play: () => Promise<void>
  } | undefined = undefined

  const dispatch = createEventDispatcher<{
    close: undefined
    enter: undefined
    leave: undefined
    runtimeerror: string
  }>()

  const nonce = crypto.randomUUID()
  const popupId = crypto.randomUUID()
  const resultSets = new MiningPopupResultRegistry(popupId)
  $: capabilities = {
    dictionaryMedia: native.isApp,
    audio: audioSources.length > 0,
    mining: false,
    nestedLookup: false
  } satisfies MiningPopupCapabilities

  let iframe: HTMLIFrameElement
  let frameLoaded = false
  let frameReady = false
  let contentReady = false
  let lastEntries: MiningDictionaryEntry[] | undefined
  let lastSettingsKey = ''
  let backCount = 0
  let forwardCount = 0
  let destroyed = false
  let wasOpen = false
  let wordAudio: HTMLAudioElement
  let audioRestore: (() => void) | undefined

  $: runtimeSettings = {
    scanNonJapaneseText,
    scanLength,
    collapseMode,
    expandFirstDictionary,
    compactGlossaries,
    showExpressionTags,
    harmonicFrequency: false,
    deduplicatePitchAccents: false,
    compactPitchAccents: false,
    dictionaryStyles,
    customCss,
    scale,
    darkMode: true,
    audioSources,
    audioEnableAutoplay: audioAutoplay,
    audioPlaybackMode
  } satisfies MiningPopupRuntimeSettings
  $: settingsKey = JSON.stringify(runtimeSettings)
  $: if (loading || error) contentReady = false
  $: if (frameLoaded && settingsKey !== lastSettingsKey) initializeFrame(runtimeSettings, settingsKey)
  $: syncOpenState(Boolean(position))
  $: if (frameReady && position && !loading && !error && entries !== lastEntries) renderEntries(entries)

  function post (message: MiningPopupHostMessage) {
    iframe.contentWindow?.postMessage(message, '*')
  }

  function initializeFrame (settings: MiningPopupRuntimeSettings, key: string) {
    lastSettingsKey = key
    frameReady = false
    post(makeMiningPopupHostMessage(nonce, {
      type: 'initialize',
      settings,
      capabilities
    }))
  }

  function frameLoad () {
    frameLoaded = true
    lastSettingsKey = ''
  }

  function syncOpenState (open: boolean) {
    if (open === wasOpen) return
    wasOpen = open
    if (open) return
    contentReady = false
    lastEntries = undefined
    resultSets.clear()
    if (frameReady) {
      post(makeMiningPopupHostMessage(nonce, { type: 'reset', popupId }))
    }
  }

  function renderEntries (nextEntries: MiningDictionaryEntry[]) {
    lastEntries = nextEntries
    contentReady = nextEntries.length === 0
    const render = resultSets.replace(nextEntries)
    post(makeMiningPopupHostMessage(nonce, {
      type: 'render',
      popupId,
      ...render
    }))
  }

  function reply (
    requestId: string,
    response: { ok: true, value: unknown } | { ok: false, error: string }
  ) {
    post(makeMiningPopupHostMessage(nonce, {
      type: 'reply',
      popupId,
      requestId,
      ...response
    }))
  }

  async function handleRequest (message: Extract<MiningPopupFrameMessage, { type: 'request' }>) {
    try {
      if (message.method === 'getEntry') {
        if (!Number.isInteger(message.payload) || (message.payload as number) < 0) throw new Error('Invalid entry index')
        const entry = resultSets.entry(message.resultSetId, message.payload as number)
        reply(message.requestId, { ok: true, value: entry ?? null })
        return
      }
      if (message.method === 'lookupRedirect') {
        if (!lookupRedirect || typeof message.payload !== 'string' || !message.payload.trim()) {
          throw new Error('Redirect lookup is unavailable')
        }
        const result = await lookupRedirect(message.payload)
        if (destroyed || !resultSets.has(message.resultSetId)) return
        if (!result.entries.length) {
          reply(message.requestId, {
            ok: true,
            value: { resultSetId: message.resultSetId, count: 0 }
          })
          return
        }
        const redirected = resultSets.add(result.entries)
        reply(message.requestId, {
          ok: true,
          value: { resultSetId: redirected.resultSetId, count: redirected.entryCount }
        })
        return
      }
      if (message.method === 'openExternalLink') {
        if (typeof message.payload !== 'string') throw new Error('Invalid external link')
        const url = new URL(message.payload)
        if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Unsupported external link')
        await native.openURL(url.href)
        reply(message.requestId, { ok: true, value: null })
        return
      }
      if (message.method === 'resolveAudioSource') {
        if (typeof message.payload !== 'string') throw new Error('Invalid audio source request')
        const audioUrl = await native.miningAudioResolveSource(message.payload, audioSources)
        reply(message.requestId, { ok: true, value: audioUrl })
        return
      }
      if (message.method === 'playWordAudio') {
        await playWordAudio(message.payload)
        reply(message.requestId, { ok: true, value: null })
        return
      }
      throw new Error(`${message.method} is unavailable`)
    } catch (cause) {
      if (!destroyed) {
        reply(message.requestId, {
          ok: false,
          error: cause instanceof Error ? cause.message : 'Popup request failed'
        })
      }
    }
  }

  function frameMessage (event: MessageEvent) {
    if (event.source !== iframe.contentWindow) return
    const message = parseMiningPopupFrameMessage(event.data, nonce)
    if (!message) return
    if (message.type === 'ready') {
      frameReady = true
      if (position && !loading && !error) {
        lastEntries = undefined
        renderEntries(entries)
      }
    } else if (message.type === 'contentReady' && message.popupId === popupId) {
      contentReady = true
    } else if (message.type === 'request' && message.popupId === popupId) {
      handleRequest(message).catch(cause => {
        dispatch('runtimeerror', cause instanceof Error ? cause.message : 'Popup request failed')
      })
    } else if ((message.type === 'dismiss' || message.type === 'tapOutside') && message.popupId === popupId) {
      dispatch('close')
    } else if (message.type === 'historyChanged' && message.popupId === popupId) {
      backCount = message.backCount
      forwardCount = message.forwardCount
    } else if (message.type === 'runtimeError' && (!message.popupId || message.popupId === popupId)) {
      dispatch('runtimeerror', message.message)
    }
  }

  function navigate (type: 'navigateBack' | 'navigateForward') {
    post(makeMiningPopupHostMessage(nonce, { type, popupId }))
  }

  async function playWordAudio (payload: unknown) {
    if (!isRecord(payload) || typeof payload.url !== 'string') throw new Error('Invalid audio playback request')
    const mode = payload.mode === 'duck' || payload.mode === 'mix' ? payload.mode : 'interrupt'
    const url = new URL(payload.url)
    if (url.protocol !== 'http:' && url.protocol !== 'https:' && url.protocol !== 'hayase-local-audio:') {
      throw new Error('Unsupported audio URL')
    }

    stopWordAudio()
    if (backgroundMedia && mode === 'interrupt') {
      const shouldResume = !backgroundMedia.paused
      backgroundMedia.pause()
      audioRestore = () => {
        if (shouldResume && backgroundMedia?.paused) backgroundMedia.play().catch(() => {})
      }
    } else if (mode === 'duck' && backgroundMedia) {
      const previousVolume = backgroundMedia.volume
      const duckedVolume = previousVolume * 0.25
      backgroundMedia.volume = duckedVolume
      audioRestore = () => {
        if (backgroundMedia?.volume === duckedVolume) backgroundMedia.volume = previousVolume
      }
    }

    wordAudio.src = url.href
    wordAudio.load()
    try {
      await wordAudio.play()
    } catch (error) {
      stopWordAudio()
      throw error
    }
  }

  function stopWordAudio () {
    if (wordAudio) {
      wordAudio.pause()
      wordAudio.removeAttribute('src')
      wordAudio.load()
    }
    audioRestore?.()
    audioRestore = undefined
  }

  function isRecord (value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
  }

  function portalPopup (node: HTMLElement, target: HTMLElement | undefined) {
    const placeholder = document.createComment('mining-popup')
    node.before(placeholder)
    const move = (nextTarget: HTMLElement | undefined) => {
      if (nextTarget) nextTarget.appendChild(node)
      else placeholder.after(node)
    }
    move(target)
    return {
      update: move,
      destroy () {
        placeholder.remove()
      }
    }
  }

  onMount(() => {
    window.addEventListener('message', frameMessage)
  })
  onDestroy(() => {
    destroyed = true
    window.removeEventListener('message', frameMessage)
    resultSets.clear()
    stopWordAudio()
  })
</script>

<aside
  class='mining-popup-frame'
  class:active={Boolean(position)}
  class:content-ready={contentReady}
  class:fixed
  aria-label='Dictionary lookup'
  aria-live='polite'
  style:left={position ? `${position.left}px` : '-10000px'}
  style:top={position ? `${position.top}px` : '-10000px'}
  style:width={position ? `${position.width}px` : '500px'}
  style:height={position ? `${position.height}px` : '400px'}
  on:pointerenter={() => dispatch('enter')}
  on:pointerleave={() => dispatch('leave')}
  on:pointerdown|stopPropagation
  on:pointerup|stopPropagation
  on:pointercancel|stopPropagation
  on:mousedown|stopPropagation
  on:mouseup|stopPropagation
  on:click|stopPropagation
  on:dblclick|stopPropagation
  on:contextmenu|stopPropagation
  on:wheel|stopPropagation
  on:touchstart|stopPropagation
  on:touchmove|stopPropagation
  on:touchend|stopPropagation
  on:keydown|stopPropagation
  use:portalPopup={portalTarget}
>
  <div class='action-bar'>
    <button type='button' aria-label='Back' disabled={!backCount} on:click={() => navigate('navigateBack')}>
      <ChevronLeft size={18} />
    </button>
    <button type='button' aria-label='Forward' disabled={!forwardCount} on:click={() => navigate('navigateForward')}>
      <ChevronRight size={18} />
    </button>
    <span />
    <button type='button' aria-label='Close dictionary' on:click={() => dispatch('close')}>
      <X size={18} />
    </button>
  </div>

  <iframe
    class:hidden={loading || Boolean(error)}
    bind:this={iframe}
    title='Dictionary results'
    src='/mining-popup/hoshi-android/iframe.html'
    sandbox='allow-scripts'
    on:load={frameLoad}
  />
  {#if loading}
    <div class='popup-state'><span class='spinner' />Looking up…</div>
  {:else if error}
    <div class='popup-state error'>{error}</div>
  {/if}
</aside>

<audio
  bind:this={wordAudio}
  class='hidden'
  aria-hidden='true'
  on:ended={stopWordAudio}
  on:error={stopWordAudio}
/>

<style>
  .mining-popup-frame {
    position: absolute;
    z-index: 2147483000;
    display: flex;
    visibility: hidden;
    overflow: hidden;
    flex-direction: column;
    border: 1px solid rgb(120 120 128 / 36%);
    border-radius: 10px;
    background: #000;
    box-shadow: 0 3px 12px rgb(0 0 0 / 22%);
    opacity: 0;
    pointer-events: none;
    overscroll-behavior: contain;
  }

  .mining-popup-frame.fixed { position: fixed; }

  .mining-popup-frame.active {
    visibility: visible;
    opacity: 1;
    pointer-events: auto;
  }

  .action-bar {
    display: flex;
    height: 37px;
    flex: 0 0 37px;
    align-items: center;
    border-bottom: 1px solid rgb(120 120 128 / 25%);
    background: #000;
  }

  .action-bar span { flex: 1; }

  .action-bar button {
    display: grid;
    width: 37px;
    height: 37px;
    place-items: center;
    border: 0;
    color: rgb(235 235 245 / 92%);
    background: transparent;
    cursor: pointer;
  }

  .action-bar button:disabled {
    opacity: 0.3;
    cursor: default;
  }

  iframe {
    width: 100%;
    min-height: 0;
    flex: 1;
    border: 0;
    opacity: 0;
    background: #000;
  }

  iframe.hidden { display: none; }

  .content-ready iframe { opacity: 1; }

  .popup-state {
    display: flex;
    min-height: 0;
    flex: 1;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 18px;
    color: #fff;
    text-align: center;
  }

  .popup-state.error { color: #fca5a5; }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgb(255 255 255 / 30%);
    border-top-color: currentColor;
    border-radius: 999px;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
