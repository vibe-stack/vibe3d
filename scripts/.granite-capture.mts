/** Temporary: frame-time benchmark for the granite material. */
import { PNG } from 'pngjs'
import { create, globals } from 'webgpu'
import { writeFile } from 'node:fs/promises'

const ROOT = '/Users/fairhat/Repositories/scifi-kit'
const width = Number(process.env.BENCH_WIDTH ?? 1280)
const height = Number(process.env.BENCH_HEIGHT ?? 960)
const which = process.env.BENCH_PREVIEW ?? 'createOverlayClosePreview'
const frames = Number(process.env.BENCH_FRAMES ?? 40)
const warmups = Number(process.env.BENCH_WARMUPS ?? 2)

Object.assign(globalThis, globals)
const gpu = create(['enable-dawn-features=allow_unsafe_apis'])
Object.defineProperty(globalThis.navigator, 'gpu', { value: gpu, configurable: true })
Object.defineProperty(globalThis, 'self', {
  configurable: true, writable: true,
  value: { requestAnimationFrame: () => 0, cancelAnimationFrame: () => undefined },
})
const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' })
if (!adapter) throw new Error('no adapter')
const device = await adapter.requestDevice()

const three = await import(`${ROOT}/node_modules/three/build/three.webgpu.js`)
const rendererModule = await import(`${ROOT}/src/core/renderer.ts`)
const granite = await import(`${ROOT}/assets/terrain/glacial-granite-boulder/model.ts`)

const canvas = {
  width, height, style: {},
  addEventListener() {}, removeEventListener() {},
  getContext: () => null,
  getBoundingClientRect: () => ({ width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0 }),
} as unknown as HTMLCanvasElement
const renderer = rendererModule.createRenderer({ canvas, device, outputType: three.UnsignedByteType })
;(renderer as unknown as { _getFallback: null })._getFallback = null
rendererModule.setRendererViewport(renderer, { width, height, pixelRatio: 1 })

const factory = (granite as Record<string, unknown>)[which] as (o: { aspect: number }) => Promise<{
  scene: unknown; camera: unknown; update(dt: number): void
}>
const preview = await factory({ aspect: width / height })
// Pull the camera in so the material actually covers the frame: a rock at 30%
// of the viewport dilutes a fragment-shader change by the same factor.
const zoom = Number(process.env.BENCH_ZOOM ?? 0.42)
const cam = preview.camera as { position: { multiplyScalar(s: number): void }; lookAt(x: number, y: number, z: number): void; updateProjectionMatrix(): void }
cam.position.multiplyScalar(zoom)
cam.lookAt(0, 0.95, 0)
cam.updateProjectionMatrix()
const target = new three.RenderTarget(width, height, {
  format: three.RGBAFormat, type: three.UnsignedByteType,
  colorSpace: three.SRGBColorSpace, depthBuffer: true, stencilBuffer: false, samples: 0,
})
await renderer.init()
renderer.setOutputRenderTarget(target)
renderer.setRenderTarget(null)
preview.update(0.016)

// Warm up: shader compilation and first-use allocation must not land in the timing.
const frame = async () => {
  renderer.render(preview.scene, preview.camera)
  // render() only records work. Without waiting on the queue this measures CPU
  // command submission, which is not what a shader change moves.
  await device.queue.onSubmittedWorkDone()
}
for (let i = 0; i < warmups; i += 1) await frame()
renderer.render(preview.scene, preview.camera)
const readback = await renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height)
const source = new Uint8Array(readback.buffer, readback.byteOffset, readback.byteLength)
const pixels = new Uint8Array(width * height * 4)
const stride = width * 4
for (let row = 0; row < height; row += 1) {
  pixels.set(source.subarray(row * stride, (row + 1) * stride), (height - row - 1) * stride)
}
const png = new PNG({ width, height })
png.data.set(pixels)
await writeFile(process.env.BENCH_OUTPUT ?? '/private/tmp/granite-after.png', PNG.sync.write(png))
const samples: number[] = []
for (let i = 0; i < frames; i += 1) {
  const start = performance.now()
  await frame()
  samples.push(performance.now() - start)
}
samples.sort((a, b) => a - b)
const median = samples[Math.floor(samples.length / 2)]!
console.log(JSON.stringify({
  which, width, height,
  medianMs: Number(median.toFixed(2)),
  fps: Number((1000 / median).toFixed(1)),
  minMs: Number(samples[0]!.toFixed(2)),
  maxMs: Number(samples.at(-1)!.toFixed(2)),
}))
process.exit(0)
