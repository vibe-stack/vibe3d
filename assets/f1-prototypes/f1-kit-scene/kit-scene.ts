/**
 * Compound F1 kit evaluation scene — a pit-straight diorama, not a GP.
 *
 * Overhead (looking down, +Z is the far end of the road):
 *
 *   END   tunnel · stairs/bridge · armco/jersey/pit-wall (barriers live here)
 *   MID   empty asphalt + kerb/fence the full length · sector gantry only
 *   START grid / SF / lights · grandstands | ribbon | clear pit apron | garages
 *
 * Stairs and runoff barriers are at the far end. The pit apron in front of
 * the garage doors stays clear. Every kit id appears at least once.
 */

import {
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
} from 'three/webgpu'

import { GARAGE, GARAGE_BAY_PITCH, PIT_WALL, TOKEN, shade } from '../f1-kit-core/index.ts'
import { createModel as createTyre } from '../f1-tyre/model.ts'
import { createModel as createStack } from '../f1-tyre-stack/model.ts'
import { createModel as createReel } from '../f1-hose-reel/model.ts'
import { createModel as createPitBoard } from '../f1-pit-board/model.ts'
import { createModel as createPitGantry } from '../f1-pit-gantry/model.ts'
import { createModel as createLollipop } from '../f1-lollipop-board/model.ts'
import { createModel as createTyreGun } from '../f1-tyre-gun/model.ts'
import { createModel as createPitJack } from '../f1-pit-jack/model.ts'
import { createModel as createCabinet } from '../f1-tool-cabinet/model.ts'
import { createModel as createExtinguisher } from '../f1-fire-extinguisher/model.ts'
import { createModel as createGunRack } from '../f1-gun-rack/model.ts'
import { createModel as createCatchFence } from '../f1-catch-fence/model.ts'
import { createModel as createArmco } from '../f1-armco/model.ts'
import { createModel as createTyreBarrier } from '../f1-tyre-barrier/model.ts'
import { createModel as createTecpro } from '../f1-tecpro/model.ts'
import { createModel as createStartLights } from '../f1-start-lights/model.ts'
import { createModel as createKerb } from '../f1-kerb/model.ts'
import { createModel as createFloodlight } from '../f1-floodlight/model.ts'
import { createModel as createTimingPylon } from '../f1-timing-pylon/model.ts'
import { createModel as createBrakeMarker } from '../f1-brake-marker/model.ts'
import { createModel as createJumbotron } from '../f1-jumbotron/model.ts'
import { createModel as createMarshalPost } from '../f1-marshal-post/model.ts'
import { createModel as createStartGantry } from '../f1-start-gantry/model.ts'
import { createModel as createGrandstandBay } from '../f1-grandstand-bay/model.ts'
import { createModel as createOranjeCan } from '../f1-oranje-can/model.ts'
import { createModel as createConcreteWall } from '../f1-concrete-wall/model.ts'
import { createModel as createSausageKerb } from '../f1-sausage-kerb/model.ts'
import { createModel as createAstroturf } from '../f1-astroturf-strip/model.ts'
import { createModel as createJersey } from '../f1-jersey-barrier/model.ts'
import { createModel as createAccessGate } from '../f1-access-gate/model.ts'
import { createModel as createCrashCushion } from '../f1-crash-cushion/model.ts'
import { createModel as createGravelTrap } from '../f1-gravel-trap/model.ts'
import { createModel as createCrowdFence } from '../f1-crowd-fence/model.ts'
import { createModel as createMarkerPost } from '../f1-marker-post/model.ts'
import { createModel as createSlotDrain } from '../f1-slot-drain/model.ts'
import { createModel as createStairs } from '../f1-stairs/model.ts'
import { createModel as createCircuitSign } from '../f1-circuit-sign/model.ts'
import { createModel as createGridBox } from '../f1-grid-box/model.ts'
import { createModel as createStartFinishLine } from '../f1-start-finish-line/model.ts'
import { createModel as createFiaLightPanel } from '../f1-fia-light-panel/model.ts'
import { createModel as createChevronBoard } from '../f1-chevron-board/model.ts'
import { createModel as createCameraTower } from '../f1-camera-tower/model.ts'
import { createModel as createFoamMonitor } from '../f1-foam-monitor/model.ts'
import { createModel as createCctvMast } from '../f1-cctv-mast/model.ts'
import { createModel as createPaHorn } from '../f1-pa-horn/model.ts'
import { createModel as createGarageBox } from '../f1-garage-box/model.ts'
import { createModel as createPitWall } from '../f1-pit-wall/model.ts'
import { createModel as createRaceControl } from '../f1-race-control/model.ts'
import { createModel as createSpectatorBridge } from '../f1-spectator-bridge/model.ts'
import { createModel as createPodium } from '../f1-podium/model.ts'
import { createModel as createCone } from '../f1-cone/model.ts'
import { createModel as createBollard } from '../f1-bollard/model.ts'
import { createModel as createWeighbridge } from '../f1-weighbridge/model.ts'
import { createModel as createParcFerme } from '../f1-parc-ferme/model.ts'
import { createModel as createMedicalPost } from '../f1-medical-post/model.ts'
import { createModel as createGeneratorCabin } from '../f1-generator-cabin/model.ts'
import { createModel as createFlagPole } from '../f1-flag-pole/model.ts'
import { createModel as createCameraPlatform } from '../f1-camera-platform/model.ts'
import { createModel as createTunnelPortal } from '../f1-tunnel-portal/model.ts'
import { createModel as createSectorGantry } from '../f1-sector-gantry/model.ts'
import { createModel as createTrophyCup } from '../f1-trophy-cup/model.ts'
import { createModel as createChampagne } from '../f1-champagne/model.ts'
import { createModel as createIceBucket } from '../f1-ice-bucket/model.ts'
import { createModel as createTrophyTable } from '../f1-trophy-table/model.ts'
import { createModel as createInterviewBackdrop } from '../f1-interview-backdrop/model.ts'
import { createModel as createCooldownBoard } from '../f1-cooldown-board/model.ts'
import { createModel as createLedRibbon } from '../f1-led-ribbon/model.ts'
import { createModel as createSectorBoard } from '../f1-sector-board/model.ts'
import { createModel as createNameboard } from '../f1-nameboard/model.ts'
import { createModel as createServiceTruck } from '../f1-service-truck/model.ts'
import { createModel as createChequeredFlag } from '../f1-chequered-flag/model.ts'

