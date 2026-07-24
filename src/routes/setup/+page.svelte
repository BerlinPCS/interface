<script lang='ts'>
  import { onMount } from 'svelte'
  import { toast } from 'svelte-sonner'

  import { WEB_URL } from '$lib'
  import ConfirmationDialog from '$lib/components/ConfirmationDialog.svelte'
  import Logo from '$lib/components/icons/Logo.svelte'
  import { Button } from '$lib/components/ui/button'
  import { Checkbox } from '$lib/components/ui/checkbox'
  import { Label } from '$lib/components/ui/label'
  import native from '$lib/modules/native'
  import { click, dragScroll } from '$lib/modules/navigate'

  let checked = false
  let migrationAvailable = false
  let checkingMigration = native.isApp
  let importing = false
  let migrationConfirmOpen = false

  onMount(async () => {
    if (!native.isApp) return
    try {
      migrationAvailable = (await native.hayaseMigrationState()).available
    } catch (error) {
      console.error('Could not check for Hayase data:', error)
    } finally {
      checkingMigration = false
    }
  })

  async function importFromHayase () {
    importing = true
    try {
      if (!await native.hayaseMigrationImport()) importing = false
    } catch (error) {
      importing = false
      toast.error('Failed to import from Hayase', {
        description: error instanceof Error ? error.message : String(error)
      })
    }
  }
</script>

<div class='space-y-3 lg:max-w-4xl h-full overflow-y-auto w-full py-8 flex flex-col items-center justify-center' use:dragScroll>
  <Logo class='w-52 h-52 object-contain mb-14 shrink-0' />
  <div class='font-bold text-5xl text-center w-full overflow-x-clip flex justify-center'>
    <div class='relative'>
      Welcome to Hayatan
      <div class='animate-[hearbeat_1.5s_ease-in-out_infinite_alternate] absolute text-lg text-theme right-0 -top-5 xs:-right-20 xs:-top-2 rotate-12'>Previously known as Miru!</div>
    </div>
  </div>
  <div class='text-muted-foreground pt-3 text-center px-3'>Let's set up your perfect streaming environment.</div>
  {#if migrationAvailable}
    <div class='flex flex-col items-center gap-2 pt-8 px-5 text-center'>
      <Button class='text-lg font-bold' variant='secondary' size='lg' disabled={importing} on:click={() => { migrationConfirmOpen = true }}>
        {importing ? 'Restarting…' : 'Import Existing Hayase Profile'}
      </Button>
      <div class='text-sm text-muted-foreground max-w-xl'>Replaces this new Hayatan profile with your Hayase settings, accounts, and local app data. This will skip the initial setup process.</div>
    </div>
  {:else if checkingMigration}
    <div class='text-sm text-muted-foreground pt-8'>Checking for an existing Hayase profile…</div>
  {/if}
  <div class='flex items-center space-x-2 pt-12 pb-3 px-5'>
    <Checkbox bind:checked />
    <Label for='terms' class='text-md font-medium leading-none text-muted-foreground'>
      I agree to the <a use:click={() => native.openURL(`${WEB_URL}/terms`)} class='text-foreground underline py-2 px-1'>Terms of Service</a> and <a use:click={() => native.openURL(`${WEB_URL}/privacy`)} class='text-foreground underline py-2 px-1'>Privacy Policy</a>
    </Label>
  </div>
  <Button class='text-lg font-bold shrink-0' disabled={!checked} size='lg' href={checked ? '/#/setup/storage' : undefined} data-sveltekit-replacestate>{!checked ? 'Accept terms to continue' : 'Start Setup'}</Button>
</div>

<ConfirmationDialog
  bind:open={migrationConfirmOpen}
  title='Import from Hayase?'
  description='Hayatan will restart and replace its settings, accounts, browser storage, and mining data with the compatible data from Hayase. Your original Hayase profile will not be changed.'
  confirmLabel='Import and Restart'
  destructive
  on:confirm={importFromHayase}
/>
