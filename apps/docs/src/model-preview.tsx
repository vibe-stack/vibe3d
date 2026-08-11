import { useEffect, useRef, useState } from 'react'
import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  SRGBColorSpace,
  WebGPURenderer,
} from 'three/webgpu'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { exportStaticGlb } from '../../../src/asset-forge/generator/glb.ts'
import type { CatalogModel, ModelPreview as PreviewInstance } from './catalog.ts'

interface ModelPreviewProps {
  model: CatalogModel
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

export function ModelPreview({ model }: ModelPreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<PreviewInstance | undefined>(undefined)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const canvas = host.querySelector('canvas')
    if (!canvas) return

    let stopped = false
    let preview: PreviewInstance | undefined
    let controls: OrbitControls | undefined
    let renderer: WebGPURenderer | undefined
    let previous = 0

    const resize = () => {
      if (!renderer || !preview) return
      const width = Math.max(host.clientWidth, 1)
      const height = Math.max(host.clientHeight, 1)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
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
      renderer.toneMappingExposure = 1.32
      await renderer.init()
      if (stopped) return

      const module = await model.load()
      preview = module.createPreview({ aspect: Math.max(host.clientWidth, 1) / Math.max(host.clientHeight, 1) })
      preview.scene.background = new Color(0x4b5660)
      const studioLights = new Group()
      studioLights.name = 'vibe3d-docs-studio-lighting'
      studioLights.add(new AmbientLight(0xe7edf4, 1.15))
      const sky = new HemisphereLight(0xe8f3ff, 0x51473d, 2.2)
      studioLights.add(sky)
      const key = new DirectionalLight(0xfff5e8, 3.8)
      key.position.set(6, 9, 7)
      studioLights.add(key)
      const fill = new DirectionalLight(0xc8e2ff, 2.15)
      fill.position.set(-7, 4, 5)
      studioLights.add(fill)
      const rim = new DirectionalLight(0xb8ffd9, 2.4)
      rim.position.set(3, 6, -8)
      studioLights.add(rim)
      preview.scene.add(studioLights)
      previewRef.current = preview
      controls = new OrbitControls(preview.camera, canvas)
      controls.enableDamping = true
      controls.dampingFactor = 0.075
      controls.target.set(0, Math.max(0.75, preview.camera.position.y * 0.28), 0)
      controls.update()
      resize()
      renderer.setAnimationLoop((time) => {
        if (!preview || !renderer) return
        const delta = previous === 0 ? 0 : Math.min((time - previous) / 1_000, 0.05)
        previous = time
        preview.update(delta)
        controls?.update()
        renderer.render(preview.scene, preview.camera)
      })
    })().catch((error: unknown) => {
      console.error(`Unable to preview ${model.id}`, error)
    })

    return () => {
      stopped = true
      observer.disconnect()
      renderer?.setAnimationLoop(null)
      controls?.dispose()
      preview?.dispose()
      previewRef.current = undefined
      renderer?.dispose()
    }
  }, [model])

  const exportGlb = async () => {
    const preview = previewRef.current
    if (!preview || exporting) return
    setExporting(true)
    try {
      const blob = await exportStaticGlb(preview.root, { textureSize: 512 })
      download(blob, `${model.id}.glb`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="model-preview" ref={hostRef}>
      <canvas aria-label={`Interactive 3D preview of ${model.name}`} />
      <button type="button" className="export-button" onClick={() => void exportGlb()} disabled={exporting}>
        {exporting ? 'Exporting…' : 'Export GLB'}
      </button>
    </div>
  )
}
