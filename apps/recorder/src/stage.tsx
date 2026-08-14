import { useEffect, useRef, useState } from 'react'
import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Raycaster,
  Vector2,
  InstancedMesh,
  Material,
  Mesh,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  Object3D,
  RenderPipeline,
  SRGBColorSpace,
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
  renderMode: RenderMode
  modelOptions: Record<string, number>
  onLoadingChange(loading: boolean): void
  onError(message: string | null): void
  onStatsChange(stats: ModelStats | null): void
  onExporterChange(exporter: (() => Promise<Blob>) | null): void
}

export type RenderMode = 'full' | 'solid' | 'wireframe'

export interface ModelStats {
  vertices: number
  activeLod?: string
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
const TERRAIN_EXPOSURE = 1.05
const FRAME_PADDING = 1.15

interface StudioLighting {
  target?: Vector3
}

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

function effectiveVisibility(object: Object3D, root: Object3D): boolean {
  let current: Object3D | null = object
  while (current) {
    if (!current.visible) return false
    if (current === root) return true
    current = current.parent
  }
  return false
}

function namedLod(object: Mesh): number | undefined {
  const match = `${object.name} ${object.geometry.name}`.match(/\bLOD\s*(\d+)\b/i)
  if (!match) return undefined
  const level = Number(match[1])
  return Number.isInteger(level) ? level : undefined
}

function dominantLod(object: Object3D): number | undefined {
  const terrain = object.userData.terrain as { lodWeights?: unknown } | undefined
  const weights = terrain?.lodWeights
  if (!Array.isArray(weights) || weights.length < 2) return undefined

  let active = 0
  let greatest = Number.NEGATIVE_INFINITY
  for (let level = 0; level < weights.length; level += 1) {
    const weight = Number(weights[level])
    if (Number.isFinite(weight) && weight > greatest) {
      active = level
      greatest = weight
    }
  }
  return active
}

function activeTerrainParent(
  object: Object3D,
  root: Object3D,
  lodByTerrain: Map<Object3D, number>,
): number | undefined {
  let current: Object3D | null = object
  while (current) {
    const level = lodByTerrain.get(current)
    if (level !== undefined) return level
    if (current === root) return undefined
    current = current.parent
  }
  return undefined
}

function formatActiveLods(levels: Set<number>): string | undefined {
  const ordered = [...levels].sort((a, b) => a - b)
  if (ordered.length === 0) return undefined
  if (ordered.length === 1) return `LOD ${ordered[0]}`
  const consecutive = ordered.every((level, index) => index === 0 || level === ordered[index - 1]! + 1)
  return consecutive
    ? `LOD ${ordered[0]}–${ordered[ordered.length - 1]}`
    : ordered.map((level) => `LOD ${level}`).join(' / ')
}

export function modelStatsFor(preview: ModelPreview): ModelStats {
  const lodByTerrain = new Map<Object3D, number>()
  preview.root.traverse((object) => {
    const level = dominantLod(object)
    if (level !== undefined) lodByTerrain.set(object, level)
  })

  let vertices = 0
  const activeLods = new Set<number>()
  preview.root.traverse((object) => {
    if (!(object instanceof Mesh) || !effectiveVisibility(object, preview.root)) return
    const position = object.geometry.getAttribute('position')
    if (!position) return

    const terrainLod = activeTerrainParent(object, preview.root, lodByTerrain)
    const meshLod = namedLod(object)
    if (terrainLod !== undefined && meshLod !== undefined && meshLod !== terrainLod) return
    if (terrainLod !== undefined) activeLods.add(terrainLod)
    else if (meshLod !== undefined) activeLods.add(meshLod)

    const instances = object instanceof InstancedMesh ? object.count : 1
    vertices += position.count * instances
  })

  return { vertices, activeLod: formatActiveLods(activeLods) }
}

/**
 * Aim the authored camera at the model's actual world-space bounds and dolly
 * far enough back to fit them. Models keep their authored transforms; only the
 * recorder camera moves, so a preview fix cannot leak into a GLB export.
 */
export function frameModel(preview: ModelPreview, padding = FRAME_PADDING): Vector3 | null {
  preview.scene.updateMatrixWorld(true)
  const bounds = new Box3().setFromObject(preview.root)
  if (bounds.isEmpty()) return null

  const center = bounds.getCenter(new Vector3())
  const radius = Math.max(bounds.getSize(new Vector3()).length() * 0.5, 0.01)
  const verticalFov = preview.camera.fov * Math.PI / 180
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov * 0.5) * preview.camera.aspect)
  const limitingHalfFov = Math.max(Math.min(verticalFov, horizontalFov) * 0.5, 0.01)
  const distance = radius * Math.max(padding, 1) / Math.sin(limitingHalfFov)
  const viewDirection = preview.camera.getWorldDirection(new Vector3()).normalize()

  preview.camera.position.copy(center).addScaledVector(viewDirection, -distance)
  // OrbitControls lets reviewers dolly right up to a surface. A near plane
  // derived from the initial framing distance becomes a giant invisible knife
  // once they do, so keep it close to the lens for inspection work.
  preview.camera.near = 0.01
  preview.camera.far = Math.max(preview.camera.far, distance + radius * 4)
  preview.camera.lookAt(center)
  preview.camera.updateProjectionMatrix()
  preview.camera.updateMatrixWorld(true)
  return center
}

