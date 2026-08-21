// f1-champagne — unbranded 1.5 L magnum (punt, foil, muselet). Dark glass,
// not a teal toy bottle. No house mark.

import { BufferGeometry, Group, Mesh, MeshStandardMaterial, Vector3, type Material } from 'three/webgpu'

import {
  CHAMPAGNE,
  TOKEN,
  acquireF1Materials,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
  revolve,
  shade,
  taperedTube,
} from '../f1-kit-core/index.ts'

type Slot = 'glass' | 'cage'

export interface F1ChampagneConfig {
  height: number
}

export interface F1ChampagneOptions extends Partial<F1ChampagneConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1ChampagneInstance {
  readonly root: Group
  readonly parts: { glass: Group; cage: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1ChampagneConfig>
  configure(patch: Partial<F1ChampagneConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1ChampagneConfig = { height: CHAMPAGNE.height }

export function createModel(options: F1ChampagneOptions = {}): F1ChampagneInstance {
  const config: F1ChampagneConfig = {
    height: Math.max(0.22, options.height ?? defaults.height),
  }
  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const glassMat = new MeshStandardMaterial({
    name: 'f1-kit / magnum glass',
    color: shade(TOKEN.INK_950, 0.18),
    roughness: 0.22,
    metalness: 0.08,
  })
  const extras: Material[] = [glassMat]
  const materialSlots: Record<Slot, Material> = {
    glass: options.materials?.glass ?? glassMat,
    cage: options.materials?.cage ?? kit.steel,
  }
  const root = new Group(); root.name = 'f1-champagne'
  const glass = new Group(); glass.name = 'glass'
  const cage = new Group(); cage.name = 'cage'
  root.add(glass, cage)
  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { glass: [], cage: [] }
  const releaseGenerated = (): void => {
    glass.clear(); cage.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
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
    const h = config.height
    const k = h / CHAMPAGNE.height
    const bodyR = CHAMPAGNE.bodyR * k
    const neckR = CHAMPAGNE.neckR * k
    const foilH = CHAMPAGNE.foilH * k
    const puntH = 0.028 * k
    emit('glass', revolve(
      [
        [0.00, bodyR * 0.38],
        [0.06, bodyR * 0.55],
        [0.14, bodyR],
        [0.52, bodyR],
        [0.64, bodyR * 0.55],
        [0.74, neckR],
        [0.88, neckR],
        [0.94, neckR * 1.15],
        [1.00, neckR * 0.55],
      ],
      { yBot: 0, yTop: h, scaleW: 1, segments: 24 },
    ), glass, 'bottle')
    emit('glass', revolve(
      [
        [0.00, bodyR * 0.36],
        [1.00, 0.001],
      ],
      { yBot: 0.003 * k, yTop: puntH, scaleW: 1, segments: 16 },
    ), glass, 'punt')
    emit('glass', revolve(
      [
        [0.00, neckR * 1.35],
        [0.55, neckR * 1.45],
        [1.00, neckR * 0.70],
      ],
      { yBot: h - foilH, yTop: h + 0.006 * k, scaleW: 1, segments: 20 },
    ), glass, 'foil')
    const wires: BufferGeometry[] = []
    const cageY = h - foilH * 0.35
    const cageR = neckR * 1.55
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      wires.push(taperedTube([
        new Vector3(Math.cos(a) * cageR, cageY, Math.sin(a) * cageR),
        new Vector3(Math.cos(a) * neckR * 0.9, h + 0.004 * k, Math.sin(a) * neckR * 0.9),
      ], 0.0016 * k, 6))
    }
    const hoop = taperedTube(
      Array.from({ length: 13 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2
        return new Vector3(Math.cos(a) * cageR, cageY, Math.sin(a) * cageR)
      }),
      0.0014 * k,
      6,
    )
    wires.push(hoop)
    emit('cage', mergeParts(wires, 'cage'), cage, 'cage')
  }
  rebuild()
  return {
    root,
    parts: { glass, cage },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.height !== undefined) config.height = Math.max(0.22, patch.height)
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
  return createF1Preview(createModel(), {
    aspect, target: [0, 0.18, 0], distance: 0.95, fov: 28, yaw: -0.4, pitch: 0.08,
  })
}
