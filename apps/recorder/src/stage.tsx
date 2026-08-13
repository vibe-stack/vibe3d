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
  Material,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
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
const TERRAIN_EXPOSURE = 1.15

interface StudioLighting {
  target?: Vector3
  update(): void
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

    // A raking, camera-relative outdoor rig keeps relief readable from every
    // authored terrain camera and while the user orbits around the formation.
    studio.add(new AmbientLight(0xdce5ea, 0.015))
    studio.add(new HemisphereLight(0xd9e9f5, 0x211815, 0.18))
    const key = new DirectionalLight(0xffe1bf, 2.55)
    const fill = new DirectionalLight(0x8eb9df, 0.1)
    const sandstone = /canyon|sandstone/i.test(preview.scene.name)
    const rim = new DirectionalLight(
      sandstone ? 0xffcfad : 0xe2f4ff,
      sandstone ? 2.3 : 3.8,
    )
    rim.name = 'terrain-rim-light'
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
    rim.target.position.copy(target)
    studio.add(key.target, fill.target, rim.target, key, fill, rim)
    preview.scene.add(studio)

    const view = new Vector3()
    const up = new Vector3(0, 1, 0)
    const right = new Vector3()
    const update = () => {
      preview.camera.getWorldDirection(view).normalize()
      right.crossVectors(view, up)
      if (right.lengthSq() < 0.001) right.set(1, 0, 0)
      else right.normalize()

      key.position.copy(target)
        .addScaledVector(view, -radius * 2.6)
        .addScaledVector(right, -radius * 1.15)
        .addScaledVector(up, radius * 1.9)
      fill.position.copy(target)
        .addScaledVector(view, -radius * 1.5)
        .addScaledVector(right, radius * 1.7)
        .addScaledVector(up, radius * 0.45)
      // Strong high back-right rim. Its direction is deliberately behind the
      // visible faces, so it catches silhouettes and grazing normal-map relief
      // without adding another wash of diffuse light to the rock fronts.
      rim.position.copy(target)
        .addScaledVector(view, radius * 2.25)
        .addScaledVector(right, radius * 1.35)
        .addScaledVector(up, radius * 1.1)
    }
    update()
    return { target, update }
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
  return { update: () => undefined }
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
    let studioLighting: StudioLighting | undefined
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
      const terrain = item.category === 'Terrain'
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
      studioLighting.update()

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
        studioLighting?.update()
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
