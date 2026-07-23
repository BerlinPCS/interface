<script lang='ts'>
  import ArrowDown from 'lucide-svelte/icons/arrow-down'
  import ArrowLeft from 'lucide-svelte/icons/arrow-left'
  import ArrowUp from 'lucide-svelte/icons/arrow-up'
  import Download from 'lucide-svelte/icons/download'
  import Plus from 'lucide-svelte/icons/plus'
  import Trash2 from 'lucide-svelte/icons/trash-2'
  import { onMount } from 'svelte'
  import { toast } from 'svelte-sonner'

  import SettingCard from '$lib/components/SettingCard.svelte'
  import { Button, buttonVariants } from '$lib/components/ui/button'
  import { SingleCombo } from '$lib/components/ui/combobox'
  import * as Dialog from '$lib/components/ui/dialog'
  import { Input } from '$lib/components/ui/input'
  import { Switch } from '$lib/components/ui/switch'
  import {
    HAYASE_LOCAL_AUDIO_SOURCE_URL,
    normalizeMiningAudioSources,
    withLocalMiningAudioSource,
    type MiningAudioSource,
    type MiningLocalAudioState
  } from '$lib/modules/mining-audio'
  import native from '$lib/modules/native'
  import { settings } from '$lib/modules/settings'

  const playbackModes = {
    interrupt: 'Interrupt',
    duck: 'Lower Volume',
    mix: 'Keep Volume'
  }
  const localAudioDownloadUrl = 'https://drive.usercontent.google.com/download?id=1Fn11_nN04zM89yKFYBWVTi0Xpaf6I3qe&export=download'

  let name = ''
  let url = ''
  let localState: MiningLocalAudioState = {
    available: false,
    sizeBytes: 0,
    sources: [],
    sourceOrder: []
  }
  let loadingLocal = true
  let changingLocal = false
  let removeLocalOpen = false

  onMount(async () => {
    await refreshLocalState()
    if (
      localState.available &&
      !$settings.miningAudioSources.some(source => source.url === HAYASE_LOCAL_AUDIO_SOURCE_URL)
    ) {
      $settings.miningAudioSources = withLocalMiningAudioSource($settings.miningAudioSources, true)
    }
  })

  async function refreshLocalState () {
    loadingLocal = true
    try {
      localState = await native.miningAudioLocalState()
    } catch (error) {
      toast.error('Unable to inspect local audio', { description: errorMessage(error) })
    } finally {
      loadingLocal = false
    }
  }

  function updateSources (sources: MiningAudioSource[]) {
    $settings.miningAudioSources = normalizeMiningAudioSources(sources)
  }

  function toggleSource (index: number, enabled: boolean) {
    updateSources($settings.miningAudioSources.map((source, sourceIndex) =>
      sourceIndex === index ? { ...source, enabled } : source
    ))
  }

  function moveSource (from: number, offset: -1 | 1) {
    const sources = [...$settings.miningAudioSources]
    const to = from + offset
    if (from < 0 || to < 0 || from >= sources.length || to >= sources.length) return
    const [source] = sources.splice(from, 1)
    if (!source) return
    sources.splice(to, 0, source)
    updateSources(sources)
  }

  function deleteSource (index: number) {
    const source = $settings.miningAudioSources[index]
    if (!source || source.builtIn) return
    updateSources($settings.miningAudioSources.filter((_, sourceIndex) => sourceIndex !== index))
  }

  function addSource () {
    const nextName = name.trim()
    const nextUrl = url.trim()
    if (!nextName || !nextUrl) return
    try {
      const parsed = new URL(nextUrl.replaceAll('{term}', 'term').replaceAll('{reading}', 'reading'))
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Audio source URLs must use HTTP or HTTPS.')
      }
    } catch (error) {
      toast.error('Invalid audio source URL', { description: errorMessage(error) })
      return
    }
    if ($settings.miningAudioSources.some(source => source.url === nextUrl)) {
      toast.error('That audio source has already been added.')
      return
    }
    updateSources([...$settings.miningAudioSources, {
      id: crypto.randomUUID(),
      name: nextName,
      url: nextUrl,
      enabled: true
    }])
    name = ''
    url = ''
  }

  async function importLocalDatabase () {
    changingLocal = true
    try {
      localState = await native.miningAudioLocalImport()
      if (
        localState.available &&
        !$settings.miningAudioSources.some(source => source.url === HAYASE_LOCAL_AUDIO_SOURCE_URL)
      ) {
        $settings.miningAudioSources = withLocalMiningAudioSource($settings.miningAudioSources, true)
      }
    } catch (error) {
      toast.error('Unable to import android.db', { description: errorMessage(error) })
    } finally {
      changingLocal = false
    }
  }

  async function removeLocalDatabase () {
    changingLocal = true
    removeLocalOpen = false
    try {
      localState = await native.miningAudioLocalRemove()
      $settings.miningAudioSources = withLocalMiningAudioSource($settings.miningAudioSources, false)
    } catch (error) {
      toast.error('Unable to remove local audio', { description: errorMessage(error) })
    } finally {
      changingLocal = false
    }
  }

  async function moveLocalSource (from: number, offset: -1 | 1) {
    const order = [...localState.sourceOrder]
    const to = from + offset
    if (from < 0 || to < 0 || from >= order.length || to >= order.length) return
    const [source] = order.splice(from, 1)
    if (!source) return
    order.splice(to, 0, source)
    changingLocal = true
    try {
      localState = await native.miningAudioLocalReorder(order)
    } catch (error) {
      toast.error('Unable to reorder local sources', { description: errorMessage(error) })
    } finally {
      changingLocal = false
    }
  }

  function errorMessage (error: unknown) {
    return error instanceof Error ? error.message : 'Unknown error'
  }

  function fileSize (bytes: number) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`
    return `${(bytes / 1024 ** 3).toFixed(1)} GiB`
  }
</script>

<div class='flex items-center gap-3'>
  <a href='/#/app/settings/mining' class='inline-flex size-9 items-center justify-center rounded-md hover:bg-accent' aria-label='Back to mining settings'>
    <ArrowLeft size={20} />
  </a>
  <div>
    <h1 class='text-xl font-bold'>Audio Sources</h1>
    <p class='text-sm text-muted-foreground'>Configure the sources used by the Hoshi Android dictionary popup.</p>
  </div>
</div>

<section class='space-y-3 rounded-lg border bg-card p-4'>
  <div>
    <h2 class='font-bold'>Sources</h2>
    <p class='text-sm text-muted-foreground'>Sources are tried from top to bottom until one returns audio.</p>
  </div>
  <div class='divide-y rounded-md border'>
    {#each $settings.miningAudioSources as source, index (source.id)}
      <div class='flex items-center gap-3 p-3'>
        <div class='min-w-0 grow'>
          <div class='truncate font-medium'>{source.name}</div>
          <div class='truncate text-xs text-muted-foreground'>{source.url}</div>
        </div>
        <div class='flex shrink-0 items-center gap-1'>
          <Button variant='ghost' size='icon' disabled={index === 0} aria-label={`Move ${source.name} up`} on:click={() => moveSource(index, -1)}>
            <ArrowUp size={16} />
          </Button>
          <Button variant='ghost' size='icon' disabled={index === $settings.miningAudioSources.length - 1} aria-label={`Move ${source.name} down`} on:click={() => moveSource(index, 1)}>
            <ArrowDown size={16} />
          </Button>
          {#if !source.builtIn}
            <Button variant='ghost' size='icon' aria-label={`Delete ${source.name}`} on:click={() => deleteSource(index)}>
              <Trash2 size={16} />
            </Button>
          {/if}
          <Switch
            aria-label={`Enable ${source.name}`}
            checked={source.enabled}
            on:click={() => toggleSource(index, !source.enabled)}
          />
        </div>
      </div>
    {/each}
  </div>
</section>

<section class='space-y-3 rounded-lg border bg-card p-4'>
  <div>
    <h2 class='font-bold'>Add Source</h2>
    <p class='text-sm text-muted-foreground'>Yomitan JSON audio-source endpoints are supported. Use <code>{'{term}'}</code> and <code>{'{reading}'}</code> in the URL template.</p>
  </div>
  <div class='grid gap-3 md:grid-cols-[minmax(10rem,0.35fr)_1fr_auto]'>
    <Input bind:value={name} maxlength={100} placeholder='Name' aria-label='Audio source name' />
    <Input bind:value={url} maxlength={4096} placeholder={'https://example.test/?term={term}&reading={reading}'} aria-label='Audio source URL' />
    <Button class='gap-2' disabled={!name.trim() || !url.trim()} on:click={addSource}>
      <Plus size={16} />
      Add
    </Button>
  </div>
</section>

<section class='rounded-lg border bg-card px-4'>
  <SettingCard let:id title='Auto-play on Lookup' description='Automatically play the first available pronunciation for the first result.'>
    <Switch {id} bind:checked={$settings.miningAudioAutoplay} />
  </SettingCard>
  <SettingCard title='Background Audio' description='Choose how word audio interacts with the playing video.'>
    <SingleCombo bind:value={$settings.miningAudioPlaybackMode} items={playbackModes} class='w-44 shrink-0 border-input border' />
  </SettingCard>
</section>

<section class='space-y-3 rounded-lg border bg-card p-4'>
  <div class='flex flex-wrap items-start justify-between gap-3'>
    <div>
      <h2 class='font-bold'>Local Audio</h2>
      <p class='text-sm text-muted-foreground'>Import the same <code>android.db</code> format supported by Hoshi Reader Android.</p>
    </div>
    {#if !loadingLocal}
      <div class='flex flex-wrap justify-end gap-2'>
        <Button variant={localState.available ? 'secondary' : 'default'} disabled={changingLocal || !native.isApp} on:click={importLocalDatabase}>
          {localState.available ? 'Replace' : 'Choose android.db'}
        </Button>
        <a
          href={localAudioDownloadUrl}
          target='_blank'
          rel='noreferrer'
          class={buttonVariants({ variant: 'secondary', className: 'no-scale gap-2' })}
        >
          <Download size={16} />
          Download
        </a>
        {#if localState.available}
          <Button variant='destructive' disabled={changingLocal} on:click={() => { removeLocalOpen = true }}>Remove</Button>
        {/if}
      </div>
    {/if}
  </div>

  {#if loadingLocal}
    <p class='text-sm text-muted-foreground'>Checking local audio…</p>
  {:else if localState.available}
    <div class='rounded-md border p-3'>
      <div>
        <div class='font-medium'>android.db ({fileSize(localState.sizeBytes)})</div>
        <div class='text-xs text-muted-foreground'>{localState.sources.length} embedded source{localState.sources.length === 1 ? '' : 's'}</div>
      </div>
    </div>
    {#if localState.sourceOrder.length}
      <div>
        <h3 class='mb-2 text-sm font-medium'>Local database source order</h3>
        <div class='divide-y rounded-md border'>
          {#each localState.sourceOrder as source, index (source)}
            <div class='flex items-center gap-2 px-3 py-2'>
              <span class='grow'>{source}</span>
              <Button variant='ghost' size='icon' disabled={changingLocal || index === 0} aria-label={`Move ${source} up`} on:click={() => moveLocalSource(index, -1)}>
                <ArrowUp size={16} />
              </Button>
              <Button variant='ghost' size='icon' disabled={changingLocal || index === localState.sourceOrder.length - 1} aria-label={`Move ${source} down`} on:click={() => moveLocalSource(index, 1)}>
                <ArrowDown size={16} />
              </Button>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {:else}
    {#if !native.isApp}
      <p class='text-sm text-muted-foreground'>Local audio is available in the desktop app.</p>
    {/if}
  {/if}

  {#if localState.error}
    <p class='text-sm text-destructive'>{localState.error}</p>
  {/if}
  <p class='text-xs text-muted-foreground'>Hayatan validates and copies the selected database into private app storage. After import, the original file is no longer required.</p>
</section>

<Dialog.Root portal='#root' bind:open={removeLocalOpen}>
  <Dialog.Content class='bg-background'>
    <Dialog.Header>
      <Dialog.Title>Remove local audio?</Dialog.Title>
      <Dialog.Description>This deletes Hayatan’s private copy of android.db. Your original selected file is not affected.</Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer>
      <Button variant='secondary' on:click={() => { removeLocalOpen = false }}>Cancel</Button>
      <Button variant='destructive' on:click={removeLocalDatabase}>Remove</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
