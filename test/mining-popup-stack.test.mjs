import assert from 'node:assert/strict'
import test from 'node:test'

import {
  appendNestedPopup,
  closeNestedChildren,
  dismissNestedPopup,
  MAX_NESTED_POPUP_DEPTH
} from '../src/lib/modules/mining/popup/stack.ts'

const children = ['child-1', 'child-2', 'child-3']

test('reselecting or scrolling a popup removes only its descendants', () => {
  assert.deepEqual(closeNestedChildren(children, 0), [])
  assert.deepEqual(closeNestedChildren(children, 1), ['child-1'])
  assert.deepEqual(closeNestedChildren(children, 2), ['child-1', 'child-2'])
})

test('dismissing a child returns to its immediate parent', () => {
  assert.deepEqual(dismissNestedPopup(children, 1), [])
  assert.deepEqual(dismissNestedPopup(children, 2), ['child-1'])
  assert.deepEqual(dismissNestedPopup(children, 3), ['child-1', 'child-2'])
})

test('a new child replaces the selected parent popup descendants', () => {
  assert.deepEqual(appendNestedPopup(children, 0, 'replacement'), ['replacement'])
  assert.deepEqual(appendNestedPopup(children, 1, 'replacement'), ['child-1', 'replacement'])
  assert.deepEqual(appendNestedPopup(children, MAX_NESTED_POPUP_DEPTH, 'too-deep'), children)
})
