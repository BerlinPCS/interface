/** Only continuous playback positions are evidence of watched content. */
export function watchedRange (start: number, end: number, elapsed: number, rate: number, seeking: boolean, sameEpisode: boolean): [number, number] {
  const advanced = end - start
  return !seeking && sameEpisode && elapsed > 0 && elapsed <= 15 && start >= 0 &&
    Number.isFinite(advanced) && advanced > 0 && Math.abs(advanced - elapsed * rate) <= 1
    ? [start, end]
    : [0, 0]
}
