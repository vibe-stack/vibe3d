import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RENDER_SETTINGS } from '../core/config.ts'
import { createRenderer, setRendererViewport } from '../core/renderer.ts'
import { createActivePlayground } from '../playgrounds/active.ts'
import { createF1KitPlayground } from '../playgrounds/f1-kit-scene.ts'

function browserPixelRatio(): number {
  return Math.min(window.devicePixelRatio || 1, RENDER_SETTINGS.maxBrowserPixelRatio)
}

export async function startBrowserPlayground(host: HTMLDivElement): Promise<() => void> {
  host.innerHTML = `
    <main class="playground-shell">
      <canvas class="viewport" aria-label="Interactive 3D sci-fi kit playground"></canvas>

      <header class="hud hud--top" aria-label="Playground status">
        <div class="brand-lockup">
          <span class="brand-mark" aria-hidden="true"></span>
          <div>
            <p class="eyebrow">PROCEDURAL ASSET LAB</p>
            <h1>SCI-FI <span>KIT</span></h1>
          </div>
        </div>
        <div class="renderer-state">
          <span class="status-dot" aria-hidden="true"></span>
          <div>
            <p class="eyebrow">RENDER PATH</p>
            <p class="status-value" data-renderer-status>INITIALIZING</p>
          </div>
        </div>
      </header>

      <section class="subject-card hud" aria-label="Current procedural asset">
        <p class="eyebrow">ACTIVE SUBJECT</p>
        <h2 data-subject-label>LOADING</h2>
        <div class="subject-meta">
          <span>PROCEDURAL</span>
          <span>REAL-TIME</span>
          <span>DAWN READY</span>
        </div>
      </section>

      <section class="telemetry hud" aria-label="Renderer telemetry">
        <p class="eyebrow">FRAME TELEMETRY</p>
        <p data-telemetry>-- DRAW / -- TRI</p>
      </section>

      <div class="focus-reticle" aria-hidden="true">
        <i></i><i></i><i></i><i></i>
      </div>

      <footer class="hud hud--bottom">
        <p><span>DRAG</span> ORBIT</p>
        <p><span>WHEEL</span> DOLLY</p>
        <p><span>RIGHT DRAG</span> PAN</p>
        <p class="build-tag">THREE / WEBGPU</p>
      </footer>

      <div class="boot-screen" data-boot-screen>
        <span class="boot-line"></span>
        <p>REQUESTING GPU DEVICE</p>
      </div>
    </main>
  `

  const canvas = host.querySelector<HTMLCanvasElement>('canvas')!
  const status = host.querySelector<HTMLElement>('[data-renderer-status]')!
  const subject = host.querySelector<HTMLElement>('[data-subject-label]')!
  const telemetry = host.querySelector<HTMLElement>('[data-telemetry]')!
  const bootScreen = host.querySelector<HTMLElement>('[data-boot-screen]')!

  const playgroundId = new URLSearchParams(window.location.search).get('playground')
  const playground = playgroundId === 'f1'
    ? createF1KitPlayground({ aspect: 1 })
    : createActivePlayground({ aspect: 1 })
  const renderer = createRenderer({ canvas })
  const controls = new OrbitControls(playground.camera, canvas)
  let stopped = false
  let lastTelemetryUpdate = 0

  controls.target.copy(playground.focus)
  controls.enableDamping = true
  controls.dampingFactor = 0.055
  const wide = playground.id === 'f1-kit-scene'
  controls.minDistance = wide ? 12 : 5.5
  controls.maxDistance = wide ? 140 : 24
  controls.maxPolarAngle = Math.PI * 0.49
  controls.update()

  const resize = () => {
    const width = Math.max(host.clientWidth, 1)
    const height = Math.max(host.clientHeight, 1)
    const pixelRatio = browserPixelRatio()
    setRendererViewport(renderer, { width, height, pixelRatio })
    playground.resize(width / height)
  }

  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(host)
  resize()

  try {
    await renderer.init()
  } catch (error) {
    status.textContent = 'DEVICE ERROR'
    bootScreen.classList.add('boot-screen--error')
    bootScreen.querySelector('p')!.textContent =
      error instanceof Error ? error.message : 'Unable to initialize renderer'
    console.error(error)

    return () => {
      resizeObserver.disconnect()
      controls.dispose()
      playground.dispose()
      renderer.dispose()
    }
  }

  const usingWebGPU = Boolean(
    (renderer.backend as typeof renderer.backend & { isWebGPUBackend?: boolean })
      .isWebGPUBackend,
  )
  status.textContent = usingWebGPU ? 'WEBGPU / READY' : 'WEBGL 2 / FALLBACK'
  subject.textContent = playground.label
  host.dataset.backend = usingWebGPU ? 'webgpu' : 'webgl'
  bootScreen.classList.add('boot-screen--complete')

  const fixedTimeValue = new URLSearchParams(window.location.search).get('time')
  const fixedTime = fixedTimeValue === null ? null : Number(fixedTimeValue)

  await renderer.setAnimationLoop((time) => {
    if (stopped) return

    const elapsedSeconds =
      fixedTime !== null && Number.isFinite(fixedTime) ? fixedTime : time * 0.001
    playground.update(elapsedSeconds)
    controls.update()
    renderer.render(playground.scene, playground.camera)

    if (time - lastTelemetryUpdate > 400) {
      const renderInfo = renderer.info.render
      telemetry.textContent = `${renderInfo.drawCalls} DRAW / ${renderInfo.triangles.toLocaleString()} TRI`
      lastTelemetryUpdate = time
    }
  })

  return () => {
    stopped = true
    resizeObserver.disconnect()
    void renderer.setAnimationLoop(null)
    controls.dispose()
    playground.dispose()
    renderer.dispose()
  }
}
