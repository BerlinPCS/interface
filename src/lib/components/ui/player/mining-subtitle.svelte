<script lang='ts'>
  import { createEventDispatcher } from 'svelte'

  import type { MiningCue, MiningSelection } from '$lib/modules/mining'

  import { segmentMiningGraphemes } from '$lib/modules/mining'

  export let cues: MiningCue[] = []
  export let css = ''
  export let preview = false

  const dispatch = createEventDispatcher<{
    selection: MiningSelection | undefined
  }>()

  let selectedCueId: string | undefined
  let selectedOffset: number | undefined
  let lastCueIds = ''

  $: cueIds = cues.map(cue => cue.id).join('\u0000')
  $: if (lastCueIds !== cueIds) {
    lastCueIds = cueIds
    clearSelection()
  }

  function clearSelection () {
    selectedCueId = undefined
    selectedOffset = undefined
    dispatch('selection', undefined)
  }

  function selectGrapheme (event: PointerEvent, cue: MiningCue, utf16Offset: number, utf16Length: number, whitespace: boolean) {
    if (whitespace) return clearSelection()
    selectedCueId = cue.id
    selectedOffset = utf16Offset
    dispatch('selection', {
      cueId: cue.id,
      utf16Offset,
      utf16Length,
      anchor: (event.currentTarget as HTMLElement).getBoundingClientRect()
    })
  }

  function handleInteractionMove (event: PointerEvent) {
    if (event.target === event.currentTarget) clearSelection()
  }
</script>

{#if cues.length}
  <div class={preview ? 'relative z-20 flex justify-center px-4' : 'absolute inset-x-0 bottom-28 z-20 flex justify-center px-4 pointer-events-none'}>
    <div
      class='mining-interaction-region max-w-[90%] flex flex-col items-center gap-2 text-center whitespace-pre-wrap pointer-events-auto select-text'
      role='group'
      aria-label={cues.map(cue => cue.plainText).join('\n')}
      on:pointerleave={clearSelection}
      on:pointermove={handleInteractionMove}
      on:click|stopPropagation
      on:dblclick|stopPropagation
    >
      {#each cues as cue (cue.id)}
        <div class={preview ? 'whitespace-nowrap' : ''} style={css}>
          {#each segmentMiningGraphemes(cue.plainText) as grapheme (`${grapheme.utf16Offset}:${grapheme.text}`)}
            {#if grapheme.lineBreak}
              <br aria-hidden='true' on:pointerenter={clearSelection} />
            {:else}
              <span
                aria-hidden='true'
                data-cue-id={cue.id}
                data-utf16-offset={grapheme.utf16Offset}
                data-utf16-length={grapheme.utf16Length}
                class:mining-selected={selectedCueId === cue.id && selectedOffset === grapheme.utf16Offset}
                on:pointerenter={event => selectGrapheme(event, cue, grapheme.utf16Offset, grapheme.utf16Length, grapheme.whitespace)}
              >{grapheme.text}</span>
            {/if}
          {/each}
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .mining-selected {
    color: var(--mining-selection-color, #facc15);
  }
</style>
