/** Secret-free worker entry for bounded document conversion. */

import { parentPort, workerData } from 'node:worker_threads'
import { convertSource } from './knowledge.ts'

interface ConverterWorkerData {
  path: string
}

if (parentPort === null) throw new Error('converter worker requires a parent port')

try {
  const data = workerData as ConverterWorkerData
  const result = await convertSource(data.path)
  parentPort.postMessage({ ok: true, result })
} catch {
  parentPort.postMessage({ ok: false })
}
