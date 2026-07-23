<script lang='ts'>
  import ChevronDown from 'lucide-svelte/icons/chevron-down'
  import ChevronUp from 'lucide-svelte/icons/chevron-up'
  import CodeXml from 'lucide-svelte/icons/code-xml'
  import LoaderCircle from 'lucide-svelte/icons/loader-circle'
  import Trash2 from 'lucide-svelte/icons/trash-2'
  import Upload from 'lucide-svelte/icons/upload'
  import { createEventDispatcher, onMount } from 'svelte'

  import { Button } from '$lib/components/ui/button'
  import * as Dialog from '$lib/components/ui/dialog'
  import { Switch } from '$lib/components/ui/switch'
  import {
    UNAVAILABLE_MINING_DICTIONARY_STATE,
    type MiningDictionaryImportError,
    type MiningDictionaryImportProgress,
    type MiningDictionaryKind,
    type MiningDictionaryRecord,
    type MiningDictionaryState
  } from '$lib/modules/mining-dictionary'
  import native from '$lib/modules/native'

  const kinds: Array<{ kind: MiningDictionaryKind, title: string }> = [
    { kind: 'term', title: 'Term' },
    { kind: 'frequency', title: 'Frequency' },
    { kind: 'pitch', title: 'Pitch' }
  ]
  const dispatch = createEventDispatcher<{ editcss: null }>()

  let state: MiningDictionaryState = UNAVAILABLE_MINING_DICTIONARY_STATE
  let loading = native.isApp
  let mutating = false
  let error = ''
  let progress: MiningDictionaryImportProgress[] = []
  let importErrors: MiningDictionaryImportError[] = []
  let removeTarget: MiningDictionaryRecord | undefined

  function applyState (next: MiningDictionaryState) {
    state = next
    loading = false
  }

  onMount(() => {
    if (!native.isApp) return
    const unsubscribe = native.onMiningDictionaryEvent(event => {
      if (event.event === 'stateChanged') applyState(event.data)
      if (event.event === 'backendError') error = event.data.message
      if (event.event === 'importError') {
        const key = `${event.data.operationId}:${event.data.fileIndex}`
        importErrors = [...importErrors.filter(item => `${item.operationId}:${item.fileIndex}` !== key), event.data]
          .sort((a, b) => a.fileIndex - b.fileIndex)
      }
      if (event.event === 'importProgress') {
        const key = `${event.data.operationId}:${event.data.fileIndex}`
        progress = [...progress.filter(item => `${item.operationId}:${item.fileIndex}` !== key), event.data]
          .sort((a, b) => a.fileIndex - b.fileIndex)
        if (event.data.phase === 'completion') {
          native.miningDictionaryState().then(applyState).catch(() => {})
        }
      }
    })
    native.miningDictionaryState()
      .then(applyState)
      .catch(cause => {
        loading = false
        error = cause instanceof Error ? cause.message : 'Could not start the offline dictionary backend.'
      })
    return unsubscribe
  })

  async function mutate (operation: () => Promise<MiningDictionaryState>) {
    if (mutating) return
    mutating = true
    error = ''
    try {
      applyState(await operation())
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'The dictionary operation failed.'
    } finally {
      mutating = false
    }
  }

  async function importDictionaries () {
    progress = []
    importErrors = []
    await mutate(() => native.miningDictionaryImport())
  }

  function setEnabled (record: MiningDictionaryRecord, kind: MiningDictionaryKind) {
    return mutate(() => native.miningDictionarySetEnabled(record.id, kind, !record.enabled[kind]))
  }

  function move (kind: MiningDictionaryKind, index: number, direction: -1 | 1) {
    const ordered = [...state.order[kind]]
    const target = index + direction
    if (target < 0 || target >= ordered.length) return
    ;[ordered[index], ordered[target]] = [ordered[target]!, ordered[index]!]
    return mutate(() => native.miningDictionaryReorder(kind, ordered))
  }

  async function removeDictionary () {
    if (!removeTarget) return
    const id = removeTarget.id
    removeTarget = undefined
    await mutate(() => native.miningDictionaryRemove(id))
  }

  function recordsFor (kind: MiningDictionaryKind) {
    return state.order[kind]
      .map(id => state.dictionaries.find(dictionary => dictionary.id === id))
      .filter((dictionary): dictionary is MiningDictionaryRecord => Boolean(dictionary))
  }

  function phaseLabel (phase: string) {
    return phase.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, letter => letter.toUpperCase())
  }

  function handleRemoveDialog (open: boolean) {
    if (!open) removeTarget = undefined
  }
</script>

