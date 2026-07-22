export interface SubtitleCue {
  start: number
  end: number
}

export interface SubtitleAlignment {
  offset: number
}

const RESOLUTION = 0.1
const MAX_OFFSET = 120
const MIN_REFERENCE_CUES = 4
const MIN_SCORE = 0.3
const ONSET_TOLERANCE = 0.8

function parseTimestamp (value: string): number | undefined {
  const match = value.trim().match(/^(\d+):(\d{1,2}):(\d{1,2})(?:[.,](\d+))?$/)
  if (!match) return

  const fraction = match[4] ? Number(`0.${match[4]}`) : 0
  const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + fraction
  if (!Number.isFinite(seconds)) return
  return seconds
}

function formatTimestamp (seconds: number): string {
  const centiseconds = Math.max(0, Math.round(seconds * 100))
  const hours = Math.floor(centiseconds / 360000)
  const minutes = Math.floor(centiseconds / 6000) % 60
  const secs = Math.floor(centiseconds / 100) % 60
  const fraction = centiseconds % 100
  return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${fraction.toString().padStart(2, '0')}`
}

function splitFields (value: string, count: number): string[] | undefined {
  if (count < 1) return

  const fields: string[] = []
  let start = 0
  for (let i = 1; i < count; ++i) {
    const comma = value.indexOf(',', start)
    if (comma === -1) return
    fields.push(value.slice(start, comma))
    start = comma + 1
  }
  fields.push(value.slice(start))
  return fields
}

function replacePreservingWhitespace (value: string, replacement: string): string {
  const leading = value.match(/^\s*/)?.[0] ?? ''
  const trailing = value.match(/\s*$/)?.[0] ?? ''
  return leading + replacement + trailing
}

interface EventFormat {
  fields: string[]
  start: number
  end: number
}

const DEFAULT_EVENT_FORMAT: EventFormat = {
  fields: ['layer', 'start', 'end', 'style', 'name', 'marginl', 'marginr', 'marginv', 'effect', 'text'],
  start: 1,
  end: 2
}

function eventFormat (line: string): EventFormat | undefined {
  const match = line.match(/^\s*Format\s*:\s*(.*)$/i)
  if (!match) return

  const fields = match[1]!.split(',').map(field => field.trim().toLowerCase())
  const start = fields.indexOf('start')
  const end = fields.indexOf('end')
  if (start === -1 || end === -1) return
  return { fields, start, end }
}

export function parseAssCues (header: string): SubtitleCue[] {
  const cues: SubtitleCue[] = []
  let inEvents = false
  let format: EventFormat | undefined

  for (const line of header.split(/\r?\n|\r/)) {
    const section = line.match(/^\s*\[([^\]]+)]\s*$/)
    if (section) {
      inEvents = section[1]!.trim().toLowerCase() === 'events'
      format = inEvents ? DEFAULT_EVENT_FORMAT : undefined
      continue
    }
    if (!inEvents) continue

    format = eventFormat(line) ?? format
    const dialogue = line.match(/^\s*Dialogue\s*:\s*(.*)$/i)
    if (!dialogue || !format) continue

    const fields = splitFields(dialogue[1]!, format.fields.length)
    if (!fields) continue
    const start = parseTimestamp(fields[format.start]!)
    const end = parseTimestamp(fields[format.end]!)
    if (start === undefined || end === undefined || end <= start) continue
    cues.push({ start, end })
  }

  return cues
}

export function shiftAssDialogue (header: string, offset: number): string {
  let inEvents = false
  let format: EventFormat | undefined
  const parts = header.split(/(\r\n|\n|\r)/)

  for (let i = 0; i < parts.length; i += 2) {
    const line = parts[i]!
    const section = line.match(/^\s*\[([^\]]+)]\s*$/)
    if (section) {
      inEvents = section[1]!.trim().toLowerCase() === 'events'
      format = inEvents ? DEFAULT_EVENT_FORMAT : undefined
      continue
    }
    if (!inEvents) continue

    format = eventFormat(line) ?? format
    const dialogue = line.match(/^(\s*Dialogue\s*:\s*)(.*)$/i)
    if (!dialogue || !format) continue

    const fields = splitFields(dialogue[2]!, format.fields.length)
    if (!fields) continue
    const start = parseTimestamp(fields[format.start]!)
    const end = parseTimestamp(fields[format.end]!)
    if (start === undefined || end === undefined || end <= start) continue

    fields[format.start] = replacePreservingWhitespace(fields[format.start]!, formatTimestamp(start + offset))
    fields[format.end] = replacePreservingWhitespace(fields[format.end]!, formatTimestamp(end + offset))
    parts[i] = dialogue[1]! + fields.join(',')
  }

  return parts.join('')
}

export function shouldAttemptSubtitleAlignment (cueCount: number): boolean {
  if (cueCount < MIN_REFERENCE_CUES) return false
  if (cueCount <= 16) return cueCount % 4 === 0
  if (cueCount <= 32) return cueCount % 8 === 0
  if (cueCount <= 64) return cueCount % 16 === 0
  return cueCount % 32 === 0
}

export function findSubtitleAlignment (referenceCues: SubtitleCue[], targetCues: SubtitleCue[]): SubtitleAlignment | undefined {
  if (referenceCues.length < MIN_REFERENCE_CUES || targetCues.length < MIN_REFERENCE_CUES) return

  const referenceTicks = referenceCues.map(cue => Math.round(cue.start / RESOLUTION))
  const targetTicks = new Set(targetCues.map(cue => Math.round(cue.start / RESOLUTION)))
  const maxOffsetTicks = Math.round(MAX_OFFSET / RESOLUTION)
  const toleranceTicks = Math.round(ONSET_TOLERANCE / RESOLUTION)
  let best = { offsetTicks: 0, score: -Infinity }

  for (let offsetTicks = -maxOffsetTicks; offsetTicks <= maxOffsetTicks; ++offsetTicks) {
    let score = 0
    for (const referenceTick of referenceTicks) {
      const expectedTargetTick = referenceTick - offsetTicks
      for (let distance = 0; distance <= toleranceTicks; ++distance) {
        if (targetTicks.has(expectedTargetTick - distance) || targetTicks.has(expectedTargetTick + distance)) {
          score += 1 - distance / (toleranceTicks + 1)
          break
        }
      }
    }
    const candidate = { offsetTicks, score: score / referenceTicks.length }
    if (candidate.score > best.score || (candidate.score === best.score && Math.abs(candidate.offsetTicks) < Math.abs(best.offsetTicks))) {
      best = candidate
    }
  }

  if (best.score < MIN_SCORE) return

  return { offset: best.offsetTicks * RESOLUTION }
}
