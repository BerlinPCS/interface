import type { SubtitleCue } from './subtitle-alignment'

export const TIMING_LIMITS = { maxOffset: 120, step: 0.1, tolerance: 0.8, minMatches: 6, support: 0.65, margin: 0.15, agreement: 0.25, jointWindows: 3, jointAnchors: 1, jointMargin: 0.15, jointHoldoutMargin: 0.05, earlyMatches: 10, earlySupport: 0.85, earlyMargin: 0.2, earlyTimeoutMs: 30_000 }
export interface ReferenceWindow { id: string, start: number, end: number, cues: SubtitleCue[] }
export interface TimingEvidence { offset: number, matches: number, support: number, margin: number, competingOffset?: number, windowId?: string, start?: number, end?: number, referenceCount?: number, pairs?: Array<{ reference: number, candidate: number, error: number, referenceText?: string, candidateText?: string }> }
export interface TimingResult { earlyOffset?: number, accepted: boolean, offset?: number, confidence: number, support?: number, joint?: { windows: number, offset: number, margin: number, holdoutMargin: number }, windows: TimingEvidence[], reason: string }

export function dialogueCue (text = '', style = '') {
  return !/sign|karaoke|opening|ending|lyrics|(?:^|[\s._-])(?:op|ed)(?:$|[\s._-]|\d|style|romaji|kanji|english|japanese)/i.test(style) && !/\\(?:k[fo]?\d|p[1-9])/i.test(text)
}
export function distinctCues (cues: SubtitleCue[]) {
  const sorted = cues.filter(cue => Number.isFinite(cue.start) && Number.isFinite(cue.end) && cue.end > cue.start).sort((a, b) => a.start - b.start)
  return sorted.filter((cue, index) => !index || cue.start - sorted[index - 1]!.start > 0.1)
}
function scoreOffset (reference: SubtitleCue[], target: SubtitleCue[], offset: number, collect = false) {
  const pairs: Array<{ reference: number, candidate: number, error: number, referenceText?: string, candidateText?: string }> = []
  let cursor = 0
  let matches = 0
  let score = 0
  for (const cue of reference) {
    while (cursor < target.length && target[cursor]!.start + offset < cue.start - TIMING_LIMITS.tolerance) cursor++
    let best = -1
    let distance = Infinity
    for (let index = cursor; index < target.length && target[index]!.start + offset <= cue.start + TIMING_LIMITS.tolerance; index++) {
      const difference = Math.abs(target[index]!.start + offset - cue.start)
      if (difference < distance) { best = index; distance = difference }
    }
    if (best < 0) continue
    const selected = target[best]!
    const overlap = Math.max(0, Math.min(cue.end, selected.end + offset) - Math.max(cue.start, selected.start + offset))
    const duration = Math.max(cue.end - cue.start, selected.end - selected.start)
    score += 0.9 * (1 - distance / (TIMING_LIMITS.tolerance + 0.1)) + 0.1 * Math.min(1, overlap / duration)
    if (collect && pairs.length < 100) pairs.push({ reference: cue.start, candidate: selected.start, error: selected.start + offset - cue.start, referenceText: cue.text?.slice(0, 500), candidateText: selected.text?.slice(0, 500) })
    matches++
    cursor = best + 1
  }
  return { score: score / reference.length, matches, support: matches / reference.length, pairs }
}
export function matchSubtitleWindows (windows: ReferenceWindow[], targetCues: SubtitleCue[]): TimingResult {
  const target = distinctCues(targetCues)
  const evidence: TimingEvidence[] = []
  const ranges: Array<{ start: number, end: number }> = []
  const curves: Array<Array<{ offset: number, score: number }>> = []
  for (const window of windows) {
    // Repeated/overlapping observations do not provide independent evidence.
    if (ranges.some(range => window.start < range.end && window.end > range.start)) continue
    const reference = distinctCues(window.cues.filter(cue => cue.start >= window.start && cue.start < window.end))
    if (reference.length < TIMING_LIMITS.minMatches) continue
    ranges.push(window)
    const candidates = []
    const targets = target.filter(cue => cue.start >= window.start - 121 && cue.start < window.end + 121)
    for (let tick = -1200; tick <= 1200; tick++) {
      const offset = tick / 10
      candidates.push({ offset, ...scoreOffset(reference, targets, offset) })
    }
    curves.push(candidates.map(({ offset, score }) => ({ offset, score })))
    candidates.sort((a, b) => b.score - a.score || Math.abs(a.offset) - Math.abs(b.offset))
    const best = candidates[0]!
    const runner = candidates.find(candidate => Math.abs(candidate.offset - best.offset) > 1)!
    evidence.push({ offset: best.offset, matches: best.matches, support: best.support, margin: best.score - runner.score, competingOffset: runner.offset, windowId: window.id, start: window.start, end: window.end, referenceCount: reference.length, pairs: scoreOffset(reference, targets, best.offset, true).pairs })
  }
  const supported = evidence.map((result, index) => ({ ...result, index })).filter(result => result.matches >= TIMING_LIMITS.minMatches && result.support >= TIMING_LIMITS.support)
  const usable = supported.filter(result => result.margin >= TIMING_LIMITS.margin)
  const support = evidence.length ? evidence.reduce((sum, window) => sum + window.matches, 0) / evidence.reduce((sum, window) => sum + (window.referenceCount ?? 0), 0) : 0
  const reject = (reason: string, joint?: TimingResult['joint']): TimingResult => ({ accepted: false, confidence: 0, support, windows: evidence, reason, joint })
  if (supported.length < 2) return reject('insufficient-evidence')
  // Strong but contradictory windows still reject different cuts, even when
  // their local peaks are ambiguous. Never average contradictory offsets.
  const supportedOffsets = evidence.filter(result => result.support >= TIMING_LIMITS.support).map(result => result.offset)
  if (Math.max(...supportedOffsets) - Math.min(...supportedOffsets) > TIMING_LIMITS.agreement) return reject('inconsistent-windows')
  if (usable.length >= 2) return { accepted: true, offset: usable[0]!.offset, confidence: Math.min(...usable.map(result => result.support)), support, windows: evidence, reason: 'accepted' }

  // Compare the SAME alternative offset across independent windows. Previously
  // each window's unrelated runner-up defeated an otherwise consistent offset.
  // Equal window weights prevent one dense scene dominating confirmation.
  const jointScores = curves[supported[0]!.index]!.map((point, tick) => ({
    offset: point.offset,
    score: supported.reduce((sum, window) => sum + curves[window.index]![tick]!.score, 0) / supported.length
  })).sort((a, b) => b.score - a.score || Math.abs(a.offset) - Math.abs(b.offset))
  const best = jointScores[0]!
  const runner = jointScores.find(point => Math.abs(point.offset - best.offset) > 1)!
  const bestTick = curves[supported[0]!.index]!.findIndex(point => point.offset === best.offset)
  const holdoutMargin = Math.min(...supported.map((_, excluded) => {
    const remaining = supported.filter((_, index) => index !== excluded)
    const scores = curves[remaining[0]!.index]!.map((point, tick) => ({ offset: point.offset, score: remaining.reduce((sum, window) => sum + curves[window.index]![tick]!.score, 0) / remaining.length }))
    const competing = Math.max(...scores.filter(point => Math.abs(point.offset - best.offset) > 1).map(point => point.score))
    return scores[bestTick]!.score - competing
  }))
  const joint = { windows: supported.length, offset: best.offset, margin: best.score - runner.score, holdoutMargin }
  if (supported.length < TIMING_LIMITS.jointWindows || usable.length < TIMING_LIMITS.jointAnchors || joint.margin < TIMING_LIMITS.jointMargin || joint.holdoutMargin < TIMING_LIMITS.jointHoldoutMargin) return reject('ambiguous-offset', joint)
  if (supported.some(window => Math.abs(window.offset - best.offset) > TIMING_LIMITS.agreement)) return reject('inconsistent-windows', joint)
  return { accepted: true, offset: best.offset, confidence: Math.min(...supported.map(window => window.support)), support, joint, windows: evidence, reason: 'accepted-joint-evidence' }
}

/** A deliberately stricter single-window hint; never a verified result. */
export function firstWindowOffset (estimates: TimingResult[]): number | undefined {
  if (estimates.some(result => result.windows.length > 1)) return
  const evidence = estimates.flatMap(result => result.windows)
  const strong = evidence.filter(window => window.matches >= TIMING_LIMITS.earlyMatches && window.support >= TIMING_LIMITS.earlySupport && window.margin >= TIMING_LIMITS.earlyMargin)
  if (!strong.length) return
  const offset = strong[0]!.offset
  if (evidence.some(window => window.support >= TIMING_LIMITS.support && window.margin >= TIMING_LIMITS.margin && Math.abs(window.offset - offset) > TIMING_LIMITS.agreement)) return
  return offset
}
