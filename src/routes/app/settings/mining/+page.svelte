<script lang='ts'>
  import ChevronDown from 'lucide-svelte/icons/chevron-down'
  import ChevronRight from 'lucide-svelte/icons/chevron-right'
  import CodeXml from 'lucide-svelte/icons/code-xml'
  import RotateCcw from 'lucide-svelte/icons/rotate-ccw'
  import { onDestroy, onMount } from 'svelte'

  import MiningDictionariesSettings from './mining-dictionaries-settings.svelte'

  import SettingCard from '$lib/components/SettingCard.svelte'
  import { Button } from '$lib/components/ui/button'
  import { SingleCombo } from '$lib/components/ui/combobox'
  import * as Dialog from '$lib/components/ui/dialog'
  import { Input } from '$lib/components/ui/input'
  import MiningDictionaryIframePopup from '$lib/components/ui/player/mining-dictionary-iframe-popup.svelte'
  import MiningSubtitle from '$lib/components/ui/player/mining-subtitle.svelte'
  import { Switch } from '$lib/components/ui/switch'
  import { Textarea } from '$lib/components/ui/textarea'
  import { DEFAULT_MINING_SUBTITLE_CSS, type MiningSelection } from '$lib/modules/mining'
  import { enabledMiningAudioTemplates } from '$lib/modules/mining-audio'
  import {
    calculateMiningPopupPosition,
    DEFAULT_MINING_DICTIONARY_CSS,
    getMiningLookupRequest,
    UNAVAILABLE_MINING_DICTIONARY_STATE,
    type MiningDictionaryEntry,
    type MiningDictionaryState,
    type MiningPopupPosition
  } from '$lib/modules/mining-dictionary'
  import native from '$lib/modules/native'
  import { settings } from '$lib/modules/settings'

  const previewCue = {
    id: 'mining-preview',
    trackId: 'preview',
    start: 0,
    end: 1,
    readOrder: 0,
    rawText: '昨日は寿司を食べました',
    plainText: '昨日は寿司を食べました'
  }
  const collapseModes = {
    expandAll: 'Expand All',
    collapseAll: 'Collapse All'
  }
  let dictionaryCssOpen = false
  let subtitleCssOpen = false
  let previewPortalTarget: HTMLElement | undefined
  let previewSelection: MiningSelection | undefined
  let previewEntries: MiningDictionaryEntry[] = []
  let previewLoading = false
  let previewPending = false
  let previewError = ''
  let previewSelectionLength = 0
  let previewRequestKey = ''
  let previewRequestGeneration = 0
  let previewDictionaryState = UNAVAILABLE_MINING_DICTIONARY_STATE
  let previewCloseTimer: ReturnType<typeof setTimeout> | undefined

  $: previewPopupPosition = previewSelection
    ? calculatePreviewPopupPosition(previewSelection)
    : undefined

  function calculatePreviewPopupPosition (selection: MiningSelection): MiningPopupPosition {
    return calculateMiningPopupPosition(
      selection.anchor,
      { width: window.innerWidth, height: window.innerHeight },
      $settings.miningPopupWidth,
      $settings.miningPopupHeight
    )
  }

  function handlePreviewSelection (event: CustomEvent<MiningSelection | undefined>) {
    const selection = event.detail
    if (!selection) return schedulePreviewClose()
    const request = getMiningLookupRequest(
      previewCue,
      selection,
      $settings.miningDictionaryScanLength,
      $settings.miningDictionaryScanNonJapanese,
      $settings.miningDictionaryMaxResults
    )
    if (!request) return closePreviewDictionary()

    keepPreviewOpen()
    previewSelection = selection
    previewSelectionLength = selection.utf16Length
    if (!previewDictionaryState.available) {
      previewEntries = []
      previewPending = false
      previewLoading = false
      previewError = previewDictionaryState.error || (native.isApp
        ? 'The offline dictionary backend is unavailable.'
        : 'Dictionary lookup is only available in the Hayatan desktop app.')
      return
    }
    if (!previewDictionaryState.order.term.some(id => previewDictionaryState.dictionaries.find(dictionary => dictionary.id === id)?.enabled.term)) {
      previewEntries = []
      previewPending = false
      previewLoading = false
      previewError = 'Import and enable a term dictionary to use this preview.'
      return
    }

    const requestKey = `${previewDictionaryState.generation}:${request.text}:${request.offset}:${request.scanLength}:${request.maxResults}`
    if (requestKey === previewRequestKey && (previewPending || previewEntries.length)) return
    const requestGeneration = ++previewRequestGeneration
    previewRequestKey = requestKey
    previewEntries = []
    previewError = ''
    previewPending = true
    previewLoading = true
    native.miningDictionaryLookup(request)
      .then(result => {
        if (requestGeneration === previewRequestGeneration) {
          previewEntries = result.entries
          previewSelectionLength = result.length
        }
      })
      .catch(error => {
        if (requestGeneration !== previewRequestGeneration) return
        if (error instanceof Error && error.message.includes('SUPERSEDED')) return
        previewError = error instanceof Error ? error.message : 'Dictionary lookup failed'
      })
      .finally(() => {
        if (requestGeneration === previewRequestGeneration) {
          previewPending = false
          previewLoading = false
        }
      })
  }

  function keepPreviewOpen () {
    if (previewCloseTimer) clearTimeout(previewCloseTimer)
    previewCloseTimer = undefined
  }

  function schedulePreviewClose () {
    keepPreviewOpen()
    previewCloseTimer = setTimeout(() => {
      closePreviewDictionary()
      previewCloseTimer = undefined
    }, 100)
  }

  function closePreviewDictionary () {
    ++previewRequestGeneration
    previewSelection = undefined
    previewEntries = []
    previewPending = false
    previewLoading = false
    previewError = ''
    previewSelectionLength = 0
    previewRequestKey = ''
  }

  function lookupPreviewRedirect (query: string) {
    const text = query.trim()
    if (!text) return Promise.resolve({ length: 0, entries: [] })
    return native.miningDictionaryLookup({
      text,
      offset: 0,
      scanLength: Math.max(1, Math.min(64, $settings.miningDictionaryScanLength)),
      maxResults: Math.max(1, Math.min(50, $settings.miningDictionaryMaxResults))
    })
  }

  function resetSubtitleCss () {
    $settings.miningSubtitleCss = DEFAULT_MINING_SUBTITLE_CSS
  }

  function resetDictionaryCss () {
    $settings.miningDictionaryCss = DEFAULT_MINING_DICTIONARY_CSS
  }

  onMount(() => {
    previewPortalTarget = document.body
    if (!native.isApp) return
    const applyDictionaryState = (state: MiningDictionaryState) => {
      previewDictionaryState = state
    }
    const unsubscribe = native.onMiningDictionaryEvent(event => {
      if (event.event === 'stateChanged') applyDictionaryState(event.data)
      if (event.event === 'backendError' && previewSelection) {
        ++previewRequestGeneration
        previewError = event.data.message
        previewPending = false
        previewLoading = false
      }
    })
    native.miningDictionaryState()
      .then(applyDictionaryState)
      .catch(error => {
        previewDictionaryState = {
          ...UNAVAILABLE_MINING_DICTIONARY_STATE,
          error: error instanceof Error ? error.message : 'The offline dictionary backend is unavailable.'
        }
      })
    return unsubscribe
  })

  onDestroy(() => {
    keepPreviewOpen()
    closePreviewDictionary()
  })
