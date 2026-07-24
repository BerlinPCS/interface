<script lang='ts'>
  import ArrowLeft from 'lucide-svelte/icons/arrow-left'
  import Check from 'lucide-svelte/icons/check'
  import RefreshCw from 'lucide-svelte/icons/refresh-cw'
  import Unplug from 'lucide-svelte/icons/unplug'
  import { onMount } from 'svelte'
  import { toast } from 'svelte-sonner'

  import { Button } from '$lib/components/ui/button'
  import { SingleCombo } from '$lib/components/ui/combobox'
  import { Input } from '$lib/components/ui/input'
  import { Switch } from '$lib/components/ui/switch'
  import {
    UNAVAILABLE_MINING_ANKI_STATE,
    type MiningAnkiSettingsPatch,
    type MiningAnkiState
  } from '$lib/modules/mining-anki'
  import native from '$lib/modules/native'
  import { settings } from '$lib/modules/settings'

  const duplicateScopes = {
    collection: 'Entire collection',
    deck: 'Selected deck',
    deckRoot: 'Deck and children'
  }
  const templateOptions = [
    '{expression}', '{reading}', '{furigana-plain}', '{audio}', '{selected-text}',
    '{popup-selection-text}', '{sentence}', '{sentence-audio}', '{screenshot}',
    '{timestamp}', '{document-title}', '{glossary-first}', '{glossary}',
    '{frequencies}', '{frequency-harmonic-rank}', '{pitch-accent-positions}',
    '{pitch-accent-categories}', '{phonetic-transcriptions}'
  ]
  const fieldMappingItems = Object.fromEntries([
    ['', 'None'],
    ...templateOptions.map(value => [value, value])
  ])

  let state: MiningAnkiState = structuredClone(UNAVAILABLE_MINING_ANKI_STATE)
  let apiKey = ''
  let loading = true
  let changing = false
  let connected = false

  $: deckItems = Object.fromEntries(state.decks.map(name => [name, name]))
  $: modelItems = Object.fromEntries(state.models.map(model => [model.name, model.name]))
  $: selectedModel = state.models.find(model => model.name === state.settings.modelName)

  onMount(() => {
    refresh()
    if (!native.isApp) return
    return native.onMiningAnkiEvent(event => {
      state = event.data
      connected = event.data.connectionStatus === 'connected'
    })
  })

  async function refresh () {
    loading = true
    try {
      state = await native.miningAnkiState()
      connected = state.connectionStatus === 'connected'
    } catch (error) {
      toast.error('Unable to load Anki settings', { description: errorMessage(error) })
    } finally {
      loading = false
    }
  }

  async function update (patch: MiningAnkiSettingsPatch) {
    changing = true
    try {
      state = await native.miningAnkiUpdateSettings(patch)
      if ('endpoint' in patch || 'apiKey' in patch) connected = false
    } catch (error) {
      toast.error('Unable to save Anki settings', { description: errorMessage(error) })
    } finally {
      changing = false
    }
  }

  async function connectAnki () {
    changing = true
    try {
      state = await native.miningAnkiUpdateSettings({
        endpoint: state.settings.endpoint,
        ...(apiKey ? { apiKey } : {})
      })
      const connection = await native.miningAnkiPing()
      if (connection.status === 'error') throw new Error(connection.message)
      state = await native.miningAnkiDetect()
      if (state.error) throw new Error(state.error)
      apiKey = ''
      connected = true
      toast.success('Connected to AnkiConnect')
    } catch (error) {
      connected = false
      toast.error('Could not connect to AnkiConnect', { description: errorMessage(error) })
    } finally {
      changing = false
    }
  }

  async function refreshModels () {
    changing = true
    try {
      state = await native.miningAnkiDetect()
      if (state.error) throw new Error(state.error)
      connected = true
      toast.success('Refreshed Anki decks and models')
    } catch (error) {
      connected = false
      toast.error('Could not refresh Anki decks and models', { description: errorMessage(error) })
    } finally {
      changing = false
    }
  }

  function updateMapping (field: string, value: string) {
    update({ fieldMappings: { ...state.settings.fieldMappings, [field]: value } })
  }

  function updateDuplicateScope (duplicateScope: string) {
    if (duplicateScope === 'collection' || duplicateScope === 'deck' || duplicateScope === 'deckRoot') {
      update({ duplicateScope })
    }
  }

  function errorMessage (error: unknown) {
    return error instanceof Error ? error.message : 'Unknown error'
  }
