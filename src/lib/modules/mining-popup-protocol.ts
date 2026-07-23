import type { HoshiPopupEntry } from './mining-popup-adapter'

export const MINING_POPUP_PROTOCOL_VERSION = 1 as const
export const MINING_POPUP_MESSAGE_SOURCE = 'hayase-mining-popup' as const

export interface MiningPopupRuntimeSettings {
  scanNonJapaneseText: boolean
  scanLength: number
  collapseMode: 'expandAll' | 'collapseAll'
  expandFirstDictionary: boolean
  compactGlossaries: boolean
  showExpressionTags: boolean
  harmonicFrequency: boolean
  deduplicatePitchAccents: boolean
  compactPitchAccents: boolean
  dictionaryStyles: Record<string, string>
  customCss: string
  scale: number
  darkMode: boolean
  audioSources: string[]
  audioEnableAutoplay: boolean
  audioPlaybackMode: 'interrupt' | 'duck' | 'mix'
}

export interface MiningPopupCapabilities {
  dictionaryMedia: boolean
  audio: boolean
  mining: boolean
  nestedLookup: boolean
}

interface HostMessageBase {
  source: typeof MINING_POPUP_MESSAGE_SOURCE
  version: typeof MINING_POPUP_PROTOCOL_VERSION
  nonce: string
}

export type MiningPopupHostMessage =
  | HostMessageBase & {
    type: 'initialize'
    settings: MiningPopupRuntimeSettings
    capabilities: MiningPopupCapabilities
  }
  | HostMessageBase & {
    type: 'render'
    popupId: string
    resultSetId: string
    entryCount: number
    initialEntry?: HoshiPopupEntry
  }
  | HostMessageBase & {
    type: 'reply'
    popupId: string
    requestId: string
    ok: true
    value: unknown
  }
  | HostMessageBase & {
    type: 'reply'
    popupId: string
    requestId: string
    ok: false
    error: string
  }
  | HostMessageBase & {
    type: 'reset' | 'clearSelection' | 'navigateBack' | 'navigateForward' | 'focus'
    popupId: string
  }

export type MiningPopupRequestMethod =
  | 'getEntry'
  | 'lookupRedirect'
  | 'openExternalLink'
  | 'resolveAudioSource'
  | 'playWordAudio'
  | 'mineEntry'
  | 'duplicateCheck'

export interface MiningPopupSelection {
  text: string
  sentence: string
  rect: { x: number, y: number, width: number, height: number }
  normalizedOffset?: number
  sentenceOffset?: number
}

interface FrameMessageBase {
  source: typeof MINING_POPUP_MESSAGE_SOURCE
  version: typeof MINING_POPUP_PROTOCOL_VERSION
  nonce: string
}

export type MiningPopupFrameMessage =
  | FrameMessageBase & { type: 'ready' }
  | FrameMessageBase & { type: 'contentReady', popupId: string }
  | FrameMessageBase & {
    type: 'request'
    popupId: string
    resultSetId: string
    requestId: string
    method: MiningPopupRequestMethod
    payload: unknown
  }
  | FrameMessageBase & {
    type: 'selectionChanged'
    popupId: string
    selection: MiningPopupSelection
  }
  | FrameMessageBase & {
    type: 'dismiss' | 'tapOutside' | 'scrolled'
    popupId: string
  }
  | FrameMessageBase & {
    type: 'historyChanged'
    popupId: string
    backCount: number
    forwardCount: number
  }
  | FrameMessageBase & {
    type: 'scrollState'
    popupId: string
    atTop: boolean
    scrollTop: number
  }
  | FrameMessageBase & {
    type: 'runtimeError'
    popupId?: string
    message: string
  }

function isRecord (value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isString (value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isFiniteNumber (value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function hasValidBase (value: Record<string, unknown>, nonce: string) {
  return value.source === MINING_POPUP_MESSAGE_SOURCE &&
    value.version === MINING_POPUP_PROTOCOL_VERSION &&
    value.nonce === nonce
}

const requestMethods = new Set<MiningPopupRequestMethod>([
  'getEntry',
  'lookupRedirect',
  'openExternalLink',
  'resolveAudioSource',
  'playWordAudio',
  'mineEntry',
  'duplicateCheck'
])

export function parseMiningPopupFrameMessage (
  value: unknown,
  nonce: string
): MiningPopupFrameMessage | undefined {
  if (!isRecord(value) || !hasValidBase(value, nonce) || !isString(value.type)) return

  switch (value.type) {
    case 'ready':
      return value as unknown as MiningPopupFrameMessage
    case 'contentReady':
    case 'dismiss':
    case 'tapOutside':
    case 'scrolled':
      if (!isString(value.popupId)) return
      return value as unknown as MiningPopupFrameMessage
    case 'runtimeError':
      if (!isString(value.message) || (value.popupId !== undefined && !isString(value.popupId))) return
      return value as unknown as MiningPopupFrameMessage
    case 'request':
      if (
        !isString(value.popupId) ||
        !isString(value.resultSetId) ||
        !isString(value.requestId) ||
        !isString(value.method) ||
        !requestMethods.has(value.method as MiningPopupRequestMethod)
      ) return
      return value as unknown as MiningPopupFrameMessage
    case 'selectionChanged':
      if (!isString(value.popupId) || !isRecord(value.selection)) return
      if (!isString(value.selection.text) || typeof value.selection.sentence !== 'string' || !isRecord(value.selection.rect)) return
      if (
        !isFiniteNumber(value.selection.rect.x) ||
        !isFiniteNumber(value.selection.rect.y) ||
        !isFiniteNumber(value.selection.rect.width) ||
        !isFiniteNumber(value.selection.rect.height) ||
        value.selection.rect.width <= 0 ||
        value.selection.rect.height <= 0
      ) return
      return value as unknown as MiningPopupFrameMessage
    case 'historyChanged':
      if (
        !isString(value.popupId) ||
        !Number.isInteger(value.backCount) ||
        !Number.isInteger(value.forwardCount) ||
        (value.backCount as number) < 0 ||
        (value.forwardCount as number) < 0
      ) return
      return value as unknown as MiningPopupFrameMessage
    case 'scrollState':
      if (
        !isString(value.popupId) ||
        typeof value.atTop !== 'boolean' ||
        !isFiniteNumber(value.scrollTop) ||
        value.scrollTop < 0
      ) return
      return value as unknown as MiningPopupFrameMessage
  }
}

export type MiningPopupHostPayload =
  MiningPopupHostMessage extends infer Message
    ? Message extends HostMessageBase
      ? Omit<Message, keyof HostMessageBase>
      : never
    : never

export function makeMiningPopupHostMessage<T extends MiningPopupHostPayload> (
  nonce: string,
  message: T
): T & HostMessageBase {
  return {
    source: MINING_POPUP_MESSAGE_SOURCE,
    version: MINING_POPUP_PROTOCOL_VERSION,
    nonce,
    ...message
  }
}
