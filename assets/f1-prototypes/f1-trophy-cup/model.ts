// f1-trophy-cup — Studio Piet Boon / Royal Delft Zandvoort winner's cup
// (1939 silhouette, 2021– redesign). Faceted ceramic, angular handles,
// cobalt disc medallion. Height is FIA Appendix 5 winner band (0.50–0.65 m).
// No championship mark, team, or sponsor IP.

import { BufferGeometry, Group, Mesh, MeshStandardMaterial, Vector3, type Material } from 'three/webgpu'

import {
  TOKEN,
  TROPHY_CUP,
  acquireF1Materials,
  createF1Preview,
  disposeF1Materials,
  bevelDisc,
  facetRadius,
  revolve,
  shade,
  taperedTube,
} from '../f1-kit-core/index.ts'

type Slot = 'cup' | 'handles'

export interface F1TrophyCupConfig {
  height: number
}

export interface F1TrophyCupOptions extends Partial<F1TrophyCupConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1TrophyCupInstance {
  readonly root: Group
  readonly parts: { cup: Group; handles: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1TrophyCupConfig>
  configure(patch: Partial<F1TrophyCupConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1TrophyCupConfig = { height: TROPHY_CUP.height }

export function createModel(options: F1TrophyCupOptions = {}): F1TrophyCupInstance {
  const config: F1TrophyCupConfig = {
    height: Math.max(0.25, options.height ?? defaults.height),
  }
  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const ceramic = new MeshStandardMaterial({
    name: 'f1-kit / delft ceramic',
    color: shade(TOKEN.SHELL_050, 0.15),
    roughness: 0.22,
    metalness: 0,
  })
  const extras: Material[] = [ceramic]
  const materialSlots: Record<Slot, Material> = {
    cup: options.materials?.cup ?? ceramic,
    handles: options.materials?.handles ?? ceramic,
  }
  const root = new Group(); root.name = 'f1-trophy-cup'
  const cup = new Group(); cup.name = 'cup'
  const handles = new Group(); handles.name = 'handles'
  root.add(cup, handles)
  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { cup: [], handles: [] }
  const releaseGenerated = (): void => {
    cup.clear(); handles.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
  }
  const emit = (
    slot: Slot,
    geometry: BufferGeometry,
    group: Group,
    name: string,
    material?: Material,
  ): void => {
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
    const k = h / TROPHY_CUP.height
    const bowlR = facetRadius(TROPHY_CUP.bowlR * k, 8)
    const footR = facetRadius(TROPHY_CUP.footR * 1.2 * k, 8)
    const body = revolve(
      [
        [0.00, 0.002],
        [0.03, footR],
        [0.12, footR],
        [0.18, footR * 0.70],
        [0.28, footR * 0.48],
        [0.40, footR * 0.50],
        [0.50, bowlR * 0.58],
        [0.62, bowlR],
        [0.78, bowlR * 1.05],
        [0.90, bowlR * 0.98],
        [0.96, bowlR * 0.92],
        [1.00, bowlR * 0.90],
      ],
      { yBot: 0, yTop: h, scaleW: 1, segments: 8 },
    )
    emit('cup', body, cup, 'body')
    const disc = bevelDisc(bowlR * 0.28, 0.014 * k, 0.002, 24)
    disc.translate(0, h * 0.70, bowlR * 0.94)
    generated.push(disc)
    const discMesh = new Mesh(disc, kit.cobalt)
    discMesh.name = 'medallion'
    discMesh.castShadow = true
    cup.add(discMesh)
    const handleR = 0.020 * k
    for (const sx of [-1, 1] as const) {
      const path = [
        new Vector3(sx * bowlR * 0.90, h * 0.58, 0),
        new Vector3(sx * (bowlR + 0.018 * k), h * 0.57, 0),
        new Vector3(sx * (bowlR + 0.070 * k), h * 0.64, 0),
        new Vector3(sx * (bowlR + 0.070 * k), h * 0.86, 0),
        new Vector3(sx * (bowlR + 0.018 * k), h * 0.91, 0),
        new Vector3(sx * bowlR * 0.86, h * 0.92, 0),
      ]
      emit('handles', taperedTube(path, handleR, 6), handles, `handle-${sx}`)
    }
  }
  rebuild()
  return {
    root,
    parts: { cup, handles },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.height !== undefined) config.height = Math.max(0.25, patch.height)
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
    aspect, target: [0, 0.30, 0], distance: 1.55, fov: 28, yaw: -0.55, pitch: 0.10,
  })
}
