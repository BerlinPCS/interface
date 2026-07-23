import { toHoshiPopupEntry, type HoshiPopupEntry } from './mining-popup-adapter.ts'

import type { MiningDictionaryEntry } from './mining-dictionary'

export interface MiningPopupRenderData {
  resultSetId: string
  entryCount: number
  initialEntry?: HoshiPopupEntry
}

export class MiningPopupResultRegistry {
  readonly #popupId: string
  readonly #sets = new Map<string, MiningDictionaryEntry[]>()
  #nextId = 1

  constructor (popupId: string) {
    this.#popupId = popupId
  }

  replace (entries: MiningDictionaryEntry[]): MiningPopupRenderData {
    this.clear()
    return this.add(entries)
  }

  add (entries: MiningDictionaryEntry[]): MiningPopupRenderData {
    const resultSetId = `${this.#popupId}:${this.#nextId++}`
    this.#sets.set(resultSetId, entries)
    return {
      resultSetId,
      entryCount: entries.length,
      initialEntry: entries[0] ? toHoshiPopupEntry(entries[0]) : undefined
    }
  }

  has (resultSetId: string): boolean {
    return this.#sets.has(resultSetId)
  }

  entry (resultSetId: string, index: number): HoshiPopupEntry | undefined {
    const entry = this.#sets.get(resultSetId)?.[index]
    return entry ? toHoshiPopupEntry(entry) : undefined
  }

  clear () {
    this.#sets.clear()
  }
}
