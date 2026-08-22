// f1-race-control — Grade 1 multi-storey tower (~10 × 8 m): dark glass, steel
// mullions, RC plate, roof dishes. Not a solid grey cabinet.

import {
  BufferGeometry,
  CylinderGeometry,
  DataTexture,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector3,
  type Material,
} from 'three/webgpu'

import {
  LAYER_CLEARANCE,
  RACE_CONTROL,
  acquireF1Materials,
  bevelBox,
  bevelDisc,
  createF1Preview,
  disposeF1Materials,
  marshalPlateTexture,
  member,
  mergeParts,
} from '../f1-kit-core/index.ts'

type Slot = 'tower' | 'deck'

export interface F1RaceControlConfig {
  height: number
}

export interface F1RaceControlOptions extends Partial<F1RaceControlConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1RaceControlInstance {
  readonly root: Group
  readonly parts: { tower: Group; deck: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1RaceControlConfig>
  configure(patch: Partial<F1RaceControlConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1RaceControlConfig = { height: RACE_CONTROL.height }
const W = RACE_CONTROL.width
const D = RACE_CONTROL.depth

export function createModel(options: F1RaceControlOptions = {}): F1RaceControlInstance {
  const config: F1RaceControlConfig = {
    height: Math.max(8, options.height ?? defaults.height),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const textures: DataTexture[] = []
  const glassMat = new MeshStandardMaterial({
    name: 'f1-kit / race control glass',
    color: 0x081018,
    roughness: 0.12,
    metalness: 0.35,
  })
  extras.push(glassMat)

  const materialSlots: Record<Slot, Material> = {
    tower: options.materials?.tower ?? kit.shell,
    deck: options.materials?.deck ?? kit.graphite,
  }

  const root = new Group(); root.name = 'f1-race-control'
  const tower = new Group(); tower.name = 'tower'
  const deck = new Group(); deck.name = 'deck'
  root.add(tower, deck)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { tower: [], deck: [] }

  const releaseGenerated = (): void => {
    tower.clear(); deck.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
    for (const texture of textures) texture.dispose()
    textures.length = 0
    for (let i = 1; i < extras.length; i++) extras[i]!.dispose()
    extras.length = 1
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
    const h = config.height
    const w = W
    const d = D
    const shellParts: BufferGeometry[] = []
    for (const sx of [-1, 1] as const) {
      shellParts.push(bevelBox(0.28, h, d, 0.014).translate(sx * (w / 2 - 0.14), h / 2, 0))
    }
    shellParts.push(bevelBox(w - 0.5, h, 0.28, 0.014).translate(0, h / 2, -(d / 2 - 0.14)))
    shellParts.push(bevelBox(w - 0.5, 0.45, 0.28, 0.012).translate(0, h - 0.22, d / 2 - 0.14))
    shellParts.push(bevelBox(w - 0.5, 0.7, 0.28, 0.012).translate(0, 0.45, d / 2 - 0.14))
    shellParts.push(bevelBox(0.28, 0.45, d - 0.5, 0.012).translate(w / 2 - 0.14, h - 0.22, 0))
    shellParts.push(bevelBox(0.28, 0.7, d - 0.5, 0.012).translate(w / 2 - 0.14, 0.45, 0))
    emit('tower', mergeParts(shellParts, 'frame'), tower, 'frame', kit.graphite)

    const glassF = bevelBox(w - 0.48, h - 1.4, 0.04, 0.004)
    glassF.translate(0, h / 2 + 0.15, d / 2 - 0.12)
    const glassS = bevelBox(0.04, h - 1.4, d - 0.48, 0.004)
    glassS.translate(w / 2 - 0.12, h / 2 + 0.15, 0)
    emit('tower', mergeParts([glassF, glassS], 'glazing'), tower, 'glazing', glassMat)

    const cols = 5
    const rows = 4
    const mullions: BufferGeometry[] = []
    for (let c = 0; c <= cols; c++) {
      const x = -w / 2 + 0.28 + (c / cols) * (w - 0.56)
      mullions.push(bevelBox(0.11, h - 1.45, 0.08, 0.006).translate(x, h / 2 + 0.15, d / 2 - 0.1))
    }
    for (let r = 0; r <= rows; r++) {
      const y = 1.05 + (r / rows) * (h - 1.6)
      mullions.push(bevelBox(w - 0.5, 0.12, 0.08, 0.006).translate(0, y, d / 2 - 0.1))
    }
    for (let c = 0; c <= cols; c++) {
      const z = -d / 2 + 0.28 + (c / cols) * (d - 0.56)
      mullions.push(bevelBox(0.08, h - 1.45, 0.11, 0.006).translate(w / 2 - 0.1, h / 2 + 0.15, z))
    }
    for (let r = 0; r <= rows; r++) {
      const y = 1.05 + (r / rows) * (h - 1.6)
      mullions.push(bevelBox(0.08, 0.12, d - 0.5, 0.006).translate(w / 2 - 0.1, y, 0))
    }
    emit('tower', mergeParts(mullions, 'mullions'), tower, 'mullions', kit.steel)

    const door = bevelBox(1.2, 2.2, 0.08, 0.01)
    door.translate(-2.2, 1.2, d / 2 + 0.02)
    emit('tower', door, tower, 'door', kit.ink)
    const handle = bevelBox(0.08, 0.22, 0.06, 0.004)
    handle.translate(-1.7, 1.2, d / 2 + 0.08)
    emit('tower', handle, tower, 'handle', kit.steel)

    const back = bevelBox(1.7, 1.15, 0.06, 0.008)
    back.translate(2.1, 2.4, d / 2 + 0.04)
    emit('tower', back, tower, 'sign-back', kit.graphite)
    const face = new PlaneGeometry(1.55, 1.0)
    face.translate(2.1, 2.4, d / 2 + 0.08 + LAYER_CLEARANCE * 3)
    const tex = marshalPlateTexture('RC')
    textures.push(tex)
    const mat = new MeshStandardMaterial({
      name: 'f1-kit / race control plate',
      map: tex,
      roughness: 0.5,
      metalness: 0.05,
    })
    extras.push(mat)
    emit('tower', face, tower, 'sign', mat)

    const base = bevelBox(w + 0.8, 0.22, d + 1.0, 0.014)
    base.translate(0, 0.11, 0)
    emit('tower', base, tower, 'podium', kit.graphite)

    const roof = bevelBox(w + 0.5, 0.14, d + 0.6, 0.012)
    roof.translate(0, h + 0.07, 0)
    emit('deck', roof, deck, 'roof')
    const railParts: BufferGeometry[] = []
    for (const sx of [-1, 1] as const) {
      railParts.push(member(new Vector3(sx * w / 2, h + 0.14, -d / 2), new Vector3(sx * w / 2, h + 1.05, -d / 2), 0.028, 8))
      railParts.push(member(new Vector3(sx * w / 2, h + 0.14, d / 2), new Vector3(sx * w / 2, h + 1.05, d / 2), 0.028, 8))
      railParts.push(member(new Vector3(sx * w / 2, h + 1.05, -d / 2), new Vector3(sx * w / 2, h + 1.05, d / 2), 0.022, 6))
    }
    for (const sz of [-1, 1] as const) {
      railParts.push(member(new Vector3(-w / 2, h + 1.05, sz * d / 2), new Vector3(w / 2, h + 1.05, sz * d / 2), 0.022, 6))
    }
    emit('deck', mergeParts(railParts, 'rails'), deck, 'rails', kit.steel)

    const dishes: BufferGeometry[] = []
    for (const [x, z] of [[-2.6, 1.4], [2.4, -1.6]] as const) {
      const dish = bevelDisc(0.55, 0.06, 0.01, 16)
      dish.rotateX(-0.9)
      dish.translate(x, h + 0.55, z)
      dishes.push(dish)
      const stem = new CylinderGeometry(0.03, 0.04, 0.45, 8)
      stem.translate(x, h + 0.32, z)
      dishes.push(stem)
    }
    emit('deck', mergeParts(dishes, 'dishes'), deck, 'dishes', kit.steel)
    const masts: BufferGeometry[] = []
    for (const [x, z] of [[-1.2, 0], [1.2, 0], [0, 2.4]] as const) {
      masts.push(new CylinderGeometry(0.018, 0.024, 1.8, 8).translate(x, h + 1.0, z))
    }
    emit('deck', mergeParts(masts, 'antennas'), deck, 'antennas', kit.steel)
  }
  rebuild()

  return {
    root,
    parts: { tower, deck },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.height !== undefined) config.height = Math.max(8, patch.height)
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
  return createF1Preview(createModel(), {
    aspect,
    target: [0, 7.2, 0],
    distance: 26,
    fov: 32,
    yaw: 0.7,
    pitch: 0.16,
  })
}
