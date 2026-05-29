registerProcessor('audio-stream-processor', class AudioStreamProcessor extends AudioWorkletProcessor {
  _chunks: Array<{ channelData: Float32Array[], length: number }> = []
  _offset = 0
  _samplesConsumed = 0
  _reportInterval = Math.round(sampleRate * 0.1) // report every ~100ms
  _step = 1

  constructor () {
    super()
    this.port.onmessage = ({ data }) => {
      if (data.type === 'push') {
        this._chunks.push({ channelData: data.channelData, length: data.channelData[0].length })
      } else if (data.type === 'flush') {
        this._chunks = []
        this._offset = 0
        this._samplesConsumed = 0
      } else if (data.type === 'rate') {
        this._step = Math.max(0.01, data.playbackRate)
      }
    }
  }

  process (_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    try {
      const out = outputs[0]!
      const blockSize = out[0]?.length ?? 128

      for (let c = 0; c < out.length; c++) out[c]!.fill(0)

      let written = 0

      while (written < blockSize && this._chunks.length > 0) {
        const chunk = this._chunks[0]!

        if (this._step === 1) {
          const available = chunk.length - Math.floor(this._offset)
          const n = Math.min(available, blockSize - written)

          for (let c = 0; c < out.length; c++) {
            const src = chunk.channelData[c] ?? chunk.channelData[0]
            if (src) out[c]!.set(src.subarray(Math.floor(this._offset), Math.floor(this._offset) + n), written)
          }

          written += n
          this._offset += n
        } else {
          while (written < blockSize && Math.floor(this._offset) < chunk.length) {
            const idx = Math.min(Math.floor(this._offset), chunk.length - 1)
            const frac = this._offset - idx

            if (frac < 1e-10) {
              for (let c = 0; c < out.length; c++) {
                const src = chunk.channelData[c] ?? chunk.channelData[0]
                if (src) out[c]![written] = src[idx]!
              }
            } else {
              const nextIdx = Math.min(idx + 1, chunk.length - 1)
              for (let c = 0; c < out.length; c++) {
                const src = chunk.channelData[c] ?? chunk.channelData[0]
                if (src) {
                  out[c]![written] = src[idx]! + (src[nextIdx]! - src[idx]!) * frac
                }
              }
            }

            written++
            this._offset += this._step
          }
        }

        if (this._offset >= chunk.length) {
          this._offset -= chunk.length
          this._chunks.shift()
        }
      }

      const inputConsumed = Math.round(written * this._step)
      if (inputConsumed > 0 && this._samplesConsumed + inputConsumed > this._samplesConsumed) {
        this._samplesConsumed += inputConsumed

        if (this._samplesConsumed % this._reportInterval < inputConsumed) {
          this.port.postMessage({ type: 'progress', samplesConsumed: this._samplesConsumed })
        }
      }
    } catch {}

    return true
  }
})
