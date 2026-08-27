<script lang='ts'>
  import BookOpen from 'lucide-svelte/icons/book-open'
  import CalendarDays from 'lucide-svelte/icons/calendar-days'
  import ChartColumnBig from 'lucide-svelte/icons/chart-column-big'
  import Clock3 from 'lucide-svelte/icons/clock-3'
  import Flame from 'lucide-svelte/icons/flame'
  import NotebookPen from 'lucide-svelte/icons/notebook-pen'
  import Pickaxe from 'lucide-svelte/icons/pickaxe'
  import Sigma from 'lucide-svelte/icons/sigma'
  import TextSearch from 'lucide-svelte/icons/text-search'

  import * as Tabs from '$lib/components/ui/tabs'
  import { client as anilistClient } from '$lib/modules/anilist'
  import { localDateKey, miningStatistics, type DailyMiningStatistics, type MiningStatistics } from '$lib/modules/mining/statistics'
  import { dragScroll } from '$lib/modules/navigate'

  type StatisticsTab = 'mining' | 'total'
  interface CountStatistic { count: number, minutesWatched: number, meanScore: number }

  const animeStatistics = anilistClient.animeStatistics
  const anilistViewerID = anilistClient.viewerID
  const countryNames = new Intl.DisplayNames(undefined, { type: 'region' })
  let activeTab: StatisticsTab = 'mining'

  function formatDuration (seconds: number) {
    const minutes = Math.floor(seconds / 60)
    if (minutes < 1) return seconds > 0 ? '<1m' : '0m'
    const hours = Math.floor(minutes / 60)
    if (!hours) return `${minutes}m`
    const days = Math.floor(hours / 24)
    if (days) return `${days}d ${hours % 24}h`
    return `${hours}h ${minutes % 60}m`
  }

  function formatDays (minutes: number) {
    return (minutes / 60 / 24).toLocaleString(undefined, { maximumFractionDigits: 1 })
  }

  function formatLabel (value: unknown) {
    if (typeof value !== 'string') return typeof value === 'number' ? String(value) : 'Unknown'
    return value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase())
  }

  function countryLabel (value: unknown) {
    if (typeof value !== 'string') return 'Unknown'
    try {
      return countryNames.of(value) ?? value
    } catch {
      return value
    }
  }

  function compact<T> (items: Array<T | null> | null | undefined): T[] {
    return items?.filter((item): item is T => item !== null) ?? []
  }

  function maxCount (items: CountStatistic[]) {
    return Math.max(1, ...items.map(item => item.count))
  }

  function totalCount (items: CountStatistic[]) {
    return Math.max(1, items.reduce((total, item) => total + item.count, 0))
  }

  function recentActivity (statistics: MiningStatistics) {
    return Array.from({ length: 14 }, (_, index) => {
      const date = new Date()
      date.setHours(12, 0, 0, 0)
      date.setDate(date.getDate() - (13 - index))
      const key = localDateKey(date.getTime())
      const empty: DailyMiningStatistics = { miningSeconds: 0, standardSeconds: 0, dictionaryLookups: 0, cardsMined: 0 }
      return {
        key,
        label: date.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 1),
        title: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        ...(statistics.daily[key] ?? empty)
      }
    })
  }

  $: hayatanWatchSeconds = $miningStatistics.watchSeconds.mining + $miningStatistics.watchSeconds.standard
  $: miningShare = hayatanWatchSeconds ? Math.round($miningStatistics.watchSeconds.mining / hayatanWatchSeconds * 100) : 0
  $: standardShare = hayatanWatchSeconds ? 100 - miningShare : 0
  $: recent = recentActivity($miningStatistics)
  $: maxDailySeconds = Math.max(1, ...recent.map(day => day.miningSeconds + day.standardSeconds))
  $: totalStats = $animeStatistics?.data?.User?.statistics?.anime
  $: scores = compact(totalStats?.scores)
  $: lengths = compact(totalStats?.lengths)
  $: formats = compact(totalStats?.formats)
  $: statuses = compact(totalStats?.statuses)
  $: countries = compact(totalStats?.countries)
  $: releaseYears = compact(totalStats?.releaseYears)
