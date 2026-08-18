// Ownership and runtime-contract tests for the three rebuilt F1 props.
//
// This kit has leaked a material once already (a per-rebuild sidewall material that was nulled but never
// disposed), and `f1-tyre.setMaterial` was a silent no-op for its whole first life, so both are
// covered here by construction rather than by inspection.

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { BufferGeometry, Material, Mesh, MeshStandardMaterial, Box3, Vector3 } from 'three/webgpu'

import { createModel as createTyre } from './f1-tyre/model.ts'
import { createModel as createStack } from './f1-tyre-stack/model.ts'
import { createModel as createReel } from './f1-hose-reel/model.ts'
import { createModel as createPitBoard } from './f1-pit-board/model.ts'
import { createModel as createGantry } from './f1-pit-gantry/model.ts'
import { createModel as createLollipop } from './f1-lollipop-board/model.ts'
import { createModel as createTyreGun } from './f1-tyre-gun/model.ts'
import { createModel as createPitJack } from './f1-pit-jack/model.ts'
import { createModel as createCabinet } from './f1-tool-cabinet/model.ts'
import { createModel as createExtinguisher } from './f1-fire-extinguisher/model.ts'
import { createModel as createGunRack } from './f1-gun-rack/model.ts'
import { createModel as createCatchFence } from './f1-catch-fence/model.ts'
import { createModel as createArmco } from './f1-armco/model.ts'
import { createModel as createTyreBarrier } from './f1-tyre-barrier/model.ts'
import { createModel as createTecpro } from './f1-tecpro/model.ts'
import { createModel as createStartLights } from './f1-start-lights/model.ts'
import { createModel as createKerb } from './f1-kerb/model.ts'
import { createModel as createFloodlight } from './f1-floodlight/model.ts'
import { createModel as createTimingPylon } from './f1-timing-pylon/model.ts'
import { createModel as createBrakeMarker } from './f1-brake-marker/model.ts'
import { createModel as createJumbotron } from './f1-jumbotron/model.ts'
import { createModel as createMarshalPost } from './f1-marshal-post/model.ts'
import { createModel as createStartGantry } from './f1-start-gantry/model.ts'
import { createModel as createGrandstandBay } from './f1-grandstand-bay/model.ts'
import { createModel as createOranjeCan } from './f1-oranje-can/model.ts'

// --- dispose instrumentation -------------------------------------------------------------------------

const disposeCounts = new Map<object, number>()
let restore: Array<() => void> = []

const instrument = (proto: { dispose: () => void }): void => {
  const original = proto.dispose
  proto.dispose = function patched(this: object) {
    disposeCounts.set(this, (disposeCounts.get(this) ?? 0) + 1)
    return original.call(this)
  }
  restore.push(() => { proto.dispose = original })
}

const countOf = (resource: object): number => disposeCounts.get(resource) ?? 0

/** Every geometry and material reachable from a model root, before it is disposed. */
const resourcesOf = (root: { traverse: (fn: (o: unknown) => void) => void }): {
  geometries: BufferGeometry[]
  materials: Material[]
} => {
  const geometries = new Set<BufferGeometry>()
  const materials = new Set<Material>()
  root.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    geometries.add(mesh.geometry as BufferGeometry)
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      materials.add(material as Material)
    }
  })
  return { geometries: [...geometries], materials: [...materials] }
}

beforeEach(() => {
  disposeCounts.clear()
  restore = []
  instrument(BufferGeometry.prototype as unknown as { dispose: () => void })
  instrument(Material.prototype as unknown as { dispose: () => void })
})

afterEach(() => {
  for (const undo of restore) undo()
  restore = []
})

const factories = {
  'f1-tyre': () => createTyre(),
  'f1-tyre-stack': () => createStack({ count: 3 }),
  'f1-hose-reel': () => createReel({ wraps: 3, layers: 2 }),
  'f1-pit-board': () => createPitBoard(),
  'f1-pit-gantry': () => createGantry(),
  'f1-lollipop-board': () => createLollipop(),
  'f1-tyre-gun': () => createTyreGun(),
  'f1-pit-jack': () => createPitJack(),
  'f1-tool-cabinet': () => createCabinet(),
  'f1-fire-extinguisher': () => createExtinguisher(),
  'f1-gun-rack': () => createGunRack(),
  'f1-catch-fence': () => createCatchFence({ length: 6, height: 3 }),
  'f1-armco': () => createArmco({ bays: 2 }),
  'f1-tyre-barrier': () => createTyreBarrier({ columns: 2, rows: 2, depth: 1 }),
  'f1-tecpro': () => createTecpro({ columns: 2, rows: 2 }),
  'f1-start-lights': () => createStartLights({ lit: 3 }),
  'f1-kerb': () => createKerb({ modules: 4 }),
  'f1-floodlight': () => createFloodlight({ height: 8 }),
  'f1-timing-pylon': () => createTimingPylon({ height: 6 }),
  'f1-brake-marker': () => createBrakeMarker({ distance: 100 }),
  'f1-jumbotron': () => createJumbotron({ width: 4 }),
  'f1-marshal-post': () => createMarshalPost(),
  'f1-start-gantry': () => createStartGantry({ span: 8, height: 5 }),
  'f1-grandstand-bay': () => createGrandstandBay({ rows: 4, width: 5 }),
  'f1-oranje-can': () => createOranjeCan({ lit: true }),
} as const

