// f1-sausage-kerb — FIA Type 4 combination kerb (80 cm wide, 12 cm crown) tiled along X.
// Discrete yellow sausages with grooves and bolt pads — not a continuous loaf, not f1-kerb rumble.

import { BufferGeometry, Group, Mesh, MeshStandardMaterial, type Material } from 'three/webgpu'

import {
  SAUSAGE_KERB,
  TOKEN,
  acquireF1Materials,
  bevelBox,
  bolt,
  createF1Preview,
  creased,
  disposeF1Materials,
  loftAlongX,
  mergeParts,
  shade,
} from '../f1-kit-core/index.ts'

type Slot = 'sausage'

export interface F1SausageKerbConfig {
  modules: number
}

export interface F1SausageKerbOptions extends Partial<F1SausageKerbConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1SausageKerbInstance {
  readonly root: Group
  readonly parts: { sausage: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1SausageKerbConfig>
  configure(patch: Partial<F1SausageKerbConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1SausageKerbConfig = { modules: 6 }
const BAND = SAUSAGE_KERB.pitch
const HALF = SAUSAGE_KERB.width / 2
const CROWN = SAUSAGE_KERB.crown
const GAP = 0.03

/** Solid Type 4 blister: semi-ellipse in ZY, 0.80 m wide × 0.12 m crown. */
function sausageProfile(): Array<readonly [number, number]> {
  const segs = 12
  const pts: Array<readonly [number, number]> = []
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI
    pts.push([-HALF * Math.cos(a), CROWN * Math.sin(a)])
  }
  return pts
}

export function createModel(options: F1SausageKerbOptions = {}): F1SausageKerbInstance {
  const config: F1SausageKerbConfig = {
    modules: Math.max(1, Math.round(options.modules ?? defaults.modules)),
  }

  const bundle = acquireF1Materials()
  const extras: Material[] = []
  const materialSlots: Record<Slot, Material> = {
    sausage: options.materials?.sausage ?? (() => {
      const mat = new MeshStandardMaterial({
        name: 'f1-kit / sausage kerb',
        color: TOKEN.AMBER_400,
        roughness: 0.62,
        metalness: 0.05,
      })
      extras.push(mat)
      return mat
    })(),
  }
  const padMat = new MeshStandardMaterial({
    name: 'f1-kit / sausage pad',
    color: shade(TOKEN.INK_950, 0.06),
    roughness: 0.92,
    metalness: 0,
  })
  extras.push(padMat)

  const root = new Group()
  root.name = 'f1-sausage-kerb'
  const sausage = new Group(); sausage.name = 'sausage'
  root.add(sausage)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { sausage: [] }

  const releaseGenerated = (): void => {
    sausage.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    meshesBySlot.sausage.length = 0
  }

  const emit = (geometry: BufferGeometry, material: Material, name: string): void => {
    generated.push(geometry)
    const mesh = new Mesh(geometry, material)
    mesh.name = name
    mesh.castShadow = true
    mesh.receiveShadow = true
    meshesBySlot.sausage.push(mesh)
    sausage.add(mesh)
  }

  const rebuild = (): void => {
    releaseGenerated()
    const length = config.modules * BAND
    const half = length / 2
    const bay = BAND - GAP
    const profile = sausageProfile()
    const bodyParts: BufferGeometry[] = []
    const padParts: BufferGeometry[] = []

    for (let i = 0; i < config.modules; i++) {
      const x = -half + i * BAND + BAND / 2
      const body = creased(loftAlongX(profile, bay, { closed: true, stations: 4 }), 40)
      body.translate(x, 0, 0)
      bodyParts.push(body)

      for (const z of [-0.22, 0, 0.22]) {
        const groove = bevelBox(bay - 0.06, 0.01, 0.028, 0.003)
        groove.translate(x, CROWN - 0.012, z)
        bodyParts.push(groove)
      }

      const pad = bevelBox(bay - 0.04, 0.012, SAUSAGE_KERB.width - 0.08, 0.003)
      pad.translate(x, 0.005, 0)
      padParts.push(pad)

      for (const sx of [-1, 1] as const) {
        for (const sz of [-1, 1] as const) {
          padParts.push(bolt(
            [x + sx * (bay / 2 - 0.06), 0.01, sz * (HALF - 0.08)],
            0.01,
            0.012,
          ))
        }
      }
    }

    emit(mergeParts(bodyParts, 'sausage'), materialSlots.sausage, 'sausage')
    emit(mergeParts(padParts, 'pads'), padMat, 'pads')
  }
  rebuild()

  return {
    root,
    parts: { sausage },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.modules !== undefined) config.modules = Math.max(1, Math.round(patch.modules))
      rebuild()
    },
    setMaterial(slot, material) {
      materialSlots[slot] = material
      for (const mesh of meshesBySlot[slot]) {
        if (mesh.name === 'sausage') mesh.material = material
      }
    },
    update: () => {},
    dispose() {
      releaseGenerated()
      for (const material of extras) material.dispose()
      disposeF1Materials(bundle)
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  return createF1Preview(createModel({ modules: 6 }), {
    aspect,
    target: [0, 0.06, 0],
    distance: 5.2,
    fov: 28,
    yaw: -1.1,
    pitch: 0.38,
  })
}
