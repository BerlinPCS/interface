<!--
  Popup DOM and styling adapted from Hoshi Reader's Features/Popup implementation.
  Copyright © 2026 Manhhao.
  Portions copyright © 2021-2025 Yomitan and Yomichan authors.
  SPDX-License-Identifier: GPL-3.0-or-later
-->
<script lang='ts'>
  import X from 'lucide-svelte/icons/x'
  import { createEventDispatcher } from 'svelte'

  import MiningStructuredContent from './mining-structured-content.svelte'

  import type { MiningDictionaryEntry, MiningPopupPosition } from '$lib/modules/mining-dictionary'

  import { groupMiningGlossaries, parseMiningGlossaryContent, scaleHoshiDictionaryCss, segmentFurigana, splitDictionaryTags } from '$lib/modules/mining-dictionary'

  export let entries: MiningDictionaryEntry[] = []
  export let loading = false
  export let error = ''
  export let position: MiningPopupPosition
  export let scale = 1
  export let collapseMode: 'expandAll' | 'collapseAll' = 'expandAll'
  export let expandFirstDictionary = false
  export let twoColumnLayout = false
  export let compactGlossaries = true
  export let showExpressionTags = false
  export let dictionaryStyles: Record<string, string> = {}
  export let customCss = ''

  const dispatch = createEventDispatcher<{
    close: undefined
    enter: undefined
    leave: undefined
  }>()

  $: scaledCss = scaleHoshiDictionaryCss(customCss)

  function sectionOpen (dictionaryIndex: number) {
    return collapseMode === 'expandAll' || (expandFirstDictionary && dictionaryIndex === 0)
  }

  function unique (values: string[]) {
    return [...new Set(values.filter(Boolean))]
  }

  const smallKana = new Set('ぁぃぅぇぉゃゅょゎゕゖァィゥェォャュョヮヵヶ')

  function pitchMorae (reading: string) {
    const morae: string[] = []
    for (const character of reading) {
      if (smallKana.has(character) && morae.length) {
        morae[morae.length - 1] += character
      } else {
        morae.push(character)
      }
    }
    return morae
  }

  function moraIsHigh (index: number, pitch: number) {
    if (pitch === 0) return index > 0
    if (pitch === 1) return index < 1
    return index > 0 && index < pitch
  }

  function dictionaryStyle (node: HTMLElement, css: string) {
    const style = document.createElement('style')
    style.id = 'popup-custom-css'
    style.textContent = `@scope (.mining-dictionary-popup) { ${css} }`
    node.appendChild(style)
    return {
      update (nextCss: string) {
        style.textContent = `@scope (.mining-dictionary-popup) { ${nextCss} }`
      },
      destroy () {
        style.remove()
      }
    }
  }

  function importedDictionaryStyle (node: HTMLElement, value: { dictionary: string, css: string }) {
    const style = document.createElement('style')
    const update = (next: { dictionary: string, css: string }) => {
      const escaped = CSS.escape(next.dictionary)
      style.textContent = `
        [data-dictionary="${escaped}"] {
          @media (prefers-color-scheme: light) { color: #000; }
          @media (prefers-color-scheme: dark) { color: #fff; }
          ${next.css}
        }
      `
    }
    update(value)
    node.prepend(style)
    return {
      update,
      destroy () {
        style.remove()
      }
    }
  }

  let selectedDictionaryLabel: HTMLElement | undefined
  function longPressDictionary (node: HTMLElement) {
    let timer = 0
    let longPressed = false
    const cancel = () => clearTimeout(timer)
    const pointerdown = () => {
      longPressed = false
      timer = setTimeout(() => {
        longPressed = true
        if (selectedDictionaryLabel === node) {
          node.classList.remove('selected')
          selectedDictionaryLabel = undefined
        } else {
          selectedDictionaryLabel?.classList.remove('selected')
          node.classList.add('selected')
          selectedDictionaryLabel = node
        }
      }, 400)
    }
    const click = (event: MouseEvent) => {
      if (longPressed) event.preventDefault()
    }
    node.addEventListener('pointerdown', pointerdown)
    node.addEventListener('pointerup', cancel)
    node.addEventListener('pointercancel', cancel)
    node.addEventListener('click', click)
    return {
      destroy () {
        cancel()
        node.removeEventListener('pointerdown', pointerdown)
        node.removeEventListener('pointerup', cancel)
        node.removeEventListener('pointercancel', cancel)
        node.removeEventListener('click', click)
      }
    }
  }
