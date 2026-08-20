// f1-sausage-kerb — yellow triangular sausage (50–100 mm crown) tiled along X.
// Distinct from f1-kerb (800 mm rumble). Used on chicane apexes.

import { BufferGeometry, Group, Mesh, MeshStandardMaterial, type Material } from 'three/webgpu'

import {
  TOKEN,
  acquireF1Materials,
  createF1Preview,
  disposeF1Materials,
  loftAlongX,
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
const BAND = 0.50
const WIDTH = 0.25
const CROWN = 0.08

function sausageProfile(): Array<readonly [number, number]> {
  return [
    [-WIDTH / 2, 0],
    [0, CROWN],
    [WIDTH / 2, 0],
    [WIDTH / 2 - 0.012, 0],
    [0, CROWN - 0.012],
    [-WIDTH / 2 + 0.012, 0],
  ]
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

  const rebuild = (): void => {
    releaseGenerated()
    const length = config.modules * BAND
    const geo = loftAlongX(sausageProfile(), length, { closed: true, stations: 6 })
    generated.push(geo)
    const mesh = new Mesh(geo, materialSlots.sausage)
    mesh.name = 'sausage'
    mesh.castShadow = true
    mesh.receiveShadow = true
    meshesBySlot.sausage.push(mesh)
    sausage.add(mesh)
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
      for (const mesh of meshesBySlot[slot]) mesh.material = material
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
  return createF1Preview(createModel({ modules: 8 }), {
    aspect,
    target: [0, 0.04, 0],
    distance: 3.4,
    fov: 28,
    yaw: -1.1,
    pitch: 0.32,
  })
}
