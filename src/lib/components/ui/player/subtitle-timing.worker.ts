import { firstWindowOffset, matchSubtitleWindows, type ReferenceWindow } from './subtitle-matcher'

import type { SubtitleCue } from './subtitle-alignment'

self.onmessage = ({ data }: MessageEvent<{ id: number, references: ReferenceWindow[][], candidates: Array<{ id: string, cues: SubtitleCue[] }> }>) => {
  const results = data.candidates.map(candidate => {
    const estimates = data.references.map(windows => matchSubtitleWindows(windows, candidate.cues))
    const accepted = estimates.filter(result => result.accepted).sort((a, b) => b.confidence - a.confidence)
    const strongestRejected = estimates.filter(result => !result.accepted).sort((a, b) => (b.support ?? 0) - (a.support ?? 0))[0]
    const result = accepted.length
      ? accepted.every(result => Math.abs(result.offset! - accepted[0]!.offset!) <= 0.25) ? accepted[0]! : { accepted: false, confidence: 0, reason: 'conflicting-references', windows: [] }
      : strongestRejected ?? { accepted: false, confidence: 0, reason: 'no-reference', windows: [] }
    return { id: candidate.id, ...result, earlyOffset: firstWindowOffset(estimates), references: estimates.map((estimate, referenceIndex) => ({ referenceIndex, ...estimate })) }
  })
  self.postMessage({ id: data.id, results })
}
