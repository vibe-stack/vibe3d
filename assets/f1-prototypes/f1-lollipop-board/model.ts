// f1-lollipop-board — the thin two-sided STOP/GO paddle a mechanic holds over the car during a pit stop:
// a white circular face, narrow dark rim, full-width instruction field, slim metal pole, and rubber grip.
// Lettering is a deterministic DataTexture from the shared 3×5 atlas (no canvas).

import {
  BufferGeometry,
  CylinderGeometry,
  DataTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  PlaneGeometry,
  RGBAFormat,
  UnsignedByteType,
  type Material,
} from 'three/webgpu'

import {
  LAYER_CLEARANCE,
  acquireF1Materials,
  bevelBox,
  bevelDisc as disc,
  bevelRing as ring,
  createF1Preview,
  disposeF1Materials,
  fillGlyphRect,
  mergeParts,
  writeGlyphWord,
} from '../f1-kit-core/index.ts'

type Slot = 'pole' | 'paddle' | 'legend'

export interface F1LollipopBoardConfig {
  /** Paddle radius, metres. Real boards run about 0.20–0.23 m. */
  radius: number
  /** Height of the paddle's centre above the floor, metres. */
  height: number
  /** Front-face instruction. Back face is GEAR when this is BRAKES. */
  legend: string
}

