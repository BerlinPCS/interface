<script lang='ts'>
  import { onMount } from 'svelte'

  import { TIMING_LIMITS } from './subtitle-matcher'

  import type Subtitles from './subtitles'

  import { Button } from '$lib/components/ui/button'

  export let subtitles: Subtitles
  export let close: () => void
  let data = subtitles.getTimingDiagnostics()
  let actionError = ''
  const expanded: Record<string, boolean> = {}
  const seconds = (value: number | undefined) => value === undefined ? '—' : `${value.toFixed(2)} s`
  const reason = (value: string) => ({ 'accepted-joint-evidence': 'Verified by combined windows', 'ambiguous-offset': 'Competing offsets remain too similar', 'insufficient-evidence': 'Too few well-supported independent windows', 'inconsistent-windows': 'Windows disagree on the offset', 'conflicting-references': 'Embedded references disagree', 'no-reference': 'No usable embedded reference', accepted: 'Verified' })[value] ?? value
  const percent = (value: number) => `${(value * 100).toFixed(1)}%`
  const bytes = (value = 0) => `${(value / 1024 / 1024).toFixed(2)} MiB`
  onMount(() => {
    const timer = setInterval(() => { data = subtitles.getTimingDiagnostics() }, 500)
    return () => clearInterval(timer)
  })
  async function retry () {
    actionError = ''
    try { await subtitles.retryTiming() } catch (error) { actionError = String(error) }
    data = subtitles.getTimingDiagnostics()
  }
  async function copy () {
    try { await navigator.clipboard.writeText(JSON.stringify(data, null, 2)) } catch (error) { actionError = String(error) }
  }
</script>