describe.each(Object.keys(factories) as Array<keyof typeof factories>)('%s ownership', (id) => {
  test('disposes every owned resource exactly once', () => {
    const model = factories[id]()
    const { geometries, materials } = resourcesOf(model.root)
    expect(geometries.length).toBeGreaterThan(0)
    expect(materials.length).toBeGreaterThan(0)

    model.dispose()

    // Rule 16: exactly once. Twice is as much a bug as never.
    for (const geometry of geometries) expect(countOf(geometry)).toBe(1)
    for (const material of materials) expect(countOf(material)).toBe(1)
  })

  test('is safe to dispose twice', () => {
    const model = factories[id]()
    const { geometries, materials } = resourcesOf(model.root)
    model.dispose()
    model.dispose()
    for (const resource of [...geometries, ...materials]) {
      expect(countOf(resource)).toBeLessThanOrEqual(2)
    }
  })

  test('keeps the root and its part groups stable across a rebuild (rule 14)', () => {
    const model = factories[id]()
    const rootId = model.root.uuid
    const partIds = Object.values(model.parts as Record<string, { uuid: string }>).map((p) => p.uuid)

    model.configure(model.getConfig() as never)

    expect(model.root.uuid).toBe(rootId)
    expect(Object.values(model.parts as Record<string, { uuid: string }>).map((p) => p.uuid))
      .toEqual(partIds)
    model.dispose()
  })

  test('does not accumulate live geometry across rebuild cycles', () => {
    const model = factories[id]()
    const firstGeneration = resourcesOf(model.root).geometries
    const baseline = firstGeneration.length

    for (let cycle = 0; cycle < 3; cycle++) {
      model.configure(model.getConfig() as never)
      expect(resourcesOf(model.root).geometries.length).toBe(baseline)
    }

    // Anything from generation 1 that a rebuild replaced must already be released; anything still live
    // must not have been disposed. Some props (the gun, the jack) configure a transform rather than
    // regenerating geometry, so their generation-1 set is legitimately still the live set.
    const live = new Set(resourcesOf(model.root).geometries)
    for (const geometry of firstGeneration) {
      expect(countOf(geometry)).toBe(live.has(geometry) ? 0 : 1)
    }
    model.dispose()
  })
})

describe('material slots', () => {
  test('setMaterial retargets live meshes without a rebuild', () => {
    // This assertion fails against the original tyre, whose setMaterial wrote to a slot map that
    // rebuild() never read back.
    const model = createTyre()
    const probe = new MeshStandardMaterial({ color: 0xff00ff })

    model.setMaterial('cover', probe)

    let hits = 0
    model.root.traverse((object) => {
      const mesh = object as Mesh
      if (mesh.isMesh && mesh.material === probe) hits++
    })
    expect(hits).toBeGreaterThan(0)
    expect(model.materials.cover).toBe(probe)

    model.dispose()
    // A consumer-supplied material is never owned, so the model must not dispose it (rule 16).
    expect(countOf(probe)).toBe(0)
    probe.dispose()
  })

  test('a tyre never disposes a material its consumer supplied', () => {
    const shared = new MeshStandardMaterial()
    const tyre = createTyre({ materials: { cover: shared } })
    tyre.dispose()
    expect(countOf(shared)).toBe(0)
    shared.dispose()
  })

  test('a single gun hangs on the rail centre', () => {
    const rack = createGunRack({ count: 1 })
    expect(rack.parts.guns.children).toHaveLength(1)
    expect(rack.parts.guns.children[0]!.position.x).toBeCloseTo(0, 5)
    rack.dispose()
  })

  test('a stack owns the cover/accent materials it shares across its child tyres', () => {
    // Four children share one pair of materials. If the children disposed them, the pair would be
    // disposed four times over and the siblings would be rendering freed materials.
    const stack = createStack({ count: 4 })
    const childMaterials = new Set<Material>()
    stack.parts.tyres.traverse((object) => {
      const mesh = object as Mesh
      if (mesh.isMesh) childMaterials.add(mesh.material as Material)
    })
    stack.dispose()
    for (const material of childMaterials) expect(countOf(material)).toBe(1)
  })
})

