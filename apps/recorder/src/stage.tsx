import { useEffect, useRef, useState } from 'react'
import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Raycaster,
  RenderPipeline,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGPURenderer,
} from 'three/webgpu'
import { emissive, mrt, output, pass } from 'three/tsl'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { describeHit, type Pin, type PinHit } from './annotations.ts'
import type { CatalogItem, ModelPreview } from './catalog.ts'

interface StageProps {
  item: CatalogItem
  isAnimating: boolean
  annotating: boolean
  pins: readonly Pin[]
  activePinId: string | null
  onAnnotate(hit: PinHit): void
  onSelectPin(id: string): void
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

/**
 * How far a pointer may travel between press and release and still count as a
 * click rather than an orbit. Annotating shares the canvas with OrbitControls,
 * and a drag that ends on the model would otherwise drop a pin every time the
 * user turned the object round to look at it.
 */
const CLICK_SLOP = 4

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

export function Stage({
  item,
  isAnimating,
  annotating,
  pins,
  activePinId,
  onAnnotate,
  onSelectPin,
  onLoadingChange,
  onError,
}: StageProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<ModelPreview | undefined>(undefined)
  const animatingRef = useRef(isAnimating)
  const previousAnimatingRef = useRef(isAnimating)
  // The render loop outlives every prop it reads, so annotation state reaches it
  // through refs. Putting any of this in the effect's dependencies would tear
  // down the renderer and rebuild the model on each pin.
  const annotatingRef = useRef(annotating)
  const pinsRef = useRef(pins)
  const onAnnotateRef = useRef(onAnnotate)
  const markersRef = useRef(new Map<string, HTMLButtonElement>())
  const [webGpuReady, setWebGpuReady] = useState(false)

  useEffect(() => {
    annotatingRef.current = annotating
    pinsRef.current = pins
    onAnnotateRef.current = onAnnotate
  })

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

    const raycaster = new Raycaster()
    const pointer = new Vector2()
    const projected = new Vector3()
    let pressedAt: { x: number; y: number } | null = null

    const handlePointerDown = (event: PointerEvent) => {
      pressedAt = event.button === 0 ? { x: event.clientX, y: event.clientY } : null
    }

    const handlePointerUp = (event: PointerEvent) => {
      const pressed = pressedAt
      pressedAt = null
      if (!pressed || !annotatingRef.current || !preview) return
      if (Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > CLICK_SLOP) return

      const bounds = canvas.getBoundingClientRect()
      pointer.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
      )
      raycaster.setFromCamera(pointer, preview.camera)
      // Only the model answers. The studio lights and the scene's own helpers
      // are recorder furniture and mean nothing to whoever reads the report.
      const [hit] = raycaster.intersectObject(preview.root, true)
      if (!hit) return
      const target = controls?.target ?? new Vector3()
      onAnnotateRef.current(describeHit(hit, preview.root, preview.camera, target))
    }

    // Pins are HTML anchored to a world point rather than geometry, because the
    // preview scene is rebuilt and disposed on every model change and a review
    // must not be able to leak into what the recorder captures.
    const positionMarkers = () => {
      if (!preview) return
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      preview.camera.updateMatrixWorld()
      for (const pin of pinsRef.current) {
        const marker = markersRef.current.get(pin.id)
        if (!marker) continue
        projected.set(...pin.hit.world).project(preview.camera)
        // Behind the camera the projection folds back through the origin, which
        // would otherwise park the marker on the opposite side of the frame.
        const visible = projected.z < 1
        marker.style.visibility = visible ? 'visible' : 'hidden'
        if (!visible) continue
        const x = (projected.x * 0.5 + 0.5) * width
        const y = (projected.y * -0.5 + 0.5) * height
        marker.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`
      }
    }

    canvas.addEventListener('pointerdown', handlePointerDown)
    canvas.addEventListener('pointerup', handlePointerUp)

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
        positionMarkers()
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
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('pointerup', handlePointerUp)
      renderer?.setAnimationLoop(null)
      controls?.dispose()
      pipeline?.dispose()
      preview?.dispose()
      previewRef.current = undefined
      renderer?.dispose()
    }
  }, [item, onError, onLoadingChange])

  return (
    <div className="stage" ref={hostRef} data-ready={webGpuReady} data-annotating={annotating}>
      <canvas aria-label={`Interactive 3D showcase of ${item.name}`} />
      <div className="pin-layer">
        {pins.map((pin, index) => (
          <button
            key={pin.id}
            ref={(node) => {
              if (node) markersRef.current.set(pin.id, node)
              else markersRef.current.delete(pin.id)
            }}
            className="pin-marker"
            type="button"
            aria-pressed={pin.id === activePinId}
            onClick={() => onSelectPin(pin.id)}
          >
            {index + 1}
            <span className="visually-hidden">
              {pin.note.trim() || `Annotation ${index + 1} on ${pin.hit.path}`}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
