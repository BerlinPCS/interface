import { get, set } from 'idb-keyval'

export const CUSTOM_SUBTITLE_FONT_KEY = 'custom-subtitle-font-v1'

interface StoredCustomSubtitleFont {
  data: ArrayBuffer
  filename: string
  type: string
}

export interface CustomSubtitleFont {
  data: Uint8Array
  family?: string
  type: string
}

export function fontFamilyFromFilename (filename: string): string {
  const withoutExtension = filename.replace(/\.[^.]+$/, '')
  return withoutExtension.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function decodeFontName (data: Uint8Array, platformId: number): string | undefined {
  try {
    if (platformId === 0 || platformId === 3) {
      if (data.byteLength % 2) return
      let result = ''
      for (let index = 0; index < data.byteLength; index += 2) {
        result += String.fromCharCode((data[index]! << 8) | data[index + 1]!)
      }
      return result.replace(/\0/g, '').trim() || undefined
    }
    return new TextDecoder('latin1').decode(data).replace(/\0/g, '').trim() || undefined
  } catch {
    return undefined
  }
}

export function fontFamilyFromData (data: Uint8Array): string | undefined {
  if (data.byteLength < 12) return
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const tableCount = view.getUint16(4)
  let nameOffset: number | undefined
  let nameLength = 0

  for (let index = 0; index < tableCount; index++) {
    const recordOffset = 12 + index * 16
    if (recordOffset + 16 > data.byteLength) return
    const tag = String.fromCharCode(...data.subarray(recordOffset, recordOffset + 4))
    if (tag !== 'name') continue
    nameOffset = view.getUint32(recordOffset + 8)
    nameLength = view.getUint32(recordOffset + 12)
    break
  }

  if (nameOffset === undefined || nameOffset + 6 > data.byteLength || nameOffset + nameLength > data.byteLength) return
  const recordCount = view.getUint16(nameOffset + 2)
  const stringsOffset = nameOffset + view.getUint16(nameOffset + 4)
  const candidates: Array<{ value: string, score: number }> = []

  for (let index = 0; index < recordCount; index++) {
    const recordOffset = nameOffset + 6 + index * 12
    if (recordOffset + 12 > nameOffset + nameLength) break
    const platformId = view.getUint16(recordOffset)
    const languageId = view.getUint16(recordOffset + 4)
    const nameId = view.getUint16(recordOffset + 6)
    if (nameId !== 1 && nameId !== 16) continue
    const length = view.getUint16(recordOffset + 8)
    const offset = stringsOffset + view.getUint16(recordOffset + 10)
    if (offset + length > nameOffset + nameLength) continue
    const value = decodeFontName(data.subarray(offset, offset + length), platformId)
    if (!value) continue
    // libass/Fontconfig matches the legacy family (name ID 1). Some fonts,
    // including Klee One, expose a different typographic family (name ID 16)
    // which libass does not associate with the embedded face.
    const score = (nameId === 1 ? 100 : 0) + (platformId === 3 ? 20 : platformId === 0 ? 10 : 0) + (languageId === 0x409 ? 5 : 0)
    candidates.push({ value, score })
  }

  return candidates.sort((a, b) => b.score - a.score)[0]?.value
}

export async function saveCustomSubtitleFont (file: File): Promise<string> {
  const data = await file.arrayBuffer()
  const stored: StoredCustomSubtitleFont = {
    data,
    filename: file.name,
    type: file.type
  }
  await set(CUSTOM_SUBTITLE_FONT_KEY, stored)
  return fontFamilyFromData(new Uint8Array(data)) ?? fontFamilyFromFilename(file.name)
}

export async function loadCustomSubtitleFont (): Promise<CustomSubtitleFont | undefined> {
  try {
    const stored = await get<StoredCustomSubtitleFont>(CUSTOM_SUBTITLE_FONT_KEY)
    if (!stored?.data || !(stored.data instanceof ArrayBuffer)) return
    const data = new Uint8Array(stored.data)
    return { data, family: fontFamilyFromData(data), type: stored.type }
  } catch {
    return undefined
  }
}
