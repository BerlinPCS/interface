import { derived } from 'svelte/store'
import { persisted } from 'svelte-persisted-store'

import SUPPORTS from '../settings/supports'

export const playerVolume = persisted('volume', 1)

export const playerOutputVolume = derived(
  playerVolume,
  volume => SUPPORTS.isMobile ? 1 : scaleVolume(volume)
)

export function scaleVolume (volume: number): number {
  return Math.min(1, Math.max(0, volume)) ** 3
}
