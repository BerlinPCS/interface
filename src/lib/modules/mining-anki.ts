import type { MiningCapturedMedia } from './mining-media-capture'

export type MiningAnkiDuplicateScope = 'collection' | 'deck' | 'deckRoot'

export interface MiningAnkiModel {
  name: string
  fields: string[]
}

export interface MiningAnkiSettings {
  endpoint: string
  hasApiKey: boolean
  deckName?: string
  modelName?: string
  fieldMappings: Record<string, string>
  tags: string
  allowDuplicates: boolean
  duplicateScope: MiningAnkiDuplicateScope
  checkAllModels: boolean
  forceSync: boolean
  showNotes: boolean
}

export interface MiningAnkiState {
  available: boolean
  connectionStatus: 'unknown' | 'connected' | 'disconnected'
  settings: MiningAnkiSettings
  decks: string[]
  models: MiningAnkiModel[]
  error?: string
}

export interface MiningAnkiEvent {
  event: 'stateChanged'
  data: MiningAnkiState
}

export type MiningAnkiSettingsPatch =
  Partial<Omit<MiningAnkiSettings, 'hasApiKey'>> & { apiKey?: string }

export interface MiningAnkiPopupPayload {
  expression: string
  reading?: string
  matched?: string
  furiganaPlain?: string
  frequenciesHtml?: string
  freqHarmonicRank?: string
  glossary?: string
  glossaryFirst?: string
  singleGlossaries?: string
  pitchPositions?: string
  pitchCategories?: string
  phoneticTranscriptions?: string
  popupSelectionText?: string
  audio?: string
  selectedDictionary?: string
  dictionaryMedia?: Array<{ dictionary: string, path: string, filename: string }>
}

export interface MiningAnkiContext {
  sentence: string
  selectedText: string
  title: string
  timestamp: number
  sentenceOffset?: number
  media: MiningCapturedMedia[]
}

export type MiningAnkiAddResult =
  | { status: 'success', noteId?: number }
  | { status: 'duplicate' }
  | { status: 'error', message: string }

export type MiningAnkiConnectionResult =
  | { status: 'success' }
  | { status: 'error', message: string }

export type MiningAnkiDuplicateResult =
  | { status: 'success', duplicate: boolean }
  | { status: 'error', message: string }

export type MiningAnkiResult = MiningAnkiAddResult

export type MiningAnkiShowNotesResult =
  | { status: 'success', cardIds: number[] }
  | { status: 'error', message: string }

export interface MiningAnkiAddRequest {
  payload: MiningAnkiPopupPayload
  context: MiningAnkiContext
}

export const UNAVAILABLE_MINING_ANKI_STATE: MiningAnkiState = {
  available: false,
  connectionStatus: 'unknown',
  settings: {
    endpoint: 'http://127.0.0.1:8765',
    hasApiKey: false,
    fieldMappings: {},
    tags: '',
    allowDuplicates: false,
    duplicateScope: 'collection',
    checkAllModels: false,
    forceSync: false,
    showNotes: true
  },
  decks: [],
  models: []
}

export function parseMiningAnkiPopupPayload (value: unknown): MiningAnkiPopupPayload {
  if (!isRecord(value) || typeof value.expression !== 'string' || !value.expression.trim()) {
    throw new Error('The dictionary entry has no expression.')
  }
  const payload: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== 'string' || item.length > 4 * 1024 * 1024) continue
    if (key === 'dictionaryMedia') {
      const parsed = item ? JSON.parse(item) : []
      if (!Array.isArray(parsed)) throw new Error('Dictionary media descriptors are invalid.')
      payload[key] = parsed
    } else {
      payload[key] = item
    }
  }
  return payload as unknown as MiningAnkiPopupPayload
}

function isRecord (value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