<div class='rounded-lg border bg-card p-4 flex flex-col gap-4'>
  <div class='flex flex-wrap items-start justify-between gap-3'>
    <div>
      <h2 class='font-bold'>Dictionaries</h2>
      <p class='text-sm text-muted-foreground'>Import Yomitan term, frequency, and pitch dictionary ZIPs for fully offline lookup.</p>
    </div>
    <div class='flex flex-wrap gap-2'>
      <Button variant='secondary' class='gap-2' on:click={() => dispatch('editcss', null)}>
        <CodeXml size={16} />
        Dictionary CSS
      </Button>
      <Button class='gap-2' disabled={!state.available || mutating} on:click={importDictionaries}>
        {#if mutating}
          <LoaderCircle class='animate-spin' size={16} />
        {:else}
          <Upload size={16} />
        {/if}
        Import ZIPs
      </Button>
    </div>
  </div>

  {#if !native.isApp}
    <p class='rounded-md bg-muted p-3 text-sm'>Dictionary import and lookup are available in the Hayase desktop app.</p>
  {:else if loading}
    <p class='flex items-center gap-2 text-sm text-muted-foreground'><LoaderCircle class='animate-spin' size={16} /> Starting dictionary backend…</p>
  {:else if !state.available}
    <p class='rounded-md bg-destructive/10 p-3 text-sm text-destructive'>{state.error || 'The offline dictionary backend is unavailable.'}</p>
  {/if}

  {#if error}
    <p class='rounded-md bg-destructive/10 p-3 text-sm text-destructive' role='alert'>{error}</p>
  {/if}

  {#if progress.length}
    <div class='flex flex-col gap-2' aria-live='polite'>
      {#each progress as item (`${item.operationId}:${item.fileIndex}`)}
        <div class='rounded-md bg-muted p-3 text-sm'>
          <div class='flex justify-between gap-3'>
            <span class='truncate font-medium'>{item.dictionary || item.fileName}</span>
            <span class='shrink-0 text-muted-foreground'>{phaseLabel(item.phase)}</span>
          </div>
          <progress class='mt-2 h-1.5 w-full accent-primary' max={Math.max(1, item.total)} value={Math.min(item.completed, Math.max(1, item.total))} />
          <div class='text-right text-xs text-muted-foreground'>{item.completed} / {item.total}</div>
        </div>
      {/each}
    </div>
  {/if}

  {#if importErrors.length}
    <div class='flex flex-col gap-2' aria-live='polite'>
      {#each importErrors as item (`${item.operationId}:${item.fileIndex}`)}
        <div class='rounded-md bg-destructive/10 p-3 text-sm text-destructive' role='alert'>
          <span class='font-medium'>{item.fileName}:</span> {item.message}
          <span class='text-xs opacity-80'> ({item.code})</span>
        </div>
      {/each}
    </div>
  {/if}

  {#if state.available && !state.dictionaries.length}
    <p class='rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground'>No dictionaries installed. Import one or more Yomitan ZIP files to begin.</p>
  {/if}

  {#if state.dictionaries.length}
    <div class='flex flex-col gap-2'>
      {#each kinds as { kind, title } (kind)}
        {@const dictionaries = recordsFor(kind)}
        <details class='group min-w-0 rounded-md border bg-background'>
          <summary class='flex cursor-pointer list-none items-center gap-3 p-3 [&::-webkit-details-marker]:hidden'>
            <ChevronDown class='shrink-0 transition-transform group-open:rotate-180' size={17} />
            <span class='font-bold'>{title}</span>
            <span class='ml-auto text-sm text-muted-foreground'>
              {dictionaries.length} {dictionaries.length === 1 ? 'dictionary' : 'dictionaries'}
              · {dictionaries.reduce((total, dictionary) => total + dictionary.counts[kind], 0).toLocaleString()} entries
            </span>
          </summary>
          <div class='border-t p-3'>
            {#if !dictionaries.length}
              <p class='text-sm text-muted-foreground'>No {title.toLowerCase()} data installed.</p>
            {:else}
              <ol class='flex flex-col gap-2'>
                {#each dictionaries as dictionary, index (dictionary.id)}
                  <li class='flex flex-wrap items-center gap-2 rounded-md bg-muted/60 px-3 py-2'>
                    <div class='min-w-48 flex-1'>
                      <div class='truncate font-medium' title={dictionary.title}>{dictionary.title}</div>
                      <div class='text-xs text-muted-foreground'>
                        {dictionary.counts[kind].toLocaleString()} entries
                        {#if dictionary.revision} · revision {dictionary.revision}{/if}
                      </div>
                    </div>
                    <Switch
                      hideState
                      checked={dictionary.enabled[kind]}
                      disabled={mutating}
                      aria-label={`${dictionary.enabled[kind] ? 'Disable' : 'Enable'} ${dictionary.title} ${kind} dictionary`}
                      on:click={() => setEnabled(dictionary, kind)}
                    />
                    <div class='flex gap-1'>
                      <Button
                        size='icon'
                        variant='ghost'
                        disabled={mutating || index === 0}
                        aria-label={`Move ${dictionary.title} up`}
                        title='Move up'
                        on:click={() => move(kind, index, -1)}
                      ><ChevronUp size={16} /></Button>
                      <Button
                        size='icon'
                        variant='ghost'
                        disabled={mutating || index === dictionaries.length - 1}
                        aria-label={`Move ${dictionary.title} down`}
                        title='Move down'
                        on:click={() => move(kind, index, 1)}
                      ><ChevronDown size={16} /></Button>
                      <Button
                        size='icon'
                        variant='ghost'
                        disabled={mutating}
                        aria-label={`Remove ${dictionary.title}`}
                        title='Remove dictionary'
                        on:click={() => { removeTarget = dictionary }}
                      ><Trash2 size={16} /></Button>
                    </div>
                  </li>
                {/each}
              </ol>
            {/if}
          </div>
        </details>
      {/each}
    </div>
  {/if}
</div>

<Dialog.Root open={Boolean(removeTarget)} onOpenChange={handleRemoveDialog}>
  <Dialog.Content class='max-w-md bg-background'>
    <Dialog.Header>
      <Dialog.Title>Remove {removeTarget?.title}?</Dialog.Title>
      <Dialog.Description>
        This removes the imported dictionary from every term, frequency, and pitch list it supports.
      </Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer>
      <Button variant='secondary' on:click={() => { removeTarget = undefined }}>Cancel</Button>
      <Button variant='destructive' on:click={removeDictionary}>Remove dictionary</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
