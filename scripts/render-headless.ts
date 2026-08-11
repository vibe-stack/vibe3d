import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { PNG } from 'pngjs'
import type {} from 'webgpu'

const BACKENDS = new Set([
  'metal',
  'vulkan',
  'd3d11',
  'd3d12',
  'opengl',
  'opengles',
  'null',
])

interface CaptureOptions {
  output: string
  width: number
  height: number
  time: number
  backend?: string
  adapter?: string
  flipY: boolean
}

interface DawnRuntime {
  gpu: GPU
  restoreGlobals(): void
}

function numericOption(name: string, value: string, minimum: number, maximum: number): number {
  const number = Number(value)
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new Error(`--${name} must be between ${minimum} and ${maximum}`)
  }
  return number
}

function readOptions(): CaptureOptions {
  const { values } = parseArgs({
    options: {
      output: { type: 'string', short: 'o', default: 'renders/axiom-relay.png' },
      width: { type: 'string', short: 'w', default: '1280' },
      height: { type: 'string', short: 'h', default: '720' },
      time: { type: 'string', short: 't', default: '1.75' },
      backend: { type: 'string' },
      adapter: { type: 'string' },
      'flip-y': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
    strict: true,
    allowPositionals: false,
  })

  if (values.help) {
    console.log(`
Three.js + Dawn headless WebGPU capture

Usage:
  bun run render:headless -- [options]

Options:
  -o, --output <path>    PNG destination (default: renders/axiom-relay.png)
  -w, --width <pixels>   Capture width (default: 1280)
  -h, --height <pixels>  Capture height (default: 720)
  -t, --time <seconds>   Deterministic scene time (default: 1.75)
      --backend <name>   Dawn backend: metal, vulkan, d3d12, opengl, ...
      --adapter <name>   Dawn adapter name override
      --flip-y           Vertically flip readback rows
      --help             Show this message
`)
    process.exit(0)
  }

  if (values.backend && !BACKENDS.has(values.backend)) {
    throw new Error(`Unknown Dawn backend: ${values.backend}`)
  }

  return {
    output: resolve(values.output!),
    width: numericOption('width', values.width!, 64, 8192),
    height: numericOption('height', values.height!, 64, 8192),
    time: numericOption('time', values.time!, 0, 86_400),
    backend: values.backend,
    adapter: values.adapter,
    flipY: values['flip-y']!,
  }
}

function installDawn(
  options: CaptureOptions,
  dawnModule: typeof import('webgpu'),
): DawnRuntime {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const originalSelf = Object.getOwnPropertyDescriptor(globalThis, 'self')
  const dawnOptions: string[] = []

  if (options.backend) dawnOptions.push(`backend=${options.backend}`)
  if (options.adapter) dawnOptions.push(`adapter=${options.adapter}`)

  Object.assign(globalThis, dawnModule.globals)
  const gpu = dawnModule.create(dawnOptions)

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: { gpu, userAgent: 'Node.js + Dawn' },
  })

  // Three starts an animation manager during renderer initialization. A
  // no-schedule frame host keeps one-shot Node captures deterministic.
  Object.defineProperty(globalThis, 'self', {
    configurable: true,
    writable: true,
    value: {
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: () => undefined,
    },
  })

  return {
    gpu,
    restoreGlobals() {
      if (originalNavigator) {
        Object.defineProperty(globalThis, 'navigator', originalNavigator)
      } else {
        delete (globalThis as { navigator?: unknown }).navigator
      }

      if (originalSelf) {
        Object.defineProperty(globalThis, 'self', originalSelf)
      } else {
        delete (globalThis as { self?: unknown }).self
      }
    },
  }
}

function createHeadlessCanvas(width: number, height: number): HTMLCanvasElement {
  return {
    width,
    height,
    style: { width: `${width}px`, height: `${height}px` },
    getContext() {
      throw new Error('Headless rendering must target a Three.js RenderTarget')
    },
  } as unknown as HTMLCanvasElement
}

