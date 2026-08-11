import { access, copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Box3, Vector3 } from 'three/webgpu'
import { disposeObjectTree } from '../../src/core/dispose.ts'
import { DawnCaptureSession } from './capture/dawn-session.ts'
import { writePng } from './image.ts'

interface PreviewArguments {
  readonly module: string
  readonly exportName: string
  readonly asset?: string
  readonly output?: string
  readonly reference?: string
  readonly width: number
  readonly height: number
  readonly time: number
  readonly yaw: number
  readonly pitch: number
  readonly backend?: string
  readonly adapter?: string
}

export interface FastPreviewOptions {
  readonly module: string
  readonly exportName: string
  readonly asset?: string
  readonly output?: string
  readonly reference?: string
  readonly width: string
  readonly height: string
  readonly time: string
  readonly yaw: string
  readonly pitch: string
  readonly backend?: string
  readonly adapter?: string
}

interface PreviewController {
  readonly scene: import('three/webgpu').Scene
  readonly camera: import('three/webgpu').Camera
  readonly update?: (time: number) => void
  readonly dispose?: () => void
}

interface ModelController {
  readonly root: import('three/webgpu').Object3D
  readonly update?: (time: number) => void
  readonly dispose?: () => void
}

export interface FastPreviewReport {
  readonly schemaVersion: 1
  readonly mode: 'fast-preview'
  readonly asset: string
  readonly iteration: number
  readonly module: string
  readonly exportName: string
  readonly reference?: string
  readonly output: string
  readonly requestedOutput?: string
  readonly workspace: string
  readonly latest: string
  readonly index: string
  readonly size: readonly [number, number]
  readonly time: number
  readonly camera: { readonly yaw: number; readonly pitch: number }
  readonly renderPath: 'dawn'
  readonly adapter: Record<string, string>
  readonly drawCalls: number
  readonly triangles: number
  readonly durationMs: number
}

function numberOption(
  values: Record<string, string | boolean | undefined>,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = values[name]
  const value = raw === undefined || typeof raw === 'boolean' ? fallback : Number(raw)
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`--${name} must be between ${minimum} and ${maximum}`)
  }
  return value
}

