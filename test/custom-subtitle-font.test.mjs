import assert from 'node:assert/strict'
import test from 'node:test'

import { fontFamilyFromData, fontFamilyFromFilename } from '../src/lib/components/ui/player/custom-subtitle-font.ts'

test('derives an editable font family from a custom font filename', () => {
  assert.equal(fontFamilyFromFilename('NotoSansJP-Bold.ttf'), 'NotoSansJP Bold')
  assert.equal(fontFamilyFromFilename('My_Custom Font.otf'), 'My Custom Font')
  assert.equal(fontFamilyFromFilename('font-without-extension'), 'font without extension')
})

function fontWithNames (names) {
  const encoded = names.map(({ value }) => Uint8Array.from(Array.from(new TextEncoder().encode(value)).flatMap(byte => [0, byte])))
  const stringsLength = encoded.reduce((total, value) => total + value.length, 0)
  const data = new Uint8Array(12 + 16 + 6 + 12 * names.length + stringsLength)
  const view = new DataView(data.buffer)
  view.setUint16(4, 1)
  data.set(new TextEncoder().encode('name'), 12)
  view.setUint32(20, 28)
  view.setUint32(24, 6 + 12 * names.length + stringsLength)
  view.setUint16(30, names.length)
  view.setUint16(32, 6 + 12 * names.length)

  let stringOffset = 0
  for (let index = 0; index < names.length; index++) {
    const recordOffset = 34 + index * 12
    view.setUint16(recordOffset, 3)
    view.setUint16(recordOffset + 2, 1)
    view.setUint16(recordOffset + 4, 0x409)
    view.setUint16(recordOffset + 6, names[index].id)
    view.setUint16(recordOffset + 8, encoded[index].length)
    view.setUint16(recordOffset + 10, stringOffset)
    data.set(encoded[index], 28 + 6 + 12 * names.length + stringOffset)
    stringOffset += encoded[index].length
  }
  return data
}

test('reads a typographic family when it is the only available name', () => {
  assert.equal(fontFamilyFromData(fontWithNames([{ id: 16, value: 'Klee One' }])), 'Klee One')
})

test('prefers the legacy family used by libass over a typographic family', () => {
  assert.equal(fontFamilyFromData(fontWithNames([
    { id: 16, value: 'Klee One' },
    { id: 1, value: 'Klee One SemiBold' }
  ])), 'Klee One SemiBold')
})
