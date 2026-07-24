<script lang='ts'>
  import { createEventDispatcher } from 'svelte'

  import { Button } from '$lib/components/ui/button'
  import * as Dialog from '$lib/components/ui/dialog'

  export let open = false
  export let title: string
  export let description: string
  export let confirmLabel = 'Confirm'
  export let cancelLabel = 'Cancel'
  export let destructive = false

  const dispatch = createEventDispatcher<{ confirm: null }>()

  function confirm () {
    open = false
    dispatch('confirm', null)
  }
</script>

<Dialog.Root portal='#root' bind:open>
  <Dialog.Content class='max-w-md bg-background'>
    <Dialog.Header>
      <Dialog.Title>{title}</Dialog.Title>
      <Dialog.Description>{description}</Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer>
      <Button variant='secondary' on:click={() => { open = false }}>{cancelLabel}</Button>
      <Button variant={destructive ? 'destructive' : 'default'} on:click={confirm}>{confirmLabel}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
