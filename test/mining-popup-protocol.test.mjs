import assert from 'node:assert/strict'
import test from 'node:test'

import {
  makeMiningPopupHostMessage,
  MINING_POPUP_MESSAGE_SOURCE,
  MINING_POPUP_PROTOCOL_VERSION,
  parseMiningPopupFrameMessage
} from '../src/lib/modules/mining-popup-protocol.ts'

const nonce = 'frame-nonce'
const base = {
  source: MINING_POPUP_MESSAGE_SOURCE,
  version: MINING_POPUP_PROTOCOL_VERSION,
  nonce
}

test('accepts valid frame lifecycle and request messages', () => {
  assert.deepEqual(parseMiningPopupFrameMessage({ ...base, type: 'ready' }, nonce), { ...base, type: 'ready' })
  assert.deepEqual(parseMiningPopupFrameMessage({
    ...base,
    type: 'request',
    popupId: 'popup-1',
    resultSetId: 'results-1',
    requestId: 'request-1',
    method: 'getEntry',
    payload: 3
  }, nonce)?.method, 'getEntry')
  assert.equal(parseMiningPopupFrameMessage({
    ...base,
    type: 'request',
    popupId: 'popup-1',
    resultSetId: 'results-1',
    requestId: 'request-2',
    method: 'resolveAudioSource',
    payload: 'https://audio.test'
  }, nonce)?.method, 'resolveAudioSource')
})

test('rejects wrong versions, nonces, methods, and malformed selections', () => {
  assert.equal(parseMiningPopupFrameMessage({ ...base, version: 2, type: 'ready' }, nonce), undefined)
  assert.equal(parseMiningPopupFrameMessage({ ...base, nonce: 'spoofed', type: 'ready' }, nonce), undefined)
  assert.equal(parseMiningPopupFrameMessage({
    ...base,
    type: 'request',
    popupId: 'popup-1',
    resultSetId: 'results-1',
    requestId: 'request-1',
    method: 'readFile',
    payload: '/'
  }, nonce), undefined)
  assert.equal(parseMiningPopupFrameMessage({
    ...base,
    type: 'selectionChanged',
    popupId: 'popup-1',
    selection: {
      text: '語',
      sentence: '日本語',
      rect: { x: 0, y: 0, width: 0, height: 10 }
    }
  }, nonce), undefined)
})

test('constructs host messages with the protocol envelope', () => {
  assert.deepEqual(makeMiningPopupHostMessage(nonce, {
    type: 'reset',
    popupId: 'popup-1'
  }), {
    ...base,
    type: 'reset',
    popupId: 'popup-1'
  })
})
