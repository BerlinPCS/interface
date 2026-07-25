/*
 * Furigana and popup compatibility behavior adapted from Hoshi Reader.
 * Copyright © 2026 Manhhao.
 * Portions copyright © 2021-2025 Yomitan and Yomichan authors.
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { MiningCue, MiningSelection } from './mining'

export const DEFAULT_MINING_DICTIONARY_CSS = ''

export const RECOMMENDED_MINING_DICTIONARY_CSS = `html,
body,
button {
    font-family: "Klee One", "Klee One SemiBold", cursive !important;
    font-weight: 600;
}

html[data-hoshi-color-scheme],
html[data-hoshi-color-scheme] body {
    background: transparent !important;
    color: #dfdfdf !important;
}

.frequency-group {
    --freq-tag-color: #43864d;
    border-color: #43864d !important;
    background: rgba(35, 38, 40, 0.72) !important;
}

.frequency-dict-label {
    color: #f2fff3 !important;
    background: #43864d !important;
}

.frequency-values {
    color: #e6e6eb !important;
    background: rgba(35, 38, 40, 0.72) !important;
}

.pitch-dict-label {
    color: #fff !important;
    background: #7048bd !important;
}

.glossary-tag,
.deinflection-tag {
    color: #f1f1f3 !important;
    background: #515258 !important;
}

.expr-tag {
    color: #fff !important;
    background: #398ca6 !important;
}

.gloss-sc-thead,
.gloss-sc-tfoot,
.gloss-sc-th {
    color: #dfdfdf !important;
    background: transparent !important;
}

.gloss-sc-th,
.gloss-sc-td {
    border-color: rgba(255, 255, 255, 0.2) !important;
}

.expression,
.glossary-content,
.glossary-group > div[data-dictionary] {
    color: #dfdfdf !important;
}

.expression rt,
.headword-term > ruby > rt {
    color: #dedede !important;
}

hr {
    border-color: rgba(255, 255, 255, 0.18) !important;
}

button.button-slot {
    color: rgba(235, 235, 245, 0.92) !important;
}

.overlay {
    color: #dfdfdf !important;
    background: rgba(45, 45, 55, 0.96) !important;
}

a {
    color: #9dbbff !important;
}`

export const RECOMMENDED_MINING_DICTIONARY_OUTER_CSS = `iframe.hoshi-popup {
    background: rgba(45, 45, 55, 0.85) !important;
    backdrop-filter: blur(6px) !important;
    -webkit-backdrop-filter: blur(6px) !important;
    border: 1px solid rgba(255, 255, 255, 0.2) !important;
    border-radius: 12px !important;
    box-shadow: 0 3px 12px rgba(0, 0, 0, 0.3) !important;
    overflow: hidden !important;
}

.action-bar {
    background: transparent !important;
    border-bottom-color: rgba(255, 255, 255, 0.15) !important;
}

.action-bar button {
    color: rgba(235, 235, 245, 0.92) !important;
}`

export type MiningDictionaryKind = 'term' | 'frequency' | 'pitch'

export interface MiningDictionaryTrace {
  name: string
  description: string
}

export interface MiningDictionaryGlossary {
  dictionary: string
  content: string
  definitionTags: string
  termTags: string
}

export interface MiningDictionaryFrequency {
  dictionary: string
  frequencies: Array<{ value: number, displayValue: string }>
}

export interface MiningDictionaryPitch {
  dictionary: string
  pitchPositions: number[]
  transcriptions: string[]
}

export interface MiningDictionaryEntry {
  expression: string
  reading: string
  matched: string
  deinflected: string
  trace: MiningDictionaryTrace[]
  rules: string[]
  glossaries: MiningDictionaryGlossary[]
  frequencies: MiningDictionaryFrequency[]
  pitches: MiningDictionaryPitch[]
}

export interface MiningDictionaryRecord {
  id: string
  title: string
  revision: string
  format: number
  counts: Record<MiningDictionaryKind, number> & { media: number }
  enabled: Record<MiningDictionaryKind, boolean>
}

export interface MiningDictionaryState {
  available: boolean
  generation: number
  error?: string
  dictionaries: MiningDictionaryRecord[]
  order: Record<MiningDictionaryKind, string[]>
  styles: Record<string, string>
}

export interface MiningDictionaryLookupRequest {
  text: string
  offset: number
  maxResults: number
  scanLength: number
}

export interface MiningDictionaryLookupResult {
  length: number
  entries: MiningDictionaryEntry[]
}

export interface MiningDictionaryImportProgress {
  operationId: string
  fileIndex: number
  fileCount: number
  fileName: string
  dictionary?: string
  phase: string
  completed: number
  total: number
}

export interface MiningDictionaryImportError {
  operationId: string
  fileIndex: number
  fileCount: number
  fileName: string
  code: string
  message: string
}

export type MiningDictionaryEvent =
  | { event: 'importProgress', data: MiningDictionaryImportProgress }
  | { event: 'importError', data: MiningDictionaryImportError }
  | { event: 'stateChanged', data: MiningDictionaryState }
  | { event: 'backendError', data: { message: string } }

export const UNAVAILABLE_MINING_DICTIONARY_STATE: MiningDictionaryState = {
  available: false,
  generation: 0,
  dictionaries: [],
  order: { term: [], frequency: [], pitch: [] },
  styles: {}
}

export interface MiningPopupPosition {
  left: number
  top: number
  width: number
  height: number
  placement: 'above' | 'below'
}

const JAPANESE_PATTERN = /[\u3000-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/
const LOOKUP_TERMINATORS = new Set(' \t\r\n、。！？!?「」『』（）()［］[]｛｝{}〈〉《》【】…‥・,;:')

export function isPartiallyJapanese (text: string): boolean {
  return JAPANESE_PATTERN.test(text)
}

export function getMiningLookupRequest (
  cue: MiningCue,
  selection: Pick<MiningSelection, 'utf16Offset'>,
  scanLength: number,
  scanNonJapaneseText: boolean,
  maxResults: number
): MiningDictionaryLookupRequest | undefined {
  const boundedLength = Math.max(1, Math.min(64, Math.trunc(scanLength) || 1))
  const tail = cue.plainText.slice(selection.utf16Offset)
  let end = 0
  for (const character of tail) {
    if (LOOKUP_TERMINATORS.has(character)) break
    if (end + character.length > boundedLength) break
    end += character.length
  }
  const text = tail.slice(0, end).trim()
  if (!text || (!scanNonJapaneseText && !isPartiallyJapanese(text))) return
  return {
    text: cue.plainText,
    offset: selection.utf16Offset,
    scanLength: boundedLength,
    maxResults: Math.max(1, Math.min(50, Math.trunc(maxResults) || 1))
  }
}

export function calculateMiningPopupPosition (
  anchor: Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom'>,
  viewport: { width: number, height: number },
  requestedWidth: number,
  requestedHeight: number,
  containerOffset: { left: number, top: number } = { left: 0, top: 0 }
): MiningPopupPosition {
  const screenInset = 6
  const selectionGap = 4
  const width = Math.min(Math.max(100, requestedWidth), Math.max(100, viewport.width - screenInset * 2))
  const spaceAbove = anchor.top - screenInset
  const spaceBelow = viewport.height - anchor.bottom - screenInset
  const placement = spaceBelow >= Math.min(requestedHeight, spaceBelow) && (spaceBelow >= requestedHeight || spaceBelow >= spaceAbove)
    ? 'below'
    : 'above'
  const availableHeight = placement === 'below' ? spaceBelow - selectionGap : spaceAbove - selectionGap
  const height = Math.min(Math.max(100, requestedHeight), Math.max(100, availableHeight))
  const viewportLeft = Math.max(
    screenInset,
    Math.min(anchor.left, viewport.width - width - screenInset)
  )
  const viewportTop = placement === 'below'
    ? anchor.bottom + selectionGap
    : anchor.top - selectionGap - height
  return {
    left: viewportLeft - containerOffset.left,
    top: Math.max(screenInset, viewportTop) - containerOffset.top,
    width,
    height,
    placement
  }
}