interface Live {
  readonly root: Group
  update(deltaSeconds: number): void
  dispose(): void
}

export interface F1KitScene {
  readonly root: Group
  update(deltaSeconds: number): void
  dispose(): void
}

/** Local +Z (doors, glass, seats) → world +X. */
const FACE_PIT = Math.PI / 2
/** Local +Z → world −X (spectator furniture looking at the ribbon). */
const FACE_SPEC = -Math.PI / 2
/** Local-X runs (kerbs, fences, walls) → world Z along the ribbon. */
const ALONG = Math.PI / 2

const RIBBON_W = 12
const RIBBON_HALF = RIBBON_W / 2
/** One pavement from garage doors to the catch fence, start to tunnel. */
const ROAD_W = 40
const ROAD_X = -1
const ROAD_LEN = 220
const ROAD_Z = 20
const END_Z = 108
const SPAN = 22
const STAND_X = 22
const STAND_PITCH = 10
const DOOR_X = -(RIBBON_HALF + 1.2 + 8)
const GARAGE_X = DOOR_X - GARAGE.depth / 2
const WALL_X = -(RIBBON_HALF + 0.6 + PIT_WALL.depth / 2)
const TOOL_X = DOOR_X + 0.55
const EDGE_X = RIBBON_HALF + 2.35

