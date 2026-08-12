import { useEffect, useRef, useState } from 'react'
import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Material,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  RenderPipeline,
  SRGBColorSpace,
  WebGPURenderer,
} from 'three/webgpu'
import { emissive, mrt, output, pass } from 'three/tsl'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import type { CatalogItem, ModelPreview } from './catalog.ts'

interface StageProps {
  item: CatalogItem
  isAnimating: boolean
  renderMode: RenderMode
  onLoadingChange(loading: boolean): void
  onError(message: string | null): void
}

export type RenderMode = 'full' | 'solid' | 'wireframe'

const actionPriority = [
  'triggerCalibration',
  'triggerLiftCycle',
  'toggleHatch',
  'toggleGate',
]

const BLOOM_STRENGTH = 2
const BLOOM_RADIUS = 0.35
const BLOOM_THRESHOLD = 0.1

const solidMaterial = new MeshStandardNodeMaterial({
  color: 0xb9bdb9,
  metalness: 0.04,
  roughness: 0.82,
})

const wireframeMaterial = new MeshBasicNodeMaterial({
  color: 0xd1ff8c,
  wireframe: true,
})

function applyRenderMode(
  preview: ModelPreview,
  renderMode: RenderMode,
  authoredOverrideMaterial: Material | null,
): void {
  if (renderMode === 'solid') {
    preview.scene.overrideMaterial = solidMaterial
  } else if (renderMode === 'wireframe') {
    preview.scene.overrideMaterial = wireframeMaterial
  } else {
    preview.scene.overrideMaterial = authoredOverrideMaterial
  }
}

function triggerAnimation(preview: ModelPreview): void {
  const fallback = Object.keys(preview).find((key) => /^(trigger|toggle)[A-Z]/.test(key))
  const actionName = actionPriority.find((key) => typeof preview[key] === 'function') ?? fallback
  if (!actionName) return
  const action = preview[actionName]
  if (typeof action === 'function') action.call(preview, true)
}

function addStudioLighting(preview: ModelPreview, terrain = false): void {
  const existingStudioLights: Array<AmbientLight | HemisphereLight | DirectionalLight> = []
  preview.scene.traverse((object) => {
    if (object instanceof AmbientLight || object instanceof HemisphereLight || object instanceof DirectionalLight) {
      existingStudioLights.push(object)
    }
  })
  for (const light of existingStudioLights) light.parent?.remove(light)

  preview.scene.background = new Color(0x202326)
  const studio = new Group()
  studio.name = 'recorder-studio-lighting'
  studio.add(new AmbientLight(0xe9edf0, terrain ? 0.18 : 0.72))
  studio.add(new HemisphereLight(0xe3edf3, 0x191512, terrain ? 0.58 : 1.55))

  const key = new DirectionalLight(0xfff1df, terrain ? 4.2 : 3.4)
  key.position.set(-8, terrain ? 5 : 12, 10)
  key.castShadow = terrain
  const fill = new DirectionalLight(0xa9c9e7, terrain ? 0.45 : 1.6)
  fill.position.set(9, 5, 8)
  const rim = new DirectionalLight(0xc4e5ef, terrain ? 2.8 : 2.2)
  rim.position.set(7, 10, -11)
  studio.add(key, fill, rim)
  preview.scene.add(studio)
}

export function Stage({ item, isAnimating, renderMode, onLoadingChange, onError }: StageProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<ModelPreview | undefined>(undefined)
  const authoredOverrideMaterialRef = useRef<Material | null>(null)
  const animatingRef = useRef(isAnimating)
  const renderModeRef = useRef(renderMode)
  const previousAnimatingRef = useRef(isAnimating)
  const [webGpuReady, setWebGpuReady] = useState(false)

  useEffect(() => {
    animatingRef.current = isAnimating
    if (isAnimating && !previousAnimatingRef.current && previewRef.current) {
      triggerAnimation(previewRef.current)
    }
    previousAnimatingRef.current = isAnimating
  }, [isAnimating])

  useEffect(() => {
    renderModeRef.current = renderMode
    if (previewRef.current) {
      applyRenderMode(previewRef.current, renderMode, authoredOverrideMaterialRef.current)
    }
  }, [renderMode])

  useEffect(() => {
    const host = hostRef.current
    const canvas = host?.querySelector('canvas')
    if (!host || !canvas) return

    let stopped = false
    let renderer: WebGPURenderer | undefined
    let pipeline: RenderPipeline | undefined
    let preview: ModelPreview | undefined
    let controls: OrbitControls | undefined
    let previousTime = 0

    onLoadingChange(true)
    onError(null)
    setWebGpuReady(false)

    const resize = () => {
      if (!renderer || !preview) return
      const width = Math.max(host.clientWidth, 1)
      const height = Math.max(host.clientHeight, 1)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
      renderer.setSize(width, height, false)
      preview.camera.aspect = width / height
      preview.camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)

    void (async () => {
      renderer = new WebGPURenderer({ canvas, antialias: true })
      renderer.outputColorSpace = SRGBColorSpace
      renderer.toneMapping = ACESFilmicToneMapping
      renderer.toneMappingExposure = 1
      renderer.shadowMap.enabled = true
      await renderer.init()
      if (stopped) return
      setWebGpuReady(true)

      const module = await item.load()
      if (stopped) return
      preview = await module.createPreview({ aspect: host.clientWidth / Math.max(host.clientHeight, 1) })
      previewRef.current = preview
      authoredOverrideMaterialRef.current = preview.scene.overrideMaterial
      addStudioLighting(preview, item.category === 'Terrain')
      applyRenderMode(preview, renderModeRef.current, authoredOverrideMaterialRef.current)
      if (item.animated && animatingRef.current) triggerAnimation(preview)

      controls = new OrbitControls(preview.camera, canvas)
      controls.enableDamping = true
      controls.dampingFactor = 0.07
      controls.screenSpacePanning = true
      controls.minDistance = 0.4
      controls.maxDistance = 180
      controls.update()

      const scenePass = pass(preview.scene, preview.camera)
      scenePass.setMRT(mrt({ output, emissive }))
      const sceneColor = scenePass.getTextureNode('output')
      const emissiveColor = scenePass.getTextureNode('emissive')
      pipeline = new RenderPipeline(renderer)
      pipeline.outputNode = sceneColor.add(bloom(
        emissiveColor,
        BLOOM_STRENGTH,
        BLOOM_RADIUS,
        BLOOM_THRESHOLD,
      ))

      resize()
      onLoadingChange(false)

      renderer.setAnimationLoop((time) => {
        if (!preview || !pipeline) return
        const delta = previousTime === 0 ? 0 : Math.min((time - previousTime) / 1_000, 0.05)
        previousTime = time
        if (animatingRef.current) preview.update(delta)
        controls?.update()
        pipeline.render()
      })
    })().catch((error: unknown) => {
      if (stopped) return
      console.error(`Unable to load ${item.id}`, error)
      onLoadingChange(false)
      onError(error instanceof Error ? error.message : `Unable to load ${item.name}`)
    })

    return () => {
      stopped = true
      observer.disconnect()
      renderer?.setAnimationLoop(null)
      controls?.dispose()
      pipeline?.dispose()
      preview?.dispose()
      previewRef.current = undefined
      authoredOverrideMaterialRef.current = null
      renderer?.dispose()
    }
  }, [item, onError, onLoadingChange])

  return (
    <div className="stage" ref={hostRef} data-ready={webGpuReady}>
      <canvas aria-label={`Interactive 3D showcase of ${item.name}`} />
    </div>
  )
}