<section aria-label='Subtitle retiming diagnostics' class='bg-background text-foreground rounded-lg p-5 w-full max-w-5xl max-h-[85vh] overflow-auto text-sm select-text pointer-events-auto' on:keydown|stopPropagation on:pointerdown|stopPropagation on:wheel|stopPropagation>
  <div class='flex flex-wrap items-center gap-3 mb-4'>
    <h2 class='text-lg font-bold mr-auto'>Subtitle retiming diagnostics</h2>
    <Button variant='outline' on:click={retry}>Retry automatic timing</Button>
    <Button variant='outline' on:click={copy}>Copy diagnostics</Button>
    <Button variant='ghost' on:click={close}>Back</Button>
  </div>
  <p class='font-semibold'>{data.reason}</p>
  {#if data.error || actionError}<p class='text-red-400 mt-2'>{actionError || data.error}</p>{/if}
  <dl class='grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 my-4 break-all'>
    <dt>Retiming revision</dt><dd>{data.revision}</dd>
    <dt>Video</dt><dd>{data.video}</dd>
    <dt>Video release</dt><dd>{data.videoProfile ?? 'Unknown (exact-file timing only)'}</dd>
    <dt>Preferred subtitles</dt><dd>{data.preferred?.off ? 'Off' : `${data.preferred?.source ?? 'None'} · ${data.preferred?.language ?? 'unknown language'} · ${data.preferred?.profile ?? data.preferred?.name ?? 'unknown release'}`}</dd>
    <dt>Selected language / track</dt><dd>{data.language} / {data.active}</dd>
    {#if data.earlyTiming}<dt>Early correction</dt><dd>{seconds(data.earlyTiming.offset)} · not yet verified · expires after {TIMING_LIMITS.earlyTimeoutMs / 1000} seconds without confirmation</dd>{/if}
    <dt>Manual delay</dt><dd>{seconds(data.manualDelay)} (existing player sign convention)</dd>
    <dt>Playback / buffer</dt><dd>{seconds(data.playback.time)} / {seconds(data.playback.buffered ?? undefined)} buffered · {data.playback.stalled ? 'stalled' : data.paused ? 'paused' : 'playing'}{data.seeking ? ' · seeking' : ''}</dd>
    <dt>Session</dt><dd>{data.sessionId ?? 'Not started'}</dd>
    <dt>Sampling</dt><dd>{data.sample?.reason ?? (data.sessionId ? 'in progress' : 'waiting')} · {(data.elapsedMs / 1000).toFixed(1)} s elapsed (60 s deadline)</dd>
    <dt>Download / parsing</dt><dd>{bytes(data.sample?.bytesFetched)} / 64 MiB · {bytes(data.sample?.bytesParsed)} / 128 MiB</dd>
    <dt>Candidate discovery</dt><dd>{data.candidateDiscoveryDone ? 'Finished' : 'In progress'} · {data.candidateLoading} downloads pending</dd>
  </dl>
  <p class='text-muted-foreground mb-4'>Support is the percentage of distinct reference onsets matched, not a measured probability of correctness. Each supporting window needs at least {TIMING_LIMITS.minMatches} matches and {percent(TIMING_LIMITS.support)} support, with offsets agreeing within {TIMING_LIMITS.agreement} s. Verification needs two windows with a {TIMING_LIMITS.margin} peak margin, or at least {TIMING_LIMITS.jointWindows} agreeing windows with one clear anchor, a {TIMING_LIMITS.jointMargin} combined margin, and a {TIMING_LIMITS.jointHoldoutMargin} margin after removing any one window. An early correction requires {TIMING_LIMITS.earlyMatches} matches, {percent(TIMING_LIMITS.earlySupport)} support and a {TIMING_LIMITS.earlyMargin} margin from one window, and still needs verification. Positive automatic offsets move cues later.</p>
  <h3 class='font-bold mb-2'>Embedded reference coverage</h3>
  {#each data.sample?.tracks ?? [] as track (track.id)}
    <div class='border rounded p-3 mb-2'>
      <strong>{track.name ?? track.id}</strong> · {track.language} · track {track.id}
      {#if track.forced || /sign|karaoke/i.test(track.name ?? '')}<span class='text-amber-400'> · excluded (forced/signs/karaoke)</span>{/if}
      {#each track.windows as window, index (index)}
        <div>{window.id}: {seconds(window.start)}–{seconds(window.end)} · {window.cues.length} sampled cues</div>
      {/each}
    </div>
  {:else}<p class='text-muted-foreground mb-4'>No embedded reference windows received.</p>{/each}
  <h3 class='font-bold mt-4 mb-2'>Subtitle candidates and matching evidence</h3>
  {#each data.candidates as candidate (candidate.id)}
    <details class='border rounded p-3 mb-2' open={expanded[candidate.id] ?? candidate.active} on:toggle={event => { expanded[candidate.id] = event.currentTarget.open }}>
      <summary class='cursor-pointer font-semibold'>{candidate.name}{candidate.active ? ' · active' : ''}{candidate.preferred ? ' · preferred' : ''} · {(candidate.result ? reason(candidate.result.reason) : undefined) ?? (candidate.sameLanguage ? 'Not evaluated yet' : 'Excluded: different language')}</summary>
      <p class='my-2 break-all'>{candidate.source} · {candidate.language} · {candidate.profile ?? 'Unknown release group'} · {candidate.cues} dialogue cues · applied offset {seconds(candidate.offset)}{candidate.verifiedOffset !== undefined && candidate.offset !== candidate.verifiedOffset ? ` · verified ${seconds(candidate.verifiedOffset)} (waiting to apply)` : ''}</p>
      <p class='text-muted-foreground break-all'>Content fingerprint: {candidate.fingerprint}</p>
      {#each candidate.result?.references ?? [] as result (result.referenceIndex)}
        <div class='mt-3'>
          <strong>Reference {data.referenceNames[result.referenceIndex] ?? result.referenceIndex}</strong>: {reason(result.reason)} · offset {seconds(result.offset)} · matched-onset support {percent(result.support ?? result.confidence)}
          {#if result.joint}
            <p class='text-muted-foreground'>Combined {result.joint.windows} windows: offset {seconds(result.joint.offset)} · peak margin {result.joint.margin.toFixed(3)} (requires {TIMING_LIMITS.jointMargin}) · weakest margin with one window removed {result.joint.holdoutMargin.toFixed(3)} (requires {TIMING_LIMITS.jointHoldoutMargin}).</p>
          {/if}
          {#each result.windows as window, index (index)}
            <details class='ml-3 my-2'>
              <summary class='cursor-pointer'>Window {window.windowId}: {seconds(window.start)}–{seconds(window.end)} · offset {seconds(window.offset)} · {window.matches}/{window.referenceCount ?? '?'} matches · support {percent(window.support)} · peak margin {window.margin.toFixed(3)} · competing offset {seconds(window.competingOffset)}</summary>
              <table class='w-full text-left my-2 tabular-nums'>
                <thead><tr><th>Reference onset</th><th>Original candidate onset</th><th>Error after offset</th></tr></thead>
                <tbody>{#each window.pairs ?? [] as pair (pair.reference)}<tr><td class='align-top pr-3'>{seconds(pair.reference)}<div class='text-xs text-muted-foreground max-w-sm break-words'>{pair.referenceText ?? ''}</div></td><td class='align-top pr-3'>{seconds(pair.candidate)}<div class='text-xs text-muted-foreground max-w-sm break-words'>{pair.candidateText ?? ''}</div></td><td>{seconds(pair.error)}</td></tr>{/each}</tbody>
              </table>
              <p class='text-muted-foreground'>Up to 100 matched onset pairs shown per window.</p>
            </details>
          {:else}<p class='text-muted-foreground'>No window contained enough distinct dialogue onsets to score.</p>{/each}
        </div>
      {/each}
    </details>
  {:else}<p class='text-muted-foreground'>No external subtitles loaded.</p>{/each}
  <h3 class='font-bold mt-4 mb-2'>Session log (last 200 events)</h3>
  <pre class='whitespace-pre-wrap break-words text-xs bg-muted p-3 rounded'>{data.log.map(entry => `${entry.time}  ${entry.message}`).join('\n') || 'No retiming events yet.'}</pre>
</section>
