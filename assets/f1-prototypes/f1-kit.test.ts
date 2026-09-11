// Ownership and runtime-contract tests for the three rebuilt F1 props.
//
// This kit has leaked a material once already (a per-rebuild sidewall material that was nulled but never
// disposed), and `f1-tyre.setMaterial` was a silent no-op for its whole first life, so both are
// covered here by construction rather than by inspection.

import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { BufferGeometry, InstancedMesh, Material, Mesh, MeshStandardMaterial, Box3, Object3D, PlaneGeometry, Vector3 } from 'three/webgpu'
import { GARAGE, SPECTATOR_BRIDGE, STAIRS, TOKEN } from './f1-kit-core/index.ts'

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
import { createModel as createStairs, createPreview as createStairsPreview } from './f1-stairs/model.ts'
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
import { createModel as createChampagne } from './f1-champagne/model.ts'
import { createModel as createIceBucket } from './f1-ice-bucket/model.ts'
import { createModel as createTrophyTable } from './f1-trophy-table/model.ts'
import { createModel as createInterviewBackdrop } from './f1-interview-backdrop/model.ts'
import { createModel as createCooldownBoard } from './f1-cooldown-board/model.ts'
import { createModel as createLedRibbon } from './f1-led-ribbon/model.ts'
import { createModel as createSectorBoard } from './f1-sector-board/model.ts'
import { createModel as createNameboard } from './f1-nameboard/model.ts'
import { createModel as createServiceTruck, createPreview as createServiceTruckPreview, createWheelPreview } from './f1-service-truck/model.ts'
import { createModel as createChequeredFlag } from './f1-chequered-flag/model.ts'
import { createModel as createMotorhome } from './f1-team-motorhome/model.ts'
import { createScene as createKitScene } from './f1-kit-scene/kit-scene.ts'

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
  'f1-astroturf-strip': () => createAstroturf({ modules: 2 }),
  'f1-jersey-barrier': () => createJersey(),
  'f1-access-gate': () => createAccessGate(),
  'f1-crash-cushion': () => createCrashCushion(),
  'f1-gravel-trap': () => createGravelTrap({ modules: 1 }),
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
  'f1-champagne': () => createChampagne(),
  'f1-ice-bucket': () => createIceBucket(),
  'f1-trophy-table': () => createTrophyTable(),
  'f1-interview-backdrop': () => createInterviewBackdrop(),
  'f1-cooldown-board': () => createCooldownBoard(),
  'f1-led-ribbon': () => createLedRibbon(),
  'f1-sector-board': () => createSectorBoard(),
  'f1-nameboard': () => createNameboard(),
  'f1-service-truck': () => createServiceTruck(),
  'f1-chequered-flag': () => createChequeredFlag({ waving: true }),
  'f1-team-motorhome': () => createMotorhome(),
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
  test('Checo 11 is the default driver stamp', async () => {
    const { DRIVER } = await import('./f1-kit-core/driver.ts')
    expect(DRIVER).toEqual({ number: '11', name: 'CHECO' })
    const board = createNameboard()
    expect(board.getConfig()).toEqual({ label: '11', name: 'CHECO' })
    board.dispose()
    const cool = createCooldownBoard()
    expect(cool.getConfig().kind).toBe('11')
    expect(cool.getConfig().name).toBe('CHECO')
    cool.dispose()
  })

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


  test('weekend extras read as the object, not a grey box', () => {
    const scale = createWeighbridge()
    expect(scale.root.getObjectByName('grate')).toBeDefined()
    expect(scale.root.getObjectByName('hazard')).toBeDefined()
    expect(scale.root.getObjectByName('face')).toBeDefined()
    scale.dispose()
    const parc = createParcFerme({ bays: 3 })
    expect(parc.root.getObjectByName('gate')).toBeDefined()
    expect(parc.root.getObjectByName('sign')).toBeDefined()
    parc.dispose()
    const gen = createGeneratorCabin({ length: 3 })
    expect(gen.root.getObjectByName('louvers')).toBeDefined()
    expect(gen.root.getObjectByName('exhaust')).toBeDefined()
    gen.dispose()
    const tunnel = createTunnelPortal()
    expect(tunnel.root.getObjectByName('throat')).toBeDefined()
    expect(tunnel.root.getObjectByName('chevrons')).toBeDefined()
    tunnel.dispose()
    const bollard = createBollard()
    expect(bollard.root.getObjectByName('reflective')).toBeDefined()
    bollard.dispose()
    const cctv = createCctvMast({ height: 5 })
    expect(cctv.root.getObjectByName('cameras')).toBeDefined()
    expect(cctv.root.getObjectByName('tally')).toBeDefined()
    cctv.dispose()
    const pa = createPaHorn({ horns: 6 })
    expect(pa.root.getObjectByName('cluster')).toBeDefined()
    pa.dispose()
  })

  test('circuit heroes read as the object, not a grey box', () => {
    const rc = createRaceControl()
    expect(rc.root.getObjectByName('glazing')).toBeDefined()
    expect(rc.root.getObjectByName('sign')).toBeDefined()
    expect(rc.root.getObjectByName('dishes')).toBeDefined()
    rc.dispose()
    const gantry = createSectorGantry({ sector: 2 })
    expect(gantry.root.getObjectByName('plate')).toBeDefined()
    expect(gantry.getConfig().sector).toBe(2)
    gantry.dispose()
    const bridge = createSpectatorBridge({ span: 10 })
    expect(bridge.root.getObjectByName('deck')).toBeDefined()
    expect(bridge.root.getObjectByName('stairs')).toBeDefined()
    bridge.dispose()
    const cone = createCone()
    expect(cone.root.getObjectByName('base')).toBeDefined()
    expect(cone.root.getObjectByName('stripe')).toBeDefined()
    cone.dispose()
    const grid = createGridBox({ index: 5 })
    expect(grid.root.getObjectByName('asphalt')).toBeDefined()
    expect(grid.root.getObjectByName('number')).toBeDefined()
    expect(grid.getConfig().index).toBe(5)
    grid.dispose()
  })

  test('scaffold and flag weekend extras read as the object', () => {
    const flag = createFlagPole()
    expect(flag.root.getObjectByName('band-red')).toBeDefined()
    expect(flag.root.getObjectByName('band-blue')).toBeDefined()
    flag.dispose()
    const platform = createCameraPlatform()
    expect(platform.root.getObjectByName('camera')).toBeDefined()
    expect(platform.root.getObjectByName('lens')).toBeDefined()
    expect(platform.root.getObjectByName('ladder')).toBeDefined()
    platform.dispose()
    const med = createMedicalPost()
    expect(med.root.getObjectByName('door')).toBeDefined()
    expect(med.root.getObjectByName('cross')).toBeDefined()
    expect(med.getConfig().number).toBe('M1')
    med.dispose()
    const foam = createFoamMonitor()
    expect(foam.root.getObjectByName('tank')).toBeDefined()
    expect(foam.root.getObjectByName('nozzle')).toBeDefined()
    expect(foam.root.getObjectByName('wheels')).toBeDefined()
    foam.dispose()
    const tower = createCameraTower({ height: 6 })
    expect(tower.root.getObjectByName('cameras')).toBeDefined()
    expect(tower.root.getObjectByName('lenses')).toBeDefined()
    tower.dispose()
  })

  test('pit-board default cards are timing codes, not CHECO', () => {
    const board = createPitBoard()
    expect(board.root.getObjectByName('handle')).toBeDefined()
    expect(board.getConfig().labels[0]?.[0]).toBe('P2')
    expect(board.getConfig().labels.flat().join(' ')).not.toContain('CHECO')
    board.dispose()
  })

  test('nameboard stays a hung CHECO 11 plate on a pit-wall stub', () => {
    const board = createNameboard()
    expect(board.getConfig()).toEqual({ label: '11', name: 'CHECO' })
    expect(board.root.getObjectByName('wall-stub')).toBeDefined()
    board.dispose()
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


  test('pit wall brand colors and benches configure', () => {
    const model = createPitWall({
      bays: 2,
      labels: ['16', '55'],
      legend: 'FER',
      primary: 0xe10600,
      accent: 0xffe014,
      benches: true,
    })
    expect(model.getConfig().primary).toBe(0xe10600)
    expect(model.getConfig().legend).toBe('FER')
    expect(model.root.getObjectByName('bench-seats')).toBeTruthy()
    model.configure({ primary: 0x1e5aff, accent: 0xffd200, legend: 'RBR', labels: ['1', '11'], benches: false })
    expect(model.getConfig()).toMatchObject({ primary: 0x1e5aff, accent: 0xffd200, legend: 'RBR', benches: false })
    expect(model.root.getObjectByName('bench-seats')).toBeFalsy()
    // The monitor bank is fitted to the shell, not to the seating, so it survives the stools going away.
    expect(model.root.getObjectByName('screens')).toBeTruthy()
    model.dispose()
  })

  test('pit wall seats and monitors are counts for the run, not for the bay pitch', () => {
    // Vertices in a merged batch scale exactly with the number of repeats in it, so the built geometry
    // is what proves the count — `getConfig` only proves the bookkeeping.
    const vertsOf = (root: Object3D, name: string): number => {
      const mesh = root.getObjectByName(name) as Mesh | undefined
      expect(mesh).toBeTruthy()
      return (mesh!.geometry as BufferGeometry).getAttribute('position').count
    }

    const model = createPitWall({ bays: 2 })
    expect(model.getConfig()).toMatchObject({ seats: 6, tvs: 3 })

    // Same span, half the crew: the stool batch has to halve with it rather than follow the two bays.
    const half = createPitWall({ bays: 2, seats: 3, tvs: 1 })
    expect(vertsOf(model.root, 'bench-seats')).toBe(2 * vertsOf(half.root, 'bench-seats'))
    expect(vertsOf(model.root, 'screens')).toBe(3 * vertsOf(half.root, 'screens'))

    // Twice the building, same crew: neither row may grow.
    const long = createPitWall({ bays: 4 })
    expect(vertsOf(long.root, 'bench-seats')).toBe(vertsOf(model.root, 'bench-seats'))
    expect(vertsOf(long.root, 'screens')).toBe(vertsOf(model.root, 'screens'))

    // ...but it does spread over the longer run.
    model.root.updateMatrixWorld(true)
    long.root.updateMatrixWorld(true)
    const rowWidth = (root: Object3D): number =>
      new Box3().setFromObject(root.getObjectByName('bench-seats')!).getSize(new Vector3()).x
    expect(rowWidth(long.root)).toBeGreaterThan(rowWidth(model.root) * 1.8)
    expect(rowWidth(long.root)).toBeLessThan(4 * GARAGE.pitch)

    half.dispose()
    long.dispose()
    model.dispose()
  })

  test('pit wall monitor count follows the seat count until it is set', () => {
    const model = createPitWall({ bays: 2 })
    expect(model.getConfig()).toMatchObject({ seats: 6, tvs: 3 })

    model.configure({ seats: 8 })
    expect(model.getConfig()).toMatchObject({ seats: 8, tvs: 4 })

    // An odd crew still gets a screen for the spare engineer.
    model.configure({ seats: 5 })
    expect(model.getConfig()).toMatchObject({ seats: 5, tvs: 3 })

    // Once set, `tvs` is a decision and stops tracking.
    model.configure({ tvs: 2 })
    expect(model.getConfig()).toMatchObject({ seats: 5, tvs: 2 })
    model.configure({ seats: 12 })
    expect(model.getConfig()).toMatchObject({ seats: 12, tvs: 2 })

    // Counts are whole and never zero.
    model.configure({ seats: 0.4, tvs: 2.6 })
    expect(model.getConfig()).toMatchObject({ seats: 1, tvs: 3 })

    const explicit = createPitWall({ bays: 2, seats: 6, tvs: 6 })
    expect(explicit.getConfig().tvs).toBe(6)
    explicit.configure({ seats: 2 })
    expect(explicit.getConfig().tvs).toBe(6)

    explicit.dispose()
    model.dispose()
  })

  test('garage fascia number and legend round-trip', () => {
    const model = createGarageBox({ count: 2, number: '4', legend: 'BOX' })
    expect(model.getConfig()).toEqual({
      count: 2, number: '4', legend: 'BOX', style: 'stamp', open: 0, floors: 1, tower: false,
    })
    expect(model.parts.fascia.children.length).toBe(2)
    model.configure({ count: 1, number: '9', legend: 'PIT', style: 'fia' })
    expect(model.getConfig()).toEqual({
      count: 1, number: '9', legend: 'PIT', style: 'fia', open: 0, floors: 1, tower: false,
    })
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
    expect(GARAGE.depth).toBe(20)
    expect(GARAGE.height).toBe(4.5)
    expect(GARAGE.door).toBe(3.3)
    expect(GARAGE.head).toBe(3)
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

  test('garage bay is a 7 m pitch, 20 m deep, 4.5 m Yas-class box', () => {
    const model = createGarageBox()
    model.root.updateMatrixWorld(true)
    const { box, size } = sizeOf(model.root)
    // 20 m apron face to back wall, plus the apron pour and the coping drip in front of it.
    expect(size.z).toBeGreaterThan(GARAGE.depth)
    expect(size.z).toBeLessThan(GARAGE.depth + 1.5)
    // Roof deck at 4.5 m; only the coping and the low roof plant are allowed above it.
    expect(box.max.y).toBeGreaterThan(GARAGE.height)
    expect(box.max.y).toBeLessThan(GARAGE.height + 0.6)
    // A bay fills its pitch, so a run grows by exactly one module per extra bay and shares its piers.
    const run = createGarageBox({ count: 3 })
    run.root.updateMatrixWorld(true)
    expect((sizeOf(run.root).size.x - size.x) / 2).toBeCloseTo(GARAGE.pitch, 3)
    run.dispose()
    model.dispose()
  })

  test('garage shutter clears the 3.3 x 3.0 m Yas door', () => {
    const model = createGarageBox()
    model.root.updateMatrixWorld(true)
    const curtain = model.root.getObjectByName('shutter-0')
    expect(curtain).toBeDefined()
    const { box, size } = sizeOf(curtain!)
    // Laths run inside the guide tracks, so the curtain is the clear width less its side clearance.
    expect(size.x).toBeLessThanOrEqual(GARAGE.door)
    expect(size.x).toBeGreaterThan(GARAGE.door - 0.2)
    expect(box.max.y).toBeCloseTo(GARAGE.head, 1)
    // The head must stay under the fascia beam soffit, barrel and all.
    expect(GARAGE.head).toBeLessThan(GARAGE.height - GARAGE.fascia)
    model.dispose()
  })

  test('garage floors defaults to 1 and is byte-identical to the plain box', () => {
    // `floors`/`tower` must not perturb the default build: same vertex/triangle totals and AABB whether
    // omitted or passed explicitly at their defaults.
    const totalVerts = (root: Object3D): number => {
      let total = 0
      root.traverse((object) => {
        const mesh = object as Mesh
        if (!mesh.isMesh) return
        total += (mesh.geometry as BufferGeometry).getAttribute('position').count
      })
      return total
    }
    const totalTriangles = (root: Object3D): number => {
      let total = 0
      root.traverse((object) => {
        const mesh = object as Mesh
        if (!mesh.isMesh) return
        const index = (mesh.geometry as BufferGeometry).getIndex()
        total += index ? index.count / 3 : mesh.geometry.getAttribute('position').count / 3
      })
      return total
    }
    const plain = createGarageBox({ count: 2 })
    const explicit = createGarageBox({ count: 2, floors: 1, tower: false })
    expect(explicit.getConfig()).toEqual(plain.getConfig())
    expect(totalVerts(explicit.root)).toBe(totalVerts(plain.root))
    expect(totalTriangles(explicit.root)).toBe(totalTriangles(plain.root))
    plain.root.updateMatrixWorld(true)
    explicit.root.updateMatrixWorld(true)
    const plainBox = sizeOf(plain.root).box
    const explicitBox = sizeOf(explicit.root).box
    expect(explicitBox.min.toArray()).toEqual(plainBox.min.toArray())
    expect(explicitBox.max.toArray()).toEqual(plainBox.max.toArray())
    // No upper-storey or tower geometry leaks into the default box.
    plain.root.traverse((object) => {
      expect(object.name.startsWith('floor-slab-')).toBe(false)
      expect(object.name.startsWith('floor-core-')).toBe(false)
      expect(object.name.startsWith('tower-')).toBe(false)
    })
    plain.dispose()
    explicit.dispose()
  })

  test('garage floors 2-3 stack glazed Paddock Club storeys toward the 18.5 m official max', () => {
    const one = createGarageBox({ count: 4, floors: 1 })
    const three = createGarageBox({ count: 4, floors: 3 })
    one.root.updateMatrixWorld(true)
    three.root.updateMatrixWorld(true)
    const oneTop = sizeOf(one.root).box.max.y
    const threeTop = sizeOf(three.root).box.max.y
    expect(threeTop).toBeGreaterThan(oneTop)
    // floors:3 caps close under the official 18.5 m max height. estimate:official-max-height.
    expect(threeTop).toBeGreaterThan(17)
    expect(threeTop).toBeLessThanOrEqual(18.5 + 0.5)
    expect(three.root.getObjectByName('floor-glazing-0')).toBeDefined()
    expect(three.root.getObjectByName('floor-glazing-1')).toBeDefined()
    expect(three.root.getObjectByName('terrace-fascia-0')).toBeDefined()
    expect(three.root.getObjectByName('terrace-fascia-1')).toBeDefined()
    expect(three.root.getObjectByName('floors-roof-slab')).toBeDefined()
    expect(three.root.getObjectByName('floors-parapet')).toBeDefined()
    // Storeys stay the full run wide — nothing overhangs the bay width so bays keep tiling.
    const glazing = three.root.getObjectByName('floor-glazing-0')!
    expect(new Box3().setFromObject(glazing).getSize(new Vector3()).x)
      .toBeLessThanOrEqual(4 * GARAGE.pitch + 1e-6)
    one.dispose()
    three.dispose()
  })

  test('garage tower adds a one-bay glazed shaft at the -X end; floors clamps to 1-3', () => {
    const base = createGarageBox({ count: 2, floors: 3 })
    const towered = createGarageBox({ count: 2, floors: 3, tower: true })
    base.root.updateMatrixWorld(true)
    towered.root.updateMatrixWorld(true)
    expect(towered.getConfig().tower).toBe(true)
    expect(sizeOf(towered.root).box.min.x).toBeLessThan(sizeOf(base.root).box.min.x)
    expect(sizeOf(towered.root).box.max.y).toBeGreaterThan(sizeOf(base.root).box.max.y)
    expect(towered.root.getObjectByName('tower-glazing')).toBeDefined()
    expect(towered.root.getObjectByName('tower-posts')).toBeDefined()
    base.dispose()
    towered.dispose()

    const low = createGarageBox({ floors: 0 })
    expect(low.getConfig().floors).toBe(1)
    low.dispose()
    const high = createGarageBox({ floors: 9 })
    expect(high.getConfig().floors).toBe(3)
    high.dispose()
  })

  test('pit wall is 1.0 m deep and 2.2 m overall', () => {
    const shell = createPitWall({ benches: false })
    shell.root.updateMatrixWorld(true)
    const { box, size } = sizeOf(shell.root)
    expect(size.z).toBeGreaterThan(0.95)
    expect(size.z).toBeLessThan(1.2)
    expect(box.max.y).toBeCloseTo(2.2, 1)
    shell.dispose()
    // Benches sit proud of the 1.00 m envelope on the pit-lane working face.
    const seated = createPitWall({ benches: true })
    seated.root.updateMatrixWorld(true)
    expect(sizeOf(seated.root).size.z).toBeGreaterThan(1.2)
    seated.dispose()
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

  test('astroturf strip is a two-tone pile on a dark bed', () => {
    const model = createAstroturf({ modules: 3 })
    expect(model.root.getObjectByName('bed')).toBeDefined()
    expect(model.root.getObjectByName('pile')).toBeDefined()
    expect(model.root.getObjectByName('pile-dark')).toBeDefined()
    const bed = model.root.getObjectByName('bed') as Mesh
    expect((bed.material as MeshStandardMaterial).color.getHex()).not.toBe(TOKEN.FIELD_500)
    model.dispose()
  })

  test('gravel trap is pebble-scale raked stones', () => {
    const model = createGravelTrap({ modules: 1 })
    expect(model.root.getObjectByName('bed')).toBeDefined()
    expect(model.root.getObjectByName('stones')).toBeDefined()
    expect(model.root.getObjectByName('stones-dark')).toBeDefined()
    expect(model.root.getObjectByName('rake')).toBeDefined()
    model.root.updateMatrixWorld(true)
    const stones = model.root.getObjectByName('stones') as Mesh
    const size = new Box3().setFromObject(stones).getSize(new Vector3())
    expect(size.y).toBeLessThan(0.12)
    model.dispose()
  })

  test('chequered flag grips at the origin and waves', () => {
    const model = createChequeredFlag({ waving: true })
    model.root.updateMatrixWorld(true)
    const { box } = sizeOf(model.root)
    expect(box.min.y).toBeCloseTo(0, 1)
    expect(model.root.getObjectByName('cloth')).toBeDefined()
    expect(model.root.getObjectByName('shaft')).toBeDefined()
    let clothMesh: Mesh | undefined
    model.root.traverse((object) => {
      const mesh = object as Mesh
      if (mesh.isMesh && mesh.name === 'cloth') clothMesh = mesh
    })
    expect(clothMesh).toBeDefined()
    const attr = clothMesh!.geometry.getAttribute('position')
    const z0 = attr.getZ(attr.count - 1)
    model.update(0.4)
    expect(attr.getZ(attr.count - 1)).not.toBe(z0)
    model.dispose()
  })

  test('kit scene places every kit id', () => {
    const scene = createKitScene()
    const names = new Set<string>()
    scene.root.traverse((object) => {
      if (object.name.startsWith('f1-')) names.add(object.name)
    })
    const missing = Object.keys(factories).filter((id) => !names.has(id))
    expect(missing).toEqual([])
    scene.dispose()
  }, 180_000)

  test('jersey barrier crown is 1.0 m', () => {
    const model = createJersey({ modules: 1 })
    model.root.updateMatrixWorld(true)
    const { box } = sizeOf(model.root)
    expect(box.max.y).toBeCloseTo(1.0, 1)
    model.dispose()
  })
  test('jersey barrier punches a through-drain per module', () => {
    const model = createJersey({ modules: 2 })
    model.root.updateMatrixWorld(true)
    expect(model.root.getObjectByName('drains')).toBeDefined()
    expect(model.root.getObjectByName('jersey')).toBeDefined()
    const { box } = sizeOf(model.root)
    expect(box.max.y).toBeCloseTo(1.0, 1)
    model.dispose()
  })

  test('TecPro wrap is amber polyethylene, not grey', () => {
    const model = createTecpro({ columns: 2, rows: 2 })
    const wrap = model.root.getObjectByName('wrap') as Mesh
    expect(wrap).toBeDefined()
    expect((wrap.material as MeshStandardMaterial).color.getHex()).toBe(TOKEN.AMBER_400)
    expect(model.root.getObjectByName('straps')).toBeDefined()
    expect(model.root.getObjectByName('handles')).toBeDefined()
    model.dispose()
  })

  test('Armco carries red/white block reflectors on galvanized W-beam', () => {
    const model = createArmco({ bays: 3 })
    expect(model.root.getObjectByName('reflectors-red')).toBeDefined()
    expect(model.root.getObjectByName('reflectors-white')).toBeDefined()
    expect(model.root.getObjectByName('rails')).toBeDefined()
    model.dispose()
  })

  test('catch fence chain-link is a transparent mapped plane, not a card', () => {
    const model = createCatchFence({ length: 6, height: 3 })
    const mesh = model.root.getObjectByName('chain-link') as Mesh
    expect(mesh).toBeDefined()
    const mat = mesh.material as MeshStandardMaterial
    expect(mat.map).toBeTruthy()
    expect(mat.transparent).toBe(true)
    expect(model.root.getObjectByName('trackward-overhang')).toBeDefined()
    model.dispose()
  })

  test('start lights glow with emissive lamps, not SpotLights', () => {
    const model = createStartLights({ lit: 5 })
    let spots = 0
    model.root.traverse((object) => {
      if ((object as { isSpotLight?: boolean }).isSpotLight) spots += 1
    })
    expect(spots).toBe(0)
    expect(model.root.getObjectByName('lamps-on')).toBeDefined()
    expect(model.root.getObjectByName('housings')).toBeDefined()
    model.dispose()
  })

  test('grandstand seats are instanced with an aisle and fascia board', () => {
    const model = createGrandstandBay({ rows: 4, width: 5 })
    const seats = model.root.getObjectByName('seats') as InstancedMesh
    expect(seats).toBeDefined()
    expect(seats.isInstancedMesh).toBe(true)
    expect(seats.count).toBeGreaterThan(8)
    expect(model.root.getObjectByName('nosings')).toBeDefined()
    expect(model.root.getObjectByName('fascia-board')).toBeDefined()
    expect(model.root.getObjectByName('central-gangway')).toBeDefined()
    model.dispose()
  })

  test('grandstand-bay tiers:1 with default tierSpec is byte-identical to the pre-tierSpec build (sha256 vertex proof)', () => {
    // Locks the acceptance gate: introducing `tierSpec` must not perturb a `tiers: 1` build one bit.
    // Golden hash captured from the model BEFORE the tierSpec feature landed (rows: 8, width: 10, tiers: 1).
    const hashOf = (root: Object3D): string => {
      const hash = createHash('sha256')
      root.traverse((object) => {
        const mesh = object as InstancedMesh & Mesh
        if (!mesh.isMesh && !mesh.isInstancedMesh) return
        hash.update(mesh.name)
        const pos = (mesh.geometry as BufferGeometry).getAttribute('position')
        for (let i = 0; i < pos.count; i++) {
          hash.update(pos.getX(i).toFixed(6))
          hash.update(pos.getY(i).toFixed(6))
          hash.update(pos.getZ(i).toFixed(6))
        }
        if (mesh.isInstancedMesh) {
          hash.update(String(mesh.count))
          for (const value of mesh.instanceMatrix.array) hash.update(value.toFixed(6))
        }
      })
      return hash.digest('hex')
    }
    const omitted = createGrandstandBay({ rows: 8, width: 10, tiers: 1 })
    omitted.root.updateMatrixWorld(true)
    const omittedHash = hashOf(omitted.root)
    expect(omittedHash).toBe('3570efa087f65d4981ccb6826b05f41abd494267e920100f1c578521b24b1674')
    omitted.dispose()

    // Also byte-identical when the default tierSpec is given explicitly, not just omitted.
    const explicit = createGrandstandBay({
      rows: 8, width: 10, tiers: 1,
      tierSpec: [{ plinth: 0.95, support: 'columns', rearSupport: 'columns', stairSide: 'none', roof: true }],
    })
    explicit.root.updateMatrixWorld(true)
    expect(hashOf(explicit.root)).toBe(omittedHash)
    explicit.dispose()
  })

  test('grandstand-bay tiers default to a fully supported stack, nothing left floating', () => {
    // `stairs` is asked for explicitly: the top-level default is 'none' so a tiled run butts flush.
    const model = createGrandstandBay({ rows: 8, width: 10, tiers: 3, stairs: 'right' })
    model.root.updateMatrixWorld(true)
    const names: string[] = []
    model.root.traverse((object) => { if ((object as Mesh).isMesh) names.push(object.name) })
    // One front/rear support per tier above the bottom (tiers 1 and 2 of 3), but ONE stair cage for the
    // whole stack — tier k's head landing is tier k+1's foot landing, so the tower is shared, not stacked.
    expect(names.filter((n) => n === 'front-support').length).toBe(2)
    expect(names.filter((n) => n === 'rear-support').length).toBe(2)
    expect(names.filter((n) => n === 'stairs').length).toBe(1)
    expect(names.filter((n) => n === 'stair-rail').length).toBe(1)
    // Every rear support's foot lands at TRUE ground (y=0), never mid-air.
    let rearSupportCount = 0
    model.root.traverse((object) => {
      if (object.name !== 'rear-support') return
      rearSupportCount += 1
      const box = new Box3().setFromObject(object)
      expect(box.min.y).toBeGreaterThan(-0.05)
      expect(box.min.y).toBeLessThan(0.05)
    })
    expect(rearSupportCount).toBe(2)
    model.dispose()
  })

  test('grandstand-bay support: "none" removes the front/rear support members', () => {
    const supported = createGrandstandBay({ rows: 8, width: 10, tiers: 2 })
    supported.root.updateMatrixWorld(true)
    expect(supported.root.getObjectByName('front-support')).toBeDefined()
    expect(supported.root.getObjectByName('rear-support')).toBeDefined()
    supported.dispose()

    const unsupported = createGrandstandBay({
      rows: 8, width: 10, tiers: 2,
      tierSpec: [{}, { support: 'none', rearSupport: 'none' }],
    })
    unsupported.root.updateMatrixWorld(true)
    expect(unsupported.root.getObjectByName('front-support')).toBeUndefined()
    expect(unsupported.root.getObjectByName('rear-support')).toBeUndefined()
    unsupported.dispose()
  })

  test('grandstand-bay per-tier lift/plinth/rows change the Box3 as expected', () => {
    const base = createGrandstandBay({ rows: 8, width: 10, tiers: 2 })
    base.root.updateMatrixWorld(true)
    const baseBox = sizeOf(base.root).box
    base.dispose()

    // `lift` on the upper tier adds exactly that much extra height, nothing else.
    const lifted = createGrandstandBay({ rows: 8, width: 10, tiers: 2, tierSpec: [{}, { lift: 3 }] })
    lifted.root.updateMatrixWorld(true)
    const liftedBox = sizeOf(lifted.root).box
    expect(liftedBox.max.y).toBeCloseTo(baseBox.max.y + 3, 2)
    lifted.dispose()

    // `plinth` on tier 0 shifts the WHOLE stack up rigidly (2.45 m plinth vs the 0.95 m default), while
    // tier 0's own front skirt still closes to true ground.
    const plinth = createGrandstandBay({ rows: 8, width: 10, tiers: 2, tierSpec: [{ plinth: 2.45 }] })
    plinth.root.updateMatrixWorld(true)
    const plinthBox = sizeOf(plinth.root).box
    expect(plinthBox.max.y).toBeCloseTo(baseBox.max.y + 1.5, 2)
    expect(plinthBox.min.y).toBeCloseTo(baseBox.min.y, 2)
    plinth.dispose()

    // More rows on the upper tier grows both its height and its depth.
    const moreRows = createGrandstandBay({ rows: 8, width: 10, tiers: 2, tierSpec: [{}, { rows: 14 }] })
    moreRows.root.updateMatrixWorld(true)
    const moreRowsBox = sizeOf(moreRows.root).box
    expect(moreRowsBox.max.y).toBeGreaterThan(baseBox.max.y)
    expect(moreRowsBox.min.z).toBeLessThan(baseBox.min.z)
    moreRows.dispose()
  })

  test('grandstand-bay stairs are SIDE stair towers: on the end face, outside the seating, along Z', () => {
    // Miguel's review on the previous cut: "the stairs are on the front side right now — we need those
    // stairs along the side." This is that gate. A tower travels along Z (parallel to the rake) on the
    // bay's END face; nothing about it may cross the bowl.
    const model = createGrandstandBay({ rows: 8, width: 10, tiers: 3, stairs: 'right' })
    model.root.updateMatrixWorld(true)
    const halfW = 10 / 2
    const footprint = model.getFootprint()
    expect(footprint.width).toBe(10)
    expect(footprint.left).toBe(0)
    expect(footprint.right).toBeGreaterThan(0)
    expect(footprint.totalWidth).toBeCloseTo(10 + footprint.right, 6)

    // ONE cage for the stack, not one per tier — the tiers share their landings.
    const names: string[] = []
    model.root.traverse((object) => { if ((object as Mesh).isMesh) names.push(object.name) })
    expect(names.filter((n) => n === 'stairs').length).toBe(1)
    expect(names.filter((n) => n === 'stair-frame').length).toBe(1)
    expect(names.filter((n) => n === 'stair-gate').length).toBe(1)

    let checked = 0
    model.root.traverse((object) => {
      if (!['stairs', 'stair-frame', 'stair-rail'].includes(object.name)) return
      checked += 1
      const box = new Box3().setFromObject(object)
      // Never INSIDE the seating width — the failure mode being locked out is a flight across the bowl.
      // A level landing decks right up to the end face (x = halfW) so there is no gap to step over, so
      // this abuts rather than clears; nothing may cross it.
      expect(box.min.x).toBeGreaterThanOrEqual(halfW - 1e-6)
      // ...and wholly INSIDE what getFootprint() promises an emitter tiling a run of bays.
      expect(box.max.x).toBeLessThanOrEqual(halfW + footprint.right + 1e-6)
      // Direction of travel is Z: the tower is far longer front-to-back than it is wide.
      expect(box.max.z - box.min.z).toBeGreaterThan((box.max.x - box.min.x) * 3)
      // It starts at GRADE — the entry flight's own foot, or the ground pads under the cage — not up in
      // the air and not on tier 0's promenade (see the ground-flight test below for the exact datum).
      expect(box.min.y).toBeLessThan(0.12)
    })
    expect(checked).toBe(3)

    // The flights climb promenade to promenade: the treads reach tier 2's walking level (13.99 m) and
    // stop there, rather than running on up past the top tier.
    const stairs = model.root.getObjectByName('stairs')!
    const treadBox = new Box3().setFromObject(stairs)
    expect(treadBox.max.y).toBeGreaterThan(13.9)
    expect(treadBox.max.y).toBeLessThan(14.3)
    model.dispose()
  })

  test('grandstand-bay stair tower runs a GROUND flight: grade -> tier 0, inside the cage it already had', () => {
    // The gate on the missing bottom flight. Before this, the tower's LOWEST landing was tier 0's own
    // promenade (DECK 0.95 m + plinth), so the bottom bays of the cage were an empty braced shaft and
    // the stand had no way in from grade. The entry flight fills them.
    //
    // Read off the built geometry rather than declared, using two datums that are pure functions of the
    // flight's own foot:
    //   - the lowest tread's kick lip sits `0.028 - 0.019 = 0.009 m` above the flight's datum, whatever
    //     the rise — so `stairs.min.y === 0.009` says the datum IS grade, and nothing else does;
    //   - the lowest rail post starts `rise/2 + 0.02` above it, which recovers the derived rise exactly.
    const KICK_ABOVE_DATUM = 0.009
    const POST_ABOVE_TREAD = 0.02
    const boxesNamed = (model: { root: Object3D }, name: string): Box3[] => {
      const boxes: Box3[] = []
      model.root.traverse((object) => {
        if (object.name === name) boxes.push(new Box3().setFromObject(object))
      })
      return boxes
    }

    const model = createGrandstandBay({ rows: 8, width: 10, tiers: 3, stairs: 'both' })
    model.root.updateMatrixWorld(true)
    const footprint = model.getFootprint()
    // ONE ground flight per tower — 'both' mounts two cages, and each gets its own way in.
    const treadBoxes = boxesNamed(model, 'stairs')
    const railBoxes = boxesNamed(model, 'stair-rail')
    expect(treadBoxes).toHaveLength(2)
    expect(railBoxes).toHaveLength(2)
    for (const [index, treads] of treadBoxes.entries()) {
      // Foot at y = 0. Never BELOW grade, and one kick lip above it — not up on the promenade.
      expect(treads.min.y).toBeCloseTo(KICK_ABOVE_DATUM, 6)
      // f1-stairs' own pitch: the derived rise never exceeds the FIA 180 mm the catalogue flight uses,
      // and 0.95 m of plinth divides into exactly six of them.
      const rise = 2 * (railBoxes[index]!.min.y - POST_ABOVE_TREAD)
      expect(rise).toBeLessThanOrEqual(0.18 + 1e-9)
      expect(Math.round(0.95 / rise)).toBe(6)
      expect(0.95 / rise).toBeCloseTo(6, 4)
      // Inside the footprint the emitter was already promised — the entry flight rides in the cage's own
      // spare lane, so it may not push a millimetre past the overhang `getFootprint()` reports.
      expect(Math.abs(treads.min.x)).toBeGreaterThanOrEqual(10 / 2 - 1e-6)
      expect(Math.abs(treads.max.x)).toBeLessThanOrEqual(10 / 2 + footprint.right + 1e-6)
    }
    expect(footprint.width).toBe(10)
    expect(footprint.left).toBeCloseTo(3.27, 6)
    expect(footprint.right).toBeCloseTo(3.27, 6)
    expect(footprint.totalWidth).toBeCloseTo(16.54, 6)

    // ...and the collision proxy does not grow either: the entry flight tucks UNDER the outboard lane
    // that was already there, so the tower box is the same box it was before the flight existed.
    for (const volume of model.getCollisionVolumes().filter((v) => v.part === 'stair-tower')) {
      expect(volume.min[1]).toBeCloseTo(0, 6)
      expect(volume.min[2]).toBeCloseTo(-11.33, 6)
      expect(volume.max[2]).toBeCloseTo(4.05, 6)
      expect(volume.max[1]).toBeCloseTo(15.34, 2)
    }
    model.dispose()

    // A taller plinth is more risers, still landing on grade — the flight is derived, not a fixed part.
    const tall = createGrandstandBay({
      rows: 8, width: 10, tiers: 3, stairs: 'right', tierSpec: [{ plinth: 2 }, {}, {}],
    })
    tall.root.updateMatrixWorld(true)
    const tallTreads = boxesNamed(tall, 'stairs')[0]!
    const tallRise = 2 * (boxesNamed(tall, 'stair-rail')[0]!.min.y - POST_ABOVE_TREAD)
    expect(tallTreads.min.y).toBeCloseTo(KICK_ABOVE_DATUM, 6)
    expect(tallRise).toBeLessThanOrEqual(0.18 + 1e-9)
    expect(Math.round(2 / tallRise)).toBe(12)
    tall.dispose()
  })

  test('grandstand-bay stairSide picks the end face — "both" mirrors the tower, "none" removes it', () => {
    const both = createGrandstandBay({
      rows: 8, width: 10, tiers: 3, tierSpec: [{}, { stairSide: 'both' }, { stairSide: 'both' }],
    })
    both.root.updateMatrixWorld(true)
    const bothNames: string[] = []
    both.root.traverse((object) => { if ((object as Mesh).isMesh) bothNames.push(object.name) })
    expect(bothNames.filter((n) => n === 'stairs').length).toBe(2)
    const mirrored = both.getFootprint()
    expect(mirrored.left).toBeCloseTo(mirrored.right, 6)
    expect(mirrored.totalWidth).toBeCloseTo(10 + mirrored.left + mirrored.right, 6)
    both.dispose()

    // A bay in the MIDDLE of a tiled run passes 'none' and is back to the bare tiling module.
    const none = createGrandstandBay({
      rows: 8, width: 10, tiers: 3, tierSpec: [{}, { stairSide: 'none' }, { stairSide: 'none' }],
    })
    none.root.updateMatrixWorld(true)
    expect(none.root.getObjectByName('stairs')).toBeUndefined()
    expect(none.root.getObjectByName('stair-frame')).toBeUndefined()
    expect(none.root.getObjectByName('stair-gate')).toBeUndefined()
    expect(none.getFootprint()).toEqual({ width: 10, totalWidth: 10, left: 0, right: 0 })
    // 0.18 m is the pre-existing frontage/column overhang the tiling module has always carried; the
    // point of the assertion is that removing the tower removes ALL of the tower's 3.2 m.
    const box = new Box3().setFromObject(none.root)
    expect(box.min.x).toBeGreaterThan(-5.2)
    expect(box.max.x).toBeLessThan(5.2)
    none.dispose()

    // A wider flight widens the tower and the reported footprint with it.
    const nominal = createGrandstandBay({ rows: 8, width: 10, tiers: 2, stairs: 'right' })
    const nominalRight = nominal.getFootprint().right
    nominal.dispose()
    const wide = createGrandstandBay({
      rows: 8, width: 10, tiers: 2, stairs: 'right', tierSpec: [{}, { stairWidth: 2.2 }],
    })
    expect(wide.getFootprint().right).toBeGreaterThan(nominalRight)
    wide.dispose()
  })

  test('grandstand-bay collision proxy: convex volumes per tier, roof excluded, detached from root', () => {
    const one = createGrandstandBay({ rows: 8, width: 10, tiers: 1 })
    // A single bowl is a single prism, and the proxy never reaches the visual/compile path unaided.
    expect(one.getCollisionVolumes().length).toBe(1)
    expect(one.parts.collision.parent).toBeNull()
    expect(one.root.getObjectByName('collision-bowl-0')).toBeUndefined()
    one.dispose()

    const three = createGrandstandBay({ rows: 8, width: 10, tiers: 3, stairs: 'right' })
    three.root.updateMatrixWorld(true)
    const volumes = three.getCollisionVolumes()
    // 3 bowl prisms + 2 front support lines + 2 rear support lines + 1 stair tower.
    expect(volumes.length).toBe(8)
    expect(volumes.filter((v) => v.part === 'bowl').length).toBe(3)
    expect(volumes.filter((v) => v.part === 'front-support').length).toBe(2)
    expect(volumes.filter((v) => v.part === 'rear-support').length).toBe(2)
    expect(volumes.filter((v) => v.part === 'stair-tower').length).toBe(1)
    for (const volume of volumes) {
      expect(volume.points.length).toBeGreaterThanOrEqual(8)
      for (let axis = 0; axis < 3; axis++) {
        expect(volume.max[axis]!).toBeGreaterThan(volume.min[axis]!)
      }
    }

    // The roof is excluded BY DESIGN — a whole-model box is what put an invisible wall over the racing
    // line. So the proxy must stop well below the canopy and never reach past its cantilever tip.
    const visual = new Box3().setFromObject(three.root)
    let top = -Infinity
    let front = -Infinity
    for (const volume of volumes) {
      top = Math.max(top, volume.max[1]!)
      front = Math.max(front, volume.max[2]!)
    }
    expect(top).toBeLessThan(visual.max.y - 1)
    expect(front).toBeLessThanOrEqual(visual.max.z + 1e-6)
    three.dispose()

    const both = createGrandstandBay({
      rows: 8, width: 10, tiers: 3, tierSpec: [{}, { stairSide: 'both' }, { stairSide: 'both' }],
    })
    expect(both.getCollisionVolumes().filter((v) => v.part === 'stair-tower').length).toBe(2)
    expect(both.getCollisionVolumes().length).toBe(9)
    both.dispose()

    const none = createGrandstandBay({
      rows: 8, width: 10, tiers: 3, tierSpec: [{}, { stairSide: 'none' }, { stairSide: 'none' }],
    })
    expect(none.getCollisionVolumes().length).toBe(7)
    none.dispose()

    // DEV flag is the only thing that parents the proxy, and it marks it excluded from export.
    const debug = createGrandstandBay({ rows: 8, width: 10, tiers: 2, debug: { collision: true } })
    expect(debug.parts.collision.parent).toBe(debug.root)
    expect(debug.parts.collision.visible).toBe(true)
    expect(debug.parts.collision.userData.excludeFromExport).toBe(true)
    debug.dispose()
  })

  test('grandstand-bay tiers given directly as the tierSpec array sets tiers = array.length', () => {
    const model = createGrandstandBay({
      rows: 8,
      width: 10,
      tiers: [
        { rows: 6, plinth: 1.5 },
        { rows: 8, lift: 1.5, support: 'wall' },
        { rows: 10, lift: 0.5, rearSupport: 'wall' },
      ],
    })
    expect(model.getConfig().tiers).toBe(3)
    model.root.updateMatrixWorld(true)
    // Both non-bottom tiers still get a front-support mesh — one 'wall', one 'columns' — neither is 'none'.
    let frontSupportCount = 0
    model.root.traverse((object) => { if (object.name === 'front-support') frontSupportCount += 1 })
    expect(frontSupportCount).toBe(2)
    model.dispose()
  })

  test('grandstand-bay roof: "full" spans the WHOLE section, not just the top tier', () => {
    // Miguel's review on 8r-3t: "the canopy up top doesn't extend over the whole section like it does
    // for rows 24 tiers 1." This is that gate — the default canopy's leading edge has to reach exactly
    // as far forward as a SINGLE-tier bay's does, over tier 0's promenade, not stop at the top deck.
    const single = createGrandstandBay({ rows: 8, width: 10 })
    single.root.updateMatrixWorld(true)
    const singleRoof = new Box3().setFromObject(single.parts.roof)

    const full = createGrandstandBay({ rows: 8, width: 10, tiers: 3 })
    full.root.updateMatrixWorld(true)
    const fullRoof = new Box3().setFromObject(full.parts.roof)

    // Same leading edge, to the millimetre: the canopy leads where a one-tier bay's roof leads.
    expect(fullRoof.max.z).toBeCloseTo(singleRoof.max.z, 6)
    // ...and ties back at the TOP tier's rear wall line, two tier-steps further back.
    expect(fullRoof.min.z).toBeCloseTo(singleRoof.min.z - 2 * (2 * 4 - 3 * 0.8), 6)
    // So the section canopy is more than twice the single-tier roof's depth.
    const fullDepth = fullRoof.max.z - fullRoof.min.z
    expect(fullDepth).toBeGreaterThan(2 * (singleRoof.max.z - singleRoof.min.z))
    expect(fullDepth).toBeCloseTo(20.88, 2)

    // Intermediate props: one column line per LOWER tier's promenade, so a 20 m rafter is carried.
    const props = full.root.getObjectByName('canopy-props')
    expect(props).toBeDefined()
    const propBox = new Box3().setFromObject(props!)
    // They stand on tier 0's promenade (0.95 m) and reach the rafter twenty metres up.
    expect(propBox.min.y).toBeLessThan(1.1)
    expect(propBox.max.y).toBeGreaterThan(19)
    // ...and stay inside the tiling module's own long-standing 0.18 m pad overhang, so a tiled run is
    // unaffected by them (the same bound the stairs-'none' footprint test holds the whole model to).
    expect(propBox.min.x).toBeGreaterThan(-5.2)
    expect(propBox.max.x).toBeLessThan(5.2)

    // CLEARANCE. Measured off the membrane's own underside, per tier, over that tier's own depth. The
    // design datum is the rafter CHORD at bowlTop + ROOF_CLEAR; the fabric hangs a little below it, so
    // the honest gate is that a three-tier section is no tighter than the single-tier bay already is.
    const clearanceOf = (model: ReturnType<typeof createGrandstandBay>): number[] => {
      model.root.updateMatrixWorld(true)
      const under = new Map<number, number>()
      const v = new Vector3()
      model.parts.roof.traverse((object) => {
        const mesh = object as Mesh
        if (!mesh.isMesh || mesh.name !== 'roof') return
        const pos = (mesh.geometry as BufferGeometry).getAttribute('position')
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos as never, i).applyMatrix4(mesh.matrixWorld)
          const key = Math.round(v.z * 2) / 2
          const cur = under.get(key)
          if (cur === undefined || v.y < cur) under.set(key, v.y)
        }
      })
      const out: number[] = []
      model.parts.bowl.traverse((object) => {
        if (!(object as Mesh).isMesh || object.name !== 'bowl') return
        const bowl = new Box3().setFromObject(object)
        let worst = Infinity
        for (const [z, y] of under) {
          if (z < bowl.min.z - 0.25 || z > bowl.max.z + 0.25) continue
          worst = Math.min(worst, y - bowl.max.y)
        }
        out.push(worst)
      })
      return out
    }
    const singleClear = clearanceOf(single)[0]!
    const fullClear = clearanceOf(full)
    expect(fullClear).toHaveLength(3)
    // The top tier is the binding one, and it is no tighter than today's single-tier bay.
    expect(fullClear[2]!).toBeGreaterThanOrEqual(singleClear)
    // The two tiers below it are wide open under the same canopy — this is a section roof, not a lid.
    expect(fullClear[0]!).toBeGreaterThan(10)
    expect(fullClear[1]!).toBeGreaterThan(5)

    single.dispose()
    full.dispose()
  })

  test('grandstand-bay roof: "none" removes every roof mesh, "top" is the old top-tier-only canopy', () => {
    const none = createGrandstandBay({ rows: 8, width: 10, tiers: 3, roof: 'none' })
    none.root.updateMatrixWorld(true)
    let roofMeshes = 0
    none.parts.roof.traverse((object) => { if ((object as Mesh).isMesh) roofMeshes += 1 })
    expect(roofMeshes).toBe(0)
    // ('roof' itself is the GROUP's name, so it is checked by the mesh count above, not by lookup.)
    for (const name of ['roof-frames', 'columns', 'fascia-frame', 'fascia-board', 'canopy-props']) {
      expect(none.root.getObjectByName(name)).toBeUndefined()
    }
    // A single-tier bay obeys it too — `roof` is a top-level switch, not a tiers>1 special case.
    const bare = createGrandstandBay({ rows: 8, width: 10, roof: 'none' })
    expect(bare.root.getObjectByName('roof-frames')).toBeUndefined()
    expect(bare.root.getObjectByName('columns')).toBeUndefined()
    bare.dispose()

    // 'top' reproduces the previous behaviour exactly: one canopy, sized to the TOP tier alone.
    const top = createGrandstandBay({ rows: 8, width: 10, tiers: 3, roof: 'top' })
    top.root.updateMatrixWorld(true)
    const topRoof = new Box3().setFromObject(top.parts.roof)
    const single = createGrandstandBay({ rows: 8, width: 10 })
    single.root.updateMatrixWorld(true)
    const singleRoof = new Box3().setFromObject(single.parts.roof)
    // Same depth as a one-tier bay's roof (the top tier has the same rows), just lifted and stepped back.
    expect(topRoof.max.z - topRoof.min.z).toBeCloseTo(singleRoof.max.z - singleRoof.min.z, 6)
    expect(topRoof.max.z).toBeLessThan(0)
    // No props: nothing spans down to a lower tier under a top-only canopy.
    expect(top.root.getObjectByName('canopy-props')).toBeUndefined()

    none.dispose()
    top.dispose()
    single.dispose()
  })

  test('grandstand-bay roof: "per-tier" is the ONLY value that reads tierSpec[k].roof', () => {
    // `lift` buys tier 0 the ROOF_CLEAR headroom its own canopy needs under tier 1 — the pre-existing
    // per-tier gate. Same config either side, so only the `roof` value is under test.
    const spec = [{ roof: true }, { roof: false, lift: 4 }] as const

    // Under the default 'full' the per-tier field is ignored — one section canopy, no second roof.
    const ignored = createGrandstandBay({
      rows: 8, width: 10, tiers: 2, tierSpec: [...spec],
    })
    ignored.root.updateMatrixWorld(true)
    let membranes = 0
    ignored.parts.roof.traverse((object) => {
      if ((object as Mesh).isMesh && object.name === 'roof') membranes += 1
    })
    expect(membranes).toBe(1)
    expect(new Box3().setFromObject(ignored.parts.roof).max.z).toBeCloseTo(5.06, 2)
    ignored.dispose()

    // Asked for explicitly, the per-tier field decides: tier 0 carries its own roof, the top tier does not.
    const perTier = createGrandstandBay({
      rows: 8, width: 10, tiers: 2, roof: 'per-tier', tierSpec: [...spec],
    })
    perTier.root.updateMatrixWorld(true)
    let perTierMembranes = 0
    perTier.parts.roof.traverse((object) => {
      if ((object as Mesh).isMesh && object.name === 'roof') perTierMembranes += 1
    })
    expect(perTierMembranes).toBe(1)
    // Tier 0's own roof, so it sits at the BOTTOM tier's height, not the top's.
    expect(new Box3().setFromObject(perTier.parts.roof).max.y).toBeLessThan(9)
    perTier.dispose()

    // ...and 'per-tier' with nothing declared is still the top tier only, as it always was.
    const fallback = createGrandstandBay({ rows: 8, width: 10, tiers: 2, roof: 'per-tier' })
    fallback.root.updateMatrixWorld(true)
    expect(new Box3().setFromObject(fallback.parts.roof).max.y).toBeGreaterThan(13)
    fallback.dispose()
  })

  test('grandstand-bay stairs is the top-level switch; tierSpec.stairSide overrides it', () => {
    // Default: NO towers, so a run of bays squeezes together at exactly `width`.
    const squeezed = createGrandstandBay({ rows: 8, width: 10, tiers: 3 })
    expect(squeezed.getFootprint()).toEqual({ width: 10, totalWidth: 10, left: 0, right: 0 })
    expect(squeezed.root.getObjectByName('stairs')).toBeUndefined()
    squeezed.dispose()

    const right = createGrandstandBay({ rows: 8, width: 10, tiers: 3, stairs: 'right' })
    expect(right.getFootprint().left).toBe(0)
    expect(right.getFootprint().right).toBeGreaterThan(0)
    right.dispose()

    const left = createGrandstandBay({ rows: 8, width: 10, tiers: 3, stairs: 'left' })
    expect(left.getFootprint().right).toBe(0)
    expect(left.getFootprint().left).toBeGreaterThan(0)
    left.dispose()

    // 'ends' is the documented alias for 'both' — a bay that is a run end on both sides.
    const both = createGrandstandBay({ rows: 8, width: 10, tiers: 3, stairs: 'both' })
    const ends = createGrandstandBay({ rows: 8, width: 10, tiers: 3, stairs: 'ends' })
    expect(ends.getFootprint()).toEqual(both.getFootprint())
    expect(ends.getFootprint().left).toBeGreaterThan(0)
    expect(ends.getFootprint().right).toBeGreaterThan(0)
    both.dispose()
    ends.dispose()

    // PRECEDENCE: a tier that names its own side wins over the top-level switch, for that tier.
    const overridden = createGrandstandBay({
      rows: 8, width: 10, tiers: 3, stairs: 'both',
      tierSpec: [{}, { stairSide: 'none' }, { stairSide: 'left' }],
    })
    const footprint = overridden.getFootprint()
    expect(footprint.left).toBeGreaterThan(0)
    expect(footprint.right).toBe(0)
    overridden.dispose()
  })

  test('grandstand-bay configure() patches roof and stairs live', () => {
    const model = createGrandstandBay({ rows: 8, width: 10, tiers: 3 })
    model.root.updateMatrixWorld(true)
    expect(model.getConfig().roof).toBe('full')
    expect(model.getConfig().stairs).toBe('none')
    const fullDepth = (() => {
      const box = new Box3().setFromObject(model.parts.roof)
      return box.max.z - box.min.z
    })()

    model.configure({ roof: 'top', stairs: 'both' })
    model.root.updateMatrixWorld(true)
    expect(model.getConfig().roof).toBe('top')
    const topBox = new Box3().setFromObject(model.parts.roof)
    expect(topBox.max.z - topBox.min.z).toBeLessThan(fullDepth / 2)
    expect(model.getFootprint().left).toBeGreaterThan(0)
    expect(model.getFootprint().right).toBeGreaterThan(0)

    model.configure({ roof: 'none', stairs: 'none' })
    model.root.updateMatrixWorld(true)
    let roofMeshes = 0
    model.parts.roof.traverse((object) => { if ((object as Mesh).isMesh) roofMeshes += 1 })
    expect(roofMeshes).toBe(0)
    expect(model.getFootprint().totalWidth).toBe(10)

    model.configure({ roof: 'full' })
    model.root.updateMatrixWorld(true)
    const back = new Box3().setFromObject(model.parts.roof)
    expect(back.max.z - back.min.z).toBeCloseTo(fullDepth, 6)
    model.dispose()
  })

  test('circuit stairs are 180 mm rise / 280 mm going', () => {
    const model = createStairs({ kind: 'flight', steps: 10, landing: false })
    expect(STAIRS.rise).toBeCloseTo(0.18, 5)
    expect(STAIRS.run).toBeCloseTo(0.28, 5)
    model.root.updateMatrixWorld(true)
    const { box, size } = sizeOf(model.root)
    expect(size.z).toBeGreaterThan(10 * STAIRS.run - 0.2)
    expect(size.z).toBeLessThan(10 * STAIRS.run + 0.6)
    expect(box.max.y).toBeGreaterThan(10 * STAIRS.rise)
    expect(box.max.y).toBeLessThan(10 * STAIRS.rise + STAIRS.railH + 0.2)
    expect(model.parts.treads.children.length).toBe(1)
    expect(model.parts.rails.children.length).toBe(1)
    expect(model.parts.structure.children.length).toBe(1)
    model.dispose()
  })

  test('overpass deck clears the 5.5 m catch-fence envelope', () => {
    const model = createStairs({ kind: 'overpass', span: 12 })
    expect(model.getConfig().kind).toBe('overpass')
    expect(model.getConfig().steps).toBeGreaterThanOrEqual(Math.round(SPECTATOR_BRIDGE.deckHeight / STAIRS.rise))
    model.root.updateMatrixWorld(true)
    const { box } = sizeOf(model.root)
    expect(box.max.y).toBeGreaterThanOrEqual(SPECTATOR_BRIDGE.deckHeight)
    expect(model.parts.deck.children.length).toBe(1)
    const id = model.parts.treads.uuid
    model.configure({ span: 14 })
    expect(model.parts.treads.uuid).toBe(id)
    expect(model.getConfig().span).toBe(14)
    model.dispose()
  })

  test('stairs preview is the overhang pass, not a lone flight', () => {
    const preview = createStairsPreview({ aspect: 1 })
    expect(preview.root.name).toBe('f1-stairs')
    expect(preview.root.getObjectByName('deck')?.children.length).toBeGreaterThan(0)
    preview.dispose()
  })

  test('spectator bridge deck clears the 5 m catch fence', () => {
    const model = createSpectatorBridge({ span: 10 })
    model.root.updateMatrixWorld(true)
    const { box } = sizeOf(model.root)
    expect(box.max.y).toBeGreaterThanOrEqual(5.5)
    model.dispose()
  })

  test('spectator bridge deckHeight defaults to the kit clearance and is byte-identical', () => {
    // Same vertex totals whether `deckHeight` is omitted or passed explicitly at the old
    // hard-coded constant: the option must not perturb the default build.
    const totalVerts = (root: Object3D): number => {
      let total = 0
      root.traverse((object) => {
        const mesh = object as Mesh
        if (!mesh.isMesh) return
        total += (mesh.geometry as BufferGeometry).getAttribute('position').count
      })
      return total
    }
    const omitted = createSpectatorBridge({ span: 10 })
    const explicit = createSpectatorBridge({ span: 10, deckHeight: SPECTATOR_BRIDGE.deckHeight })
    expect(omitted.getConfig().deckHeight).toBe(SPECTATOR_BRIDGE.deckHeight)
    expect(totalVerts(omitted.root)).toBe(totalVerts(explicit.root))
    omitted.root.updateMatrixWorld(true)
    explicit.root.updateMatrixWorld(true)
    expect(sizeOf(omitted.root).box.max.y).toBeCloseTo(sizeOf(explicit.root).box.max.y, 6)
    omitted.dispose()
    explicit.dispose()
  })

  test('spectator bridge deckHeight raises the deck, the piers and the stair towers', () => {
    const low = createSpectatorBridge({ span: 10 })
    const high = createSpectatorBridge({ span: 10, deckHeight: 6.5 })
    low.root.updateMatrixWorld(true)
    high.root.updateMatrixWorld(true)
    const lowBox = sizeOf(low.root).box
    const highBox = sizeOf(high.root).box
    expect(highBox.max.y).toBeGreaterThanOrEqual(6.5)
    expect(highBox.max.y).toBeGreaterThan(lowBox.max.y)
    // The stairs and piers reach the deck rather than stopping short of it: the tower's own
    // AABB (a proxy for pier + stair-tower height) grows with the deck, not just the deck slab.
    const towerHeight = (root: Object3D): number =>
      new Box3().setFromObject(root.getObjectByName('stairs')!).getSize(new Vector3()).y
    expect(towerHeight(high.root)).toBeGreaterThan(towerHeight(low.root))
    low.dispose()
    high.dispose()
  })

  test('spectator bridge rejects a non-finite or too-low deckHeight', () => {
    const fallback = createSpectatorBridge({ span: 10, deckHeight: Number.NaN })
    expect(fallback.getConfig().deckHeight).toBe(SPECTATOR_BRIDGE.deckHeight)
    fallback.dispose()

    const tooLow = createSpectatorBridge({ span: 10, deckHeight: 1 })
    expect(tooLow.getConfig().deckHeight).toBe(4)
    tooLow.dispose()

    const patched = createSpectatorBridge({ span: 10 })
    patched.configure({ deckHeight: -2 })
    expect(patched.getConfig().deckHeight).toBe(4)
    patched.configure({ deckHeight: Number.POSITIVE_INFINITY })
    expect(patched.getConfig().deckHeight).toBe(4)
    patched.dispose()
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

  test('service truck stays inside the EU 96/53 16.50 m artic box (DAF XG width 2.55 m)', () => {
    const model = createServiceTruck()
    model.root.updateMatrixWorld(true)
    const { box, size } = sizeOf(model.root)
    expect(size.x).toBeGreaterThan(15.8)
    expect(size.x).toBeLessThanOrEqual(16.55)
    expect(size.z).toBeGreaterThan(2.50)
    expect(size.z).toBeLessThan(3.8)
    expect(box.max.y).toBeGreaterThan(3.6)
    expect(box.max.y).toBeLessThanOrEqual(4.15)
    model.dispose()
  })

  test('service truck trailer hitches behind the cab, not behind the tractor', () => {
    const model = createServiceTruck()
    model.root.updateMatrixWorld(true)
    const bulkhead = model.root.getObjectByName('bulkhead')
    const cargo = model.root.getObjectByName('box')
    expect(bulkhead).toBeDefined()
    expect(cargo).toBeDefined()
    const cabRear = new Box3().setFromObject(bulkhead!).max.x
    const trailerFront = new Box3().setFromObject(cargo!).min.x
    const hitch = trailerFront - cabRear
    expect(hitch).toBeGreaterThan(0.2)
    expect(hitch).toBeLessThan(0.8)
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

  test('service truck hubs each carry a named tyre mesh', () => {
    const model = createServiceTruck()
    const hubs = model.parts.wheels.children
    expect(hubs.length).toBeGreaterThanOrEqual(8)
    for (const hub of hubs) {
      const tyre = hub.children.find((child) => child.name.startsWith('tyre-'))
      expect(tyre).toBeDefined()
    }
    model.dispose()
  })

  test('service truck wheels follow a ground plane via raycast', () => {
    const model = createServiceTruck()
    const ground = new Mesh(new PlaneGeometry(40, 40))
    ground.rotation.x = -Math.PI / 2
    ground.position.y = 0
    ground.updateMatrixWorld(true)
    model.setGround(ground)
    model.update(0)
    const tyreR = 1.08 / 2
    const hub = model.parts.wheels.children[0]
    expect(hub).toBeDefined()
    expect(hub!.position.y).toBeCloseTo(tyreR, 1)
    ground.position.y = 0.30
    ground.updateMatrixWorld(true)
    model.update(0)
    expect(hub!.position.y).toBeCloseTo(0.30 + tyreR, 1)
    ground.geometry.dispose()
    model.dispose()
  })

  test('service truck preview keeps the kit env, lamps on, and cab light on', () => {
    const preview = createServiceTruckPreview({ aspect: 1 })
    expect(preview.bloom).toBe(true)
    expect(preview.scene.environment).toBeNull()
    expect(preview.root.getObjectByName('lamps')?.children.length).toBeGreaterThan(0)
    expect(preview.isCabLightOn()).toBe(true)
    const cabLight = preview.scene.getObjectByName('f1-kit / cab light')
    expect(cabLight?.visible).toBe(true)
    expect(preview.toggleCabLight()).toBe(false)
    expect(preview.isCabLightOn()).toBe(false)
    expect(cabLight?.visible).toBe(false)
    expect(preview.scene.environment).toBeNull()
    const x0 = preview.root.position.x
    const hub = preview.root.getObjectByName('hub-0-1')
    const z0 = hub ? hub.rotation.z : 0
    preview.update(0.4)
    expect(preview.root.position.x).toBeCloseTo(x0, 5)
    expect(hub).toBeTruthy()
    expect(hub!.rotation.z).not.toBeCloseTo(z0, 5)
    preview.dispose()
  })

  test('service truck wheel preview frames a steer hub', () => {
    const preview = createWheelPreview({ aspect: 1 })
    expect(preview.bloom).toBe(true)
    expect(preview.root.getObjectByName('hub-0-1')).toBeTruthy()
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
    expect(rail).toBeTruthy()
    expect(backdrop).toBeTruthy()
    const p1Box = new Box3().setFromObject(p1)
    const p2Box = new Box3().setFromObject(p2)
    const p3Box = new Box3().setFromObject(p3)
    const railBox = new Box3().setFromObject(rail)
    const wallBox = new Box3().setFromObject(backdrop)
    const p1Size = p1Box.getSize(new Vector3())
    const p2Size = p2Box.getSize(new Vector3())
    const p3Size = p3Box.getSize(new Vector3())
    const midX = (box: Box3) => (box.min.x + box.max.x) / 2
    // Curved arc sectors share radial depth, so AABB X ranges may overlap — order by mid-X.
    expect(midX(p2Box)).toBeLessThan(midX(p1Box))
    expect(midX(p3Box)).toBeGreaterThan(midX(p1Box))
    expect(midX(p1Box)).toBeCloseTo(0, 1)
    expect(p1Size.y).toBeCloseTo(1.00, 1)
    expect(p2Size.y).toBeCloseTo(0.70, 1)
    expect(p3Size.y).toBeCloseTo(0.40, 1)
    expect(p1Size.z).toBeGreaterThan(0.9)
    // Apron glass sits on a larger arc than the dais faces, so AABB Z ranges overlap by design.
    expect(railBox.getSize(new Vector3()).x).toBeGreaterThan(1)
    expect(p1Box.min.z - wallBox.max.z).toBeGreaterThanOrEqual(0.45)
    model.dispose()
  })


  test('LED ribbon is an 8 × 1.2 m cabinet on feet', () => {
    const model = createLedRibbon()
    model.root.updateMatrixWorld(true)
    const { size } = sizeOf(model.root)
    expect(size.x).toBeCloseTo(8, 1)
    expect(size.y).toBeGreaterThan(1.25)
    expect(size.y).toBeLessThan(1.45)
    model.dispose()
  })

  test('champagne magnum is ~0.35 m', () => {
    const model = createChampagne()
    model.root.updateMatrixWorld(true)
    expect(sizeOf(model.root).box.max.y).toBeCloseTo(0.35, 1)
    model.dispose()
  })

  test('ice bucket rim is ~300 mm', () => {
    const model = createIceBucket()
    model.root.updateMatrixWorld(true)
    const { size } = sizeOf(model.root)
    expect(size.x).toBeGreaterThan(0.28)
    expect(size.x).toBeLessThan(0.36)
    expect(size.y).toBeCloseTo(0.38, 1)
    model.dispose()
  })


})
