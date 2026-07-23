import assert from 'node:assert/strict'
import test from 'node:test'

import { toHoshiPopupEntry } from '../src/lib/modules/mining-popup-adapter.ts'

test('adapts a Hayase result to the Android Hoshi popup contract', () => {
  const source = {
    expression: '食べる',
    reading: 'たべる',
    matched: '食べさせられました',
    deinflected: '食べる',
    trace: [
      { name: 'polite past', description: '食べさせられました → 食べさせられる' },
      { name: 'causative passive', description: '食べさせられる → 食べる' }
    ],
    rules: ['v1', 'v1'],
    glossaries: [{
      dictionary: 'JMdict',
      content: '[{"type":"structured-content","content":"to eat"}]',
      definitionTags: 'v1',
      termTags: 'common'
    }],
    frequencies: [{
      dictionary: 'Frequency',
      frequencies: [{ value: 10, displayValue: '10' }]
    }],
    pitches: [{
      dictionary: 'Pitch',
      pitchPositions: [2, 2],
      transcriptions: ['ta.be.ɾɯ', 'ta.be.ɾɯ']
    }]
  }

  assert.deepEqual(toHoshiPopupEntry(source), {
    expression: '食べる',
    reading: 'たべる',
    matched: '食べさせられました',
    deinflectionTraceRows: [[
      { name: 'causative passive', description: '食べさせられる → 食べる' },
      { name: 'polite past', description: '食べさせられました → 食べさせられる' }
    ]],
    rules: ['v1'],
    glossaries: source.glossaries,
    frequencies: source.frequencies,
    pitches: [{
      dictionary: 'Pitch',
      pitchPositions: [2],
      transcriptions: ['ta.be.ɾɯ']
    }]
  })
})

test('does not expose mutable backend arrays to the popup runtime', () => {
  const source = {
    expression: '語',
    reading: 'ご',
    matched: '語',
    deinflected: '語',
    trace: [],
    rules: [],
    glossaries: [],
    frequencies: [],
    pitches: []
  }
  const adapted = toHoshiPopupEntry(source)
  adapted.rules.push('n')
  assert.deepEqual(source.rules, [])
})
