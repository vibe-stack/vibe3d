import {
  ACESFilmicToneMapping,
  PCFSoftShadowMap,
  SRGBColorSpace,
  WebGPURenderer,
} from 'three/webgpu'
import { RENDER_SETTINGS } from './config.ts'
import type { Viewport } from './types.ts'

type RendererOptions = ConstructorParameters<typeof WebGPURenderer>[0]

/**
 * The only renderer factory in the project. Platform adapters may supply a
 * canvas or a Dawn device, but visual settings stay shared here.
 */
export function createRenderer(options: RendererOptions = {}): WebGPURenderer {
  const renderer = new WebGPURenderer({
    alpha: RENDER_SETTINGS.alpha,
    antialias: RENDER_SETTINGS.antialias,
    depth: RENDER_SETTINGS.depth,
    stencil: RENDER_SETTINGS.stencil,
    powerPreference: RENDER_SETTINGS.powerPreference,
    ...options,
  })

  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = RENDER_SETTINGS.exposure
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFSoftShadowMap

  return renderer
}

export function setRendererViewport(
  renderer: WebGPURenderer,
  viewport: Viewport,
): void {
  renderer.setPixelRatio(viewport.pixelRatio)
  renderer.setSize(viewport.width, viewport.height, false)
}
