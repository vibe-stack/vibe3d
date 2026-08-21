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
import { createModel as createConcreteWall } from './f1-concrete-wall/model.ts'
import { createModel as createSausageKerb } from './f1-sausage-kerb/model.ts'
import { createModel as createAstroturf } from './f1-astroturf-strip/model.ts'
import { createModel as createJersey } from './f1-jersey-barrier/model.ts'
import { createModel as createAccessGate } from './f1-access-gate/model.ts'
import { createModel as createCrashCushion } from './f1-crash-cushion/model.ts'
import { createModel as createGravelTrap } from './f1-gravel-trap/model.ts'
import { createModel as createCrowdFence } from './f1-crowd-fence/model.ts'
import { createModel as createMarkerPost } from './f1-marker-post/model.ts'
import { createModel as createSlotDrain } from './f1-slot-drain/model.ts'
import { createModel as createStairs } from './f1-stairs/model.ts'
import { createModel as createCircuitSign } from './f1-circuit-sign/model.ts'
import { createModel as createGridBox } from './f1-grid-box/model.ts'
import { createModel as createStartFinishLine } from './f1-start-finish-line/model.ts'
import { createModel as createFiaLightPanel } from './f1-fia-light-panel/model.ts'
import { createModel as createChevronBoard } from './f1-chevron-board/model.ts'
import { createModel as createCameraTower } from './f1-camera-tower/model.ts'
import { createModel as createFoamMonitor } from './f1-foam-monitor/model.ts'
import { createModel as createCctvMast } from './f1-cctv-mast/model.ts'
import { createModel as createPaHorn } from './f1-pa-horn/model.ts'
import { createModel as createGarageBox } from './f1-garage-box/model.ts'
import { createModel as createPitWall } from './f1-pit-wall/model.ts'
import { createModel as createRaceControl } from './f1-race-control/model.ts'
import { createModel as createSpectatorBridge } from './f1-spectator-bridge/model.ts'
import { createModel as createPodium } from './f1-podium/model.ts'
import { createModel as createCone } from './f1-cone/model.ts'
import { createModel as createBollard } from './f1-bollard/model.ts'
import { createModel as createWeighbridge } from './f1-weighbridge/model.ts'
import { createModel as createParcFerme } from './f1-parc-ferme/model.ts'
import { createModel as createMedicalPost } from './f1-medical-post/model.ts'
import { createModel as createGeneratorCabin } from './f1-generator-cabin/model.ts'
import { createModel as createFlagPole } from './f1-flag-pole/model.ts'
import { createModel as createCameraPlatform } from './f1-camera-platform/model.ts'
import { createModel as createTunnelPortal } from './f1-tunnel-portal/model.ts'
import { createModel as createSectorGantry } from './f1-sector-gantry/model.ts'
import { createModel as createTrophyCup } from './f1-trophy-cup/model.ts'
import { createModel as createTrophyBowl } from './f1-trophy-bowl/model.ts'
import { createModel as createTrophyPlinth } from './f1-trophy-plinth/model.ts'
import { createModel as createChampagne } from './f1-champagne/model.ts'
import { createModel as createIceBucket } from './f1-ice-bucket/model.ts'
import { createModel as createTrophyTable } from './f1-trophy-table/model.ts'
import { createModel as createInterviewBackdrop } from './f1-interview-backdrop/model.ts'
import { createModel as createPressRiser } from './f1-press-riser/model.ts'
import { createModel as createCooldownBoard } from './f1-cooldown-board/model.ts'
import { createModel as createLedRibbon } from './f1-led-ribbon/model.ts'
import { createModel as createPitTotem } from './f1-pit-totem/model.ts'
import { createModel as createSectorBoard } from './f1-sector-board/model.ts'
import { createModel as createFanScreen } from './f1-fan-screen/model.ts'
import { createModel as createStartClock } from './f1-start-clock/model.ts'
import { createModel as createNameboard } from './f1-nameboard/model.ts'
import { createModel as createBannerBridge } from './f1-banner-bridge/model.ts'
import { createModel as createAFrame } from './f1-a-frame/model.ts'
import { createModel as createBarrierSleeve } from './f1-barrier-sleeve/model.ts'
import { createModel as createGazebo } from './f1-gazebo/model.ts'
import { createModel as createDrinkWall } from './f1-drink-wall/model.ts'
import { createModel as createFeatherFlag } from './f1-feather-flag/model.ts'
import { createModel as createServiceTruck, createPreview as createServiceTruckPreview } from './f1-service-truck/model.ts'
import { createModel as createStillage } from './f1-stillage/model.ts'
import { createModel as createHandTrolley } from './f1-hand-trolley/model.ts'
import { createModel as createCableRamp } from './f1-cable-ramp/model.ts'

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
  'f1-concrete-wall': () => createConcreteWall(),
  'f1-sausage-kerb': () => createSausageKerb(),
  'f1-astroturf-strip': () => createAstroturf(),
  'f1-jersey-barrier': () => createJersey(),
  'f1-access-gate': () => createAccessGate(),
  'f1-crash-cushion': () => createCrashCushion(),
  'f1-gravel-trap': () => createGravelTrap(),
  'f1-crowd-fence': () => createCrowdFence(),
  'f1-marker-post': () => createMarkerPost(),
  'f1-slot-drain': () => createSlotDrain(),
  'f1-stairs': () => createStairs(),
  'f1-circuit-sign': () => createCircuitSign(),
  'f1-grid-box': () => createGridBox(),
  'f1-start-finish-line': () => createStartFinishLine(),
  'f1-fia-light-panel': () => createFiaLightPanel(),
  'f1-chevron-board': () => createChevronBoard(),
  'f1-camera-tower': () => createCameraTower(),
  'f1-foam-monitor': () => createFoamMonitor(),
  'f1-cctv-mast': () => createCctvMast(),
  'f1-pa-horn': () => createPaHorn(),
  'f1-garage-box': () => createGarageBox(),
  'f1-pit-wall': () => createPitWall(),
  'f1-race-control': () => createRaceControl(),
  'f1-spectator-bridge': () => createSpectatorBridge(),
  'f1-podium': () => createPodium(),
  'f1-cone': () => createCone(),
  'f1-bollard': () => createBollard(),
  'f1-weighbridge': () => createWeighbridge(),
  'f1-parc-ferme': () => createParcFerme(),
  'f1-medical-post': () => createMedicalPost(),
  'f1-generator-cabin': () => createGeneratorCabin(),
  'f1-flag-pole': () => createFlagPole(),
  'f1-camera-platform': () => createCameraPlatform(),
  'f1-tunnel-portal': () => createTunnelPortal(),
  'f1-sector-gantry': () => createSectorGantry(),
  'f1-trophy-cup': () => createTrophyCup(),
  'f1-trophy-bowl': () => createTrophyBowl(),
  'f1-trophy-plinth': () => createTrophyPlinth(),
  'f1-champagne': () => createChampagne(),
  'f1-ice-bucket': () => createIceBucket(),
  'f1-trophy-table': () => createTrophyTable(),
  'f1-interview-backdrop': () => createInterviewBackdrop(),
  'f1-press-riser': () => createPressRiser(),
  'f1-cooldown-board': () => createCooldownBoard(),
  'f1-led-ribbon': () => createLedRibbon(),
  'f1-pit-totem': () => createPitTotem(),
  'f1-sector-board': () => createSectorBoard(),
  'f1-fan-screen': () => createFanScreen(),
  'f1-start-clock': () => createStartClock(),
  'f1-nameboard': () => createNameboard(),
  'f1-banner-bridge': () => createBannerBridge(),
  'f1-a-frame': () => createAFrame(),
  'f1-barrier-sleeve': () => createBarrierSleeve(),
  'f1-gazebo': () => createGazebo(),
  'f1-drink-wall': () => createDrinkWall(),
  'f1-feather-flag': () => createFeatherFlag(),
  'f1-service-truck': () => createServiceTruck(),
  'f1-stillage': () => createStillage(),
  'f1-hand-trolley': () => createHandTrolley(),
  'f1-cable-ramp': () => createCableRamp(),
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


  test('garage fascia number and legend round-trip', () => {
    const model = createGarageBox({ count: 2, number: '4', legend: 'BOX' })
    expect(model.getConfig()).toEqual({ count: 2, number: '4', legend: 'BOX', style: 'stamp' })
    expect(model.parts.fascia.children.length).toBe(2)
    model.configure({ count: 1, number: '9', legend: 'PIT', style: 'fia' })
    expect(model.getConfig()).toEqual({ count: 1, number: '9', legend: 'PIT', style: 'fia' })
    expect(model.parts.fascia.children.length).toBe(1)
    model.dispose()
  })

  test('garage fascia consumer image survives configure', () => {
    const model = createGarageBox({ count: 1, style: 'blank' })
    const consumer = new MeshStandardMaterial({ name: 'host fascia' })
    model.setMaterial('fascia', consumer)
    model.configure({ count: 2, number: '8' })
    expect(model.parts.fascia.children.length).toBe(2)
    for (const child of model.parts.fascia.children) {
      expect((child as Mesh).material).toBe(consumer)
    }
    model.dispose()
    consumer.dispose()
  })

  test('access-gate and crash-cushion share WALL_FITS', () => {
    const gate = createAccessGate({ fits: 'jersey', width: 2 })
    expect(gate.getConfig().fits).toBe('jersey')
    const cushion = createCrashCushion({ fits: 'concrete' })
    expect(cushion.getConfig().fits).toBe('concrete')
    cushion.configure({ fits: 'armco' })
    expect(cushion.getConfig().fits).toBe('armco')
    gate.dispose()
    cushion.dispose()
  })

  test('concrete-wall sockets and sausage modules are knobs', () => {
    const wall = createConcreteWall({ bays: 2, sockets: true })
    expect(wall.getConfig().sockets).toBe(true)
    wall.configure({ sockets: false, height: 1.4 })
    expect(wall.getConfig()).toMatchObject({ sockets: false, height: 1.4, bays: 2 })
    wall.dispose()
    const sausage = createSausageKerb({ modules: 4 })
    expect(sausage.getConfig().modules).toBe(4)
    sausage.configure({ modules: 8 })
    expect(sausage.getConfig().modules).toBe(8)
    sausage.dispose()
  })

  test('camera-tower height stays in the 6-12 m deck range', () => {
    const model = createCameraTower({ height: 3 })
    expect(model.getConfig().height).toBe(6)
    model.configure({ height: 20 })
    expect(model.getConfig().height).toBe(12)
    model.dispose()
  })

    test('circuit-sign kind and turn are knobs', () => {
    const model = createCircuitSign({ kind: 'DRS' })
    expect(model.getConfig().kind).toBe('DRS')
    model.configure({ kind: 'T-n', turn: 12 })
    expect(model.getConfig()).toEqual({ kind: 'T-n', turn: 12 })
    model.dispose()
  })

  test('WALL_FITS and CIRCUIT_SIGN_KINDS stay shared', async () => {
    const {
      WALL_FITS,
      CIRCUIT_SIGN_KINDS,
      GARAGE,
      GARAGE_BAY_PITCH,
      SAUSAGE_KERB,
      ASTROTURF,
      GRID_BOX,
      FIA_LIGHT_PANEL,
      PIT_WALL,
      SPECTATOR_BRIDGE,
      PODIUM,
      PODIUM_HEIGHTS,
      START_FINISH,
    } = await import('./f1-kit-core/track.ts')
    const { FASCIA_STYLES } = await import('./f1-kit-core/textures.ts')
    expect(WALL_FITS).toEqual(['armco', 'concrete', 'jersey'])
    expect(CIRCUIT_SIGN_KINDS).toContain('DRS')
    expect(GARAGE_BAY_PITCH).toBe(7)
    expect(GARAGE.pitch).toBe(7)
    expect(GARAGE.depth).toBe(17)
    expect(GARAGE.height).toBe(5)
    expect(SAUSAGE_KERB).toEqual({ width: 0.80, crown: 0.12, pitch: 0.80 })
    expect(ASTROTURF.width).toBe(2)
    expect(GRID_BOX).toEqual({ width: 2.7, length: 8 })
    expect(FIA_LIGHT_PANEL.width).toBeGreaterThanOrEqual(0.9)
    expect(PIT_WALL.depth).toBe(1)
    expect(PIT_WALL.height).toBe(2.2)
    expect(SPECTATOR_BRIDGE.deckHeight).toBeGreaterThanOrEqual(5.5)
    expect(PODIUM_HEIGHTS).toEqual([1, 0.7, 0.4])
    expect(PODIUM.walkway).toBeGreaterThanOrEqual(1.2)
    expect(PODIUM.flagGap).toBeGreaterThanOrEqual(0.5)
    expect(START_FINISH).toEqual({ timing: 0.15, chequer: 1 })
    expect(FASCIA_STYLES).toEqual(['stamp', 'fia', 'blank'])
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

describe('FIA 1:1 datums', () => {
  const sizeOf = (root: { updateMatrixWorld: (force: boolean) => void }) => {
    const box = new Box3().setFromObject(root as never)
    return { box, size: box.getSize(new Vector3()) }
  }

  test('sausage kerb is FIA Type 4 (0.80 × 0.12)', () => {
    const model = createSausageKerb({ modules: 4 })
    model.root.updateMatrixWorld(true)
    const { box, size } = sizeOf(model.root)
    expect(size.z).toBeCloseTo(0.80, 1)
    expect(box.max.y).toBeCloseTo(0.12, 1)
    expect(size.x).toBeCloseTo(3.2, 1)
    model.dispose()
  })

  test('grid box is a 2.7 × 8 painted stall', () => {
    const model = createGridBox()
    model.root.updateMatrixWorld(true)
    const { size } = sizeOf(model.root)
    expect(size.x).toBeCloseTo(2.7, 1)
    expect(size.z).toBeCloseTo(8, 1)
    expect(model.parts.plate.children.length).toBeGreaterThan(0)
    model.dispose()
  })

  test('garage bay is 7 m pitch, ~17 m deep, ~5 m high', () => {
    const model = createGarageBox()
    model.root.updateMatrixWorld(true)
    const { size } = sizeOf(model.root)
    expect(size.z).toBeGreaterThan(16.5)
    expect(size.z).toBeLessThan(18)
    expect(size.y).toBeGreaterThan(4.8)
    expect(size.y).toBeLessThan(5.5)
    model.dispose()
  })

  test('pit wall is 1.0 m deep and 2.2 m overall', () => {
    const model = createPitWall()
    model.root.updateMatrixWorld(true)
    const { box, size } = sizeOf(model.root)
    expect(size.z).toBeGreaterThan(0.95)
    expect(size.z).toBeLessThan(1.2)
    expect(box.max.y).toBeCloseTo(2.2, 1)
    model.dispose()
  })

  test('FIA panel face is at least 0.9 m square', () => {
    const model = createFiaLightPanel()
    model.root.updateMatrixWorld(true)
    let face: Mesh | undefined
    model.root.traverse((object) => {
      const mesh = object as Mesh
      if (mesh.isMesh && mesh.name === 'face') face = mesh
    })
    expect(face).toBeDefined()
    const size = new Box3().setFromObject(face!).getSize(new Vector3())
    expect(size.x).toBeGreaterThanOrEqual(0.9)
    expect(size.y).toBeGreaterThanOrEqual(0.9)
    model.dispose()
  })

  test('astroturf strip is 2.0 m wide', () => {
    const model = createAstroturf({ modules: 4 })
    model.root.updateMatrixWorld(true)
    const { size } = sizeOf(model.root)
    expect(size.z).toBeCloseTo(2.0, 1)
    model.dispose()
  })

  test('jersey barrier crown is 1.0 m', () => {
    const model = createJersey({ modules: 1 })
    model.root.updateMatrixWorld(true)
    const { box } = sizeOf(model.root)
    expect(box.max.y).toBeCloseTo(1.0, 1)
    model.dispose()
  })

  test('spectator bridge deck clears the 5 m catch fence', () => {
    const model = createSpectatorBridge({ span: 10 })
    model.root.updateMatrixWorld(true)
    const { box } = sizeOf(model.root)
    expect(box.max.y).toBeGreaterThanOrEqual(5.5)
    model.dispose()
  })

  test('start/finish defaults to a thin timing line; SF uses 1 m tiles', () => {
    const line = createStartFinishLine()
    expect(line.getConfig().kind).toBe('LINE')
    line.root.updateMatrixWorld(true)
    expect(sizeOf(line.root).size.z).toBeCloseTo(0.15, 1)
    line.dispose()
    const sf = createStartFinishLine({ kind: 'SF', width: 8 })
    sf.root.updateMatrixWorld(true)
    expect(sizeOf(sf.root).size.z).toBeCloseTo(1.0, 1)
    sf.dispose()
  })

  test('service truck stays inside the EU 96/53 12 m box (Semi width 2.59 m)', () => {
    const model = createServiceTruck()
    model.root.updateMatrixWorld(true)
    const { box, size } = sizeOf(model.root)
    expect(size.x).toBeGreaterThan(11.5)
    expect(size.x).toBeLessThanOrEqual(12.05)
    expect(size.z).toBeGreaterThan(2.55)
    expect(size.z).toBeLessThan(3.6)
    expect(box.max.y).toBeGreaterThan(3.6)
    expect(box.max.y).toBeLessThanOrEqual(4.15)
    model.dispose()
  })

  test('service truck wheels spin from hub transforms', () => {
    const model = createServiceTruck({ wheelRpm: 60 })
    const hub = model.parts.wheels.children[0]
    expect(hub).toBeDefined()
    const z0 = hub!.rotation.z
    model.update(1)
    expect(hub!.rotation.z).toBeCloseTo(z0 + Math.PI * 2, 5)
    model.dispose()
  })

  test('service truck lamps stay a stable part group across a toggle', () => {
    const model = createServiceTruck({ lamps: true })
    const id = model.parts.lamps.uuid
    expect(model.parts.lamps.children.length).toBeGreaterThan(0)
    model.configure({ lamps: false })
    expect(model.parts.lamps.uuid).toBe(id)
    expect(model.getConfig().lamps).toBe(false)
    model.configure({ lamps: true })
    expect(model.getConfig().lamps).toBe(true)
    model.dispose()
  })

  test('service truck preview keeps the kit env, lamps on, and cab light off', () => {
    const preview = createServiceTruckPreview({ aspect: 1 })
    expect(preview.scene.environment).toBeNull()
    expect(preview.root.getObjectByName('lamps')?.children.length).toBeGreaterThan(0)
    expect(preview.isCabLightOn()).toBe(false)
    const cabLight = preview.scene.getObjectByName('f1-kit / cab light')
    expect(cabLight?.visible).toBe(false)
    expect(preview.toggleCabLight()).toBe(true)
    expect(preview.isCabLightOn()).toBe(true)
    expect(cabLight?.visible).toBe(true)
    expect(preview.scene.environment).toBeNull()
    preview.dispose()
  })

  test('trophy cup is the 0.60 m Piet Boon / Delft cup', () => {
    const model = createTrophyCup()
    model.root.updateMatrixWorld(true)
    expect(sizeOf(model.root).box.max.y).toBeCloseTo(0.60, 1)
    model.dispose()
  })

  test('podium is P2 | P1 | P3 with Appendix 5 walkway and flag gap', () => {
    const model = createPodium()
    model.root.updateMatrixWorld(true)
    const p1 = model.root.getObjectByName('dais-1') as never
    const p2 = model.root.getObjectByName('dais-2') as never
    const p3 = model.root.getObjectByName('dais-3') as never
    const rail = model.root.getObjectByName('rail') as never
    const backdrop = model.root.getObjectByName('backdrop') as never
    expect(p1).toBeTruthy()
    expect(p2).toBeTruthy()
    expect(p3).toBeTruthy()
    const p1Box = new Box3().setFromObject(p1)
    const p2Box = new Box3().setFromObject(p2)
    const p3Box = new Box3().setFromObject(p3)
    const railBox = new Box3().setFromObject(rail)
    const wallBox = new Box3().setFromObject(backdrop)
    const p1Size = p1Box.getSize(new Vector3())
    const p2Size = p2Box.getSize(new Vector3())
    const p3Size = p3Box.getSize(new Vector3())
    expect(p2Box.max.x).toBeLessThan(p1Box.min.x)
    expect(p3Box.min.x).toBeGreaterThan(p1Box.max.x)
    expect((p1Box.min.x + p1Box.max.x) / 2).toBeCloseTo(0, 1)
    expect(p1Size.x).toBeCloseTo(1.20, 1)
    expect(p1Size.y).toBeCloseTo(1.00, 1)
    expect(p1Size.z).toBeCloseTo(1.00, 1)
    expect(p2Size.y).toBeCloseTo(0.70, 1)
    expect(p3Size.y).toBeCloseTo(0.40, 1)
    expect(railBox.min.z - p1Box.max.z).toBeGreaterThanOrEqual(1.18)
    expect(p1Box.min.z - wallBox.max.z).toBeGreaterThanOrEqual(0.48)
    model.dispose()
  })

  test('gazebo span is 3 m', () => {
    const model = createGazebo()
    expect(model.getConfig().span).toBe(3)
    model.root.updateMatrixWorld(true)
    const { size } = sizeOf(model.root)
    expect(size.x).toBeGreaterThan(2.95)
    expect(size.x).toBeLessThan(3.5)
    expect(size.z).toBeGreaterThan(2.95)
    expect(size.z).toBeLessThan(3.5)
    model.dispose()
  })

  test('LED ribbon is 8 × 1.2 m', () => {
    const model = createLedRibbon()
    model.root.updateMatrixWorld(true)
    const { size } = sizeOf(model.root)
    expect(size.x).toBeCloseTo(8, 1)
    expect(size.y).toBeCloseTo(1.2, 1)
    model.dispose()
  })

  test('stillage is a EUR pallet 1.20 × 0.80', () => {
    const model = createStillage({ count: 1 })
    model.root.updateMatrixWorld(true)
    const { size } = sizeOf(model.root)
    expect(size.x).toBeCloseTo(1.20, 1)
    expect(size.z).toBeCloseTo(0.80, 1)
    expect(size.y).toBeCloseTo(1.00, 1)
    model.dispose()
  })
})
