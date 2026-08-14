/** CPU topology/unwrap stage used by the WebGPU composition compiler. */
import { parentPort, workerData } from 'node:worker_threads'
import { tsImport } from 'tsx/esm/api'

if (!parentPort) throw new Error('granite prepare worker requires a parent port')
const { prepareAssetFor } = await tsImport('./topology.ts', import.meta.url)
const request = workerData
parentPort.postMessage(prepareAssetFor(
  request.seed,
  request.cells,
  request.atlas,
  { diagnostics: false },
))