</script>

<Tabs.Root bind:value={activeTab} activateOnFocus={false} class='size-full min-w-0'>
  <div class='size-full min-w-0 overflow-y-auto' use:dragScroll>
    <div class='mx-auto flex w-full max-w-7xl flex-col p-5 pb-24 md:p-10'>
      <div class='mb-8 flex flex-wrap items-center gap-4'>
        <div class='flex items-center gap-3'>
          <div class='flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground'>
            <ChartColumnBig size={23} />
          </div>
          <div>
            <h1 class='text-2xl font-bold'>Statistics</h1>
            <p class='text-sm text-muted-foreground'>Your watching and mining activity.</p>
          </div>
        </div>
        <Tabs.List class='ml-auto'>
          <Tabs.Trigger value='mining' tabindex={0} class='gap-2 px-4'><Pickaxe size={15} /> Mining</Tabs.Trigger>
          <Tabs.Trigger value='total' tabindex={0} class='gap-2 px-4'><Sigma size={15} /> Total</Tabs.Trigger>
        </Tabs.List>
      </div>

      <Tabs.Content value='mining' tabindex={-1} class='m-0 space-y-8'>
        <section class='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
          <div class='rounded-xl border bg-muted/25 p-5'>
            <div class='mb-5 flex items-center justify-between text-muted-foreground'><span class='text-sm font-medium'>Mining watch time</span><Pickaxe size={18} /></div>
            <div class='text-3xl font-bold'>{formatDuration($miningStatistics.watchSeconds.mining)}</div>
            <div class='mt-1 text-xs text-muted-foreground'>{miningShare}% of Hayatan watch time</div>
          </div>
          <div class='rounded-xl border bg-muted/25 p-5'>
            <div class='mb-5 flex items-center justify-between text-muted-foreground'><span class='text-sm font-medium'>Mining episodes</span><BookOpen size={18} /></div>
            <div class='text-3xl font-bold'>{$miningStatistics.episodes.mining.length}</div>
            <div class='mt-1 text-xs text-muted-foreground'>75% or more watched in mining mode</div>
          </div>
          <div class='rounded-xl border bg-muted/25 p-5'>
            <div class='mb-5 flex items-center justify-between text-muted-foreground'><span class='text-sm font-medium'>Dictionary lookups</span><TextSearch size={18} /></div>
            <div class='text-3xl font-bold'>{$miningStatistics.dictionaryLookups.toLocaleString()}</div>
            <div class='mt-1 text-xs text-muted-foreground'>{$miningStatistics.kanjiLookups.toLocaleString()} kanji lookups</div>
          </div>
          <div class='rounded-xl border bg-muted/25 p-5'>
            <div class='mb-5 flex items-center justify-between text-muted-foreground'><span class='text-sm font-medium'>Cards mined</span><NotebookPen size={18} /></div>
            <div class='text-3xl font-bold'>{$miningStatistics.cardsMined.toLocaleString()}</div>
            <div class='mt-1 text-xs text-muted-foreground'>Successfully added to Anki</div>
          </div>
        </section>

        <section class='grid gap-4 lg:grid-cols-[1.4fr_1fr]'>
          <div class='rounded-xl border p-5 md:p-6'>
            <div class='mb-6'><h2 class='font-semibold'>Watching by mode</h2><p class='text-sm text-muted-foreground'>Actual playback time and completed episodes in each mode.</p></div>
            <div class='space-y-6'>
              <div>
                <div class='mb-2 flex items-end justify-between gap-4'><div class='flex items-center gap-2 font-medium'><Pickaxe size={16} /> Mining mode</div><div class='text-right'><span class='font-semibold'>{formatDuration($miningStatistics.watchSeconds.mining)}</span><span class='ml-2 text-xs text-muted-foreground'>{$miningStatistics.episodes.mining.length} eps</span></div></div>
                <div class='h-2 overflow-hidden rounded-full bg-muted'><div class='h-full rounded-full bg-amber-400 transition-[width]' style:width={`${miningShare}%`} /></div>
              </div>
              <div>
                <div class='mb-2 flex items-end justify-between gap-4'><div class='flex items-center gap-2 font-medium'><Clock3 size={16} /> Standard playback</div><div class='text-right'><span class='font-semibold'>{formatDuration($miningStatistics.watchSeconds.standard)}</span><span class='ml-2 text-xs text-muted-foreground'>{$miningStatistics.episodes.standard.length} eps</span></div></div>
                <div class='h-2 overflow-hidden rounded-full bg-muted'><div class='h-full rounded-full bg-sky-400 transition-[width]' style:width={`${standardShare}%`} /></div>
              </div>
            </div>
          </div>

          <div class='rounded-xl border p-5 md:p-6'>
            <h2 class='mb-5 font-semibold'>Mining activity</h2>
            <div class='grid grid-cols-2 gap-3'>
              <div class='rounded-lg bg-muted/50 p-4'><Flame class='mb-3 text-amber-400' size={19} /><div class='text-2xl font-bold'>{$miningStatistics.miningSessions.toLocaleString()}</div><div class='text-xs text-muted-foreground'>Sessions with a completed episode</div></div>
              <div class='rounded-lg bg-muted/50 p-4'><CalendarDays class='mb-3 text-violet-400' size={19} /><div class='text-2xl font-bold'>{$miningStatistics.activeDates.length.toLocaleString()}</div><div class='text-xs text-muted-foreground'>Active days</div></div>
              <div class='rounded-lg bg-muted/50 p-4'><TextSearch class='mb-3 text-sky-400' size={19} /><div class='text-2xl font-bold'>{$miningStatistics.miningSessions ? Math.round($miningStatistics.dictionaryLookups / $miningStatistics.miningSessions) : 0}</div><div class='text-xs text-muted-foreground'>Lookups / completed session</div></div>
              <div class='rounded-lg bg-muted/50 p-4'><NotebookPen class='mb-3 text-green-400' size={19} /><div class='text-2xl font-bold'>{$miningStatistics.dictionaryLookups ? Math.round($miningStatistics.cardsMined / $miningStatistics.dictionaryLookups * 100) : 0}%</div><div class='text-xs text-muted-foreground'>Lookup-to-card rate</div></div>
            </div>
          </div>
        </section>

        <section class='rounded-xl border p-5 md:p-6'>
          <div class='mb-6 flex flex-wrap items-end justify-between gap-3'>
            <div><h2 class='font-semibold'>Last 14 days</h2><p class='text-sm text-muted-foreground'>Daily playback time in and outside mining mode.</p></div>
            <div class='flex gap-4 text-xs text-muted-foreground'><span class='flex items-center gap-1.5'><span class='size-2 rounded-full bg-amber-400' /> Mining</span><span class='flex items-center gap-1.5'><span class='size-2 rounded-full bg-sky-400' /> Standard</span></div>
          </div>
          <div class='flex h-44 items-end gap-2 md:gap-3'>
            {#each recent as day (day.key)}
              {@const total = day.miningSeconds + day.standardSeconds}
              <div class='group flex h-full min-w-0 flex-1 flex-col justify-end' title={`${day.title}: ${formatDuration(day.miningSeconds)} mining, ${formatDuration(day.standardSeconds)} standard`}>
                <div class='relative flex min-h-1 w-full flex-col justify-end overflow-hidden rounded-t-sm bg-muted/40' style:height={`${Math.max(total ? 4 : 1, total / maxDailySeconds * 100)}%`}>
                  {#if day.standardSeconds}<div class='w-full bg-sky-400/80' style:height={`${day.standardSeconds / total * 100}%`} />{/if}
                  {#if day.miningSeconds}<div class='w-full bg-amber-400' style:height={`${day.miningSeconds / total * 100}%`} />{/if}
                </div>
                <div class='mt-2 text-center text-[10px] text-muted-foreground'>{day.label}</div>
              </div>
            {/each}
          </div>
        </section>
      </Tabs.Content>

      <Tabs.Content value='total' tabindex={-1} class='m-0 space-y-8'>
        {#if !$anilistViewerID}
          <section class='flex min-h-80 flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center'>
            <Sigma class='mb-4 text-muted-foreground' size={32} />
            <h2 class='text-lg font-semibold'>Connect AniList to see total statistics</h2>
            <p class='mt-1 max-w-md text-sm text-muted-foreground'>The Total tab uses the anime statistics from your logged-in AniList profile.</p>
          </section>
        {:else if $animeStatistics?.fetching && !totalStats}
          <div class='flex min-h-80 items-center justify-center'><div class='size-9 animate-spin rounded-full border-[3px] border-transparent border-t-primary' /></div>
        {:else if $animeStatistics?.error}
          <section class='flex min-h-80 flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center'><h2 class='text-lg font-semibold'>Could not load AniList statistics</h2><p class='mt-1 max-w-md text-sm text-muted-foreground'>{$animeStatistics.error.message}</p></section>
        {:else if totalStats}
          <div class='flex items-center gap-3'>
            {#if $animeStatistics?.data?.User?.avatar?.large}<img class='size-11 rounded-xl object-cover' src={$animeStatistics.data.User.avatar.large} alt='' />{/if}
            <div><h2 class='font-semibold'>{$animeStatistics?.data?.User?.name}'s anime overview</h2><p class='text-sm text-muted-foreground'>Synced from AniList</p></div>
          </div>

          <section class='grid gap-3 sm:grid-cols-2 lg:grid-cols-5'>
            <div class='rounded-xl border bg-muted/25 p-5'><div class='text-3xl font-bold'>{totalStats.count.toLocaleString()}</div><div class='mt-1 text-xs text-muted-foreground'>Total anime</div></div>
            <div class='rounded-xl border bg-muted/25 p-5'><div class='text-3xl font-bold'>{totalStats.episodesWatched.toLocaleString()}</div><div class='mt-1 text-xs text-muted-foreground'>Episodes watched</div></div>
            <div class='rounded-xl border bg-muted/25 p-5'><div class='text-3xl font-bold'>{formatDays(totalStats.minutesWatched)}</div><div class='mt-1 text-xs text-muted-foreground'>Days watched</div></div>
            <div class='rounded-xl border bg-muted/25 p-5'><div class='text-3xl font-bold'>{totalStats.meanScore.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div><div class='mt-1 text-xs text-muted-foreground'>Mean score</div></div>
            <div class='rounded-xl border bg-muted/25 p-5'><div class='text-3xl font-bold'>{totalStats.standardDeviation.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div><div class='mt-1 text-xs text-muted-foreground'>Standard deviation</div></div>
          </section>

          <section class='grid gap-4 lg:grid-cols-2'>
            <div class='rounded-xl border p-5 md:p-6'>
              <div class='mb-6'><h3 class='font-semibold'>Score</h3><p class='text-sm text-muted-foreground'>Titles watched at each score.</p></div>
              <div class='flex h-52 items-end gap-1.5'>
                {#each scores as score (score.score)}
                  <div class='group flex h-full min-w-0 flex-1 flex-col justify-end' title={`${score.score}: ${score.count} titles, ${formatDuration(score.minutesWatched * 60)}`}><div class='min-h-1 rounded-t-sm bg-violet-400 transition-[height]' style:height={`${Math.max(2, score.count / maxCount(scores) * 100)}%`} /><div class='mt-2 overflow-hidden text-center text-[9px] text-muted-foreground'>{score.score}</div></div>
                {/each}
              </div>
            </div>
            <div class='rounded-xl border p-5 md:p-6'>
              <div class='mb-6'><h3 class='font-semibold'>Episode count</h3><p class='text-sm text-muted-foreground'>Titles grouped by series length.</p></div>
              <div class='flex h-52 items-end gap-3'>
                {#each lengths as length (length.length)}
                  <div class='group flex h-full min-w-0 flex-1 flex-col justify-end' title={`${length.length} episodes: ${length.count} titles, mean score ${length.meanScore}`}><div class='min-h-1 rounded-t-sm bg-sky-400 transition-[height]' style:height={`${Math.max(2, length.count / maxCount(lengths) * 100)}%`} /><div class='mt-2 overflow-hidden text-center text-[9px] text-muted-foreground'>{length.length}</div></div>
                {/each}
              </div>
            </div>
          </section>

          <section class='grid gap-4 lg:grid-cols-3'>
            <div class='rounded-xl border p-5 md:p-6'>
              <h3 class='mb-5 font-semibold'>Format distribution</h3>
              <div class='space-y-4'>{#each formats.slice(0, 6) as format (format.format)}<div><div class='mb-1 flex justify-between gap-3 text-sm'><span>{formatLabel(format.format)}</span><span class='text-muted-foreground'>{Math.round(format.count / totalCount(formats) * 100)}%</span></div><div class='h-1.5 overflow-hidden rounded-full bg-muted'><div class='h-full rounded-full bg-violet-400' style:width={`${format.count / totalCount(formats) * 100}%`} /></div></div>{/each}</div>
            </div>
            <div class='rounded-xl border p-5 md:p-6'>
              <h3 class='mb-5 font-semibold'>Status distribution</h3>
              <div class='space-y-4'>{#each statuses.slice(0, 6) as status (status.status)}<div><div class='mb-1 flex justify-between gap-3 text-sm'><span>{formatLabel(status.status)}</span><span class='text-muted-foreground'>{Math.round(status.count / totalCount(statuses) * 100)}%</span></div><div class='h-1.5 overflow-hidden rounded-full bg-muted'><div class='h-full rounded-full bg-green-400' style:width={`${status.count / totalCount(statuses) * 100}%`} /></div></div>{/each}</div>
            </div>
            <div class='rounded-xl border p-5 md:p-6'>
              <h3 class='mb-5 font-semibold'>Country distribution</h3>
              <div class='space-y-4'>{#each countries.slice(0, 6) as country (country.country)}<div><div class='mb-1 flex justify-between gap-3 text-sm'><span>{countryLabel(country.country)}</span><span class='text-muted-foreground'>{Math.round(country.count / totalCount(countries) * 100)}%</span></div><div class='h-1.5 overflow-hidden rounded-full bg-muted'><div class='h-full rounded-full bg-amber-400' style:width={`${country.count / totalCount(countries) * 100}%`} /></div></div>{/each}</div>
            </div>
          </section>

          <section class='rounded-xl border p-5 md:p-6'>
            <div class='mb-6'><h3 class='font-semibold'>Release year</h3><p class='text-sm text-muted-foreground'>Titles watched by their original release year.</p></div>
            <div class='overflow-x-auto pb-2'><div class='flex h-56 min-w-[720px] items-end gap-1.5'>
              {#each releaseYears as year (year.releaseYear)}
                <div class='group flex h-full min-w-3 flex-1 flex-col justify-end' title={`${year.releaseYear}: ${year.count} titles, mean score ${year.meanScore}`}><div class='min-h-1 rounded-t-sm bg-rose-400 transition-[height]' style:height={`${Math.max(2, year.count / maxCount(releaseYears) * 100)}%`} /><div class='mt-2 -rotate-45 text-center text-[8px] text-muted-foreground'>{year.releaseYear}</div></div>
              {/each}
            </div></div>
          </section>
        {/if}
      </Tabs.Content>
    </div>
  </div>
</Tabs.Root>