</script>

<div class='font-weight-bold text-xl font-bold'>Mining Mode</div>
<SettingCard
  let:id
  title='Pause On Entry'
  description='Pause a playing video when mining mode opens. Leaving mining mode restores the playing or paused state from before it was opened.'
>
  <Switch {id} bind:checked={$settings.miningPauseOnEnter} />
</SettingCard>
<SettingCard
  let:id
  title='Pause On Lookup'
  description='Keep the video paused while a dictionary popup is open, then restore playback when it closes.'
>
  <Switch {id} bind:checked={$settings.miningPauseOnLookup} />
</SettingCard>

<MiningDictionariesSettings on:editcss={() => { dictionaryCssOpen = true }} />

<a
  href='/#/app/settings/mining/audio'
  class='no-scale flex items-center justify-between gap-4 rounded-lg border bg-card p-4 transition-colors hover:bg-accent'
>
  <div>
    <h2 class='font-bold'>Audio Sources</h2>
    <p class='text-sm text-muted-foreground'>Configure Hoshi-compatible online sources and optional local android.db audio.</p>
  </div>
  <ChevronRight class='shrink-0' size={22} />
</a>

<section class='rounded-lg border bg-card p-4'>
  <div class='mb-3 flex flex-wrap items-start justify-between gap-3'>
    <div>
      <h2 class='font-bold'>Subtitle and Dictionary Preview</h2>
      <p class='text-sm text-muted-foreground'>Hover the inflected verb to preview selection, deinflection, and dictionary styling together.</p>
    </div>
    <Button variant='secondary' class='gap-2' on:click={() => { subtitleCssOpen = true }}>
      <CodeXml size={16} />
      Subtitle CSS
    </Button>
  </div>
  <div
    class='relative flex min-h-[100px] items-center justify-center overflow-hidden rounded-md bg-black px-6'
  >
    <div class='absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_center,_#475569,_#020617_70%)]' />
    <MiningSubtitle
      cues={[previewCue]}
      css={$settings.miningSubtitleCss}
      preview
      selectionLength={previewSelectionLength}
      on:selection={handlePreviewSelection}
    />
    <MiningDictionaryIframePopup
      entries={previewEntries}
      loading={previewLoading}
      error={previewError}
      position={previewPopupPosition && (!previewPending || previewLoading) ? previewPopupPosition : undefined}
      scale={$settings.miningPopupScale}
      collapseMode={$settings.miningDictionaryCollapseMode}
      expandFirstDictionary={$settings.miningDictionaryExpandFirst}
      compactGlossaries={$settings.miningDictionaryCompactGlossaries}
      showExpressionTags={$settings.miningDictionaryShowExpressionTags}
      dictionaryStyles={previewDictionaryState.styles}
      customCss={$settings.miningDictionaryCss}
      scanNonJapaneseText={$settings.miningDictionaryScanNonJapanese}
      scanLength={$settings.miningDictionaryScanLength}
      lookupRedirect={lookupPreviewRedirect}
      audioSources={enabledMiningAudioTemplates($settings.miningAudioSources)}
      audioAutoplay={$settings.miningAudioAutoplay}
      audioPlaybackMode={$settings.miningAudioPlaybackMode}
      fixed
      portalTarget={previewPortalTarget}
      on:enter={keepPreviewOpen}
      on:leave={schedulePreviewClose}
      on:close={closePreviewDictionary}
      on:runtimeerror={({ detail }) => { previewError = detail }}
    />
  </div>
