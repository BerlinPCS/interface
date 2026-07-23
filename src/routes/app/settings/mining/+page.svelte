<script lang='ts'>
  import ChevronDown from 'lucide-svelte/icons/chevron-down'
  import CodeXml from 'lucide-svelte/icons/code-xml'
  import RotateCcw from 'lucide-svelte/icons/rotate-ccw'
  import { onDestroy } from 'svelte'

  import MiningDictionariesSettings from './mining-dictionaries-settings.svelte'

  import SettingCard from '$lib/components/SettingCard.svelte'
  import { Button } from '$lib/components/ui/button'
  import { SingleCombo } from '$lib/components/ui/combobox'
  import * as Dialog from '$lib/components/ui/dialog'
  import { Input } from '$lib/components/ui/input'
  import MiningDictionaryPopup from '$lib/components/ui/player/mining-dictionary-popup.svelte'
  import MiningSubtitle from '$lib/components/ui/player/mining-subtitle.svelte'
  import { Switch } from '$lib/components/ui/switch'
  import { Textarea } from '$lib/components/ui/textarea'
  import { DEFAULT_MINING_SUBTITLE_CSS, type MiningSelection } from '$lib/modules/mining'
  import {
    calculateMiningPopupPosition,
    DEFAULT_MINING_DICTIONARY_CSS,
    type MiningDictionaryEntry,
    type MiningPopupPosition
  } from '$lib/modules/mining-dictionary'
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
  const previewEntries: MiningDictionaryEntry[] = [{
    expression: '食べる',
    reading: 'たべる',
    matched: '食べました',
    deinflected: '食べる',
    trace: [{ name: 'polite past', description: '食べました → 食べる' }],
    rules: ['v1'],
    glossaries: [{
      dictionary: 'JMdict',
      content: '["to eat", "to consume"]',
      definitionTags: 'v1 transitive',
      termTags: 'common'
    }, {
      dictionary: 'Japanese Examples',
      content: '[{"type":"structured-content","content":[{"tag":"span","content":"何か食べましたか？ — Did you eat anything?"}]}]',
      definitionTags: '',
      termTags: ''
    }],
    frequencies: [{
      dictionary: 'Frequency',
      frequencies: [{ value: 612, displayValue: '612' }]
    }],
    pitches: [{
      dictionary: 'Pitch Accent',
      pitchPositions: [2],
      transcriptions: ['たべる']
    }]
  }]
  const collapseModes = {
    expandAll: 'Expand All',
    collapseAll: 'Collapse All'
  }
  const previewVerbOffset = previewCue.plainText.indexOf('食べました')

  let dictionaryCssOpen = false
  let subtitleCssOpen = false
  let previewContainer: HTMLDivElement
  let previewSelection: MiningSelection | undefined
  let previewCloseTimer: ReturnType<typeof setTimeout> | undefined

  $: previewPopupPosition = previewContainer && previewSelection
    ? calculatePreviewPopupPosition(previewSelection)
    : undefined

  function calculatePreviewPopupPosition (selection: MiningSelection): MiningPopupPosition {
    const container = previewContainer.getBoundingClientRect()
    return calculateMiningPopupPosition({
      left: selection.anchor.left - container.left,
      right: selection.anchor.right - container.left,
      top: selection.anchor.top - container.top,
      bottom: selection.anchor.bottom - container.top
    }, {
      width: previewContainer.clientWidth,
      height: previewContainer.clientHeight
    }, $settings.miningPopupWidth, $settings.miningPopupHeight)
  }

  function handlePreviewSelection (event: CustomEvent<MiningSelection | undefined>) {
    const selection = event.detail
    if (!selection) return schedulePreviewClose()
    if (selection.utf16Offset < previewVerbOffset) {
      previewSelection = undefined
      return
    }
    keepPreviewOpen()
    previewSelection = selection
  }

  function keepPreviewOpen () {
    if (previewCloseTimer) clearTimeout(previewCloseTimer)
    previewCloseTimer = undefined
  }

  function schedulePreviewClose () {
    keepPreviewOpen()
    previewCloseTimer = setTimeout(() => {
      previewSelection = undefined
      previewCloseTimer = undefined
    }, 100)
  }

  function resetSubtitleCss () {
    $settings.miningSubtitleCss = DEFAULT_MINING_SUBTITLE_CSS
  }

  function resetDictionaryCss () {
    $settings.miningDictionaryCss = DEFAULT_MINING_DICTIONARY_CSS
  }

  onDestroy(keepPreviewOpen)
</script>

<div class='font-weight-bold text-xl font-bold'>Mining Mode</div>
<SettingCard
  let:id
  title='Pause On Entry'
  description='Pause a playing video when mining mode opens. Leaving mining mode restores the playing or paused state from before it was opened.'
>
  <Switch {id} bind:checked={$settings.miningPauseOnEnter} />
</SettingCard>

<MiningDictionariesSettings on:editcss={() => { dictionaryCssOpen = true }} />

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
    bind:this={previewContainer}
    class='relative flex min-h-[420px] items-center justify-center overflow-hidden rounded-md bg-black px-6'
  >
    <div class='absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_center,_#475569,_#020617_70%)]' />
    <MiningSubtitle
      cues={[previewCue]}
      css={$settings.miningSubtitleCss}
      preview
      on:selection={handlePreviewSelection}
    />
    {#if previewPopupPosition}
      <MiningDictionaryPopup
        entries={previewEntries}
        position={previewPopupPosition}
        scale={$settings.miningPopupScale}
        collapseMode={$settings.miningDictionaryCollapseMode}
        expandFirstDictionary={$settings.miningDictionaryExpandFirst}
        twoColumnLayout={$settings.miningDictionaryTwoColumn}
        compactGlossaries={$settings.miningDictionaryCompactGlossaries}
        showExpressionTags={$settings.miningDictionaryShowExpressionTags}
        dictionaryStyles={{}}
        customCss={$settings.miningDictionaryCss}
        on:enter={keepPreviewOpen}
        on:leave={schedulePreviewClose}
        on:close={() => { previewSelection = undefined }}
      />
    {/if}
  </div>
</section>

<details class='group rounded-lg border bg-card'>
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
    <SettingCard let:id title='Two-Column Layout' description='Arrange multiple dictionary sections in two columns when results provide them.'>
      <Switch {id} bind:checked={$settings.miningDictionaryTwoColumn} />
    </SettingCard>
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