</script>

<aside
  class='mining-dictionary-popup'
  class:two-column-layout={twoColumnLayout}
  class:compact-glossaries={compactGlossaries}
  aria-label='Dictionary lookup'
  aria-live='polite'
  style:left={`${position.left}px`}
  style:top={`${position.top}px`}
  style:width={`${position.width}px`}
  style:height={`${position.height}px`}
  style:--popup-scale={scale}
  use:dictionaryStyle={scaledCss}
  on:pointerenter={() => dispatch('enter')}
  on:pointerleave={() => dispatch('leave')}
  on:click|stopPropagation
  on:dblclick|stopPropagation
>
  <div class='action-bar'>
    <div class='action-spacer' />
    <button class='action-button' type='button' aria-label='Close dictionary' on:click={() => dispatch('close')}>
      <X size={18 * scale} />
    </button>
  </div>

  <div class='popup-scroll'>
    {#if loading}
      <div class='popup-state'>
        <span class='popup-spinner' />
        Looking up…
      </div>
    {:else if error}
      <div class='popup-state popup-error'>{error}</div>
    {:else if !entries.length}
      <div class='popup-state'>No dictionary results.</div>
    {:else}
      <div id='entries-container'>
        {#each entries as entry, entryIndex (`${entry.expression}:${entry.reading}:${entryIndex}`)}
          {@const glossaryGroups = groupMiningGlossaries(entry)}
          {#if entryIndex > 0}<hr />{/if}
          <div class='entry'>
            <div class='entry-header'>
              <div class='expression-scroll'>
                <span class='expression'>
                  {#if entry.reading && entry.reading !== entry.expression}
                    {#each segmentFurigana(entry.expression, entry.reading) as segment, segmentIndex (`${segment.text}:${segment.reading}:${segmentIndex}`)}
                      {#if segment.reading}
                        <ruby>{segment.text}<rt>{segment.reading}</rt></ruby>
                      {:else}
                        {segment.text}
                      {/if}
                    {/each}
                  {:else}
                    {entry.expression}
                  {/if}
                </span>
              </div>
              <div class='header-buttons' />
            </div>

            {#if showExpressionTags || entry.trace.length || entry.frequencies.length || entry.pitches.length}
              <div class='entry-tags'>
                {#if showExpressionTags}
                  <div class='tag-row expr-tag-row'>
                    {#each unique([
                      entry.expression,
                      entry.reading !== entry.expression ? entry.reading : '',
                      ...entry.glossaries.flatMap(glossary => splitDictionaryTags(glossary.termTags))
                    ]) as tag (tag)}
                      <span class='expr-tag'>{tag}</span>
                    {/each}
                  </div>
                {/if}
                {#if entry.trace.length}
                  <div class='tag-row'>
                    {#each entry.trace as trace, traceIndex (`${trace.name}:${traceIndex}`)}
                      <span class='deinflection-tag' data-description={trace.description} title={trace.description}>{trace.name}</span>
                    {/each}
                  </div>
                {/if}
                {#if entry.frequencies.length}
                  <div class='tag-row'>
                    {#each entry.frequencies as frequencyGroup, frequencyIndex (`${frequencyGroup.dictionary}:${frequencyIndex}`)}
                      <span class='frequency-group' data-details={frequencyGroup.dictionary}>
                        <span class='frequency-dict-label'>{frequencyGroup.dictionary}</span>
                        <span class='frequency-values'>{frequencyGroup.frequencies.map(frequency => frequency.displayValue || frequency.value).join(', ')}</span>
                      </span>
                    {/each}
                  </div>
                {/if}
                {#if entry.pitches.length}
                  <div class='pitch-list'>
                    {#each entry.pitches as pitchGroup, pitchIndex (`${pitchGroup.dictionary}:${pitchIndex}`)}
                      <div class='pitch-group' data-details={pitchGroup.dictionary}>
                        <span class='pitch-dict-label'>{pitchGroup.dictionary}</span>
                        <ul class='pitch-entries'>
                          {#each pitchGroup.pitchPositions as position, positionIndex (`${position}:${positionIndex}`)}
                            <li>
                              <span class='pronunciation-text'>
                                {#each pitchMorae(entry.reading) as mora, moraIndex (`${mora}:${moraIndex}`)}
                                  <span
                                    class='pronunciation-mora'
                                    data-pitch={moraIsHigh(moraIndex, position) ? 'high' : 'low'}
                                    data-pitch-next={moraIsHigh(moraIndex + 1, position) ? 'high' : 'low'}
                                  >{mora}<span class='pronunciation-mora-line' /></span>
                                {/each}
                              </span>
                              [{position}]
                            </li>
                          {/each}
                          {#each pitchGroup.transcriptions as transcription, transcriptionIndex (`${transcription}:${transcriptionIndex}`)}
                            <li><span class='pronunciation-text'>{transcription}</span></li>
                          {/each}
                        </ul>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}

            <div class:single-section={glossaryGroups.length === 1} class='glossary-sections'>
              {#each glossaryGroups as group, dictionaryIndex (group.dictionary)}
                <details class='glossary-group' open={sectionOpen(dictionaryIndex)}>
                  <summary class='dict-label' use:longPressDictionary>
                    <span class='dict-name'>{group.dictionary}</span>
                  </summary>
                  <div
                    data-dictionary={group.dictionary}
                    use:importedDictionaryStyle={{ dictionary: group.dictionary, css: dictionaryStyles[group.dictionary] ?? '' }}
                  >
                    <ol>
                      {#each group.glossaries as glossary, glossaryIndex (glossaryIndex)}
                        {@const tags = splitDictionaryTags(glossary.definitionTags)}
                        <li class='glossary-sense'>
                          {#if tags.length}
                            <div class='glossary-tags'>
                              {#each tags as tag (tag)}
                                <span class='glossary-tag'>{tag}</span>
                              {/each}
                            </div>
                          {/if}
                          <div class='glossary-content'>
                            <MiningStructuredContent node={parseMiningGlossaryContent(glossary.content)} />
                          </div>
                        </li>
                      {/each}
                    </ol>
                  </div>
                </details>
              {/each}
              {#if !glossaryGroups.length}
                <div class='popup-state'>This entry has no glossary content.</div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</aside>

<style>
  .mining-dictionary-popup {
    --font-size-no-units: 15;
    --line-height: 1.4;
    --list-padding1: 1.4em;
    --list-padding2: var(--list-padding1);
    --text-color: hsl(var(--foreground));
    --text-color-light1: #aaa;
    --text-color-light2: #999;
    --text-color-light3: #888;
    --text-color-light4: #777;
    --background-color: hsl(var(--background));
    --background-color-light: hsl(var(--muted));
    --background-color-dark1: hsl(var(--muted));
    --accent-color: hsl(var(--primary));
    --gloss-image-background-color: transparent;
    --expr-tag-color: rgba(120, 140, 160, 0.22);
    --expr-tag-text-color: inherit;
    --freq-tag-color: #77aaeb;
    --pitch-tag-color: #d37a95;
    position: absolute;
    z-index: 40;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: var(--text-color);
    background: color-mix(in srgb, var(--background-color) 88%, transparent);
    border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
    border-radius: calc(8px * var(--popup-scale));
    box-shadow: 0 calc(12px * var(--popup-scale)) calc(36px * var(--popup-scale)) rgb(0 0 0 / 0.38);
    backdrop-filter: blur(calc(20px * var(--popup-scale)));
    font-family: "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif;
    touch-action: pan-y;
    pointer-events: auto;
    user-select: text;
  }

  .action-bar {
    display: flex;
    align-items: center;
    min-height: calc(38px * var(--popup-scale));
    padding: 0 calc(10px * var(--popup-scale)) 0 calc(16px * var(--popup-scale));
    border-bottom: 1px solid color-mix(in srgb, currentColor 16%, transparent);
    color: color-mix(in srgb, currentColor 66%, transparent);
    flex: none;
  }

  .action-spacer { flex: 1; }

  .action-button {
    display: grid;
    place-items: center;
    width: calc(30px * var(--popup-scale));
    height: calc(30px * var(--popup-scale));
    padding: 0;
    border: 0;
    border-radius: calc(6px * var(--popup-scale));
    color: inherit;
    background: transparent;
    cursor: pointer;
  }

  .action-button:hover { background: color-mix(in srgb, currentColor 10%, transparent); }

  .popup-scroll {
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 calc(5px * var(--popup-scale));
  }

  .popup-state {
    display: flex;
    min-height: calc(110px * var(--popup-scale));
    align-items: center;
    justify-content: center;
    gap: calc(9px * var(--popup-scale));
    padding: calc(20px * var(--popup-scale));
    color: color-mix(in srgb, currentColor 65%, transparent);
    font-size: calc(14px * var(--popup-scale));
    text-align: center;
  }

  .popup-error { color: #ef9a9a; }

  .popup-spinner {
    width: calc(15px * var(--popup-scale));
    height: calc(15px * var(--popup-scale));
    border: calc(2px * var(--popup-scale)) solid currentColor;
    border-right-color: transparent;
    border-radius: 999px;
    animation: spin 0.8s linear infinite;
  }

  .entry { padding: calc(4px * var(--popup-scale)) 0 calc(5px * var(--popup-scale)); }

  .entry-header {
    display: flex;
    align-items: center;
    padding-top: calc(4px * var(--popup-scale));
  }

  .expression-scroll {
    flex: 1 1 auto;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .expression {
    display: inline-block;
    white-space: nowrap;
    font-size: calc(26px * var(--popup-scale));
  }

  .expression rt {
    font-size: calc(13px * var(--popup-scale));
    user-select: none;
  }

  .header-buttons {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    margin-left: auto;
    gap: calc(6px * var(--popup-scale));
  }

  .entry-tags {
    margin-top: calc(-4px * var(--popup-scale));
    user-select: none;
  }

  .tag-row {
    display: flex;
    flex-wrap: wrap;
    gap: calc(2px * var(--popup-scale));
    margin-top: calc(3px * var(--popup-scale));
    line-height: 1;
  }

  .expr-tag {
    padding: calc(2px * var(--popup-scale)) calc(4px * var(--popup-scale));
    margin-right: calc(2px * var(--popup-scale));
    color: var(--expr-tag-text-color);
    background-color: var(--expr-tag-color);
    border-radius: calc(4px * var(--popup-scale));
    font-size: calc(11px * var(--popup-scale));
  }

  .deinflection-tag {
    padding: calc(2px * var(--popup-scale)) calc(4px * var(--popup-scale));
    margin-right: calc(2px * var(--popup-scale));
    color: inherit;
    background-color: color-mix(in srgb, currentColor 13%, transparent);
    border-radius: calc(4px * var(--popup-scale));
    font-size: calc(11px * var(--popup-scale));
  }

  .frequency-group {
    display: inline-flex;
    overflow: hidden;
    border: calc(1px * var(--popup-scale)) solid var(--freq-tag-color);
    border-radius: calc(4px * var(--popup-scale));
    font-size: calc(11px * var(--popup-scale));
  }

  .frequency-dict-label {
    display: flex;
    align-items: center;
    padding: calc(4px * var(--popup-scale));
    color: #fff;
    background-color: var(--freq-tag-color);
  }

  .frequency-values { padding: calc(4px * var(--popup-scale)); }

  .pitch-list {
    display: flex;
    flex-direction: column;
    gap: calc(3px * var(--popup-scale));
    margin-top: calc(4px * var(--popup-scale));
  }

  .pitch-group {
    display: flex;
    align-items: baseline;
    gap: calc(5px * var(--popup-scale));
    font-size: calc(11px * var(--popup-scale));
  }

  .pitch-dict-label {
    padding: calc(2px * var(--popup-scale)) calc(4px * var(--popup-scale));
    color: #fff;
    background: var(--pitch-tag-color);
    border-radius: calc(4px * var(--popup-scale));
  }

  .pitch-entries {
    display: flex;
    flex-wrap: wrap;
    gap: calc(6px * var(--popup-scale));
    padding: 0;
    list-style: none;
  }

  .pronunciation-mora { position: relative; }

  .pronunciation-mora[data-pitch='high'] > .pronunciation-mora-line {
    position: absolute;
    inset: calc(-2px * var(--popup-scale)) 0 auto;
    border-top: calc(1px * var(--popup-scale)) solid currentColor;
  }

  .pronunciation-mora[data-pitch='high'][data-pitch-next='low'] > .pronunciation-mora-line {
    right: calc(-1px * var(--popup-scale));
    height: 0.4em;
    border-right: calc(1px * var(--popup-scale)) solid currentColor;
  }

  .pronunciation-mora[data-pitch='high'][data-pitch-next='low'] {
    padding-right: calc(1px * var(--popup-scale));
    margin-right: calc(1px * var(--popup-scale));
  }

  hr {
    margin: 0;
    border: none;
    border-top: calc(1px * var(--popup-scale)) solid color-mix(in srgb, currentColor 30%, transparent);
  }

  .glossary-sections { min-width: 0; }

  .glossary-group {
    position: relative;
    min-width: 0;
    margin-top: calc(5px * var(--popup-scale));
    padding: calc(6px * var(--popup-scale)) calc(8px * var(--popup-scale));
    border: calc(1px * var(--popup-scale)) solid color-mix(in srgb, currentColor 14%, transparent);
    border-radius: calc(8px * var(--popup-scale));
    box-shadow: inset 0 0 0 calc(1px * var(--popup-scale)) rgb(255 255 255 / 0.08);
  }

  .glossary-group > summary { list-style: none; }
  .glossary-group > summary::-webkit-details-marker { display: none; }

  .glossary-group > summary::before {
    content: '▶ ';
    font-size: calc(8px * var(--popup-scale));
    opacity: 0.5;
  }

  .glossary-group[open] > summary::before { content: '▼ '; }

  .glossary-group > div[data-dictionary] {
    display: block;
    padding-top: calc(2px * var(--popup-scale));
    font-size: calc(14px * var(--popup-scale));
    line-height: 1.4;
  }

  .glossary-group > div[data-dictionary] > ol {
    margin: 0;
    padding-left: var(--list-padding1);
  }

  .dict-label {
    display: block;
    opacity: 0.7;
    font-size: calc(10px * var(--popup-scale));
    cursor: pointer;
    user-select: none;
  }

  :global(.mining-dictionary-popup .dict-label.selected > .dict-name) { font-weight: bold; }

  .glossary-sense + .glossary-sense { margin-top: calc(5px * var(--popup-scale)); }

  .glossary-tags {
    display: inline-flex;
    flex-wrap: wrap;
    gap: calc(4px * var(--popup-scale));
    margin: 0 0 calc(2px * var(--popup-scale));
  }

  .glossary-tag {
    padding: calc(2px * var(--popup-scale)) calc(4px * var(--popup-scale));
    background-color: color-mix(in srgb, currentColor 13%, transparent);
    border-radius: calc(4px * var(--popup-scale));
    font-size: calc(10px * var(--popup-scale));
    line-height: 1;
  }

  .glossary-content {
    padding: 0 calc(8px * var(--popup-scale));
    font-size: calc(15px * var(--popup-scale));
  }

  :global(.mining-dictionary-popup .glossary-list) {
    margin: calc(2px * var(--popup-scale)) 0;
    padding-left: 1.8em;
  }

  :global(.mining-dictionary-popup .glossary-list > li) { margin: calc(1px * var(--popup-scale)) 0; }

  :global(.mining-dictionary-popup.compact-glossaries .glossary-list) {
    display: inline;
    margin: 0;
    padding-left: 0;
    list-style: none;
  }

  :global(.mining-dictionary-popup.compact-glossaries .glossary-list > li) { display: inline; }

  :global(.mining-dictionary-popup.compact-glossaries .glossary-list > li:not(:last-child)::after) {
    content: ' | ';
    opacity: 0.6;
  }

  .two-column-layout .glossary-sections:not(.single-section) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: calc(5px * var(--popup-scale));
    align-items: start;
    margin-top: calc(8px * var(--popup-scale));
  }

  @keyframes spin { to { transform: rotate(360deg); } }
</style>
