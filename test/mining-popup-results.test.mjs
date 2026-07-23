import assert from 'node:assert/strict'
import test from 'node:test'

import { MiningPopupResultRegistry } from '../src/lib/modules/mining-popup-results.ts'

function entry (expression) {
  return {
    expression,
    reading: expression,
    matched: expression,
    deinflected: expression,
    trace: [],
    rules: [],
    glossaries: [],
    frequencies: [],
    pitches: []
  }
}

test('render data sends only the first entry and serves later entries lazily', () => {
  const registry = new MiningPopupResultRegistry('popup')
  const render = registry.replace([entry('一'), entry('二'), entry('三')])
  assert.equal(render.entryCount, 3)
  assert.equal(render.initialEntry?.expression, '一')
  assert.equal(Object.hasOwn(render, 'entries'), false)
  assert.equal(registry.entry(render.resultSetId, 2)?.expression, '三')
})

test('redirect result sets coexist until a new root lookup replaces them', () => {
  const registry = new MiningPopupResultRegistry('popup')
  const root = registry.replace([entry('root')])
  const redirect = registry.add([entry('redirect')])
  assert.equal(registry.has(root.resultSetId), true)
  assert.equal(registry.has(redirect.resultSetId), true)
  registry.replace([entry('replacement')])
  assert.equal(registry.has(root.resultSetId), false)
  assert.equal(registry.has(redirect.resultSetId), false)
})