</script>

<div class='flex items-center gap-3'>
  <a href='/#/app/settings/mining' class='inline-flex size-9 items-center justify-center rounded-md hover:bg-accent' aria-label='Back to mining settings'>
    <ArrowLeft size={20} />
  </a>
  <div>
    <h1 class='text-xl font-bold'>Anki</h1>
    <p class='text-sm text-muted-foreground'>Add mined notes directly through the Anki desktop application.</p>
  </div>
</div>

{#if loading}
  <p class='text-sm text-muted-foreground'>Loading Anki configuration…</p>
{:else}
  <div class='space-y-3'>
    <section class='rounded-xl border bg-card p-4'>
      <div class='mb-3 flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h2 class='font-bold'>AnkiConnect</h2>
          <p class='text-xs text-muted-foreground'>Hayase connects through the native process at localhost.</p>
        </div>
        <div class='flex items-center gap-2'>
          <Button variant='outline' size='sm' class='gap-1.5' disabled={changing} on:click={refreshModels}>
            <RefreshCw size={15} /> Refresh Models
          </Button>
          <Button variant={connected ? 'secondary' : 'default'} size='sm' class='gap-1.5' disabled={changing} on:click={connectAnki}>
            {#if connected}<Check size={15} /> Connected{:else}<Unplug size={15} /> Connect{/if}
          </Button>
        </div>
      </div>
      <div class='divide-y rounded-lg border'>
        <label class='setting-row' for='anki-address'>
          <span>Address</span>
          <Input id='anki-address' bind:value={state.settings.endpoint} class='setting-input' placeholder='http://127.0.0.1:8765' />
        </label>
        <label class='setting-row' for='anki-api-key'>
          <span>
            API Key
            {#if state.settings.hasApiKey}
              <button type='button' class='ml-2 text-xs text-muted-foreground underline' disabled={changing} on:click|preventDefault={() => update({ apiKey: '' })}>Clear</button>
            {/if}
          </span>
          <Input id='anki-api-key' type='password' bind:value={apiKey} class='setting-input' autocomplete='off' placeholder={state.settings.hasApiKey ? 'Configured' : 'Optional'} />
        </label>
      </div>
    </section>

    <section class='rounded-xl border bg-card p-4'>
      <div class='mb-3'>
        <h2 class='font-bold'>Card</h2>
        <p class='text-xs text-muted-foreground'>Choose a destination, then map the selected note type’s fields.</p>
      </div>
      <div class='grid gap-3 md:grid-cols-2'>
        <div class='space-y-1.5'>
          <span class='text-sm font-medium'>Deck</span>
          <SingleCombo value={state.settings.deckName ?? ''} items={deckItems} onSelected={deckName => update({ deckName })} class='w-full border border-input' />
        </div>
        <div class='space-y-1.5'>
          <span class='text-sm font-medium'>Model</span>
          <SingleCombo value={state.settings.modelName ?? ''} items={modelItems} onSelected={modelName => update({ modelName })} class='w-full border border-input' />
        </div>
      </div>

      <div class='mb-2 mt-5'>
        <h3 class='font-semibold'>Fields</h3>
        <p class='text-xs text-muted-foreground'>Empty mappings are omitted from new notes.</p>
      </div>
      <div class='divide-y rounded-lg border'>
        {#if selectedModel}
          {#each selectedModel.fields as field (field)}
            <div class='field-row'>
              <span class='text-sm font-medium'>{field}</span>
              <SingleCombo
                value={state.settings.fieldMappings[field] ?? ''}
                items={fieldMappingItems}
                onSelected={value => updateMapping(field, value)}
                class='field-combo w-full border border-input'
              />
            </div>
          {/each}
        {:else}
          <p class='px-4 py-3 text-sm text-muted-foreground'>Detect and choose a note type to map its fields.</p>
        {/if}
        <label class='field-row'>
          <span class='text-sm font-medium'>Tags</span>
          <Input
            value={state.settings.tags}
            class='field-input'
            placeholder='Whitespace-separated tags'
            on:change={event => update({ tags: event.currentTarget.value })}
          />
        </label>
      </div>
    </section>

    <div class='grid items-start gap-3 xl:grid-cols-2'>
      <section class='rounded-xl border bg-card p-4'>
        <div class='mb-3'>
          <h2 class='font-bold'>Duplicate Checks and Actions</h2>
        </div>
        <div class='divide-y rounded-lg border'>
          <label class='setting-row' for='anki-allow-duplicates'>
            <span>Allow Duplicates</span>
            <Switch id='anki-allow-duplicates' checked={state.settings.allowDuplicates} on:click={() => update({ allowDuplicates: !state.settings.allowDuplicates })} />
          </label>
          <label class='setting-row' for='anki-show-notes'>
            <span>Disable Show Notes Button</span>
            <Switch id='anki-show-notes' checked={!state.settings.showNotes} on:click={() => update({ showNotes: !state.settings.showNotes })} />
          </label>
          <label class='setting-row'>
            <span>Duplicate Scope</span>
            <SingleCombo value={state.settings.duplicateScope} items={duplicateScopes} onSelected={updateDuplicateScope} class='w-full border border-input md:w-52' />
          </label>
          <label class='setting-row' for='anki-compact-glossaries'>
            <span>Compact Glossaries</span>
            <Switch id='anki-compact-glossaries' bind:checked={$settings.miningDictionaryCompactGlossaries} />
          </label>
          <label class='setting-row' for='anki-check-all-models'>
            <span>Check All Models</span>
            <Switch id='anki-check-all-models' checked={state.settings.checkAllModels} on:click={() => update({ checkAllModels: !state.settings.checkAllModels })} />
          </label>
          <label class='setting-row' for='anki-force-sync'>
            <span>Force Sync on Adding Card</span>
            <Switch id='anki-force-sync' checked={state.settings.forceSync} on:click={() => update({ forceSync: !state.settings.forceSync })} />
          </label>
        </div>
      </section>

      <section class='rounded-xl border bg-card p-4'>
        <div class='mb-3'>
          <h2 class='font-bold'>Player Media Capture</h2>
          <p class='text-xs text-muted-foreground'>Media is captured only when its field mapping is used.</p>
        </div>
        <div class='divide-y rounded-lg border'>
          <label class='setting-row' for='anki-screenshot'>
            <span>Screenshot <small class='block text-muted-foreground'>{'{screenshot}'}</small></span>
            <Switch id='anki-screenshot' bind:checked={$settings.miningAnkiCaptureScreenshot} />
          </label>
          <label class='setting-row' for='anki-screenshot-subtitles'>
            <span>Include Subtitles in Screenshot</span>
            <Switch
              id='anki-screenshot-subtitles'
              bind:checked={$settings.miningAnkiScreenshotSubtitles}
              disabled={!$settings.miningAnkiCaptureScreenshot}
            />
          </label>
          <label class='setting-row' for='anki-audio'>
            <span>Subtitle Audio <small class='block text-muted-foreground'>{'{sentence-audio}'}</small></span>
            <Switch id='anki-audio' bind:checked={$settings.miningAnkiCaptureAudio} />
          </label>
          <label class='setting-row' for='anki-padding-before'>
            <span>Audio Padding Before</span>
            <Input id='anki-padding-before' type='number' min='0' max='5' step='0.05' bind:value={$settings.miningAnkiAudioPaddingStart} class='w-24' />
          </label>
          <label class='setting-row' for='anki-padding-after'>
            <span>Audio Padding After</span>
            <Input id='anki-padding-after' type='number' min='0' max='5' step='0.05' bind:value={$settings.miningAnkiAudioPaddingEnd} class='w-24' />
          </label>
        </div>
      </section>
    </div>
  </div>
{/if}

<style>
  :global(.setting-row) {
    display: flex;
    min-height: 3.25rem;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.55rem 0.9rem;
    font-size: 0.875rem;
  }

  :global(.setting-input) {
    width: 100%;
    max-width: 24rem;
  }

  :global(.field-row) {
    display: grid;
    min-height: 3.25rem;
    grid-template-columns: minmax(8rem, 0.35fr) minmax(0, 1fr);
    align-items: center;
    gap: 1rem;
    padding: 0.4rem 0.9rem;
  }

  :global(.field-combo) {
    min-height: 2.25rem;
  }

  @media (max-width: 640px) {
    :global(.setting-row),
    :global(.field-row) {
      grid-template-columns: 1fr;
      flex-wrap: wrap;
      gap: 0.4rem;
    }
  }
</style>
