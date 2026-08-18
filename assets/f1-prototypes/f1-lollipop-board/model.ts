// f1-lollipop-board — the "brakes / gear" paddle a mechanic holds over the car during a pit stop: a
// dished paddle on a telescoping pole, with a legible instruction band across the face.
//
// The prop's whole job is to read as a two-sided instruction sign, so the face carries a real recessed
// panel with a raised instruction bar across it rather than a flat colour. Lettering is a DataTexture
// from the shared 3×5 atlas (no canvas).

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
  /** Paddle radius, metres. Real boards run ~0.23 m. */
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

const defaults: F1LollipopBoardConfig = { radius: 0.23, height: 2.05, legend: 'BRAKES' }

function sanitizeLegend(value: string): string {
  const next = value.replace(/[^A-Za-z]/g, '').slice(0, 8).toUpperCase()
  return next || 'BRAKES'
}

function legendTexture(word: string): DataTexture {
  const w = 160
  const h = 40
  const data = new Uint8Array(w * h * 4)
  const ink: [number, number, number] = [8, 12, 16]
  const paper: [number, number, number] = [242, 248, 250]
  fillGlyphRect(data, w, 0, 0, w, h, ink)
  const cell = word.length > 5 ? 5 : 6
  const ox = 8
  const oy = Math.max(4, Math.round((h - 5 * cell) / 2))
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
    paddle: options.materials?.paddle ?? m.amber,
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

    const paddleParts: BufferGeometry[] = [
      ring(R * 0.86, R, 0.042, 0.006),
      (() => {
        const face = disc(R * 0.90, 0.020, 0.004)
        face.translate(0, 0, -0.008)
        return face
      })(),
    ]

    const boss = new CylinderGeometry(0.048, 0.055, 0.075, 16)
    boss.translate(0, -R * 0.92, faceZ)
    paddleParts.push(boss)

    const paddleGeo = mergeParts(paddleParts, 'paddle')
    paddleGeo.translate(0, height, 0)
    emit('paddle', paddleGeo, paddle, 'face')

    const legendParts: BufferGeometry[] = []
    for (const sz of [-1, 1] as const) {
      const bar = bevelBox(R * 1.34, R * 0.34, 0.012, 0.003)
      bar.translate(0, height + R * 0.16, sz * 0.016)
      legendParts.push(bar)
      const strip = bevelBox(R * 1.06, R * 0.20, 0.010, 0.003)
      strip.translate(0, height - R * 0.32, sz * 0.016)
      legendParts.push(strip)
    }
    emit('legend', mergeParts(legendParts, 'legend'), paddle, 'legend')

    const backWord = legend === 'BRAKES' ? 'GEAR' : legend
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
      const face = new PlaneGeometry(R * 1.18, R * 0.26)
      if (sz < 0) face.rotateY(Math.PI)
      face.translate(0, height + R * 0.16, sz * (0.016 + 0.006 + LAYER_CLEARANCE))
      generated.push(face)
      const mesh = new Mesh(face, mat)
      mesh.name = `legend-type-${i}`
      mesh.castShadow = false
      paddle.add(mesh)
    }

    const poleParts: BufferGeometry[] = []
    const upperLen = height - R * 0.92 - 0.60
    const upper = new CylinderGeometry(0.020, 0.020, upperLen, 12)
    upper.translate(0, height - R * 0.92 - upperLen / 2, faceZ)
    poleParts.push(upper)

    const collar = new CylinderGeometry(0.030, 0.030, 0.055, 14)
    collar.translate(0, height - R * 0.92 - upperLen, faceZ)
    poleParts.push(collar)

    const lower = new CylinderGeometry(0.027, 0.027, 0.62, 12)
    lower.translate(0, height - R * 0.92 - upperLen - 0.31, faceZ)
    poleParts.push(lower)

    const grip = new CylinderGeometry(0.033, 0.033, 0.22, 12)
    grip.translate(0, height - R * 0.92 - upperLen - 0.50, faceZ)
    poleParts.push(grip)

    emit('pole', mergeParts(poleParts, 'pole'), pole, 'shaft')
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
  return createF1Preview(createModel(), { aspect, target: [0, 1.85, 0], distance: 1.6, fov: 32 })
}
