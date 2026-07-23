<script lang='ts'>
  import RotateCcw from 'lucide-svelte/icons/rotate-ccw'

  import SettingCard from '$lib/components/SettingCard.svelte'
  import { Button } from '$lib/components/ui/button'
  import MiningSubtitle from '$lib/components/ui/player/mining-subtitle.svelte'
  import { Switch } from '$lib/components/ui/switch'
  import { Textarea } from '$lib/components/ui/textarea'
  import { DEFAULT_MINING_SUBTITLE_CSS } from '$lib/modules/mining'
  import { settings } from '$lib/modules/settings'

  const previewCue = {
    id: 'mining-preview',
    trackId: 'preview',
    start: 0,
    end: 1,
    readOrder: 0,
    rawText: '日本語プレビュー',
    plainText: '日本語プレビュー'
  }

  function resetSubtitleCss () {
    $settings.miningSubtitleCss = DEFAULT_MINING_SUBTITLE_CSS
  }
</script>

<div class='font-weight-bold text-xl font-bold'>Mining Mode</div>
<SettingCard
  let:id
  title='Pause On Entry'
  description='Pause a playing video when mining mode opens. Leaving mining mode restores the playing or paused state from before it was opened.'
>
  <Switch {id} bind:checked={$settings.miningPauseOnEnter} />
</SettingCard>

<div class='font-weight-bold text-xl font-bold'>Mining Subtitle Appearance</div>
<SettingCard
  class='md:flex-col md:items-stretch'
  title='CSS Declarations'
  description='CSS declarations applied directly to the mining subtitle. Invalid declarations are ignored by the browser. Use --mining-selection-color to customize the hovered or selected text color.'
>
  <div class='flex flex-col gap-3'>
    <Textarea
      bind:value={$settings.miningSubtitleCss}
      class='min-h-64 font-mono bg-background'
      spellcheck={false}
      aria-label='Mining subtitle CSS declarations'
    />
    <div class='relative min-h-48 overflow-hidden rounded-md bg-black flex items-center justify-center px-6'>
      <div class='absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_center,_#475569,_#020617_70%)]' />
      <MiningSubtitle cues={[previewCue]} css={$settings.miningSubtitleCss} preview />
    </div>
    <Button class='self-end gap-2' variant='secondary' on:click={resetSubtitleCss}>
      <RotateCcw size={16} />
      Reset
    </Button>
  </div>
</SettingCard>