</section>

<details class='no-scale group rounded-lg border bg-card'>
  <summary class='flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden'>
    <ChevronDown class='shrink-0 transition-transform group-open:rotate-180' size={18} />
    <div>
      <h2 class='font-bold'>Advanced Dictionary Settings</h2>
      <p class='text-sm text-muted-foreground'>Popup dimensions, lookup limits, and result layout.</p>
    </div>
  </summary>
  <div class='border-t px-4 pb-4 pt-2'>
    <SettingCard let:id title='Popup Width' description='Maximum popup width in pixels. Matches Hoshi Reader’s popup sizing.'>
      <Input {id} type='number' inputmode='numeric' min='100' max='700' step='10' bind:value={$settings.miningPopupWidth} class='w-32 shrink-0' />
    </SettingCard>
    <SettingCard let:id title='Popup Height' description='Maximum popup height in pixels. The popup shrinks when less space is available.'>
      <Input {id} type='number' inputmode='numeric' min='100' max='800' step='10' bind:value={$settings.miningPopupHeight} class='w-32 shrink-0' />
    </SettingCard>
    <SettingCard let:id title='Popup Scale' description='Scales popup text, spacing, and pixel values in compatible Hoshi Reader CSS.'>
      <Input {id} type='number' inputmode='decimal' min='0.8' max='1.5' step='0.05' bind:value={$settings.miningPopupScale} class='w-32 shrink-0' />
    </SettingCard>
    <SettingCard let:id title='Scan Non-Japanese Text' description='Allow lookups to start on text that does not contain Japanese characters.'>
      <Switch {id} bind:checked={$settings.miningDictionaryScanNonJapanese} />
    </SettingCard>
    <SettingCard let:id title='Maximum Results' description='Maximum number of dictionary entries shown for one lookup.'>
      <Input {id} type='number' inputmode='numeric' min='1' max='50' step='1' bind:value={$settings.miningDictionaryMaxResults} class='w-32 shrink-0' />
    </SettingCard>
    <SettingCard let:id title='Scan Length' description='Maximum UTF-16 length scanned from the hovered subtitle character.'>
      <Input {id} type='number' inputmode='numeric' min='1' max='64' step='1' bind:value={$settings.miningDictionaryScanLength} class='w-32 shrink-0' />
    </SettingCard>
    <SettingCard title='Collapse Dictionaries' description='Choose whether dictionary sections open automatically.'>
      <SingleCombo bind:value={$settings.miningDictionaryCollapseMode} items={collapseModes} class='w-40 shrink-0 border-input border' />
    </SettingCard>
    {#if $settings.miningDictionaryCollapseMode !== 'expandAll'}
      <SettingCard let:id title='Expand First Dictionary' description='Keep the first result expanded when dictionary sections are otherwise collapsed.'>
        <Switch {id} bind:checked={$settings.miningDictionaryExpandFirst} />
      </SettingCard>
    {/if}
    <SettingCard let:id title='Compact Glossaries' description='Place multiple definitions on one line separated by vertical bars.'>
      <Switch {id} bind:checked={$settings.miningDictionaryCompactGlossaries} />
    </SettingCard>
    <SettingCard let:id title='Show Expression Tags' description='Show common-word and other entry tags under the expression.'>
      <Switch {id} bind:checked={$settings.miningDictionaryShowExpressionTags} />
    </SettingCard>
  </div>
</details>

<Dialog.Root portal='#root' bind:open={dictionaryCssOpen}>
  <Dialog.Content class='max-w-3xl bg-background'>
    <Dialog.Header>
      <Dialog.Title>Dictionary CSS</Dialog.Title>
      <Dialog.Description>Hoshi Reader-compatible popup CSS, applied after each imported dictionary’s styles.css.</Dialog.Description>
    </Dialog.Header>
    <Textarea
      bind:value={$settings.miningDictionaryCss}
      class='min-h-[55vh] font-mono bg-background'
      spellcheck={false}
      aria-label='Dictionary popup CSS'
    />
    <Dialog.Footer>
      <Button class='gap-2' variant='secondary' on:click={resetDictionaryCss}>
        <RotateCcw size={16} />
        Reset
      </Button>
      <Button on:click={() => { dictionaryCssOpen = false }}>Done</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root portal='#root' bind:open={subtitleCssOpen}>
  <Dialog.Content class='max-w-3xl bg-background'>
    <Dialog.Header>
      <Dialog.Title>Subtitle CSS</Dialog.Title>
      <Dialog.Description>CSS declarations applied to mining subtitles. Invalid declarations are ignored.</Dialog.Description>
    </Dialog.Header>
    <Textarea
      bind:value={$settings.miningSubtitleCss}
      class='min-h-[55vh] font-mono bg-background'
      spellcheck={false}
      aria-label='Mining subtitle CSS declarations'
    />
    <Dialog.Footer>
      <Button class='gap-2' variant='secondary' on:click={resetSubtitleCss}>
        <RotateCcw size={16} />
        Reset
      </Button>
      <Button on:click={() => { subtitleCssOpen = false }}>Done</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