function normalizedOptions(projectRoot: string, input: FastPreviewOptions): PreviewArguments {
  return {
    module: resolve(projectRoot, input.module),
    exportName: input.exportName,
    asset: input.asset,
    output: input.output ? resolve(projectRoot, input.output) : undefined,
    reference: input.reference ? resolve(projectRoot, input.reference) : undefined,
    width: numberOption({ width: input.width }, 'width', 1024, 64, 4096),
    height: numberOption({ height: input.height }, 'height', 1024, 64, 4096),
    time: numberOption({ time: input.time }, 'time', 0, 0, 86_400),
    yaw: numberOption({ yaw: input.yaw }, 'yaw', 0, -360, 360),
    pitch: numberOption({ pitch: input.pitch }, 'pitch', 10, -89, 89),
    backend: input.backend,
    adapter: input.adapter,
  }
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function assetName(modulePath: string, explicit: string | undefined): string {
  if (explicit) return slug(explicit)
  const file = basename(modulePath).replace(/\.[^.]+$/, '')
  const parent = basename(dirname(modulePath))
  return slug(file === 'model' && parent && parent !== '.' ? parent : file)
}

interface PreviewWorkspace {
  readonly asset: string
  readonly iteration: number
  readonly root: string
  readonly iterationDirectory: string
  readonly output: string
  readonly latest: string
  readonly latestReport: string
  readonly index: string
  readonly readme: string
}

async function nextPreviewWorkspace(
  projectRoot: string,
  modulePath: string,
  explicitAsset: string | undefined,
): Promise<PreviewWorkspace> {
  const asset = assetName(modulePath, explicitAsset)
  const root = resolve(projectRoot, '.asset-forge', 'previews', asset)
  let entries: import('node:fs').Dirent[] = []
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const iteration = entries.reduce((highest, entry) => {
    const match = entry.isDirectory() ? entry.name.match(/^iteration-(\d+)$/) : undefined
    return Math.max(highest, match ? Number(match[1]) : 0)
  }, 0) + 1
  const iterationDirectory = resolve(root, `iteration-${String(iteration).padStart(3, '0')}`)
  return {
    asset,
    iteration,
    root,
    iterationDirectory,
    output: resolve(iterationDirectory, 'beauty.png'),
    latest: resolve(root, 'latest.png'),
    latestReport: resolve(root, 'latest.json'),
    index: resolve(root, 'index.json'),
    readme: resolve(root, 'README.md'),
  }
}

interface PreviewIndex {
  readonly schemaVersion: 1
  readonly asset: string
  readonly iterations: readonly PreviewIteration[]
}

interface PreviewIteration {
  readonly iteration: number
  readonly output: string
  readonly createdAt: string
  readonly module: string
  readonly reference?: string
  readonly durationMs: number
  readonly drawCalls: number
  readonly triangles: number
}

async function readPreviewIndex(path: string, asset: string): Promise<PreviewIndex> {
  try {
    const value = JSON.parse(await readFile(path, 'utf8')) as Partial<PreviewIndex>
    if (value.schemaVersion === 1 && value.asset === asset && Array.isArray(value.iterations)) {
      return value as PreviewIndex
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  return { schemaVersion: 1, asset, iterations: [] }
}

function displayPath(projectRoot: string, path: string): string {
  return relative(projectRoot, path) || '.'
}

async function writePreviewWorkspace(
  projectRoot: string,
  workspace: PreviewWorkspace,
  report: FastPreviewReport,
): Promise<void> {
  await mkdir(workspace.iterationDirectory, { recursive: true })
  await copyFile(report.output, workspace.latest)
  const index = await readPreviewIndex(workspace.index, workspace.asset)
  const entry: PreviewIteration = {
    iteration: report.iteration,
    output: displayPath(projectRoot, report.output),
    createdAt: new Date().toISOString(),
    module: displayPath(projectRoot, report.module),
    reference: report.reference ? displayPath(projectRoot, report.reference) : undefined,
    durationMs: report.durationMs,
    drawCalls: report.drawCalls,
    triangles: report.triangles,
  }
  const iterations = [...index.iterations.filter((item) => item.iteration !== report.iteration), entry]
    .sort((left, right) => left.iteration - right.iteration)
  const nextIndex: PreviewIndex = { schemaVersion: 1, asset: workspace.asset, iterations }
  await writeFile(workspace.index, `${JSON.stringify(nextIndex, null, 2)}\n`, 'utf8')
  await writeFile(workspace.latestReport, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  const lines = [
    `# ${workspace.asset}`,
    '',
    `Latest: [latest.png](./latest.png) · iteration ${String(report.iteration).padStart(3, '0')}`,
    `Source: \`${displayPath(projectRoot, report.module)}\``,
    report.reference ? `Reference: \`${displayPath(projectRoot, report.reference)}\`` : 'Reference: not supplied',
    '',
    '| Iteration | Snapshot | Duration | Geometry | Critic |',
    '| ---: | --- | ---: | ---: | --- |',
    ...iterations.map((item) => [
      String(item.iteration).padStart(3, '0'),
      `[beauty.png](./iteration-${String(item.iteration).padStart(3, '0')}/beauty.png)`,
      `${item.durationMs} ms`,
      `${item.drawCalls} draws / ${item.triangles} tris`,
      'pending',
    ].join(' | ')).map((line) => `| ${line} |`),
    '',
    'The critic response, when available, belongs in the matching iteration directory as `critic.json`.',
  ]
  await writeFile(workspace.readme, `${lines.join('\n')}\n`, 'utf8')
  await writeFile(
    resolve(workspace.iterationDirectory, 'preview.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  )
}

function isObject3D(value: unknown): value is import('three/webgpu').Object3D {
  return Boolean(value && typeof value === 'object' && (value as { isObject3D?: boolean }).isObject3D)
}

function isPreviewController(value: unknown): value is PreviewController {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<PreviewController>
  return Boolean(candidate.scene?.isScene && candidate.camera?.isCamera)
}

function isModelController(value: unknown): value is ModelController {
  if (!value || typeof value !== 'object') return false
  return isObject3D((value as Partial<ModelController>).root)
}

function autoFrame(
  three: typeof import('three/webgpu'),
  root: import('three/webgpu').Object3D,
  aspect: number,
  yawDeg: number,
  pitchDeg: number,
): import('three/webgpu').PerspectiveCamera {
  root.updateMatrixWorld(true)
  const bounds = new Box3().setFromObject(root, true)
  const center = bounds.isEmpty()
    ? new Vector3()
    : bounds.getCenter(new Vector3())
  const size = bounds.isEmpty()
    ? new Vector3(1, 1, 1)
    : bounds.getSize(new Vector3())
  const fovDeg = 32
  const yaw = (yawDeg * Math.PI) / 180
  const pitch = (pitchDeg * Math.PI) / 180
  const cameraOffset = new Vector3(
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    Math.cos(yaw) * Math.cos(pitch),
  )
  const forward = cameraOffset.clone().negate()
  const right = new Vector3().crossVectors(forward, new Vector3(0, 1, 0)).normalize()
  const up = new Vector3().crossVectors(right, forward).normalize()
  const halfSize = size.clone().multiplyScalar(0.5)
  const extent = (axis: Vector3): number =>
    Math.abs(axis.x) * halfSize.x + Math.abs(axis.y) * halfSize.y + Math.abs(axis.z) * halfSize.z
  const halfHorizontal = extent(right)
  const halfVertical = extent(up)
  const halfDepth = extent(cameraOffset)
  const verticalFov = (fovDeg * Math.PI) / 360
  const horizontalFov = Math.atan(Math.tan(verticalFov) * aspect)
  const margin = 1.12
  const distance = Math.max(
    halfDepth + halfVertical / Math.tan(verticalFov),
    halfDepth + halfHorizontal / Math.tan(horizontalFov),
  ) * margin
  const position = center.clone().add(
    cameraOffset.multiplyScalar(Math.max(distance, 0.05)),
  )
  const camera = new three.PerspectiveCamera(
    fovDeg,
    aspect,
    Math.max(size.length() * 0.005, 0.01),
    Math.max(distance + size.length() * 2, 10),
  )
  camera.position.copy(position)
  camera.lookAt(center)
  camera.updateProjectionMatrix()
  return camera
}

function autoScene(
  three: typeof import('three/webgpu'),
  root: import('three/webgpu').Object3D,
  width: number,
  height: number,
  yaw: number,
  pitch: number,
  controller: ModelController | import('three/webgpu').Object3D,
): PreviewController {
  root.updateMatrixWorld(true)
  const scene = new three.Scene()
  scene.name = 'FAST PREVIEW'
  scene.background = new three.Color(0x05080c)
  scene.add(root)

  const bounds = new Box3().setFromObject(root, true)
  const center = bounds.isEmpty() ? new Vector3() : bounds.getCenter(new Vector3())
  const size = bounds.isEmpty() ? new Vector3(1, 1, 1) : bounds.getSize(new Vector3())
  const radius = Math.max(size.length() * 0.5, 0.05)

  const ambient = new three.AmbientLight(0xb9cfdd, 1.7)
  const key = new three.DirectionalLight(0xf3fbff, 3.8)
  key.position.set(center.x + radius * 2.2, center.y + radius * 3.2, center.z + radius * 3.4)
  const fill = new three.DirectionalLight(0x526cff, 1.35)
  fill.position.set(center.x - radius * 2.5, center.y + radius * 1.2, center.z - radius * 2.2)
  scene.add(ambient, key, fill)

  return {
    scene,
    camera: autoFrame(three, root, width / height, yaw, pitch),
    update: 'update' in controller && typeof controller.update === 'function'
      ? controller.update.bind(controller)
      : undefined,
    dispose: 'dispose' in controller && typeof controller.dispose === 'function'
      ? controller.dispose.bind(controller)
      : () => disposeObjectTree(root),
  }
}

async function factoryResult(
  modulePath: string,
  exportName: string,
  aspect: number,
  time: number,
): Promise<unknown> {
  const module = await import(pathToFileURL(modulePath).href)
  const candidate = module[exportName] ?? module.default
  if (candidate === undefined) {
    throw new Error(`Module has no --export ${exportName} (and no default export)`)
  }
  return typeof candidate === 'function'
    ? await candidate({ aspect, time })
    : candidate
}

export async function runFastPreview(
  projectRoot: string,
  input: FastPreviewOptions,
): Promise<FastPreviewReport> {
  const started = performance.now()
  const config = normalizedOptions(projectRoot, input)
  const modulePath = config.module
  if (config.reference) await access(config.reference)

  const three = await import('three/webgpu')
  const result = await factoryResult(modulePath, config.exportName, config.width / config.height, config.time)
  let preview: PreviewController | undefined
  let session: DawnCaptureSession | undefined
  try {
    if (isPreviewController(result)) {
      preview = result
    } else {
      const root = isModelController(result) ? result.root : result
      if (!isObject3D(root)) {
        throw new Error(
          'Preview factory must return a Three.js Object3D, { root, update?, dispose? }, or { scene, camera }',
        )
      }
      preview = autoScene(three, root, config.width, config.height, config.yaw, config.pitch, isModelController(result) ? result : root)
    }
    preview.update?.(config.time)
    preview.scene.updateMatrixWorld(true)

    session = await DawnCaptureSession.create({
      width: config.width,
      height: config.height,
      backend: config.backend,
      adapter: config.adapter,
    })
    const capture = await session.capture(preview.scene, preview.camera)
    await session.settle()
    const adapter = {
      vendor: session.adapterInfo.vendor || 'unknown',
      architecture: session.adapterInfo.architecture || 'unknown',
      device: session.adapterInfo.device || 'unknown',
      description: session.adapterInfo.description || 'unknown',
    }

    const workspace = await nextPreviewWorkspace(projectRoot, modulePath, config.asset)
    await writePng(workspace.output, capture.image)
    if (config.output && config.output !== workspace.output) {
      await mkdir(dirname(config.output), { recursive: true })
      await copyFile(workspace.output, config.output)
    }
    const report: FastPreviewReport = {
      schemaVersion: 1,
      mode: 'fast-preview',
      asset: workspace.asset,
      iteration: workspace.iteration,
      module: modulePath,
      exportName: config.exportName,
      reference: config.reference,
      output: workspace.output,
      requestedOutput: config.output && config.output !== workspace.output ? config.output : undefined,
      workspace: workspace.root,
      latest: workspace.latest,
      index: workspace.index,
      size: [config.width, config.height],
      time: config.time,
      camera: { yaw: config.yaw, pitch: config.pitch },
      renderPath: 'dawn',
      adapter,
      drawCalls: capture.drawCalls,
      triangles: capture.triangles,
      durationMs: Math.round((performance.now() - started) * 100) / 100,
    }
    await writePreviewWorkspace(projectRoot, workspace, report)
    return report
  } finally {
    preview?.dispose?.()
    session?.close()
  }
}
