// f1-tunnel-portal — concrete underpass whose opening faces the camera: dark throat,
// yellow/black chevrons on the mouth. Not a grey U seen from the side.

import { BufferGeometry, Group, Mesh, type Material } from 'three/webgpu'

import {
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
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
const DEPTH = 3.4
const WALL = 0.5

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
    const { width, height } = config
    const halfW = width / 2
    const shellParts: BufferGeometry[] = []
    shellParts.push(bevelBox(WALL, height + 0.35, DEPTH, 0.02).translate(-(halfW + WALL / 2), (height + 0.35) / 2, 0))
    shellParts.push(bevelBox(WALL, height + 0.35, DEPTH, 0.02).translate(halfW + WALL / 2, (height + 0.35) / 2, 0))
    shellParts.push(bevelBox(width + WALL * 2, 0.45, DEPTH, 0.02).translate(0, height + 0.22, 0))
    emit('shell', mergeParts(shellParts, 'walls'), shell, 'walls')

    const back = bevelBox(width - 0.08, height - 0.08, 0.1, 0.008)
    back.translate(0, height / 2, -DEPTH / 2 + 0.05)
    emit('arch', back, arch, 'throat', kit.ink)
    const cheekL = bevelBox(0.06, height - 0.08, DEPTH - 0.2, 0.006)
    cheekL.translate(-(halfW - 0.03), height / 2, -0.04)
    const cheekR = bevelBox(0.06, height - 0.08, DEPTH - 0.2, 0.006)
    cheekR.translate(halfW - 0.03, height / 2, -0.04)
    emit('arch', mergeParts([cheekL, cheekR], 'cheeks'), arch, 'cheeks', kit.ink)
    const floor = bevelBox(width - 0.08, 0.08, DEPTH - 0.12, 0.008)
    floor.translate(0, 0.04, -0.02)
    emit('shell', floor, shell, 'deck', kit.graphite)

    const mouthZ = DEPTH / 2 + 0.02
    const jamb = 0.28
    const ringParts: BufferGeometry[] = []
    ringParts.push(bevelBox(jamb, height + 0.2, 0.22, 0.01).translate(-(halfW + jamb / 2 - 0.04), height / 2 + 0.06, mouthZ))
    ringParts.push(bevelBox(jamb, height + 0.2, 0.22, 0.01).translate(halfW + jamb / 2 - 0.04, height / 2 + 0.06, mouthZ))
    ringParts.push(bevelBox(width + jamb, 0.28, 0.22, 0.01).translate(0, height + 0.08, mouthZ))
    emit('arch', mergeParts(ringParts, 'mouth-ring'), arch, 'mouth-ring', kit.graphite)

    const chevrons: BufferGeometry[] = []
    const inks: BufferGeometry[] = []
    const bands = 6
    for (let i = 0; i < bands; i++) {
      const y = 0.28 + i * ((height - 0.2) / bands)
      const stripe = bevelBox(0.22, 0.22, 0.05, 0.004)
      stripe.rotateZ(0.78)
      stripe.translate(-(halfW + 0.1), y, mouthZ + 0.12)
      const stripeR = bevelBox(0.22, 0.22, 0.05, 0.004)
      stripeR.rotateZ(-0.78)
      stripeR.translate(halfW + 0.1, y, mouthZ + 0.12)
      if (i % 2 === 0) chevrons.push(stripe, stripeR)
      else inks.push(stripe, stripeR)
    }
    emit('arch', mergeParts(chevrons, 'chevrons'), arch, 'chevrons', kit.amber)
    emit('arch', mergeParts(inks, 'chevron-ink'), arch, 'chevron-ink', kit.ink)
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
  return createF1Preview(createModel({ width: 4.6, height: 3.1 }), {
    aspect,
    target: [0, 1.45, 0.15],
    distance: 13.6,
    fov: 32,
    yaw: 0.46,
    pitch: 0.14,
  })
}
