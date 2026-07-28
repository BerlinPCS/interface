import type {
  MiningAnkiAddRequest,
  MiningAnkiAddResult,
  MiningAnkiConnectionResult,
  MiningAnkiDuplicateResult,
  MiningAnkiEvent,
  MiningAnkiSettingsPatch,
  MiningAnkiShowNotesResult,
  MiningAnkiState
} from '$lib/modules/mining/anki'
import type { MiningLocalAudioState } from '$lib/modules/mining/audio'
import type {
  MiningDictionaryEvent,
  MiningDictionaryKanjiResult,
  MiningDictionaryKind,
  MiningDictionaryLookupRequest,
  MiningDictionaryLookupResult,
  MiningDictionaryState
} from '$lib/modules/mining/dictionary'

declare module 'native' {
  interface Native {
    miningDictionaryState: () => Promise<MiningDictionaryState>
    miningDictionaryLookup: (request: MiningDictionaryLookupRequest) => Promise<MiningDictionaryLookupResult>
    miningDictionaryLookupKanji: (character: string) => Promise<MiningDictionaryKanjiResult>
    miningDictionaryImport: () => Promise<MiningDictionaryState>
    miningDictionarySetEnabled: (id: string, kind: MiningDictionaryKind, enabled: boolean) => Promise<MiningDictionaryState>
    miningDictionaryReorder: (kind: MiningDictionaryKind, ids: string[]) => Promise<MiningDictionaryState>
    miningDictionaryRemove: (id: string) => Promise<MiningDictionaryState>
    miningAudioLocalState: () => Promise<MiningLocalAudioState>
    miningAudioLocalImport: () => Promise<MiningLocalAudioState>
    miningAudioLocalRemove: () => Promise<MiningLocalAudioState>
    miningAudioLocalReorder: (sourceOrder: string[]) => Promise<MiningLocalAudioState>
    miningAudioResolveSource: (target: string, templates: string[]) => Promise<string | null>
    miningAnkiState: () => Promise<MiningAnkiState>
    miningAnkiUpdateSettings: (patch: MiningAnkiSettingsPatch) => Promise<MiningAnkiState>
    miningAnkiPing: () => Promise<MiningAnkiConnectionResult>
    miningAnkiDetect: () => Promise<MiningAnkiState>
    miningAnkiCheckDuplicate: (request: { expression: string }) => Promise<MiningAnkiDuplicateResult>
    miningAnkiAddNote: (request: MiningAnkiAddRequest) => Promise<MiningAnkiAddResult>
    miningAnkiShowNotes: (request: { expression: string }) => Promise<MiningAnkiShowNotesResult>
    onMiningAnkiEvent: (callback: (event: MiningAnkiEvent) => void) => () => void
    onMiningDictionaryEvent: (callback: (event: MiningDictionaryEvent) => void) => () => void
  }
}