function liftTerrainBackdrop(preview: ModelPreview): void {
  const backdrop = preview.scene.background instanceof Color
    ? preview.scene.background.clone()
    : new Color(0x657987)
  const luminance = backdrop.r * 0.2126 + backdrop.g * 0.7152 + backdrop.b * 0.0722

  // Keep each terrain's authored atmosphere (notably the canyon's warm haze),
  // but lift near-black skies enough to separate the silhouette and ground plane.
  if (luminance < 0.1) {
    backdrop.lerp(new Color(0x657987), Math.min(0.5, (0.1 - luminance) * 5))
  }
  preview.scene.background = backdrop
  preview.scene.fog?.color.copy(backdrop)
}

function addStudioLighting(preview: ModelPreview, terrain = false): StudioLighting {
  const existingStudioLights: Array<AmbientLight | HemisphereLight | DirectionalLight> = []
  preview.scene.traverse((object) => {
    if (object instanceof AmbientLight || object instanceof HemisphereLight || object instanceof DirectionalLight) {
      existingStudioLights.push(object)
    }
  })
  for (const light of existingStudioLights) light.parent?.remove(light)

  const studio = new Group()
  studio.name = 'recorder-studio-lighting'

  if (terrain) {
    liftTerrainBackdrop(preview)
    preview.scene.updateMatrixWorld(true)
    const bounds = new Box3().setFromObject(preview.root)
    const target = bounds.isEmpty()
      ? preview.camera.position.clone().addScaledVector(
        preview.camera.getWorldDirection(new Vector3()),
        10,
      )
      : bounds.getCenter(new Vector3())
    const radius = bounds.isEmpty()
      ? 5
      : Math.max(bounds.getSize(new Vector3()).length() * 0.5, 1)

    const fog = preview.scene.fog
    if (fog) {
      if ('near' in fog) {
        const cameraDistance = preview.camera.position.distanceTo(target)
        fog.near = Math.max(fog.near, cameraDistance + radius * 1.25)
        fog.far = Math.max(fog.far, fog.near + radius * 7)
      } else {
        fog.density *= 0.35
      }
    }

    // Fixed world-space lighting makes orbiting useful for reading the form:
    // the highlight and shadow structure now stays attached to the terrain.
    // The low ambient budget preserves contact and cavity contrast, while the
    // raking key reveals fracture planes without pushing albedo into AgX's
    // highlight rolloff.
    studio.add(new AmbientLight(0xdce5ea, 0.025))
    studio.add(new HemisphereLight(0xd9e9f5, 0x211815, 0.3))
    const sandstone = /canyon|sandstone/i.test(preview.scene.name)
    const key = new DirectionalLight(sandstone ? 0xffddb8 : 0xffedda, sandstone ? 2.05 : 1.9)
    const fill = new DirectionalLight(sandstone ? 0xc77c5b : 0xa8c7d8, 0.24)
    const separation = new DirectionalLight(sandstone ? 0xe7ad8c : 0xc9dce5, 0.16)
    separation.name = 'terrain-separation-light'
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.bias = -0.0003
    key.shadow.normalBias = Math.max(radius * 0.002, 0.012)
    key.shadow.camera.left = -radius * 1.25
    key.shadow.camera.right = radius * 1.25
    key.shadow.camera.top = radius * 1.25
    key.shadow.camera.bottom = -radius * 1.25
    key.shadow.camera.near = 0.1
    key.shadow.camera.far = radius * 8
    key.shadow.camera.updateProjectionMatrix()

    key.target.position.copy(target)
    fill.target.position.copy(target)
    separation.target.position.copy(target)

    key.position.copy(target).add(new Vector3(-1.35, 1.85, 1.2).multiplyScalar(radius))
    fill.position.copy(target).add(new Vector3(1.45, 0.55, 1.05).multiplyScalar(radius))
    separation.position.copy(target).add(new Vector3(0.65, 1.15, -1.65).multiplyScalar(radius))

    studio.add(key.target, fill.target, separation.target, key, fill, separation)
    preview.scene.add(studio)
    return { target }
  }

  preview.scene.background = new Color(0x202326)
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
  return {}
}

