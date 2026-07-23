<script lang='ts'>
  export let node: unknown

  const ALLOWED_TAGS = new Set(['a', 'br', 'code', 'dd', 'details', 'div', 'dl', 'dt', 'em', 'li', 'ol', 'p', 'rp', 'rt', 'ruby', 'small', 'span', 'strong', 'summary', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul'])

  $: record = node && typeof node === 'object' && !Array.isArray(node) ? node as Record<string, unknown> : undefined
  $: rawTag = typeof record?.tag === 'string' ? record.tag.toLowerCase() : 'span'
  $: tagName = ALLOWED_TAGS.has(rawTag) ? rawTag : 'span'
  $: content = record?.type === 'structured-content' ? record.content : record?.content
  $: children = Array.isArray(node) ? node : undefined
  $: stringChildren = children?.length && children.every(child => typeof child === 'string')
  $: isImage = record?.tag === 'img'
  $: imageData = record?.data && typeof record.data === 'object' ? record.data as Record<string, unknown> : undefined
  $: imageTitle = typeof record?.title === 'string' ? record.title : ''
  $: imageAlt = typeof imageData?.alt === 'string' ? imageData.alt : imageTitle || 'Dictionary image'

  function structuredAttributes (element: HTMLElement, value: Record<string, unknown> | undefined) {
    const update = (next: Record<string, unknown> | undefined) => {
      if (!next) return
      if (typeof next.title === 'string') element.title = next.title
      if (typeof next.lang === 'string') element.lang = next.lang
      if (typeof next.colSpan === 'number') element.setAttribute('colspan', String(next.colSpan))
      if (typeof next.rowSpan === 'number') element.setAttribute('rowspan', String(next.rowSpan))
      if (next.style && typeof next.style === 'object') {
        for (const [property, rawValue] of Object.entries(next.style as Record<string, unknown>)) {
          const value = typeof rawValue === 'number' && /^margin(?:Top|Right|Bottom|Left)$/.test(property) ? `${rawValue}em` : String(rawValue)
          element.style.setProperty(property.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`), value)
        }
      }
      if (next.data && typeof next.data === 'object') {
        for (const [key, rawValue] of Object.entries(next.data as Record<string, unknown>)) {
          const cjk = /^[\u3000-\u9fff\uf900-\ufaff]/.test(key)
          const name = key.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)
          element.setAttribute(`data-sc${cjk ? '' : '-'}${name}`, String(rawValue))
        }
      }
    }
    update(value)
    return { update }
  }
</script>

{#if typeof node === 'string'}
  {#each node.split(/\r?\n/) as line, index (`${line}:${index}`)}
    {#if index > 0}<br />{/if}{line}
  {/each}
{:else if children}
  {#if stringChildren && children.length > 1}
    <ul class='glossary-list'>
      {#each children as child, index (index)}
        <li class='gloss-sc-li'>{String(child)}</li>
      {/each}
    </ul>
  {:else}
    {#each children as child, index (index)}
      <svelte:self node={child} />
    {/each}
  {/if}
{:else if record?.type === 'structured-content'}
  <span class='structured-content'><svelte:self node={content} /></span>
{:else if isImage}
  <span
    class='gloss-image-link'
    data-path={typeof record?.path === 'string' ? record.path : ''}
    title={imageTitle}
  >
    <span class='gloss-image-container'>
      <span class='gloss-image-sizer' />
      <span class='gloss-image-background' />
      <span class='gloss-image-container-overlay'>{imageAlt}</span>
    </span>
  </span>
{:else if record}
  {#if tagName === 'table'}
    <div class='gloss-sc-table-container'>
      <svelte:element this={tagName} class={`gloss-sc-${tagName}`} use:structuredAttributes={record}>
        <svelte:self node={content} />
      </svelte:element>
    </div>
  {:else}
    <svelte:element
      this={tagName}
      class={`gloss-sc-${tagName}`}
      use:structuredAttributes={record}
      on:click|preventDefault={tagName === 'a' ? () => {} : undefined}
    >
      <svelte:self node={content} />
    </svelte:element>
  {/if}
{/if}

<style>
  .glossary-list {
    margin: calc(2px * var(--popup-scale)) 0;
    padding-left: 1.8em;
  }

  .gloss-sc-table-container {
    display: block;
    max-width: 100%;
    overflow-x: auto;
  }

  :global(.gloss-sc-table) {
    border-collapse: collapse;
    table-layout: auto;
  }

  :global(.gloss-sc-th),
  :global(.gloss-sc-td) {
    padding: 0.25em;
    border: calc(1px * var(--popup-scale)) solid currentColor;
    vertical-align: top;
  }

  .gloss-image-container {
    position: relative;
    display: inline-flex;
    min-width: 4em;
    min-height: 2em;
    align-items: center;
    justify-content: center;
    padding: 0.35em;
    border: 1px dashed currentColor;
    opacity: 0.65;
    font-size: 0.8em;
  }

  .gloss-image-sizer {
    width: 4em;
    min-height: 2em;
  }

  .gloss-image-background {
    position: absolute;
    inset: 0;
    background: var(--gloss-image-background-color, transparent);
  }

  .gloss-image-container-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.35em;
  }
</style>
