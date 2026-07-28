import type {
  MiningDictionaryEntry,
  MiningDictionaryFrequency,
  MiningDictionaryGlossary,
  MiningDictionaryPitch,
  MiningDictionaryTrace
} from '../dictionary'

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
      accents: (group.accents ?? unique(group.pitchPositions).map(position => ({
        position,
        pattern: '',
        nasal: [],
        devoice: []
      }))).filter((accent, index, accents) =>
        accents.findIndex(candidate =>
          candidate.position === accent.position &&
          candidate.pattern === accent.pattern &&
          candidate.nasal.join(',') === accent.nasal.join(',') &&
          candidate.devoice.join(',') === accent.devoice.join(',')
        ) === index
      ).map(accent => ({
        ...accent,
        nasal: unique(accent.nasal),
        devoice: unique(accent.devoice)
      })),
      transcriptions: unique(group.transcriptions)
    })),
    rules: unique(entry.rules.filter(Boolean))
  }
}
