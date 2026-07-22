<script lang='ts'>
  import { toast } from 'svelte-sonner'

  import { dev } from '$app/env'
  import SettingCard from '$lib/components/SettingCard.svelte'
  import { Button } from '$lib/components/ui/button'
  import { SingleCombo } from '$lib/components/ui/combobox'
  import { Input } from '$lib/components/ui/input'
  import { saveCustomSubtitleFont } from '$lib/components/ui/player/custom-subtitle-font'
  import { Switch } from '$lib/components/ui/switch'
  import native from '$lib/modules/native'
  import { settings, languageCodes, subtitleResolutions, SUPPORTS } from '$lib/modules/settings'
  import { fontExtensions, fontRx } from '$lib/utils'

  let prevSubStyle = $settings.subtitleStyle
  $: if (!$settings.subtitleStyle) {
    $settings.subtitleStyle = prevSubStyle
  } else {
    prevSubStyle = $settings.subtitleStyle
  }

  async function selectPlayer () {
    $settings.playerPath = await native.selectPlayer()
  }

  $: subtitleFonts = {
    none: 'None',
    gandhisans: 'Gandhi Sans Bold',
    notosans: 'Noto Sans Bold',
    roboto: 'Roboto Bold',
    ...($settings.subtitleCustomFontName ? { custom: `Custom — ${$settings.subtitleCustomFontName}` } : {})
  }

  function selectCustomFont () {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = fontExtensions.map(extension => '.' + extension).join(',')
    input.addEventListener('change', async () => {
      const file = input.files?.[0]
      if (!file || !fontRx.test(file.name)) return
      try {
        $settings.subtitleCustomFontName = await saveCustomSubtitleFont(file)
        $settings.subtitleStyle = 'custom'
      } catch (error) {
        toast.error('Failed to save custom subtitle font', { description: error instanceof Error ? error.message : String(error) })
      }
    })
    input.click()
  }
</script>

<div class='font-weight-bold text-xl font-bold'>Subtitle Settings</div>
<SettingCard let:id title='Automatic Subtitle Retiming' description='Automatically align Jimaku subtitles with the embedded subtitles in the video. Requires the Jimaku extension.'>
  <Switch {id} bind:checked={$settings.subtitleAutoRetiming} />
</SettingCard>
<SettingCard title='Subtitle Render Resolution Limit' description="Max resolution to render subtitles at. If your resolution is higher than this setting the subtitles will be upscaled lineary. This will GREATLY improve rendering speeds for complex typesetting for slower devices. It's best to lower this on mobile devices which often have high pixel density where their effective resolution might be ~1440p while having small screens and slow processors.">
  <SingleCombo bind:value={$settings.subtitleRenderHeight} items={subtitleResolutions} class='w-32 shrink-0 border-input border' />
</SettingCard>

<SettingCard title='Subtitle Dialogue Font' description='Override the font used for normal dialogue subtitles. Fancy typesetting, signs, and songs keep their original styles.'>
  <div class='flex flex-col sm:flex-row gap-2 sm:items-center'>
    <SingleCombo bind:value={$settings.subtitleStyle} items={subtitleFonts} class='w-60 shrink-0 border-input border' />
    <Button on:click={selectCustomFont} variant='secondary'>Add Custom Font</Button>
  </div>
</SettingCard>

<div class='font-weight-bold text-xl font-bold'>Language Settings</div>
<SettingCard title='Preferred Subtitle Language' description="What subtitle language to automatically select when a video is loaded if it exists. This won't find torrents with this language automatically. If not found defaults to English.">
  <SingleCombo bind:value={$settings.subtitleLanguage} items={languageCodes} class='w-36 shrink-0 border-input border' />
</SettingCard>
<SettingCard title='Preferred Audio Language' description="What audio language to automatically select when a video is loaded if it exists. This won't find torrents with this language automatically. If not found defaults to Japanese.">
  <SingleCombo bind:value={$settings.audioLanguage} items={languageCodes} class='w-36 shrink-0 border-input border' />
