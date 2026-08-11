import { useEffect, useRef, useState } from 'react'
import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
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
  onLoadingChange(loading: boolean): void
  onError(message: string | null): void
}

const actionPriority = [
  'triggerCalibration',
  'triggerLiftCycle',
  'toggleHatch',
  'toggleGate',
]

const BLOOM_STRENGTH = 2
const BLOOM_RADIUS = 0.35
const BLOOM_THRESHOLD = 0.1

function triggerAnimation(preview: ModelPreview): void {
  const fallback = Object.keys(preview).find((key) => /^(trigger|toggle)[A-Z]/.test(key))
  const actionName = actionPriority.find((key) => typeof preview[key] === 'function') ?? fallback
  if (!actionName) return
  const action = preview[actionName]
  if (typeof action === 'function') action.call(preview, true)
}

function addStudioLighting(preview: ModelPreview): void {
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
  studio.add(new AmbientLight(0xe9edf0, 0.72))
  studio.add(new HemisphereLight(0xe3edf3, 0x191512, 1.55))

  const key = new DirectionalLight(0xfff1df, 3.4)
  key.position.set(-8, 12, 10)
  const fill = new DirectionalLight(0xa9c9e7, 1.6)
  fill.position.set(9, 5, 8)
  const rim = new DirectionalLight(0xc4e5ef, 2.2)
  rim.position.set(7, 10, -11)
  studio.add(key, fill, rim)
  preview.scene.add(studio)
}

export function Stage({ item, isAnimating, onLoadingChange, onError }: StageProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<ModelPreview | undefined>(undefined)
  const animatingRef = useRef(isAnimating)
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
      await renderer.init()
      if (stopped) return
      setWebGpuReady(true)

      const module = await item.load()
      if (stopped) return
      preview = module.createPreview({ aspect: host.clientWidth / Math.max(host.clientHeight, 1) })
      previewRef.current = preview
      addStudioLighting(preview)
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
      renderer?.dispose()
    }
  }, [item, onError, onLoadingChange])

  return (
    <div className="stage" ref={hostRef} data-ready={webGpuReady}>
      <canvas aria-label={`Interactive 3D showcase of ${item.name}`} />
    </div>
  )
}
