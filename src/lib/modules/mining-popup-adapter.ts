import type {
  MiningDictionaryEntry,
  MiningDictionaryFrequency,
  MiningDictionaryGlossary,
  MiningDictionaryPitch,
  MiningDictionaryTrace
} from './mining-dictionary'

export interface HoshiPopupEntry {
  expression: string
  reading: string
  matched: string
  deinflectionTraceRows: MiningDictionaryTrace[][]
  glossaries: MiningDictionaryGlossary[]
  frequencies: MiningDictionaryFrequency[]
  pitches: MiningDictionaryPitch[]
  rules: string[]
}

function unique<T> (values: T[]): T[] {
  return [...new Set(values)]
}

export function toHoshiPopupEntry (entry: MiningDictionaryEntry): HoshiPopupEntry {
  return {
    expression: entry.expression,
    reading: entry.reading,
    matched: entry.matched,
    deinflectionTraceRows: entry.trace.length
      ? [entry.trace.toReversed().map(item => ({ ...item }))]
      : [],
    glossaries: entry.glossaries.map(glossary => ({ ...glossary })),
    frequencies: entry.frequencies.map(group => ({
      dictionary: group.dictionary,
      frequencies: group.frequencies.map(frequency => ({ ...frequency }))
    })),
    pitches: entry.pitches.map(group => ({
      dictionary: group.dictionary,
      pitchPositions: unique(group.pitchPositions),
      transcriptions: unique(group.transcriptions)
    })),
    rules: unique(entry.rules.filter(Boolean))
  }
}