</SettingCard>

<div class='font-weight-bold text-xl font-bold'>Playback Settings</div>
{#if (SUPPORTS.isAndroidTV && SUPPORTS.isUnderPowered) || dev}
  <SettingCard let:id title='Use Custom Video Player' description='Enables the custom video player. This allows you to switch audio and video tracks and has better codec support, at the cost of higher CPU usage.'>
    <Switch {id} bind:checked={$settings.playerCustom} />
  </SettingCard>
{/if}
<SettingCard let:id title='Auto-Play Next Episode' description='Automatically starts playing next episode when a video ends.'>
  <Switch {id} bind:checked={$settings.playerAutoplay} />
</SettingCard>
<SettingCard let:id title='Pause On Lost Visibility' description='Pauses/Resumes video playback when the app loses visibility.'>
  <Switch {id} bind:checked={$settings.playerPause} />
</SettingCard>
<SettingCard let:id title='PiP On Lost Visibility' description='Automatically enters Picture in Picture mode when the app loses visibility.'>
  <Switch {id} bind:checked={$settings.playerAutoPiP} />
</SettingCard>
<SettingCard let:id title='Auto-Complete Episodes' description='Automatically marks episodes as complete when you finish watching them. Requires Account login.'>
  <Switch {id} bind:checked={$settings.playerAutocomplete} />
</SettingCard>
<SettingCard let:id title='Deband Video' description='Reduces banding [compression artifacts] on dark and compressed videos. High performance impact. Recommended for seasonal web releases, not recommended for high quality blu-ray videos.'>
  <Switch {id} bind:checked={$settings.playerDeband} />
</SettingCard>
<SettingCard let:id title='Seek Duration' description='Seconds to skip forward or backward when using the seek buttons or keyboard shortcuts. Higher values might negatively impact buffering speeds.'>
  <div class='flex items-center relative scale-parent border border-input rounded-md self-baseline'>
    <Input type='number' inputmode='numeric' pattern='[0-9]*.?[0-9]*' min='1' max='50' bind:value={$settings.playerSeek} {id} class='w-32 shrink-0 pr-12 border-0 no-scale' />
    <div class='shrink-0 absolute right-3 z-10 pointer-events-none text-sm leading-5'>sec</div>
  </div>
</SettingCard>
<SettingCard let:id title='Auto-Skip Intro/Outro' description='Attempt to automatically skip intro and outro. This WILL sometimes skip incorrect chapters, as some of the chapter data is community sourced.'>
  <Switch {id} bind:checked={$settings.playerSkip} />
</SettingCard>
<SettingCard let:id title='Auto-Skip Filler' description='Automatically skip filler episodes. This WILL skip ENTIRE episodes.'>
  <Switch {id} bind:checked={$settings.playerSkipFiller} />
</SettingCard>

<div class='font-weight-bold text-xl font-bold'>Interface Settings</div>
<SettingCard let:id title='Minimal UI' description='Forces minimalistic player UI, hides controls.'>
  <Switch {id} bind:checked={$settings.minimalPlayerUI} />
</SettingCard>

{#if !SUPPORTS.isIOS}
  <div class='font-weight-bold text-xl font-bold'>External Player Settings</div>
  <SettingCard let:id title='Enable External Player' description='Opens a custom user-picked external video player to play video, instead of using the built-in one.'>
    <Switch {id} bind:checked={$settings.enableExternal} />
  </SettingCard>
  {#if !SUPPORTS.isAndroid}
    <SettingCard let:id title='External Video Player' description='Executable for an external video player. Make sure the player supports HTTP sources.'>
      <div class='flex'>
        <Input type='url' bind:value={$settings.playerPath} readonly {id} class='w-32 shrink-0 rounded-r-none pointer-events-none' />
        <Button class='rounded-l-none font-bold' on:click={selectPlayer} variant='secondary'>Select</Button>
      </div>
    </SettingCard>
  {/if}
{/if}
