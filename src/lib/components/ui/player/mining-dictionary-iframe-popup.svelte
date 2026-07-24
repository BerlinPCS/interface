<script lang='ts'>
  import { createEventDispatcher } from 'svelte'

  import MiningDictionaryIframeFrame from './mining-dictionary-iframe-frame.svelte'

  import type { MiningAudioPlaybackMode } from '$lib/modules/mining-audio'
  import type { MiningDictionaryEntry, MiningDictionaryLookupResult, MiningPopupPosition } from '$lib/modules/mining-dictionary'
  import type { MiningPopupSelection } from '$lib/modules/mining-popup-protocol'

  import { calculateMiningPopupPosition } from '$lib/modules/mining-dictionary'
  import { appendNestedPopup, closeNestedChildren, dismissNestedPopup } from '$lib/modules/mining-popup-stack'

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

  interface SelectionDetail {
    selection: MiningPopupSelection
    anchor: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>
  }

  interface SelectionCommand {
    signal: number
    length: number
  }

  interface ChildPopup {
    id: string
    entries: MiningDictionaryEntry[]
    position: MiningPopupPosition
    clearSelectionSignal: number
    highlight: SelectionCommand
  }

  const dispatch = createEventDispatcher<{
    close: undefined
    enter: undefined
    leave: undefined
    runtimeerror: string
  }>()

  let children: ChildPopup[] = []
  let rootClearSelectionSignal = 0
  let rootHighlight: SelectionCommand = { signal: 0, length: 0 }
  let selectionCommandSignal = 0
  let lookupGeneration = 0
  let previousPosition: MiningPopupPosition | undefined
  let previousEntries: MiningDictionaryEntry[] | undefined

  $: syncRootState(position, entries)

  function syncRootState (
    nextPosition: MiningPopupPosition | undefined,
    nextEntries: MiningDictionaryEntry[]
  ) {
    if ((!nextPosition && previousPosition) || nextEntries !== previousEntries) {
      ++lookupGeneration
      children = []
      rootClearSelectionSignal++
      rootHighlight = { signal: ++selectionCommandSignal, length: 0 }
    }
    previousPosition = nextPosition
    previousEntries = nextEntries
  }

  function updateHighlight (popupIndex: number, length: number) {
    const highlight = { signal: ++selectionCommandSignal, length }
    if (popupIndex === 0) {
      rootHighlight = highlight
      return
    }
    children = children.map((child, index) =>
      index === popupIndex - 1 ? { ...child, highlight } : child
    )
  }

  function clearSelection (popupIndex: number) {
    updateHighlight(popupIndex, 0)
    if (popupIndex === 0) {
      rootClearSelectionSignal++
      return
    }
    children = children.map((child, index) =>
      index === popupIndex - 1
        ? { ...child, clearSelectionSignal: child.clearSelectionSignal + 1 }
        : child
    )
  }

  function closeChildrenAfter (popupIndex: number, clearParent: boolean) {
    ++lookupGeneration
    children = closeNestedChildren(children, popupIndex)
    if (clearParent) clearSelection(popupIndex)
  }

  function closePopup (popupIndex: number) {
    if (popupIndex === 0) {
      dispatch('close')
      return
    }
    ++lookupGeneration
    children = dismissNestedPopup(children, popupIndex)
    clearSelection(popupIndex - 1)
  }

  async function openChild (popupIndex: number, detail: SelectionDetail) {
    closeChildrenAfter(popupIndex, false)
    const generation = ++lookupGeneration
    const query = detail.selection.text.trim()
    if (!lookupRedirect || !query) {
      updateHighlight(popupIndex, 0)
      return
    }

    try {
      const result = await lookupRedirect(query)
      if (generation !== lookupGeneration || !position || popupIndex > children.length) return
      updateHighlight(popupIndex, result.length)
      if (!result.entries.length) return
      const childPosition = calculateMiningPopupPosition(
        detail.anchor,
        { width: window.innerWidth, height: window.innerHeight },
        position.width,
        position.height
      )
      children = appendNestedPopup(children, popupIndex, {
        id: crypto.randomUUID(),
        entries: result.entries,
        position: childPosition,
        clearSelectionSignal: 0,
        highlight: { signal: 0, length: 0 }
      })
    } catch (cause) {
      if (generation !== lookupGeneration) return
      updateHighlight(popupIndex, 0)
      dispatch('runtimeerror', cause instanceof Error ? cause.message : 'Nested dictionary lookup failed')
    }
  }
</script>

<MiningDictionaryIframeFrame
  {entries}
  {loading}
  {error}
  {position}
  {scale}
  {collapseMode}
  {expandFirstDictionary}
  {compactGlossaries}
  {showExpressionTags}
  {dictionaryStyles}
  {customCss}
  {scanNonJapaneseText}
  {scanLength}
  {lookupRedirect}
  {audioSources}
  audioAutoplay={audioAutoplay}
  {audioPlaybackMode}
  {fixed}
  {portalTarget}
  {backgroundMedia}
  clearSelectionSignal={rootClearSelectionSignal}
  highlightSelectionSignal={rootHighlight.signal}
  highlightSelectionLength={rootHighlight.length}
  on:selection={({ detail }) => openChild(0, detail)}
  on:tapoutside={() => closeChildrenAfter(0, true)}
  on:scrolled={() => closeChildrenAfter(0, true)}
  on:close={() => closePopup(0)}
  on:enter={() => dispatch('enter')}
  on:leave={() => dispatch('leave')}
  on:runtimeerror={({ detail }) => dispatch('runtimeerror', detail)}
/>

{#each children as child, index (child.id)}
  {@const popupIndex = index + 1}
  <MiningDictionaryIframeFrame
    entries={child.entries}
    position={child.position}
    {scale}
    {collapseMode}
    {expandFirstDictionary}
    {compactGlossaries}
    {showExpressionTags}
    {dictionaryStyles}
    {customCss}
    {scanNonJapaneseText}
    {scanLength}
    {lookupRedirect}
    {audioSources}
    audioAutoplay={audioAutoplay}
    {audioPlaybackMode}
    fixed
    {portalTarget}
    {backgroundMedia}
    clearSelectionSignal={child.clearSelectionSignal}
    highlightSelectionSignal={child.highlight.signal}
    highlightSelectionLength={child.highlight.length}
    on:selection={({ detail }) => openChild(popupIndex, detail)}
    on:tapoutside={() => closeChildrenAfter(popupIndex, true)}
    on:scrolled={() => closeChildrenAfter(popupIndex, true)}
    on:close={() => closePopup(popupIndex)}
    on:enter={() => dispatch('enter')}
    on:leave={() => dispatch('leave')}
    on:runtimeerror={({ detail }) => dispatch('runtimeerror', detail)}
  />
{/each}