describe('applied-layer clearance (rule 8)', () => {
  // Every applied detail must either stand clear of its host by at least 15 mm or bite into it by at
  // least 2 mm. The failure this catches is the original tyre's habit of parking discs a fraction of a
  // millimetre off the sidewall, which both z-fights and reads as a decal.
  // Scoped to meshes within the same semantic part group. World-space AABBs cannot judge a detail placed
  // radially on a cylindrical host — a cable gland standing well clear of a tyre's surface still falls
  // inside that tyre's bounding cube — so cross-group pairs produce false positives. Layering that rule 8
  // actually governs (a marking on its own sidewall, a strap on its own sleeve) is within a group.
  test.each(Object.keys(factories) as Array<keyof typeof factories>)('%s', (id) => {
    const model = factories[id]()
    model.root.updateMatrixWorld(true)

    const offenders: string[] = []
    for (const group of Object.values(model.parts as Record<string, Mesh>)) {
      const boxes: Array<{ name: string; box: Box3 }> = []
      group.traverse((object) => {
        const mesh = object as Mesh
        if (!mesh.isMesh) return
        boxes.push({ name: mesh.name || 'unnamed', box: new Box3().setFromObject(mesh) })
      })

      for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!
        const b = boxes[j]!
        if (!a.box.intersectsBox(b.box)) continue
        const overlap = new Box3().copy(a.box).intersect(b.box)
        const size = overlap.getSize(new Vector3())
        const dims = [size.x, size.y, size.z].sort((p, q) => p - q)
        const [thinnest, mid, widest] = dims as [number, number, number]
        // The defect is a broad detail lying a hair off a broad host — thin in exactly one axis and
        // wide in the other two. A part merely passing close by (a cable routed past a tyre) grazes in
        // one axis but is narrow in another, and is not a layering problem.
        const plateLike = mid > 0.02 && widest > 0.02
        if (thinnest > 0 && thinnest < 0.002 && plateLike) {
          offenders.push(`${a.name} / ${b.name} = ${thinnest.toFixed(5)} m`)
        }
      }
      }
    }

    expect(offenders).toEqual([])
    model.dispose()
  })
})

