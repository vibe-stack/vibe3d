// f1-tunnel-portal — concrete arch tunnel opening.

import { BufferGeometry, Group, Mesh, type Material } from 'three/webgpu'

import {
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  loftAlongX,
  mergeParts,
} from '../f1-kit-core/index.ts'

type Slot = 'shell' | 'arch'

export interface F1TunnelPortalConfig {
  width: number
  height: number
}

export interface F1TunnelPortalOptions extends Partial<F1TunnelPortalConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1TunnelPortalInstance {
  readonly root: Group
  readonly parts: { shell: Group; arch: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1TunnelPortalConfig>
  configure(patch: Partial<F1TunnelPortalConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1TunnelPortalConfig = { width: 5, height: 3.2 }
const DEPTH = 1.8
const WALL = 0.45

export function createModel(options: F1TunnelPortalOptions = {}): F1TunnelPortalInstance {
  const config: F1TunnelPortalConfig = {
    width: Math.max(3, options.width ?? defaults.width),
    height: Math.max(2, options.height ?? defaults.height),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    shell: options.materials?.shell ?? kit.shell,
    arch: options.materials?.arch ?? kit.slate,
  }

  const root = new Group(); root.name = 'f1-tunnel-portal'
  const shell = new Group(); shell.name = 'shell'
  const arch = new Group(); arch.name = 'arch'
  root.add(shell, arch)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { shell: [], arch: [] }

  const releaseGenerated = (): void => {
    shell.clear(); arch.clear()
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
    const { width, height } = config
    const halfW = width / 2
    const shellParts: BufferGeometry[] = []
    shellParts.push(bevelBox(WALL, height, DEPTH, 0.012).translate(-(halfW + WALL / 2), height / 2, 0))
    shellParts.push(bevelBox(WALL, height, DEPTH, 0.012).translate(halfW + WALL / 2, height / 2, 0))
    shellParts.push(bevelBox(width + WALL * 2, WALL, DEPTH, 0.012).translate(0, WALL / 2, 0))
    emit('shell', mergeParts(shellParts, 'walls'), shell, 'walls')

    const archProfile: Array<readonly [number, number]> = []
    const segs = 12
    for (let i = 0; i <= segs; i++) {
      const t = i / segs
      const ang = Math.PI * t
      const x = -halfW + halfW * 2 * t
      const y = height * 0.55 + Math.sin(ang) * height * 0.45
      archProfile.push([x, y])
    }
    archProfile.push([halfW, 0], [-halfW, 0])
    const ring = loftAlongX(archProfile, DEPTH, { closed: true })
    emit('arch', ring, arch, 'arch-ring')
    const lintel = bevelBox(width + WALL * 2, 0.18, DEPTH + 0.12, 0.01)
    lintel.translate(0, height + 0.08, 0)
    emit('arch', lintel, arch, 'lintel', kit.graphite)
  }
  rebuild()

  return {
    root,
    parts: { shell, arch },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.width !== undefined) config.width = Math.max(3, patch.width)
      if (patch.height !== undefined) config.height = Math.max(2, patch.height)
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
  return createF1Preview(createModel({ width: 4.5, height: 3 }), {
    aspect,
    target: [0, 1.6, 0],
    distance: 8,
    fov: 30,
    yaw: -0.15,
    pitch: 0.06,
  })
}
