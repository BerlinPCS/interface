<script lang='ts'>
  import type { ResolvedFile } from './resolver'
  import type { MediaInfo } from './util'

  import { goto } from '$app/navigation'
  import EpisodesList from '$lib/components/EpisodesList.svelte'
  import { Button } from '$lib/components/ui/button'
  import * as Sheet from '$lib/components/ui/sheet'
  import * as Tabs from '$lib/components/ui/tabs'
  import { client } from '$lib/modules/anilist'
  import { episodes as eps } from '$lib/modules/anizip'
  import { click } from '$lib/modules/navigate'

  export let portal: HTMLElement
  let episodeListOpen = false

  export let mediaInfo: MediaInfo
  export let videoFiles: ResolvedFile[]
  export let selectFile: (file: ResolvedFile) => void

  let view = 'episodes'
  $: sortedFiles = [...videoFiles].sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }))

  function playFile (file: ResolvedFile) {
    episodeListOpen = false
    selectFile(file)
  }
</script>

<div class='text-foreground text-lg font-normal leading-none line-clamp-1 hover:text-muted-foreground hover:underline cursor-pointer text-shadow-lg' use:click={() => goto(`/#/app/anime/${mediaInfo.media.id}`)}>{mediaInfo.session.title}</div>
<Sheet.Root {portal} bind:open={episodeListOpen}>
  <Sheet.Trigger class='text-[rgba(217,217,217,0.6)] hover:text-muted-foreground text-sm leading-none font-light line-clamp-1 text-left hover:underline bg-transparent text-shadow-lg'>{mediaInfo.session.description}</Sheet.Trigger>
  <Sheet.Content class='w-full sm:w-[550px] p-0 max-w-full sm:max-size-full overflow-y-scroll flex flex-col !pb-0 shrink-0 gap-0 bg-background justify-between overflow-x-clip'>
    <div class='contents' on:wheel|stopPropagation>
      <Tabs.Root bind:value={view} class='w-full min-w-0'>
        <Tabs.List class='grid grid-cols-2 mx-4 mt-12'>
          <Tabs.Trigger value='episodes'>Episodes</Tabs.Trigger>
          <Tabs.Trigger value='files'>Torrent files ({videoFiles.length})</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value='episodes'>
          {#if mediaInfo.media}
            {#await Promise.all([eps(mediaInfo.media.id), client.single(mediaInfo.media.id)]) then [eps, media]}
              {#if media.data?.Media}
                <EpisodesList {eps} media={media.data.Media} class='!px-0 !py-3 xs:!p-3 sm:!p-6 !mx-0' />
              {/if}
            {/await}
          {/if}
        </Tabs.Content>
        <Tabs.Content value='files' class='p-4'>
          <p class='text-sm text-muted-foreground mb-3'>Choose a video by filename.</p>
          <div class='flex flex-col gap-1'>
            {#each sortedFiles as file (file.path)}
              {@const playing = file.path === mediaInfo.file.path}
              <Button variant={playing ? 'secondary' : 'ghost'} class='h-auto w-full justify-start whitespace-normal text-left py-3' aria-current={playing ? 'true' : undefined} on:click={() => playFile(file)}>
                <span class='min-w-0 break-all'>
                  {file.path}
                  {#if playing}<span class='block text-xs text-primary mt-1'>Now playing</span>{/if}
                </span>
              </Button>
            {/each}
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  </Sheet.Content>
</Sheet.Root>