describe('procedural knobs', () => {
  test('glyph atlas covers 0-9 and timing-sheet letters', async () => {
    const { GLYPH_3X5 } = await import('./f1-kit-core/glyphs.ts')
    for (const ch of '0123456789PLATIME') {
      expect(GLYPH_3X5[ch]).toHaveLength(15)
    }
    expect(GLYPH_3X5['1']).toEqual([0, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 1])
    expect(GLYPH_3X5['2']).toEqual([1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1])
  })

  test('jumbotron entries round-trip through configure', () => {
    const model = createJumbotron({ width: 4 })
    expect(model.getConfig().entries).toHaveLength(4)
    const entries = [
      { p: 9, code: 'Z9', lap: 3, time: '1:19.9' },
      { p: 10, code: 'Y8', lap: 3, time: '1:20.1' },
    ]
    model.configure({ entries })
    expect(model.getConfig().entries).toEqual([
      { p: 9, code: 'Z9', lap: 3, time: '1:19.9' },
      { p: 10, code: 'Y8', lap: 3, time: '1:20.1' },
    ])
    model.dispose()
  })

  test('timing pylon positions drive cabinet count', () => {
    const model = createTimingPylon({ height: 6, positions: [9, 8, 7, 6] })
    expect(model.getConfig().positions).toEqual([9, 8, 7, 6])
    expect(model.parts.screens.children).toHaveLength(4)
    model.configure({ positions: [1, 2] })
    expect(model.parts.screens.children).toHaveLength(2)
    model.dispose()
  })

  test('marshal post number and flag are knobs', () => {
    const model = createMarshalPost({ number: '7', flag: 'green' })
    expect(model.getConfig()).toEqual({ number: '7', flag: 'green' })
    model.configure({ number: '42', flag: 'red' })
    expect(model.getConfig()).toEqual({ number: '42', flag: 'red' })
    model.dispose()
  })

  test('start-lights mode and color round-trip', () => {
    const model = createStartLights({ lit: 3, mode: 'formation' })
    expect(model.getConfig().mode).toBe('formation')
    model.configure({ mode: 'go', color: 0x57b57a })
    expect(model.getConfig().mode).toBe('go')
    expect(model.getConfig().color).toBe(0x57b57a)
    model.configure({ rows: 3 })
    expect(model.getConfig().rows).toBe(3)
    model.dispose()
  })

  test('tyre barrier compound is a knob', () => {
    const model = createTyreBarrier({ columns: 2, rows: 2, depth: 1, compound: 'soft' })
    expect(model.getConfig().compound).toBe('soft')
    model.configure({ compound: 'wet' })
    expect(model.getConfig().compound).toBe('wet')
    model.dispose()
  })

  test('pit-board labels round-trip through configure', () => {
    const model = createPitBoard({ rowCount: 2, cardsPerRow: 3, labels: [['9', '1.1', '7']] })
    expect(model.getConfig().labels[0]).toEqual(['9', '1.1', '7'])
    model.configure({ labels: [['3', '0.4', '11']] })
    expect(model.getConfig().labels[0]).toEqual(['3', '0.4', '11'])
    model.dispose()
  })

  test('lollipop legend round-trips and sanitizes', () => {
    const model = createLollipop({ legend: 'BRAKES' })
    expect(model.getConfig().legend).toBe('BRAKES')
    model.configure({ legend: 'gear!!' })
    expect(model.getConfig().legend).toBe('GEAR')
    model.dispose()
  })

  test('oranje can lit and wind round-trip', () => {
    const model = createOranjeCan({ lit: true, windXZ: [-0.692, 0.722] })
    expect(model.getConfig().lit).toBe(true)
    model.configure({ lit: false, windXZ: [1, 0] })
    expect(model.getConfig().lit).toBe(false)
    expect(model.getConfig().windXZ[0]).toBeCloseTo(1, 5)
    expect(model.getConfig().windXZ[1]).toBeCloseTo(0, 5)
    model.dispose()
  })

  test('a dry-compound tyre defaults to slick and skips the grooved tread mesh', () => {
    const slick = createTyre({ compound: 'soft' })
    expect(slick.getConfig().tread).toBe('slick')
    let treadMeshes = 0
    slick.root.traverse((object) => {
      const mesh = object as Mesh
      if (mesh.isMesh && mesh.name === 'tread') treadMeshes++
    })
    expect(treadMeshes).toBe(0)
    slick.dispose()

    const wet = createTyre({ compound: 'intermediate' })
    expect(wet.getConfig().tread).toBe('grooved')
    wet.root.traverse((object) => {
      const mesh = object as Mesh
      if (mesh.isMesh && mesh.name === 'tread') treadMeshes++
    })
    expect(treadMeshes).toBe(1)
    wet.dispose()
  })

  test('kerb modules are 800 mm red/white bands with a 50 mm ramp', () => {
    const model = createKerb({ modules: 4 })
    expect(model.getConfig().modules).toBe(4)
    model.root.updateMatrixWorld(true)
    const box = new Box3().setFromObject(model.root)
    const size = box.getSize(new Vector3())
    expect(size.x).toBeCloseTo(3.2, 1)
    expect(size.z).toBeCloseTo(0.8, 1)
    expect(box.max.y).toBeGreaterThan(0.08)
    expect(box.max.y).toBeLessThan(0.14)
    expect(box.min.y).toBeLessThan(0)
    model.configure({ modules: 6 })
    expect(model.getConfig().modules).toBe(6)
    const next = new Box3().setFromObject(model.root).getSize(new Vector3())
    expect(next.x).toBeCloseTo(4.8, 1)
    model.dispose()
  })

  test('floodlight cans pitch the lens face down onto the track', () => {
    const model = createFloodlight({ height: 8 })
    model.root.updateMatrixWorld(true)
    let cans: Mesh | undefined
    let lenses: Mesh | undefined
    const spots: Array<{ position: Vector3; target: { position: Vector3 } }> = []
    model.root.traverse((object) => {
      const mesh = object as Mesh
      if (mesh.isMesh && mesh.name === 'cans') cans = mesh
      if (mesh.isMesh && mesh.name === 'lenses') lenses = mesh
      if ((object as { isSpotLight?: boolean }).isSpotLight) {
        spots.push(object as { position: Vector3; target: { position: Vector3 } })
      }
    })
    expect(cans).toBeDefined()
    expect(lenses).toBeDefined()
    expect(spots.length).toBe(4)
    const centre = (mesh: Mesh): Vector3 => {
      mesh.geometry.computeBoundingBox()
      return mesh.geometry.boundingBox!.getCenter(new Vector3())
    }
    // Lenses live on the +Z face; after rotateX(+0.55) that face drops below the can centroid.
    expect(centre(lenses!).y).toBeLessThan(centre(cans!).y)
    for (const spot of spots) {
      expect(spot.target.position.y).toBeLessThan(spot.position.y)
      expect(spot.target.position.z).toBeGreaterThan(spot.position.z)
    }
    model.dispose()
  })
})
