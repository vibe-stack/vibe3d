// f1-kerb — one FIA rumble-strip run: raised modules with a 50 mm approach ramp,
// alternating shell / red paint. Geometry, not a shader.

import {
  BufferGeometry,
  Group,
  Mesh,
  type Material,
} from 'three/webgpu'

import {
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
} from '../f1-kit-core/index.ts'

type Slot = 'shell' | 'paint'

export interface F1KerbConfig {
  /** Number of painted modules along +X. */
  modules: number
}

export interface F1KerbOptions extends Partial<F1KerbConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1KerbInstance {
  readonly root: Group
  readonly parts: { kerb: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1KerbConfig>
  configure(patch: Partial<F1KerbConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1KerbConfig = { modules: 10 }
const MOD = 0.40

export function createModel(options: F1KerbOptions = {}): F1KerbInstance {
  const config: F1KerbConfig = { modules: Math.max(2, Math.round(options.modules ?? defaults.modules)) }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    shell: options.materials?.shell ?? kit.shell,
    paint: options.materials?.paint ?? kit.red,
  }

  const root = new Group()
  root.name = 'f1-kerb'
  const kerb = new Group(); kerb.name = 'kerb'
  root.add(kerb)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { shell: [], paint: [] }

  const releaseGenerated = (): void => {
    kerb.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
  }

  const emit = (slot: Slot, geometry: BufferGeometry, name: string): void => {
    generated.push(geometry)
    const mesh = new Mesh(geometry, materialSlots[slot])
    mesh.name = name
    mesh.castShadow = true
    mesh.receiveShadow = true
    meshesBySlot[slot].push(mesh)
    kerb.add(mesh)
  }

  const rebuild = (): void => {
    releaseGenerated()
    const { modules } = config
    const half = ((modules - 1) * MOD) / 2
    const white: BufferGeometry[] = []
    const red: BufferGeometry[] = []
    for (let i = 0; i < modules; i++) {
      const x = -half + i * MOD
      const slab = bevelBox(MOD - 0.01, 0.05, 0.26, 0.008)
      slab.translate(x, 0.025, 0)
      const ramp = bevelBox(MOD - 0.01, 0.025, 0.12, 0.006)
      ramp.translate(x, 0.012, 0.16)
      if (i % 2 === 0) {
        white.push(slab, ramp)
      } else {
        red.push(slab, ramp)
      }
    }
    emit('shell', mergeParts(white, 'white'), 'white')
    emit('paint', mergeParts(red, 'red'), 'red')
  }
  rebuild()

  return {
    root,
    parts: { kerb },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.modules !== undefined) config.modules = Math.max(2, Math.round(patch.modules))
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
  return createF1Preview(createModel(), { aspect, target: [0, 0.05, 0], distance: 5.2, fov: 28 })
}
