// f1-banner-bridge — walkway branding gantry. Deck at 3.0 m (not the 5.5 m spectator
// bridge, not the start gantry). Unbranded fascia; host hangs an image via setMaterial.

import {
  BufferGeometry,
  DataTexture,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector3,
  type Material,
} from 'three/webgpu'

import {
  BANNER_BRIDGE,
  LAYER_CLEARANCE,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  fasciaTexture,
  isFasciaStyle,
  member,
  mergeParts,
  type FasciaStyle,
} from '../f1-kit-core/index.ts'

type Slot = 'frame' | 'fascia'

export interface F1BannerBridgeConfig {
  span: number
  style: FasciaStyle
}

export interface F1BannerBridgeOptions extends Partial<F1BannerBridgeConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1BannerBridgeInstance {
  readonly root: Group
  readonly parts: { frame: Group; fascia: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1BannerBridgeConfig>
  configure(patch: Partial<F1BannerBridgeConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1BannerBridgeConfig = { span: 8, style: 'stamp' }
const DECK_H = BANNER_BRIDGE.deckHeight
const WIDTH = BANNER_BRIDGE.width

export function createModel(options: F1BannerBridgeOptions = {}): F1BannerBridgeInstance {
  const config: F1BannerBridgeConfig = {
    span: Math.max(4, options.span ?? defaults.span),
    style: options.style && isFasciaStyle(options.style) ? options.style : defaults.style,
  }
  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const textures: DataTexture[] = []
  let ownsFascia = options.materials?.fascia === undefined
  const materialSlots: Record<Slot, Material> = {
    frame: options.materials?.frame ?? kit.steel,
    fascia: options.materials?.fascia ?? kit.shell,
  }
  const root = new Group(); root.name = 'f1-banner-bridge'
  const frame = new Group(); frame.name = 'frame'
  const fascia = new Group(); fascia.name = 'fascia'
  root.add(frame, fascia)
  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { frame: [], fascia: [] }
  const releaseOwned = (): void => {
    for (const texture of textures) texture.dispose()
    textures.length = 0
    for (const material of extras) material.dispose()
    extras.length = 0
  }
  const releaseGenerated = (): void => {
    frame.clear(); fascia.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
    if (ownsFascia) releaseOwned()
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
    const span = config.span
    const half = span / 2
    const parts: BufferGeometry[] = []
    for (const sx of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        parts.push(member(
          new Vector3(sx * half, 0.05, sz * WIDTH / 2),
          new Vector3(sx * half, DECK_H, sz * WIDTH / 2),
          0.045,
          10,
        ))
      }
      parts.push(member(
        new Vector3(-half, DECK_H, sx * WIDTH / 2),
        new Vector3(half, DECK_H, sx * WIDTH / 2),
        0.04,
        10,
      ))
    }
    const deck = bevelBox(span, 0.06, WIDTH, 0.008)
    deck.translate(0, DECK_H, 0)
    parts.push(deck)
    emit('frame', mergeParts(parts, 'span'), frame, 'span')

    const bannerH = 0.9
    const face = new PlaneGeometry(span - 0.5, bannerH)
    face.translate(0, DECK_H - bannerH / 2 - 0.08, WIDTH / 2 + LAYER_CLEARANCE * 3)
    if (ownsFascia) {
      const tex = fasciaTexture({ number: 'GP', legend: 'PADDOCK', style: config.style })
      textures.push(tex)
      const mat = new MeshStandardMaterial({
        name: 'f1-kit / banner-bridge fascia',
        map: tex,
        roughness: 0.55,
        metalness: 0.04,
      })
      extras.push(mat)
      emit('fascia', face, fascia, 'face', mat)
    } else {
      emit('fascia', face, fascia, 'face')
    }
  }
  rebuild()
  return {
    root,
    parts: { frame, fascia },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.span !== undefined) config.span = Math.max(4, patch.span)
      if (patch.style !== undefined && isFasciaStyle(patch.style)) config.style = patch.style
      rebuild()
    },
    setMaterial(slot, material) {
      if (slot === 'fascia' && ownsFascia) {
        releaseOwned()
        ownsFascia = false
      }
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
  return createF1Preview(createModel({ span: 8 }), {
    aspect, target: [0, 2.2, 0], distance: 16, fov: 32, yaw: 0.35, pitch: 0.1,
  })
}
