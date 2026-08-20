// f1-pit-wall — FIA signalling shelf: 1.00 m deep, ≤ 2.20 m overall, monitors at GARAGE_BAY_PITCH.

import {
  BufferGeometry,
  DataTexture,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  type Material,
} from 'three/webgpu'

import {
  GARAGE_BAY_PITCH,
  LAYER_CLEARANCE,
  PIT_WALL,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  fasciaTexture,
  mergeParts,
} from '../f1-kit-core/index.ts'

type Slot = 'shell' | 'glass' | 'fascia'

export interface F1PitWallConfig {
  bays: number
  labels?: string[]
}

export interface F1PitWallOptions extends Partial<F1PitWallConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1PitWallInstance {
  readonly root: Group
  readonly parts: { shell: Group; glass: Group; fascia: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1PitWallConfig>
  configure(patch: Partial<F1PitWallConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1PitWallConfig = { bays: 2 }
const SHELF_H = PIT_WALL.shelf
const DEPTH = PIT_WALL.depth
const GLASS_H = PIT_WALL.glass
const CAP_H = PIT_WALL.height - SHELF_H - GLASS_H

function bayLabel(labels: string[] | undefined, index: number): string {
  if (labels?.[index]) return String(labels[index]).slice(0, 3)
  return String(index + 1)
}

export function createModel(options: F1PitWallOptions = {}): F1PitWallInstance {
  const config: F1PitWallConfig = {
    bays: Math.max(1, Math.round(options.bays ?? defaults.bays)),
    labels: options.labels,
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const textures: DataTexture[] = []
  const ownsFascia = options.materials?.fascia === undefined
  const ownsGlass = options.materials?.glass === undefined
  const glassMat = options.materials?.glass ?? (() => {
    const mat = new MeshStandardMaterial({
      name: 'f1-kit / pit wall glass',
      color: 0x0a1218,
      roughness: 0.08,
      metalness: 0.1,
      transparent: true,
      opacity: 0.35,
    })
    extras.push(mat)
    return mat
  })()

  const materialSlots: Record<Slot, Material> = {
    shell: options.materials?.shell ?? kit.slate,
    glass: glassMat,
    fascia: options.materials?.fascia ?? kit.shell,
  }

  const root = new Group(); root.name = 'f1-pit-wall'
  const shell = new Group(); shell.name = 'shell'
  const glass = new Group(); glass.name = 'glass'
  const fascia = new Group(); fascia.name = 'fascia'
  root.add(shell, glass, fascia)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { shell: [], glass: [], fascia: [] }

  const releaseGenerated = (): void => {
    shell.clear(); glass.clear(); fascia.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
    if (ownsFascia) {
      for (const texture of textures) texture.dispose()
      textures.length = 0
      for (const material of extras) {
        if (material === glassMat) continue
        material.dispose()
      }
      extras.length = 0
      if (ownsGlass) extras.push(glassMat)
    }
  }

  const emit = (slot: Slot, geometry: BufferGeometry, group: Group, name: string, material?: Material): void => {
    generated.push(geometry)
    const mesh = new Mesh(geometry, material ?? materialSlots[slot])
    mesh.name = name
    mesh.castShadow = true
    mesh.receiveShadow = true
    meshesBySlot[slot].push(mesh)
    group.add(mesh)
  }

  const rebuild = (): void => {
    releaseGenerated()
    const bays = config.bays
    const span = bays * GARAGE_BAY_PITCH
    for (let i = 0; i < bays; i++) {
      const x = -span / 2 + (i + 0.5) * GARAGE_BAY_PITCH
      const shelf = bevelBox(GARAGE_BAY_PITCH - 0.2, 0.08, DEPTH, 0.008)
      shelf.translate(x, SHELF_H, 0)
      emit('shell', shelf, shell, `shelf-${i}`)
      const back = bevelBox(GARAGE_BAY_PITCH - 0.2, SHELF_H, 0.06, 0.008)
      back.translate(x, SHELF_H / 2, -DEPTH / 2 + 0.03)
      emit('shell', back, shell, `back-${i}`)
      const pane = bevelBox(GARAGE_BAY_PITCH - 0.35, GLASS_H, 0.012, 0.002)
      pane.translate(x, SHELF_H + GLASS_H / 2 + CAP_H * 0.4, DEPTH / 2 - 0.02)
      emit('glass', pane, glass, `pane-${i}`, glassMat)
      const screen = new PlaneGeometry(0.42, 0.28)
      screen.translate(x, SHELF_H + 0.22, DEPTH / 2 + LAYER_CLEARANCE * 3)
      if (ownsFascia) {
        const tex = fasciaTexture({ number: bayLabel(config.labels, i), legend: 'PIT' })
        textures.push(tex)
        const mat = new MeshStandardMaterial({
          name: `f1-kit / pit fascia ${i}`,
          map: tex,
          roughness: 0.55,
          metalness: 0.05,
        })
        extras.push(mat)
        emit('fascia', screen, fascia, `screen-${i}`, mat)
      } else {
        emit('fascia', screen, fascia, `screen-${i}`)
      }
    }
    const cap = bevelBox(span + 0.1, 0.05, DEPTH + 0.08, 0.006)
    cap.translate(0, PIT_WALL.height - 0.025, 0)
    emit('shell', cap, shell, 'cap')
  }
  rebuild()

  return {
    root,
    parts: { shell, glass, fascia },
    materials: materialSlots,
    getConfig: () => ({ ...config, labels: config.labels ? [...config.labels] : undefined }),
    configure(patch) {
      if (patch.bays !== undefined) config.bays = Math.max(1, Math.round(patch.bays))
      if (patch.labels !== undefined) config.labels = patch.labels ? [...patch.labels] : undefined
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
      extras.length = 0
      disposeF1Materials(bundle)
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  return createF1Preview(createModel({ bays: 3 }), {
    aspect,
    target: [0, 1.2, 0.2],
    distance: 34,
    fov: 32,
    yaw: -0.45,
    pitch: 0.12,
  })
}
