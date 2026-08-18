import type { Camera, Scene, WebGPURenderer } from 'three/webgpu'
import type { RenderPipeline } from 'three/webgpu'
import { createEmissiveBloomPipeline } from './emissive-bloom-pipeline.ts'
import type { RgbaImage } from '../image.ts'

const BACKENDS = new Set(['metal', 'vulkan', 'd3d11', 'd3d12', 'opengl', 'opengles', 'null'])

export interface DawnSessionOptions {
  readonly width: number
  readonly height: number
  readonly backend?: string
  readonly adapter?: string
}

export interface CaptureResult {
  readonly image: RgbaImage
  readonly drawCalls: number
  readonly triangles: number
}

interface DawnGlobals {
  readonly gpu: GPU
  restore(): void
}

function installDawn(module: typeof import('webgpu'), options: DawnSessionOptions): DawnGlobals {
  if (options.backend && !BACKENDS.has(options.backend)) {
    throw new Error(`Unknown Dawn backend ${options.backend}`)
  }
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const originalSelf = Object.getOwnPropertyDescriptor(globalThis, 'self')
  const argumentsList: string[] = []
  if (options.backend) argumentsList.push(`backend=${options.backend}`)
  if (options.adapter) argumentsList.push(`adapter=${options.adapter}`)
  Object.assign(globalThis, module.globals)
  const gpu = module.create(argumentsList)
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: { gpu, userAgent: 'Node.js + Dawn / Asset Preview' },
  })
  Object.defineProperty(globalThis, 'self', {
    configurable: true,
    writable: true,
    value: { requestAnimationFrame: () => 0, cancelAnimationFrame: () => undefined },
  })
  return {
    gpu,
    restore() {
      if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator)
      else delete (globalThis as { navigator?: unknown }).navigator
      if (originalSelf) Object.defineProperty(globalThis, 'self', originalSelf)
      else delete (globalThis as { self?: unknown }).self
    },
  }
}

function canvas(width: number, height: number): HTMLCanvasElement {
  return {
    width,
    height,
    style: { width: `${width}px`, height: `${height}px` },
    getContext() {
      throw new Error('Beauty previews render to an offscreen RenderTarget')
    },
  } as unknown as HTMLCanvasElement
}

function packRows(pixels: ArrayBufferView, width: number, height: number): Uint8Array {
  const source = new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength)
  const bytesPerRow = width * 4
  const paddedBytesPerRow = Math.ceil(bytesPerRow / 256) * 256
  const sourceStride = source.byteLength === bytesPerRow * height ? bytesPerRow : paddedBytesPerRow
  const output = new Uint8Array(bytesPerRow * height)
  for (let row = 0; row < height; row += 1) {
    const sourceStart = row * sourceStride
    output.set(source.subarray(sourceStart, sourceStart + bytesPerRow), row * bytesPerRow)
  }
  return output
}

export class DawnCaptureSession {
  readonly width: number
  readonly height: number
  readonly adapterInfo: GPUAdapterInfo
  readonly #renderer: WebGPURenderer
  readonly #target: import('three/webgpu').RenderTarget
  readonly #globals: DawnGlobals
  readonly #device: GPUDevice
  #closed = false

  private constructor(
    options: DawnSessionOptions,
    renderer: WebGPURenderer,
    target: import('three/webgpu').RenderTarget,
    globals: DawnGlobals,
    device: GPUDevice,
    adapterInfo: GPUAdapterInfo,
  ) {
    this.width = options.width
    this.height = options.height
    this.#renderer = renderer
    this.#target = target
    this.#globals = globals
    this.#device = device
    this.adapterInfo = adapterInfo
  }

  static async create(options: DawnSessionOptions): Promise<DawnCaptureSession> {
    const dawnModule = await import('webgpu')
    const globals = installDawn(dawnModule, options)
    try {
      const adapter = await globals.gpu.requestAdapter({ powerPreference: 'high-performance' })
      if (!adapter) throw new Error('Dawn could not find a compatible GPU adapter')
      const device = await adapter.requestDevice()
      const [three, rendererModule] = await Promise.all([
        import('three/webgpu'),
        import('../../../src/core/renderer.ts'),
      ])
      const renderer = rendererModule.createRenderer({
        canvas: canvas(options.width, options.height),
        device,
        outputType: three.UnsignedByteType,
      })
      ;(renderer as unknown as { _getFallback: null })._getFallback = null
      rendererModule.setRendererViewport(renderer, {
        width: options.width,
        height: options.height,
        pixelRatio: 1,
      })
      const target = new three.RenderTarget(options.width, options.height, {
        format: three.RGBAFormat,
        type: three.UnsignedByteType,
        colorSpace: three.SRGBColorSpace,
        depthBuffer: true,
        stencilBuffer: false,
        samples: 0,
      })
      target.texture.name = 'BEAUTY PREVIEW'
      await renderer.init()
      renderer.setOutputRenderTarget(target)
      renderer.setRenderTarget(null)
      return new DawnCaptureSession(options, renderer, target, globals, device, adapter.info)
    } catch (error) {
      globals.restore()
      throw error
    }
  }

  async capture(scene: Scene, camera: Camera, options: { bloom?: boolean } = {}): Promise<CaptureResult> {
    if (this.#closed) throw new Error('Dawn capture session is closed')
    this.#renderer.info.reset()
    let pipeline: RenderPipeline | undefined
    if (options.bloom) {
      pipeline = createEmissiveBloomPipeline(this.#renderer, scene, camera)
      pipeline.render()
    } else {
      this.#renderer.render(scene, camera)
    }
    const readback = await this.#renderer.readRenderTargetPixelsAsync(
      this.#target,
      0,
      0,
      this.width,
      this.height,
    )
    pipeline?.dispose()
    return {
      image: { width: this.width, height: this.height, data: packRows(readback, this.width, this.height) },
      drawCalls: this.#renderer.info.render.drawCalls,
      triangles: this.#renderer.info.render.triangles,
    }
  }

  async settle(): Promise<void> {
    await this.#device.queue.onSubmittedWorkDone()
  }

  close(): void {
    if (this.#closed) return
    this.#closed = true
    this.#renderer.setOutputRenderTarget(null)
    this.#renderer.setRenderTarget(null)
    this.#target.dispose()
    this.#renderer.dispose()
    this.#globals.restore()
  }
}