export interface F1LollipopBoardOptions extends Partial<F1LollipopBoardConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1LollipopBoardInstance {
  readonly root: Group
  readonly parts: { pole: Group; paddle: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1LollipopBoardConfig>
  configure(patch: Partial<F1LollipopBoardConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1LollipopBoardConfig = { radius: 0.20, height: 2.05, legend: 'STOP' }

function sanitizeLegend(value: string): string {
  const next = value.replace(/[^A-Za-z]/g, '').slice(0, 8).toUpperCase()
  return next || 'BRAKES'
}

function legendTexture(word: string): DataTexture {
  const w = 192
  const h = 64
  const data = new Uint8Array(w * h * 4)
  const ink: [number, number, number] = [8, 12, 16]
  const paper: [number, number, number] = [248, 249, 246]
  fillGlyphRect(data, w, 0, 0, w, h, ink)
  const cell = Math.max(4, Math.min(10, Math.floor((w - 20) / (word.length * 4))))
  const glyphW = word.length * 4 * cell - cell
  const ox = Math.round((w - glyphW) / 2)
  const oy = Math.round((h - 5 * cell) / 2)
  writeGlyphWord(data, w, ox, oy, word, paper, cell)
  const tex = new DataTexture(data, w, h, RGBAFormat, UnsignedByteType)
  tex.minFilter = NearestFilter
  tex.magFilter = NearestFilter
  tex.flipY = true
  tex.needsUpdate = true
  return tex
}

export function createModel(options: F1LollipopBoardOptions = {}): F1LollipopBoardInstance {
  const config: F1LollipopBoardConfig = {
    radius: Math.max(0.1, options.radius ?? defaults.radius),
    height: Math.max(0.8, options.height ?? defaults.height),
    legend: sanitizeLegend(options.legend ?? defaults.legend),
  }

  const bundle = acquireF1Materials()
  const m = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    pole: options.materials?.pole ?? m.steel,
    paddle: options.materials?.paddle ?? m.shell,
    legend: options.materials?.legend ?? m.ink,
  }

  const root = new Group()
  root.name = 'f1-lollipop-board'
  const pole = new Group(); pole.name = 'pole'
  const paddle = new Group(); paddle.name = 'paddle'
  root.add(pole, paddle)

  const generated: BufferGeometry[] = []
  const extras: Material[] = []
  const textures: DataTexture[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { pole: [], paddle: [], legend: [] }

  const releaseGenerated = (): void => {
    for (const group of [pole, paddle]) group.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const texture of textures) texture.dispose()
    textures.length = 0
    for (const material of extras) material.dispose()
    extras.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
  }

  const emit = (slot: Slot, geometry: BufferGeometry, group: Group, name: string): void => {
    generated.push(geometry)
    const mesh = new Mesh(geometry, materialSlots[slot])
    mesh.name = name
    mesh.castShadow = true
    mesh.receiveShadow = true
    meshesBySlot[slot].push(mesh)
    group.add(mesh)
  }

  const rebuild = (): void => {
    releaseGenerated()
    const { radius: R, height, legend } = config
    const faceZ = 0.0

    // The paddle is a thin white disc with only a 6%-radius dark retaining rim.
    const face = disc(R * 0.955, 0.012, 0.002)
    face.translate(0, height, 0)
    emit('paddle', face, paddle, 'white-face')

    const rim = ring(R * 0.94, R, 0.018, 0.003)
    rim.translate(0, height, 0)
    emit('legend', rim, paddle, 'dark-rim')

    const legendParts: BufferGeometry[] = []
    for (const sz of [-1, 1] as const) {
      const field = bevelBox(R * 1.72, R * 0.86, 0.008, 0.002)
      field.translate(0, height, sz * 0.010)
      legendParts.push(field)
    }
    emit('legend', mergeParts(legendParts, 'instruction-fields'), paddle, 'instruction-fields')

    const backWord = legend === 'STOP' ? 'GO' : legend === 'BRAKES' ? 'GEAR' : legend
    const words = [legend, backWord]
    for (let i = 0; i < 2; i++) {
      const sz = i === 0 ? 1 : -1
      const tex = legendTexture(words[i]!)
      textures.push(tex)
      const mat = new MeshBasicMaterial({
        name: `f1-kit / lollipop ${words[i]}`,
        map: tex,
        toneMapped: false,
      })
      extras.push(mat)
      const typeFace = new PlaneGeometry(R * 1.62, R * 0.74)
      if (sz < 0) typeFace.rotateY(Math.PI)
      typeFace.translate(0, height, sz * (0.010 + 0.004 + LAYER_CLEARANCE))
      generated.push(typeFace)
      const mesh = new Mesh(typeFace, mat)
      mesh.name = `legend-type-${i}`
      mesh.castShadow = false
      paddle.add(mesh)
    }

    const boardBottom = height - R * 0.96
    const upperLen = Math.max(0.08, boardBottom - 0.42)
    const poleParts: BufferGeometry[] = []
    const upper = new CylinderGeometry(0.012, 0.012, upperLen, 12)
    upper.translate(0, boardBottom - upperLen / 2, faceZ)
    poleParts.push(upper)

    const collar = new CylinderGeometry(0.017, 0.017, 0.035, 12)
    collar.translate(0, 0.42, faceZ)
    poleParts.push(collar)

    const lower = new CylinderGeometry(0.014, 0.014, 0.28, 12)
    lower.translate(0, 0.28, faceZ)
    poleParts.push(lower)

    const boss = new CylinderGeometry(0.024, 0.028, 0.050, 16)
    boss.translate(0, boardBottom - 0.025, faceZ)
    poleParts.push(boss)
    emit('pole', mergeParts(poleParts, 'pole'), pole, 'shaft')

    const grip = new CylinderGeometry(0.020, 0.020, 0.14, 12)
    grip.translate(0, 0.07, faceZ)
    emit('legend', grip, pole, 'rubber-grip')
  }
  rebuild()

  return {
    root,
    parts: { pole, paddle },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.radius !== undefined) config.radius = Math.max(0.1, patch.radius)
      if (patch.height !== undefined) config.height = Math.max(0.8, patch.height)
      if (patch.legend !== undefined) config.legend = sanitizeLegend(patch.legend)
      rebuild()
    },
    setMaterial(slot, material) {
      materialSlots[slot] = material
      for (const mesh of meshesBySlot[slot]) mesh.material = material
    },
    update: () => {},
    dispose() {
      releaseGenerated()
      disposeF1Materials(bundle)
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  return createF1Preview(createModel(), { aspect, target: [0, 1.10, 0], distance: 4.40, fov: 32 })
}
