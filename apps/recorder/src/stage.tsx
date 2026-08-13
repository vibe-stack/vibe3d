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
import type { CatalogItem, ModelPreview } from './catalog.ts'

interface StageProps {
  item: CatalogItem
  isAnimating: boolean
  renderMode: RenderMode
  modelOptions: Record<string, number>
  onLoadingChange(loading: boolean): void
  onError(message: string | null): void
  onStatsChange(stats: ModelStats | null): void
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
  renderMode,
  modelOptions,
  onLoadingChange,
  onError,
  onStatsChange,
}: StageProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<ModelPreview | undefined>(undefined)
  const authoredOverrideMaterialRef = useRef<Material | null>(null)
  const animatingRef = useRef(isAnimating)
  const renderModeRef = useRef(renderMode)
  const previousAnimatingRef = useRef(isAnimating)
  const modelOptionsRef = useRef(modelOptions)
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
      renderer.toneMapping = terrain ? AgXToneMapping : ACESFilmicToneMapping
      renderer.toneMappingExposure = terrain ? TERRAIN_EXPOSURE : 1
      studioLighting = addStudioLighting(preview, terrain)
      applyRenderMode(preview, renderModeRef.current, authoredOverrideMaterialRef.current)
      if (item.animated && animatingRef.current) triggerAnimation(preview)

      controls = new OrbitControls(preview.camera, canvas)
      controls.enableDamping = true
      controls.dampingFactor = 0.07
      controls.screenSpacePanning = true
      if (studioLighting.target) controls.target.copy(studioLighting.target)
      controls.minDistance = terrain ? 1 : 0.4
      controls.maxDistance = terrain ? 300 : 180
      controls.update()

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
      renderer?.setAnimationLoop(null)
      controls?.dispose()
      pipeline?.dispose()
      preview?.dispose()
      previewRef.current = undefined
      authoredOverrideMaterialRef.current = null
      renderer?.dispose()
    }
  }, [item, onError, onLoadingChange, onStatsChange])

  return (
    <div className="stage" ref={hostRef} data-ready={webGpuReady}>
      <canvas aria-label={`Interactive 3D showcase of ${item.name}`} />
    </div>
  )
}
