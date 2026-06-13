/*!
 * Copyright (c) 2026-present, Vanilagy and contributors
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * The WASM binary embedded in the generated .js file is derived from FFmpeg
 * (https://ffmpeg.org) and is licensed under the GNU Lesser General Public
 * License v2.1 or later. Source and build instructions:
 * https://github.com/ThaUnknown/mediabunny/tree/main/packages
 */

import createModule from './flac.js'

import type { WorkerCommand, WorkerResponse, WorkerResponseData } from './shared'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExtendedEmscriptenModule = any

let module: ExtendedEmscriptenModule
let modulePromise: Promise<ExtendedEmscriptenModule> | null = null

// Decoder functions
let initDecoderFn: () => number
let configureDecodePacketFn: (ctx: number, size: number) => number
let decodePacketFn: (ctx: number, size: number) => number
let getPcmDataFn: (ctx: number) => number
let getPcmSizeFn: (ctx: number) => number
let getDecodedChannelsFn: (ctx: number) => number
let getDecodedSampleRateFn: (ctx: number) => number
let getDecodedBitsPerSampleFn: (ctx: number) => number
// sampleCount no longer needed from the bridge
let getDecodeErrorFn: (ctx: number) => number
let flushDecoderFn: (ctx: number) => void
let closeDecoderFn: (ctx: number) => void

const ensureModule = async () => {
  if (!module) {
    if (modulePromise) {
      return await modulePromise
    }

    modulePromise = createModule() as Promise<ExtendedEmscriptenModule>
    module = await modulePromise
    modulePromise = null

    // Decoder functions
    initDecoderFn = module.cwrap('init_decoder', 'number', [])
    configureDecodePacketFn = module.cwrap('configure_decode_packet', 'number', ['number', 'number'])
    decodePacketFn = module.cwrap('decode_packet', 'number', ['number', 'number'])
    getPcmDataFn = module.cwrap('get_pcm_data', 'number', ['number'])
    getPcmSizeFn = module.cwrap('get_pcm_size', 'number', ['number'])
    getDecodedChannelsFn = module.cwrap('get_decoded_channels', 'number', ['number'])
    getDecodedSampleRateFn = module.cwrap('get_decoded_sample_rate', 'number', ['number'])
    getDecodedBitsPerSampleFn = module.cwrap('get_decoded_bits_per_sample', 'number', ['number'])
    // no-op: bridge no longer exposes sample count
    getDecodeErrorFn = module.cwrap('get_decode_error', 'number', ['number'])
    flushDecoderFn = module.cwrap('flush_decoder', 'void', ['number'])
    closeDecoderFn = module.cwrap('close_decoder', 'void', ['number'])
  }
}

const initDecoder = async () => {
  await ensureModule()

  const ctx = initDecoderFn()
  if (ctx === 0) {
    throw new Error('Failed to initialize FLAC decoder.')
  }

  return { ctx }
}

const decode = (ctx: number, encodedData: ArrayBuffer) => {
  const encodedBytes = new Uint8Array(encodedData)

  // Allocate buffer in WASM memory
  const bufPtr = configureDecodePacketFn(ctx, encodedBytes.length)
  if (bufPtr === 0) {
    throw new Error('Failed to allocate decoder buffer.')
  }

  // Copy encoded data to WASM memory
  module.HEAPU8.set(encodedBytes, bufPtr)

  // Decode the packet
  const ret = decodePacketFn(ctx, encodedBytes.length)
  if (ret < 0) {
    const error = getDecodeErrorFn(ctx)
    throw new Error(`Decode failed with error code ${ret} (decoder error: ${error}).`)
  }

  // Get PCM data
  const pcmPtr = getPcmDataFn(ctx)
  const pcmSize = getPcmSizeFn(ctx)
  const channels = getDecodedChannelsFn(ctx)
  const sampleRate = getDecodedSampleRateFn(ctx)
  const bitsPerSample = getDecodedBitsPerSampleFn(ctx)
  // bridge no longer provides sample count; it's not required by caller
  const pcmData = module.HEAPU8.slice(pcmPtr, pcmPtr + pcmSize).buffer

  return {
    pcmData,
    channels,
    sampleRate,
    bitsPerSample
  }
}

const onMessage = (data: { id: number, command: WorkerCommand }) => {
  const { id, command } = data

  const handleCommand = async (): Promise<void> => {
    try {
      let result: WorkerResponseData
      const transferables: Transferable[] = []

      switch (command.type) {
        case 'init-decoder': {
          const { ctx } = await initDecoder()
          result = { type: command.type, ctx }
        } break

        case 'decode': {
          const decoded = decode(
            command.data.ctx,
            command.data.encodedData
          )
          result = {
            type: command.type,
            pcmData: decoded.pcmData,
            channels: decoded.channels,
            sampleRate: decoded.sampleRate,
            bitsPerSample: decoded.bitsPerSample
          }
          transferables.push(result.pcmData)
        } break

        case 'flush-decoder':
          flushDecoderFn(command.data.ctx)
          result = { type: command.type }
          break

        case 'close-decoder':
          closeDecoderFn(command.data.ctx)
          result = { type: command.type }
          break
      }

      const response: WorkerResponse = {
        id,
        success: true,
        data: result!
      }
      sendMessage(response, transferables)
    } catch (error: unknown) {
      const response: WorkerResponse = {
        id,
        success: false,
        error
      }
      sendMessage(response)
    }
  }

  handleCommand()
}

const sendMessage = (data: unknown, transfer: Transferable[] = []) => self.postMessage(data, { transfer })

self.addEventListener('message', event => onMessage(event.data as { id: number, command: WorkerCommand }))
