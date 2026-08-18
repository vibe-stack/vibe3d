import { RenderPipeline, type Camera, type Scene, type WebGPURenderer } from 'three/webgpu'
import { emissive, mrt, output, pass } from 'three/tsl'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'

export interface EmissiveBloomOptions {
  readonly strength?: number
  readonly radius?: number
  readonly threshold?: number
}

/** Kit defaults — lower than the recorder studio so 320 px contact-sheet tiles do not wash out. */
export const KIT_BLOOM = {
  strength: 1.4,
  radius: 0.35,
  threshold: 0.08,
} as const

export function createEmissiveBloomPipeline(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: Camera,
  options: EmissiveBloomOptions = {},
): RenderPipeline {
  const strength = options.strength ?? KIT_BLOOM.strength
  const radius = options.radius ?? KIT_BLOOM.radius
  const threshold = options.threshold ?? KIT_BLOOM.threshold
  const scenePass = pass(scene, camera)
  scenePass.setMRT(mrt({ output, emissive }))
  const sceneColor = scenePass.getTextureNode('output')
  const emissiveColor = scenePass.getTextureNode('emissive')
  const pipeline = new RenderPipeline(renderer)
  pipeline.outputNode = sceneColor.add(bloom(emissiveColor, strength, radius, threshold))
  return pipeline
}
