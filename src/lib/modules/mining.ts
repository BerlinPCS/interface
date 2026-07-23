export const DEFAULT_MINING_SUBTITLE_CSS = `font-family: "Klee One SemiBold", "Noto Sans JP", sans-serif;
font-size: 3rem;
font-weight: 700;
line-height: 1.35;
color: #ffffff;
text-shadow: 0 2px 4px #000000, 0 0 8px #000000;
padding: 0.35em 0.65em;
border-radius: 0.3em;
--mining-selection-color: #facc15;`

export interface MiningCue {
  id: string
  trackId: string
  start: number
  end: number
  readOrder: number
  style?: string
  speaker?: string
  rawText: string
  plainText: string
}

export interface MiningSelection {
  cueId: string
  utf16Offset: number
  utf16Length: number
  anchor: DOMRect
}

export interface MiningGrapheme {
  text: string
  utf16Offset: number
  utf16Length: number
  lineBreak: boolean
  whitespace: boolean
}

export interface MiningPlaybackSession {
  wasPlaying: boolean
  autoPaused: boolean
}

interface AssEventFormat {
  fields: string[]
  start: number
  end: number
  style: number
  name: number
  text: number
}

const DEFAULT_ASS_EVENT_FORMAT: AssEventFormat = {
  fields: ['layer', 'start', 'end', 'style', 'name', 'marginl', 'marginr', 'marginv', 'effect', 'text'],
  start: 1,
  end: 2,
  style: 3,
  name: 4,
  text: 9
}

const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: '\u00a0',
  quot: '"'
}

function parseTimestamp (value: string): number | undefined {
  const match = value.trim().match(/^(\d+):(\d{1,2}):(\d{1,2})(?:[.,](\d+))?$/)
  if (!match) return
  const fraction = match[4] ? Number(`0.${match[4]}`) : 0
  const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + fraction
  return Number.isFinite(seconds) ? seconds : undefined
}

function splitAssFields (value: string, count: number): string[] | undefined {
  if (count < 1) return
  const fields: string[] = []
  let start = 0
  for (let index = 1; index < count; ++index) {
    const comma = value.indexOf(',', start)
    if (comma === -1) return
    fields.push(value.slice(start, comma))
    start = comma + 1
  }
  fields.push(value.slice(start))
  return fields
}

function parseAssEventFormat (line: string): AssEventFormat | undefined {
  const match = line.match(/^\s*Format\s*:\s*(.*)$/i)
  if (!match) return
  const fields = match[1]!.split(',').map(field => field.trim().toLowerCase())
  const start = fields.indexOf('start')
  const end = fields.indexOf('end')
  const text = fields.indexOf('text')
  if (start === -1 || end === -1 || text === -1) return
  return {
    fields,
    start,
    end,
    text,
    style: fields.indexOf('style'),
    name: fields.indexOf('name')
  }
}

function decodeHtmlEntities (value: string) {
  return value.replace(/&(#(?:x[\da-f]+|\d+)|[a-z]+);/gi, (entity, key: string) => {
    if (key[0] === '#') {
      const hexadecimal = key[1]?.toLowerCase() === 'x'
      const codePoint = Number.parseInt(key.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10)
      if (Number.isFinite(codePoint)) {
        try {
          return String.fromCodePoint(codePoint)
        } catch {}
      }
      return entity
    }
    return HTML_ENTITIES[key.toLowerCase()] ?? entity
  })
}

export function extractMiningPlainText (rawText: string): string {
  let drawingScale = 0
  let visible = ''
  let cursor = 0
  const overrides = /\{([^{}]*)\}/g

  for (const match of rawText.matchAll(overrides)) {
    const index = match.index ?? cursor
    if (drawingScale === 0) visible += rawText.slice(cursor, index)
    for (const drawing of match[1]!.matchAll(/\\p(\d+)/gi)) drawingScale = Number(drawing[1]) || 0
    cursor = index + match[0].length
  }
  if (drawingScale === 0) visible += rawText.slice(cursor)

  return decodeHtmlEntities(visible)
    .replace(/<[^>]*>/g, '')
    .replace(/\\[Nn]/g, '\n')
    .replace(/\\h/g, '\u00a0')
    .trim()
}

function cueId (trackId: string, start: number, end: number, readOrder: number, rawText: string) {
  return `${trackId}:${start}:${end}:${readOrder}:${rawText}`
}