export function Stage({
  item,
  isAnimating,
  annotating,
  pins,
  activePinId,
  onAnnotate,
  onSelectPin,
  renderMode,
  modelOptions,
  onLoadingChange,
  onError,
  onStatsChange,
  onExporterChange,
}: StageProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<ModelPreview | undefined>(undefined)
  const authoredOverrideMaterialRef = useRef<Material | null>(null)
  const animatingRef = useRef(isAnimating)
  const renderModeRef = useRef(renderMode)
  const previousAnimatingRef = useRef(isAnimating)
  // The render loop outlives every prop it reads, so annotation state reaches it
  // through refs. Putting any of this in the effect's dependencies would tear
  // down the renderer and rebuild the model on each pin.
  const annotatingRef = useRef(annotating)
  const pinsRef = useRef(pins)
  const onAnnotateRef = useRef(onAnnotate)
  const markersRef = useRef(new Map<string, HTMLButtonElement>())
  const modelOptionsRef = useRef(modelOptions)
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
    renderModeRef.current = renderMode
    if (previewRef.current) {
      applyRenderMode(previewRef.current, renderMode, authoredOverrideMaterialRef.current)
    }
  }, [renderMode])

  useEffect(() => {
    modelOptionsRef.current = modelOptions
    previewRef.current?.configure?.(modelOptions)
  }, [modelOptions])

  useEffect(() => {
    const host = hostRef.current
    const canvas = host?.querySelector('canvas')
    if (!host || !canvas) return

    let stopped = false
    let renderer: WebGPURenderer | undefined
    let pipeline: RenderPipeline | undefined
    let preview: ModelPreview | undefined
    let controls: OrbitControls | undefined
    let studioLighting: StudioLighting | undefined
    let previousTime = 0
    let previousStatsKey = ''
    let previousStatsTime = Number.NEGATIVE_INFINITY

    onLoadingChange(true)
    onError(null)
    onStatsChange(null)
    onExporterChange(null)
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
      renderer.shadowMap.enabled = true
      await renderer.init()
      if (stopped) return
      setWebGpuReady(true)

      const module = await item.load()
      if (stopped) return
      const terrain = item.category === 'Terrain'
      preview = await module.createPreview({
        aspect: host.clientWidth / Math.max(host.clientHeight, 1),
        ...modelOptionsRef.current,
        // The recorder is an interactive viewer, not a terrain compiler. A
        // stale `seed` or `path=source` query parameter previously sent an
        // uncached terrain through minutes of synchronous SDF extraction and
        // baking, leaving the loading spinner up before the tab eventually
        // became unresponsive.
        ...(terrain ? { seed: 1, path: 'compiled' } : {}),
      })
      previewRef.current = preview
      authoredOverrideMaterialRef.current = preview.scene.overrideMaterial
      const frameTarget = frameModel(preview)
      renderer.toneMapping = terrain ? AgXToneMapping : ACESFilmicToneMapping
      renderer.toneMappingExposure = terrain ? TERRAIN_EXPOSURE : 1
      studioLighting = addStudioLighting(preview, terrain)
      applyRenderMode(preview, renderModeRef.current, authoredOverrideMaterialRef.current)
      if (item.animated && animatingRef.current) triggerAnimation(preview)

      controls = new OrbitControls(preview.camera, canvas)
      controls.enableDamping = true
      controls.dampingFactor = 0.07
      controls.screenSpacePanning = true
      if (studioLighting.target ?? frameTarget) controls.target.copy(studioLighting.target ?? frameTarget!)
      controls.minDistance = terrain ? 1 : 0.4
      controls.maxDistance = terrain ? 300 : 180
      controls.update()

      onExporterChange(async () => {
        if (!preview) throw new Error('The model preview is no longer available')
        const { exportStaticGlb } = await import('../../../src/asset-forge/generator/glb.ts')
        return exportStaticGlb(preview.root, { textureSize: 512 })
      })

      const scenePass = pass(preview.scene, preview.camera)
      scenePass.setMRT(mrt({ output, emissive }))
      const sceneColor = scenePass.getTextureNode('output')
      const emissiveColor = scenePass.getTextureNode('emissive')
      pipeline = new RenderPipeline(renderer)
      // Terrain materials have no emissive output. Running a full-resolution
      // bloom pyramid over a black buffer only adds fill-rate cost, which is
      // most visible when a detailed rock covers the viewport at close range.
      pipeline.outputNode = terrain
        ? sceneColor
        : sceneColor.add(bloom(
            emissiveColor,
            BLOOM_STRENGTH,
            BLOOM_RADIUS,
            BLOOM_THRESHOLD,
          ))

      resize()
      onLoadingChange(false)

      const publishStats = () => {
        if (!preview) return
        const stats = modelStatsFor(preview)
        const key = `${stats.vertices}:${stats.activeLod ?? ''}`
        if (key === previousStatsKey) return
        previousStatsKey = key
        onStatsChange(stats)
      }
      publishStats()

      renderer.setAnimationLoop((time) => {
        if (!preview || !pipeline) return
        const delta = previousTime === 0 ? 0 : Math.min((time - previousTime) / 1_000, 0.05)
        previousTime = time
        // Terrain update() owns camera-dependent LOD selection even though the
        // catalogue correctly does not classify the asset as animated.
        if (animatingRef.current || item.category === 'Terrain') preview.update(delta)
        controls?.update()
        positionMarkers()
        pipeline.render()
        if (time - previousStatsTime >= 100) {
          previousStatsTime = time
          publishStats()
        }
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
      authoredOverrideMaterialRef.current = null
      onExporterChange(null)
      renderer?.dispose()
    }
  }, [item, onError, onExporterChange, onLoadingChange, onStatsChange])

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
