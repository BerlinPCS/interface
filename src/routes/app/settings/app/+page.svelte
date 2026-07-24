<script lang='ts'>
  import { onMount } from 'svelte'
  import { toast } from 'svelte-sonner'

  import ConfirmationDialog from '$lib/components/ConfirmationDialog.svelte'
  import SettingCard from '$lib/components/SettingCard.svelte'
  import { Button } from '$lib/components/ui/button'
  import { SingleCombo } from '$lib/components/ui/combobox'
  import { Switch } from '$lib/components/ui/switch'
  import urqlClient, { storage } from '$lib/modules/anilist/urql-client'
  import native from '$lib/modules/native'
  import { settings, SUPPORTS, debug } from '$lib/modules/settings'
  import { readFile, saveFile } from '$lib/utils'

  const debugOpts = {
    '': 'None',
    '*': 'All',
    'torrent:*,webtorrent:*,simple-peer,bittorrent-protocol,bittorrent-dht,bittorrent-lsd,torrent-discovery,bittorrent-tracker:*,ut_metadata,nat-pmp,nat-api': 'Torrent',
    'ui:*': 'Interface'
  }
  let hayaseMigrationAvailable = false
  let checkingHayaseMigration = native.isApp
  let importingHayase = false
  let hayaseConfirmOpen = false
  let resetConfirmOpen = false

  onMount(async () => {
    if (!native.isApp) return
    try {
      hayaseMigrationAvailable = (await native.hayaseMigrationState()).available
    } catch (error) {
      console.error('Could not check for Hayase data:', error)
    } finally {
      checkingHayaseMigration = false
    }
  })

  async function copyLogs () {
    try {
      await saveFile(await native.getLogs(), 'hayatan-logs', 'ansi')
      toast.success('Copied to clipboard', {
        description: 'Copied log contents to clipboard'
      })
    } catch (error) {
      const err = error as Error
      toast.error('Failed to copy logs!', {
        description: err.message,
        duration: 15_000
      })
    }
  }

  async function importSettings () {
    try {
      $settings = await readFile()
      native.restart()
    } catch (error) {
      toast.error('Failed to import settings', {
        description: 'Failed to import settings from file, make sure the selected file is valid JSON.'
      })
    }
  }
  async function exportSettings () {
    try {
      await saveFile($settings, 'hayatan-settings')
    } catch (error) {
      toast.error('Failed to export settings', {
        description: 'Failed to export settings to file.'
      })
    }
  }
  async function importFromHayase () {
    importingHayase = true
    try {
      if (!await native.hayaseMigrationImport()) importingHayase = false
    } catch (error) {
      importingHayase = false
      toast.error('Failed to import from Hayase', {
        description: error instanceof Error ? error.message : String(error)
      })
    }
  }
  async function reset () {
    localStorage.clear()
    await storage.clear()
    native.restart()
  }
  async function useInternalALAPI () {
    try {
      await urqlClient.token()
      await native.unsafeUseInternalALAPI()
    } catch (error) {
      const err = error as Error
      toast.error('Failed to use Internal API', {
        description: err.message || 'Failed to use internal API.'
      })
    }
  }
</script>

<div class='font-weight-bold text-xl font-bold'>App Settings</div>
{#if !SUPPORTS.isAndroid && !SUPPORTS.isIOS}
  <SettingCard let:id title='Hide App To Tray' description='Makes the app hide to tray instead of closing when you close the window. This is useful if you want to keep the torrent client open in the background to seed/leech.'>
    <Switch {id} bind:checked={$settings.hideToTray} />
  </SettingCard>
{/if}
<div class='grid grid-cols-1 gap-3 md:grid-cols-3'>
  <Button on:click={importSettings} class='font-bold'>
    Import Settings From File
  </Button>
  <Button on:click={exportSettings} class='font-bold'>
    Export Settings To File
  </Button>
  <Button on:click={() => { resetConfirmOpen = true }} variant='destructive' class='font-bold'>
    Reset EVERYTHING To Default
  </Button>
</div>

{#if native.isApp}
  <SettingCard title='Import From Hayase' description='Replace Hayatan settings, accounts, browser storage, and mining data with an existing Hayase profile. Hayase itself is left unchanged.' let:id>
    <Button {id} class='font-bold' variant='secondary' disabled={checkingHayaseMigration || !hayaseMigrationAvailable || importingHayase} on:click={() => { hayaseConfirmOpen = true }}>
      {importingHayase ? 'Restarting…' : checkingHayaseMigration ? 'Checking…' : hayaseMigrationAvailable ? 'Import and Restart' : 'No Hayase Profile Found'}
    </Button>
  </SettingCard>
{/if}

<ConfirmationDialog
  bind:open={resetConfirmOpen}
  title='Reset all app data?'
  description='This clears Hayatan’s interface settings, accounts, and browser storage, then restarts the app. This cannot be undone.'
  confirmLabel='Reset Everything'
  destructive
  on:confirm={reset}
/>

<ConfirmationDialog
  bind:open={hayaseConfirmOpen}
  title='Import from Hayase?'
  description='Hayatan will restart and replace its settings, accounts, browser storage, and mining data with the compatible data from Hayase. Your original Hayase profile will not be changed.'
  confirmLabel='Import and Restart'
  destructive
  on:confirm={importFromHayase}
/>

<div class='font-weight-bold text-xl font-bold'>Debug Settings</div>
<SettingCard title='Logging Levels' description='Enable logging of specific parts of the app. These logs are saved to %appdata$/Hayatan/logs/main.log or ~/config/Hayatan/logs/main.log.'>
  <SingleCombo bind:value={$debug} items={debugOpts} class='w-32 shrink-0 border-input border' />
</SettingCard>

<SettingCard title='Debug page' description='Go to the debug page to access additional debugging features.'>
  <Button href='/#/app/debug' class='btn btn-primary font-bold'>Go to Debug Page</Button>
</SettingCard>

{#if SUPPORTS.isAndroid}
  <SettingCard title='Open WebView Devtools' description={'Open devtools for the system WebView, this allows to specify performance flags to improve performance.\n\nYou can read more about this on https://wiki.hayase.watch'}>
    <Button on:click={native.openUIDevtools} class='btn btn-primary font-bold'>Open Devtools</Button>
  </SettingCard>
{/if}

{#if !SUPPORTS.isAndroid && !SUPPORTS.isIOS}
  <SettingCard title='Log Output' description='Save debug logs to a file. Once you enable a logging level you can use this to quickly copy the created logs to clipboard instead of navigating to the log file in directories.'>
    <Button on:click={copyLogs} class='btn btn-primary font-bold'>Copy To Clipboard</Button>
  </SettingCard>

  <SettingCard title='Open UI Devtools' description="Open devtools for the UI process, this allows to inspect media playback information, rendering performance and more. DO NOT PASTE ANY CODE IN THERE, YOU'RE LIKELY BEING SCAMMED IF SOMEONE TELLS YOU TO!">
    <Button on:click={native.openUIDevtools} class='btn btn-primary font-bold'>Open Devtools</Button>
  </SettingCard>

  <SettingCard title='Use Internal AniList API' description={"THIS IS VERY UNSAFE AND LIKELY BANNABLE!!!\nDO NOT USE THIS UNLESS YOU KNOW WHAT YOU'RE DOING.\n\nForces the app to use AniList's internal API instead of the public GraphQL API for the current session only. Can be used to debug issues such as CGNAT induced rate limits. This can cause issues in the UI, sync and other parts of the app."}>
    <Button on:click={useInternalALAPI} class='btn btn-primary font-bold'>Use Internal API</Button>
  </SettingCard>
{/if}