function packReadbackRows(
  pixels: ArrayBufferView,
  width: number,
  height: number,
  flipY: boolean,
): Uint8Array {
  const source = new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength)
  const bytesPerRow = width * 4
  const paddedBytesPerRow = Math.ceil(bytesPerRow / 256) * 256
  const packedLength = bytesPerRow * height
  const paddedLength = (height - 1) * paddedBytesPerRow + bytesPerRow
  const sourceStride = source.byteLength === packedLength ? bytesPerRow : paddedBytesPerRow

  if (source.byteLength !== packedLength && source.byteLength < paddedLength) {
    throw new Error(
      `Unexpected GPU readback size: ${source.byteLength} bytes for ${width}x${height}`,
    )
  }

  const packed = new Uint8Array(packedLength)
  for (let row = 0; row < height; row += 1) {
    const destinationRow = flipY ? height - row - 1 : row
    const sourceStart = row * sourceStride
    packed.set(
      source.subarray(sourceStart, sourceStart + bytesPerRow),
      destinationRow * bytesPerRow,
    )
  }
  return packed
}

async function main(): Promise<void> {
  const options = readOptions()
  let dawnModule: typeof import('webgpu')

  try {
    dawnModule = await import('webgpu')
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Unable to load the native Dawn module: ${reason}`, { cause: error })
  }

  const dawn = installDawn(options, dawnModule)
  let device: GPUDevice | undefined

  try {
    const adapter = await dawn.gpu.requestAdapter({ powerPreference: 'high-performance' })
    if (!adapter) throw new Error('Dawn could not find a compatible GPU adapter')
    device = await adapter.requestDevice()

    // Import Three only after Dawn's WebGPU globals exist.
    const [three, rendererModule, playgroundModule] = await Promise.all([
      import('three/webgpu'),
      import('../src/core/renderer.ts'),
      import('../src/playgrounds/active.ts'),
    ])

    const { RenderTarget, RGBAFormat, REVISION, SRGBColorSpace, UnsignedByteType } = three
    const canvas = createHeadlessCanvas(options.width, options.height)
    const renderer = rendererModule.createRenderer({
      canvas,
      device,
      outputType: UnsignedByteType,
    })
    // WebGPURenderer normally falls back to WebGL2 when backend init fails.
    // There is intentionally no WebGL context in this Node path, so preserve
    // the useful Dawn/WebGPU error instead of attempting an impossible fallback.
    ;(renderer as unknown as { _getFallback: null })._getFallback = null
    rendererModule.setRendererViewport(renderer, {
      width: options.width,
      height: options.height,
      pixelRatio: 1,
    })

    const playground = playgroundModule.createActivePlayground({
      aspect: options.width / options.height,
    })
    const target = new RenderTarget(options.width, options.height, {
      format: RGBAFormat,
      type: UnsignedByteType,
      colorSpace: SRGBColorSpace,
      depthBuffer: true,
      stencilBuffer: false,
      samples: 0,
    })
    target.texture.name = 'HEADLESS / COLOR OUTPUT'

    try {
      await renderer.init()
      renderer.setOutputRenderTarget(target)
      renderer.setRenderTarget(null)
      playground.update(options.time)
      renderer.render(playground.scene, playground.camera)

      const readback = await renderer.readRenderTargetPixelsAsync(
        target,
        0,
        0,
        options.width,
        options.height,
      )
      const pixels = packReadbackRows(readback, options.width, options.height, options.flipY)
      const png = new PNG({ width: options.width, height: options.height })
      png.data.set(pixels)

      await mkdir(dirname(options.output), { recursive: true })
      await writeFile(options.output, PNG.sync.write(png))

      const info = adapter.info
      console.log(
        JSON.stringify(
          {
            output: options.output,
            size: `${options.width}x${options.height}`,
            time: options.time,
            scene: playground.id,
            renderer: `three r${REVISION} / WebGPU`,
            runtime: 'Dawn via node-webgpu',
            adapter: {
              vendor: info.vendor || 'unknown',
              architecture: info.architecture || 'unknown',
              device: info.device || 'unknown',
              description: info.description || 'unknown',
            },
            drawCalls: renderer.info.render.drawCalls,
            triangles: renderer.info.render.triangles,
          },
          null,
          2,
        ),
      )

      // Older macOS-compatible node-webgpu binaries can crash while V8 runs
      // native GPU finalizers. The PNG and stdout metadata are fully flushed at
      // this point; a one-shot capture should let the OS reclaim GPU resources.
      process.exit(0)
    } finally {
      renderer.setOutputRenderTarget(null)
      renderer.setRenderTarget(null)
      target.dispose()
      playground.dispose()
      renderer.dispose()
    }
  } finally {
    // Let node-webgpu release the device with its runtime. Explicit destroy()
    // crashes older Dawn builds during Node teardown on macOS 13.
    device = undefined
    dawn.restoreGlobals()
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error)
  console.error(`Headless WebGPU capture failed:\n${message}`)
  process.exitCode = 1
})
