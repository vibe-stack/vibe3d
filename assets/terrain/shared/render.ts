/**
 * Headless capture for any terrain preview export.
 *
 * Exists because a single fixed camera is not evidence: the granite asset shipped
 * holes and detached shells past several front-only renders, and the only thing
 * that caught them was orbiting. This takes a module and a list of exports so a
 * four-angle sweep is one command.
 *
 *   node --import tsx assets/terrain/shared/render.ts \
 *     --module ../red-sandstone-canyon/model.ts \
 *     --exports createPreview,createBackPreview,createLeftPreview,createRightPreview \
 *     --out renders/canyon
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { PNG } from 'pngjs'
import type {} from 'webgpu'

const { values } = parseArgs({
  options: {
    module: { type: 'string' },
    exports: { type: 'string', default: 'createPreview' },
    out: { type: 'string', default: 'renders/terrain' },
    width: { type: 'string', default: '1280' },
    height: { type: 'string', default: '760' },
  },
  strict: true,
  allowPositionals: false,
})

if (!values.module) throw new Error('--module is required')
const width = Number(values.width)
const height = Number(values.height)
const here = dirname(fileURLToPath(import.meta.url))
const modulePath = resolve(here, values.module)

function createHeadlessCanvas(canvasWidth: number, canvasHeight: number): HTMLCanvasElement {
  return {
    width: canvasWidth,
    height: canvasHeight,
    style: { width: `${canvasWidth}px`, height: `${canvasHeight}px` },
    getContext() {
      throw new Error('Headless rendering must target a Three.js RenderTarget')
    },
  } as unknown as HTMLCanvasElement
}

/**
 * Rows come back padded to a 256-byte stride when the width demands it, so the
 * readback cannot be copied as one contiguous block.
 *
 * Row order is already top-down and must not be flipped. Flipping produced a
 * render with the ground plane across the top of the frame, which is easy to
 * misread as a camera or scene fault rather than a readback one.
 */
function packReadbackRows(pixels: ArrayBufferView, w: number, h: number): Uint8Array {
  const source = new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength)
  const bytesPerRow = w * 4
  const paddedBytesPerRow = Math.ceil(bytesPerRow / 256) * 256
  const packedLength = bytesPerRow * h
  const stride = source.byteLength === packedLength ? bytesPerRow : paddedBytesPerRow
  const packed = new Uint8Array(packedLength)
  for (let row = 0; row < h; row += 1) {
    const start = row * stride
    packed.set(source.subarray(start, start + bytesPerRow), row * bytesPerRow)
  }
  return packed
}

const dawnModule = await import('webgpu')
Object.assign(globalThis, dawnModule.globals)
const dawn = dawnModule.create([])
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  writable: true,
  value: { gpu: dawn, userAgent: 'Node.js + Dawn' },
})
// Three starts an animation manager during renderer initialization. A
// no-schedule frame host keeps one-shot Node captures deterministic.
Object.defineProperty(globalThis, 'self', {
  configurable: true,
  writable: true,
  value: { requestAnimationFrame: () => 0, cancelAnimationFrame: () => undefined },
})

const adapter = await dawn.requestAdapter({ powerPreference: 'high-performance' })
if (!adapter) throw new Error('Dawn could not find a compatible GPU adapter')
const device = await adapter.requestDevice()

const [three, rendererModule, previewModule] = await Promise.all([
  import('three/webgpu'),
  import('../../../src/core/renderer.ts'),
  import(/* @vite-ignore */ modulePath) as Promise<Record<string, unknown>>,
])

const { RenderTarget, RGBAFormat, SRGBColorSpace, UnsignedByteType } = three
const canvas = createHeadlessCanvas(width, height)
const renderer = rendererModule.createRenderer({ canvas, device, outputType: UnsignedByteType })
;(renderer as unknown as { _getFallback: null })._getFallback = null
rendererModule.setRendererViewport(renderer, { width, height, pixelRatio: 1 })
await renderer.init()

const target = new RenderTarget(width, height, {
  format: RGBAFormat,
  type: UnsignedByteType,
  colorSpace: SRGBColorSpace,
  depthBuffer: true,
  stencilBuffer: false,
  samples: 0,
})
renderer.setOutputRenderTarget(target)
renderer.setRenderTarget(null)

for (const name of values.exports.split(',').map((entry) => entry.trim()).filter(Boolean)) {
  const factory = previewModule[name]
  if (typeof factory !== 'function') throw new Error(`${values.module} has no export ${name}`)
  const started = Date.now()
  const preview = await factory({ aspect: width / height })
  // Let temporal LOD fades settle before a still capture. Rendering the first
  // frame froze alpha-hashed transition stipple into the diagnostic image and
  // made valid coarse geometry look porous.
  const update = preview.update as ((delta: number) => void) | undefined
  for (let frame = 0; frame < 18; frame += 1) update?.(1 / 30)
  renderer.render(preview.scene, preview.camera)

  const readback = await renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height)
  const png = new PNG({ width, height })
  png.data.set(packReadbackRows(readback as ArrayBufferView, width, height))
  const output = resolve(process.cwd(), `${values.out}-${name.replace(/^create|Preview$/g, '') || 'front'}.png`)
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, PNG.sync.write(png))
  console.log(`${output} (${((Date.now() - started) / 1000).toFixed(1)}s)`)
  ;(preview.dispose as (() => void) | undefined)?.()
}

renderer.dispose()
device.destroy()