export function createScene(): F1KitScene {
  const root = new Group()
  root.name = 'f1-kit-scene'
  const live: Live[] = []
  const extras: Array<{ dispose: () => void }> = []

  const add = (instance: Live, x: number, z: number, yaw = 0, y = 0): void => {
    instance.root.position.set(x, y, z)
    instance.root.rotation.y = yaw
    root.add(instance.root)
    live.push(instance)
  }

  const asphaltMat = new MeshStandardMaterial({
    name: 'f1-kit / scene asphalt',
    color: shade(TOKEN.INK_950, 0.22),
    roughness: 0.92,
    metalness: 0,
  })
  const groundMat = new MeshStandardMaterial({
    name: 'f1-kit / scene ground',
    color: shade(TOKEN.GRAPHITE_800, -0.45),
    roughness: 0.96,
    metalness: 0,
  })
  extras.push({
    dispose: () => {
      asphaltMat.dispose()
      groundMat.dispose()
    },
  })

  const ground = new Mesh(new PlaneGeometry(88, 220), groundMat)
  ground.name = 'scene-ground'
  ground.rotation.x = -Math.PI / 2
  ground.position.set(-8, -0.02, ROAD_Z)
  ground.receiveShadow = true
  root.add(ground)
  extras.push({ dispose: () => { ground.geometry.dispose() } })

  // Keep this *under* grid-box pads (top 6 mm) and SF chequer (top 8 mm).
  // At y=0.012 those tiles were buried and only the numbers poked through.
  const road = new Mesh(new PlaneGeometry(ROAD_W, ROAD_LEN), asphaltMat)
  road.name = 'scene-asphalt'
  road.rotation.x = -Math.PI / 2
  road.position.set(ROAD_X, 0.001, ROAD_Z)
  road.receiveShadow = true
  root.add(road)
  extras.push({ dispose: () => { road.geometry.dispose() } })

  // START — grid, SF, lights. Pit apron in front of the garages stays clear.
  add(createGridBox({ index: 1 }), 0, -8)
  add(createGridBox({ index: 2 }), 0, 0)
  add(createGridBox({ index: 3 }), 0, 8)
  add(createStartFinishLine({ kind: 'SF', width: RIBBON_W }), 0, -16, 0)
  add(createStartGantry({ span: 16, height: 7.2 }), 0, -18)
  add(createStartLights({ lit: 5 }), 0, -18.4, 0, 5.4)
  add(createChequeredFlag({ waving: true, windXZ: [0.9, -0.4] }), RIBBON_HALF + 0.55, -16, -0.35)
  add(createKerb({ modules: 100 }), RIBBON_HALF - 0.4, 4, ALONG)
  add(createKerb({ modules: 100 }), RIBBON_HALF - 0.4, 76, ALONG)
  add(createSausageKerb({ modules: 14 }), RIBBON_HALF + 0.3, 88, ALONG)
  add(createSlotDrain({ modules: 50 }), -(RIBBON_HALF - 0.35), 0, ALONG)
  add(createSlotDrain({ modules: 40 }), -(RIBBON_HALF - 0.35), 80, ALONG)
  add(createAstroturf({ modules: 90 }), RIBBON_HALF + 1.5, 8, ALONG)
  add(createAstroturf({ modules: 90 }), RIBBON_HALF + 1.5, 84, ALONG)
  add(createAstroturf({ modules: 70 }), -(RIBBON_HALF + 1.5), 12, ALONG)
  add(createGravelTrap({ modules: 8 }), 16, 18, ALONG)
  add(createGravelTrap({ modules: 8 }), 16, END_Z - 10, ALONG)

  // Pit (−X): garage + tools on the door line. No wall/barriers on this apron.
  add(createGarageBox({ count: 3, number: '11', legend: 'CHECO' }), GARAGE_X, 0, FACE_PIT)
  add(createPitGantry({ span: 5, height: 2.5 }), TOOL_X - 2.2, END_Z)
  add(createLollipop(), TOOL_X - 1.6, -GARAGE_BAY_PITCH + 1.4)
  add(createPitBoard(), TOOL_X - 1.4, -GARAGE_BAY_PITCH + 2.6)
  add(createStack(), TOOL_X, -GARAGE_BAY_PITCH - 1.6)
  add(createGunRack(), TOOL_X, 0)
  add(createCabinet(), TOOL_X, GARAGE_BAY_PITCH - 1.2)
  add(createReel(), TOOL_X, GARAGE_BAY_PITCH + 1.4)
  add(createTyre(), TOOL_X + 0.7, -GARAGE_BAY_PITCH - 0.2)
  add(createTyreGun(), TOOL_X + 0.55, -0.8)
  add(createPitJack(), TOOL_X + 0.7, 0.9)
  add(createExtinguisher(), TOOL_X + 0.45, GARAGE_BAY_PITCH + 0.2)

  // Spectator (+X): fence and stand wall. Fence runs the full asphalt.
  add(createCatchFence({ length: 200, height: 5 }), RIBBON_HALF + 3.4, ROAD_Z, ALONG)
  add(createCrowdFence({ length: 200 }), 18, ROAD_Z, ALONG)
  add(createGrandstandBay({ rows: 6, width: 10 }), STAND_X, -STAND_PITCH, FACE_SPEC)
  add(createGrandstandBay({ rows: 6, width: 10 }), STAND_X, 0, FACE_SPEC)
  add(createGrandstandBay({ rows: 6, width: 10 }), STAND_X, STAND_PITCH, FACE_SPEC)
  add(createJumbotron(), 29, -STAND_PITCH, FACE_SPEC)
  add(createLedRibbon({ length: 8 }), 29, STAND_PITCH, FACE_SPEC)
  add(createFloodlight({ height: 12 }), 30, 0)
  add(createPaHorn(), 28, 6, FACE_SPEC)
  add(createFlagPole({ height: 6 }), 28, -18)
  add(createCameraPlatform(), 28, -14)

  // MID — one gantry over the road, no stairs.
  add(createSectorGantry({ span: 18, sector: 2 }), 0, 36)

  // Marshalling line along the ribbon edge.
  add(createFiaLightPanel(), EDGE_X, -24, FACE_SPEC)
  add(createSectorBoard({ sector: 1 }), EDGE_X, -20, FACE_SPEC)
  add(createTimingPylon(), EDGE_X, -12)
  add(createCctvMast(), EDGE_X, -6)
  add(createCircuitSign({ kind: 'DRS' }), EDGE_X, 20, FACE_SPEC)
  add(createMarkerPost(), EDGE_X, 48)
  add(createBrakeMarker({ distance: 100 }), EDGE_X, 64, FACE_SPEC)
  add(createMarshalPost({ number: '11', flag: 'yellow' }), EDGE_X, 84, FACE_SPEC)
  add(createOranjeCan({ lit: true }), EDGE_X + 1.6, 84)

  // END of the track — stairs, bridge, pit wall, runoff barriers.
  add(createSpectatorBridge({ span: SPAN }), 0, END_Z)
  add(createStairs({ kind: 'flight', steps: 16, width: 1.4 }), STAND_X, END_Z + 8)
  add(createPitWall({ bays: 3, labels: ['11', '22', '33'] }), WALL_X, END_Z, FACE_PIT)
  add(createNameboard(), WALL_X + 0.2, END_Z - GARAGE_BAY_PITCH, FACE_PIT)
  add(createArmco({ bays: 14 }), RIBBON_HALF + 0.55, END_Z - 12, ALONG)
  add(createCrashCushion({ fits: 'armco' }), RIBBON_HALF + 0.55, END_Z - 24, ALONG)
  add(createAccessGate({ fits: 'armco', width: 3 }), RIBBON_HALF + 0.55, END_Z + 2, ALONG)
  add(createJersey({ modules: 8 }), 22, END_Z - 4, ALONG)
  add(createConcreteWall({ bays: 4 }), 26, END_Z + 6, 0.2)
  add(createTecpro({ columns: 3, rows: 2 }), 24, END_Z - 2, 0.2)
  add(createTyreBarrier({ columns: 4, rows: 3, depth: 1 }), 28, END_Z + 2, 0.35)
  add(createChevronBoard(), EDGE_X, END_Z - 16, 0.2)
  add(createCameraTower({ height: 8 }), 30, END_Z - 10)
  add(createFoamMonitor(), 22, END_Z - 14, 0.2)
  add(createCone(), -(RIBBON_HALF + 0.45), -22)
  add(createBollard(), -(RIBBON_HALF + 0.35), -26)
  add(createTunnelPortal(), 0, END_Z + 16, Math.PI)

  // Paddock (behind the garage). Cab toward −Z so the still sees cab+box as one artic.
  add(createRaceControl(), GARAGE_X - 18, 28, FACE_PIT)
  const truck = createServiceTruck({ kind: 'box', lamps: true, wheelRpm: 0 })
  truck.setGround(ground)
  add(truck, GARAGE_X - 12, -22, FACE_PIT)
  add(createWeighbridge(), GARAGE_X - 8, 8, FACE_PIT)
  add(createParcFerme(), GARAGE_X - 12, 2, FACE_PIT)
  add(createMedicalPost(), GARAGE_X - 20, 12)
  add(createGeneratorCabin(), GARAGE_X - 20, 4)

  // Ceremony cluster — behind the service row, not on the straight.
  add(createPodium(), GARAGE_X - 12, -32, Math.PI)
  add(createTrophyTable(), GARAGE_X - 12, -35)
  add(createTrophyCup(), GARAGE_X - 12, -34.6, 0, 0.75)
  add(createChampagne(), GARAGE_X - 11.2, -34.6, 0, 0.75)
  add(createIceBucket(), GARAGE_X - 12.8, -34.6, 0, 0.75)
  add(createInterviewBackdrop(), GARAGE_X - 6, -32, Math.PI)
  add(createCooldownBoard(), GARAGE_X - 8, -30, Math.PI)

  return {
    root,
    update(deltaSeconds) {
      for (const instance of live) instance.update(deltaSeconds)
    },
    dispose() {
      for (const instance of live) instance.dispose()
      live.length = 0
      for (const extra of extras) extra.dispose()
      extras.length = 0
      root.clear()
      root.removeFromParent()
    },
  }
}

