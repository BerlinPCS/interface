import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { firstWindowOffset, matchSubtitleWindows } from '../src/lib/components/ui/player/subtitle-matcher.ts'

const source = await readFile(new URL('../src/lib/components/ui/player/subtitle-timing.worker.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }, transformers: { before: [() => node => ts.factory.updateSourceFile(node, node.statements.filter(statement => !ts.isImportDeclaration(statement)))] } }).outputText.replace('export {};', '')
test('worker preserves rejected per-reference evidence for diagnostics', () => {
  let response
  const self = { postMessage: result => { response = result } }
  vm.runInNewContext(compiled, { self, matchSubtitleWindows, firstWindowOffset })
  const cues = [2, 5.4, 11.7, 16.1, 24, 31.3, 38.8, 47, 54.9].map(start => ({ start, end: start + 1.3 }))
  self.onmessage({ data: { id: 7, references: [[{ id: 'first', start: 0, end: 60, cues }]], candidates: [{ id: 'sub', cues: cues.map(cue => ({ start: cue.start + 5, end: cue.end + 5 })) }] } })
  assert.equal(response.id, 7)
  const result = response.results[0]
  assert.equal(result.accepted, false)
  assert.equal(result.references[0].reason, 'insufficient-evidence')
  assert.equal(result.references[0].windows[0].offset, -5)
  assert.equal(result.references[0].windows[0].pairs.length, cues.length)
})
