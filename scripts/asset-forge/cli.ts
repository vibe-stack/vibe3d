#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { runFastPreview } from './preview.ts'

function required(value: string | undefined, option: string): string {
  if (!value) throw new Error(`${option} is required`)
  return value
}

async function flushOutput(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    process.stdout.write('', (error) => (error ? reject(error) : resolve()))
  })
  await new Promise<void>((resolve, reject) => {
    process.stderr.write('', (error) => (error ? reject(error) : resolve()))
  })
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    options: {
      module: { type: 'string' },
      asset: { type: 'string' },
      export: { type: 'string', default: 'createModel' },
      output: { type: 'string' },
      reference: { type: 'string' },
      width: { type: 'string', default: '1024' },
      height: { type: 'string', default: '1024' },
      time: { type: 'string', default: '0' },
      yaw: { type: 'string', default: '0' },
      pitch: { type: 'string', default: '10' },
      backend: { type: 'string' },
      adapter: { type: 'string' },
    },
    allowPositionals: true,
    strict: true,
  })

  if (positionals[0] !== 'preview') {
    throw new Error('Usage: bun run asset:forge preview --module <model.ts> [--reference <image>]')
  }

  const report = await runFastPreview(process.cwd(), {
    module: required(values.module, '--module'),
    exportName: values.export,
    asset: values.asset,
    output: values.output,
    reference: values.reference,
    width: values.width,
    height: values.height,
    time: values.time,
    yaw: values.yaw,
    pitch: values.pitch,
    backend: values.backend,
    adapter: values.adapter,
  })
  const payload = JSON.stringify({ ok: true, command: 'preview', ...report })
  console.log(payload)
  console.error(
    `preview: ${report.asset} · iteration ${String(report.iteration).padStart(3, '0')}\n`
    + `${report.output}\n`
    + `${report.renderPath} · ${report.drawCalls} draw call(s) · ${report.triangles} triangle(s) · ${report.durationMs} ms`,
  )

  await flushOutput()
  await new Promise<void>((resolve) => setTimeout(resolve, 50))
  process.exit(0)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.log(JSON.stringify({ ok: false, error: message }))
  console.error(`asset:forge: ${message}`)
  process.exitCode = 1
})