function lightScene(scene: Scene): void {
  scene.add(new HemisphereLight(0x91a4b0, 0x080b0f, 0.62))
  const key = new DirectionalLight(0xffeee0, 2.1)
  key.position.set(-40, 55, 30)
  scene.add(key)
  const fill = new DirectionalLight(0x83a8be, 0.5)
  fill.position.set(45, 18, 20)
  scene.add(fill)
}

export function createPreview({ aspect, time }: { aspect: number; time?: number }) {
  const kit = createScene()
  const scene = new Scene()
  scene.name = 'f1-kit / circuit scene'
  scene.background = new Color(0x000000)
  scene.add(kit.root)
  lightScene(scene)

  const camera = new PerspectiveCamera(34, aspect > 0 ? aspect : 1, 0.5, 420)
  camera.name = 'f1-kit / scene camera'
  camera.position.set(16, 20, -40)
  const focus = new Vector3(0, 1.0, 36)
  camera.lookAt(focus)
  camera.updateProjectionMatrix()
  scene.add(camera)

  kit.update(time ?? 0.4)

  return {
    scene,
    root: kit.root,
    camera,
    update(deltaSeconds: number) {
      kit.update(deltaSeconds)
    },
    dispose() {
      scene.remove(kit.root)
      kit.dispose()
      scene.clear()
    },
  }
}

/** True top-down plan of the diorama. +Z (end of track) is up. */
export function createOverheadPreview({ aspect, time }: { aspect: number; time?: number }) {
  const kit = createScene()
  const scene = new Scene()
  scene.name = 'f1-kit / circuit overhead'
  scene.background = new Color(0x000000)
  scene.add(kit.root)
  lightScene(scene)

  const ratio = aspect > 0 ? aspect : 16 / 9
  const halfH = 112
  const halfW = halfH * ratio
  const camera = new OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.5, 400)
  camera.name = 'f1-kit / overhead camera'
  camera.up.set(0, 0, 1)
  camera.position.set(ROAD_X, 160, ROAD_Z)
  camera.lookAt(ROAD_X, 0, ROAD_Z)
  camera.updateProjectionMatrix()
  scene.add(camera)

  kit.update(time ?? 0.4)

  return {
    scene,
    root: kit.root,
    camera,
    update(deltaSeconds: number) {
      kit.update(deltaSeconds)
    },
    dispose() {
      scene.remove(kit.root)
      kit.dispose()
      scene.clear()
    },
  }
}
