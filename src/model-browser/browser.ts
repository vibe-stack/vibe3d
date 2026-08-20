import {
  ACESFilmicToneMapping,
  Color,
  RenderPipeline,
  SRGBColorSpace,
  WebGPURenderer,
  type BufferGeometry,
  type Group,
  type Scene,
} from 'three/webgpu'
import { pass } from 'three/tsl'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import {
  MODEL_CATALOG,
  findCatalogEntry,
  type ModelCatalogEntry,
  type ModelViewer,
} from './registry.ts'

interface ModelStats {
  readonly vertices: number
  readonly triangles: number
}

const MODEL_PREVIEW_BACKGROUND_HEX = 0x18252f
const MODEL_ORBIT_MAX_DISTANCE = 80
const modelPreviewBackground = new Color(MODEL_PREVIEW_BACKGROUND_HEX)

function enforceModelPreviewBackground(scene: Scene): void {
  modelPreviewBackground.setHex(MODEL_PREVIEW_BACKGROUND_HEX)
  scene.background = modelPreviewBackground
}

export async function startModelBrowser(host: HTMLDivElement): Promise<() => void> {
  host.innerHTML = `
    <main class="model-browser">
      <canvas class="model-viewport" aria-label="Interactive 3D asset preview"></canvas>

      <aside class="model-catalog" aria-label="Model catalog">
        <header class="catalog-header">
          <div class="catalog-mark" aria-hidden="true">SK</div>
          <div>
            <p class="catalog-kicker">SCI-FI KIT</p>
            <h1>Model Library</h1>
          </div>
        </header>
        <label class="catalog-search">
          <span class="sr-only">Search models</span>
          <input type="search" placeholder="Search assets…" data-model-search />
          <kbd>⌘ K</kbd>
        </label>
        <div class="catalog-section-label">
          <span>All models</span>
          <span data-model-count>${MODEL_CATALOG.length.toString().padStart(2, '0')}</span>
        </div>
        <nav class="catalog-list" data-model-list></nav>
        <footer class="catalog-footer">
          <span class="catalog-status-dot"></span>
          <span>Registry connected</span>
        </footer>
      </aside>

      <section class="model-title-panel" aria-live="polite">
        <h2 data-model-title>—</h2>
        <span data-model-description></span>
      </section>

      <section class="model-actions">
        <p data-export-status role="status" aria-live="polite"></p>
        <button type="button" class="action-button action-button--secondary" data-model-action hidden></button>
        <button type="button" class="action-button" data-export-glb>Export GLB</button>
      </section>

      <p class="model-stats" data-model-stats>—</p>
      <div class="model-loading" data-model-loading>
        <span></span>
        <p>Initializing WebGPU</p>
      </div>
      <footer class="model-help">
        <span><b>Drag</b> orbit</span>
        <span><b>Wheel</b> dolly</span>
        <span><b>Right drag</b> pan</span>
        <span data-action-help></span>
      </footer>
    </main>
  `

  const canvas = host.querySelector<HTMLCanvasElement>('.model-viewport')!
  const list = host.querySelector<HTMLElement>('[data-model-list]')!
  const search = host.querySelector<HTMLInputElement>('[data-model-search]')!
  const count = host.querySelector<HTMLElement>('[data-model-count]')!
  const title = host.querySelector<HTMLElement>('[data-model-title]')!
  const description = host.querySelector<HTMLElement>('[data-model-description]')!
  const statsElement = host.querySelector<HTMLElement>('[data-model-stats]')!
  const loading = host.querySelector<HTMLElement>('[data-model-loading]')!
  const loadingText = loading.querySelector<HTMLElement>('p')!
  const exportButton = host.querySelector<HTMLButtonElement>('[data-export-glb]')!
  const exportStatus = host.querySelector<HTMLElement>('[data-export-status]')!
  const actionButton = host.querySelector<HTMLButtonElement>('[data-model-action]')!
  const actionHelp = host.querySelector<HTMLElement>('[data-action-help]')!

  // Safari still ships without `navigator.gpu`. Three's WebGPURenderer can
  // fall back to WebGL 2; TSL bloom cannot, so that path is skipped below.
  let forceWebGL = !navigator.gpu
  loadingText.textContent = forceWebGL ? 'Initializing WebGL' : 'Initializing WebGPU'

  const makeRenderer = (webgl: boolean): WebGPURenderer => {
    const next = new WebGPURenderer({ canvas, antialias: true, forceWebGL: webgl })
    next.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    next.outputColorSpace = SRGBColorSpace
    next.toneMapping = ACESFilmicToneMapping
    next.toneMappingExposure = 1.08
    return next
  }

  let renderer = makeRenderer(forceWebGL)
  let usingWebGPU = !forceWebGL

  let viewer: ModelViewer | undefined
  let selected: ModelCatalogEntry | undefined
  let controls: OrbitControls | undefined
  let pipeline: RenderPipeline | undefined
  let modelStats: ModelStats = { vertices: 0, triangles: 0 }
  let focusY = 1.5
  let focusYGoal = 1.5
  let fov = 22
  let fovGoal = 22
  let stopped = false
  let selectionToken = 0
  let previousFrameTime = 0

  const aspect = () => Math.max(host.clientWidth, 1) / Math.max(host.clientHeight, 1)

  const renderCatalog = (query = '') => {
    const needle = query.trim().toLocaleLowerCase()
    const entries = MODEL_CATALOG.filter((entry) => [
      entry.label,
      entry.category,
      entry.description,
      ...entry.tags,
    ].some((value) => value.toLocaleLowerCase().includes(needle)))
    count.textContent = entries.length.toString().padStart(2, '0')
    list.replaceChildren(...entries.map((entry, index) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'catalog-item'
      button.dataset.modelId = entry.id
      button.setAttribute('aria-pressed', String(entry.id === selected?.id))
      button.innerHTML = `
        <span class="catalog-item-index">${String(index + 1).padStart(2, '0')}</span>
        <span class="catalog-item-copy">
          <b>${entry.label}</b>
        </span>
        <span class="catalog-item-arrow" aria-hidden="true">↗</span>
      `
      button.addEventListener('click', () => void selectModel(entry))
      return button
    }))
    if (entries.length === 0) {
      const empty = document.createElement('p')
      empty.className = 'catalog-empty'
      empty.textContent = 'No models match this search.'
      list.append(empty)
    }
  }

  const updateActionUi = () => {
    const action = viewer?.action
    actionButton.hidden = !action
    actionButton.textContent = action?.label ?? ''
    actionHelp.textContent = action?.shortcut ? `${action.shortcut}  ${action.label}` : ''
  }

  const runPrimaryAction = () => {
    const next = viewer?.action?.run()
    updateActionUi()
    if (!next) return
    focusYGoal = next.focusY
    fovGoal = next.fov
  }

  const selectModel = async (entry: ModelCatalogEntry) => {
    const token = ++selectionToken
    loading.classList.remove('model-loading--complete', 'model-loading--error')
    loadingText.textContent = `Loading ${entry.label}`
    exportStatus.textContent = ''
    exportButton.disabled = true
    actionButton.disabled = true
    try {
      const next = await entry.create(aspect())
      if (token !== selectionToken || stopped) {
        next.dispose()
        return
      }
      controls?.dispose()
      pipeline?.dispose()
      pipeline = undefined
      viewer?.dispose()
      viewer = next
      selected = entry
      enforceModelPreviewBackground(next.scene)
      modelStats = measureModel(next.root)
      focusY = next.initialView.focusY
      focusYGoal = focusY
      fov = next.initialView.fov
      fovGoal = fov
      next.camera.fov = fov
      next.camera.updateProjectionMatrix()

      controls = new OrbitControls(next.camera, canvas)
      controls.target.set(0, focusY, 0)
      controls.enableDamping = true
      controls.dampingFactor = 0.08
      controls.minDistance = 3
      controls.maxDistance = MODEL_ORBIT_MAX_DISTANCE
      controls.update()

      if (usingWebGPU) {
        const scenePass = pass(next.scene, next.camera)
        pipeline = new RenderPipeline(renderer)
        pipeline.outputNode = scenePass.add(bloom(scenePass, 0.5, 0.7, 0.42))
      }

      title.textContent = entry.label
      description.textContent = entry.description
      document.title = `${entry.label} — Sci-Fi Kit Model Library`
      window.history.replaceState(null, '', `?model=${encodeURIComponent(entry.id)}`)
      renderCatalog(search.value)
      updateActionUi()
      exportButton.disabled = false
      actionButton.disabled = false
      loading.classList.add('model-loading--complete')
    } catch (error) {
      console.error(`Unable to load model ${entry.id}`, error)
      loading.classList.add('model-loading--error')
      loadingText.textContent = error instanceof Error ? error.message : `Unable to load ${entry.label}`
    }
  }

  search.addEventListener('input', () => renderCatalog(search.value))
  actionButton.addEventListener('click', runPrimaryAction)
  window.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'k') {
      event.preventDefault()
      search.focus()
      return
    }
    if (event.code === 'Space' && !event.repeat && !(event.target instanceof HTMLInputElement)) {
      event.preventDefault()
      runPrimaryAction()
    }
  })

  exportButton.addEventListener('click', async () => {
    if (!viewer || !selected) return
    exportButton.disabled = true
    exportButton.textContent = 'Baking…'
    exportStatus.textContent = 'Preparing PBR maps'
    try {
      const { exportStaticGlb } = await import('../asset-forge/generator/glb.ts')
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const blob = await exportStaticGlb(viewer.root, { textureSize: 512 })
      downloadBlob(blob, selected.exportName)
      exportStatus.textContent = `${(blob.size / 1_048_576).toFixed(1)} MB ready`
    } catch (error) {
      console.error(`Unable to export ${selected.id}`, error)
      exportStatus.textContent = 'Export failed'
    } finally {
      exportButton.disabled = false
      exportButton.textContent = 'Export GLB'
    }
  })

  const resize = () => {
    const width = Math.max(host.clientWidth, 1)
    const height = Math.max(host.clientHeight, 1)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    renderer.setSize(width, height, false)
    viewer?.resize(width / height)
  }
  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(host)
  resize()

  try {
    await renderer.init()
  } catch (error) {
    if (forceWebGL) {
      loading.classList.add('model-loading--error')
      loadingText.textContent = error instanceof Error ? error.message : 'Unable to initialize renderer'
      return () => undefined
    }
    renderer.dispose()
    forceWebGL = true
    usingWebGPU = false
    loadingText.textContent = 'Initializing WebGL'
    renderer = makeRenderer(true)
    try {
      await renderer.init()
    } catch (webglError) {
      loading.classList.add('model-loading--error')
      loadingText.textContent =
        webglError instanceof Error ? webglError.message : 'Unable to initialize renderer'
      return () => undefined
    }
  }
  usingWebGPU = Boolean(
    (renderer.backend as typeof renderer.backend & { isWebGPUBackend?: boolean }).isWebGPUBackend,
  )

  renderCatalog()
  await selectModel(findCatalogEntry(new URLSearchParams(window.location.search).get('model')))

  renderer.setAnimationLoop((time) => {
    if (stopped || !viewer || !controls) return
    const deltaSeconds = previousFrameTime === 0 ? 0 : (time - previousFrameTime) / 1000
    previousFrameTime = time
    const smoothing = 1 - Math.exp(-Math.min(Math.max(deltaSeconds, 0), 0.05) * 8)
    viewer.update(deltaSeconds)
    enforceModelPreviewBackground(viewer.scene)

    const nextFocusY = focusY + (focusYGoal - focusY) * smoothing
    const focusShift = nextFocusY - focusY
    focusY = nextFocusY
    if (focusShift !== 0) {
      controls.target.y += focusShift
      viewer.camera.position.y += focusShift
    }
    fov += (fovGoal - fov) * smoothing
    if (Math.abs(viewer.camera.fov - fov) > 0.001) {
      viewer.camera.fov = fov
      viewer.camera.updateProjectionMatrix()
    }
    controls.update()
    if (pipeline) pipeline.render()
    else renderer.render(viewer.scene, viewer.camera)
    statsElement.textContent =
      `${modelStats.vertices.toLocaleString()} verts · ${Math.round(modelStats.triangles).toLocaleString()} tris · `
      + `${renderer.info.render.drawCalls} draw calls`
  })

  return () => {
    stopped = true
    selectionToken += 1
    resizeObserver.disconnect()
    renderer.setAnimationLoop(null)
    controls?.dispose()
    pipeline?.dispose()
    viewer?.dispose()
    renderer.dispose()
  }
}

function measureModel(root: Group): ModelStats {
  let vertices = 0
  let triangles = 0
  root.traverse((object) => {
    const geometry = (object as { geometry?: BufferGeometry }).geometry
    const position = geometry?.getAttribute?.('position')
    if (!geometry || !position) return
    vertices += position.count
    triangles += (geometry.index?.count ?? position.count) / 3
  })
  return { vertices, triangles }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}