export function createMiningCue (cue: Omit<MiningCue, 'id' | 'plainText'>): MiningCue | undefined {
  const plainText = extractMiningPlainText(cue.rawText)
  if (!plainText || !Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.end <= cue.start) return
  return {
    ...cue,
    id: cueId(cue.trackId, cue.start, cue.end, cue.readOrder, cue.rawText),
    plainText
  }
}

export function parseAssMiningCues (content: string, trackId: string): MiningCue[] {
  const cues: MiningCue[] = []
  let inEvents = false
  let format: AssEventFormat | undefined
  let readOrder = 0

  for (const line of content.split(/\r?\n|\r/)) {
    const section = line.match(/^\s*\[([^\]]+)]\s*$/)
    if (section) {
      inEvents = section[1]!.trim().toLowerCase() === 'events'
      format = inEvents ? DEFAULT_ASS_EVENT_FORMAT : undefined
      continue
    }
    if (!inEvents) continue

    format = parseAssEventFormat(line) ?? format
    const dialogue = line.match(/^\s*Dialogue\s*:\s*(.*)$/i)
    if (!dialogue || !format) continue
    const fields = splitAssFields(dialogue[1]!, format.fields.length)
    if (!fields) continue
    const start = parseTimestamp(fields[format.start]!)
    const end = parseTimestamp(fields[format.end]!)
    if (start === undefined || end === undefined) continue
    const cue = createMiningCue({
      trackId,
      start,
      end,
      readOrder: readOrder++,
      style: format.style >= 0 ? fields[format.style]?.trim() || undefined : undefined,
      speaker: format.name >= 0 ? fields[format.name]?.trim() || undefined : undefined,
      rawText: fields[format.text] ?? ''
    })
    if (cue) cues.push(cue)
  }

  return cues
}

export function sortAndDeduplicateMiningCues (cues: MiningCue[]): MiningCue[] {
  const unique = new Map<string, MiningCue>()
  for (const cue of cues) unique.set(cue.id, cue)
  return [...unique.values()]
    .map((cue, insertionOrder) => ({ cue, insertionOrder }))
    .sort((a, b) =>
      a.cue.start - b.cue.start ||
      a.cue.readOrder - b.cue.readOrder ||
      a.insertionOrder - b.insertionOrder
    )
    .map(({ cue }) => cue)
}

export function findMiningCueAt (cues: MiningCue[], time: number): MiningCue | undefined {
  const active = findActiveMiningCues(cues, time)[0]
  if (active) return active

  for (let index = cues.length - 1; index >= 0; --index) {
    const cue = cues[index]
    if (cue && cue.end <= time) return cue
  }
  return cues.find(cue => cue.start >= time)
}

export function findActiveMiningCues (cues: MiningCue[], time: number): MiningCue[] {
  return cues
    .filter(cue => cue.start <= time && time < cue.end)
    .sort((a, b) => b.start - a.start || a.readOrder - b.readOrder)
}

export function navigateMiningCue (cues: MiningCue[], currentId: string | undefined, direction: -1 | 1, time?: number): MiningCue | undefined {
  if (!cues.length) return
  const currentIndex = cues.findIndex(cue => cue.id === currentId)
  if (currentIndex === -1) {
    if (time === undefined) return cues[0]
    if (direction === 1) return cues.find(cue => cue.start >= time)
    for (let index = cues.length - 1; index >= 0; --index) {
      const cue = cues[index]
      if (cue && cue.end <= time) return cue
    }
    return
  }
  return cues[Math.max(0, Math.min(cues.length - 1, currentIndex + direction))]
}

export function miningCueSeekTime (cue: MiningCue, subtitleDelay: number): number {
  return Math.max(0, cue.start - subtitleDelay)
}

export function beginMiningPlaybackSession (paused: boolean, pauseOnEnter: boolean): MiningPlaybackSession {
  return {
    wasPlaying: !paused,
    autoPaused: pauseOnEnter && !paused
  }
}

export function shouldResumeAfterMining (session: MiningPlaybackSession | undefined): boolean {
  return !!session?.wasPlaying
}

export function segmentMiningGraphemes (text: string): MiningGrapheme[] {
  const segmenter = typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : undefined
  const segments = segmenter
    ? [...segmenter.segment(text)].map(segment => ({ text: segment.segment, index: segment.index }))
    : Array.from(text, (segment, index) => ({
      text: segment,
      index: Array.from(text).slice(0, index).join('').length
    }))

  return segments.map(({ text: segment, index }) => ({
    text: segment,
    utf16Offset: index,
    utf16Length: segment.length,
    lineBreak: segment === '\n' || segment === '\r' || segment === '\r\n',
    whitespace: /^\s+$/u.test(segment)
  }))
}
