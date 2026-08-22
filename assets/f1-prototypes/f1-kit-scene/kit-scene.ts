/**
 * Compound F1 kit evaluation scene — a pit-straight diorama, not a GP.
 *
 * Purpose is to show how the kit composes: 7 m garage pitch, WALL_FITS gates,
 * kerb/turf/gravel modules along a line. Every kit id appears at least once.
 * Repeating furniture uses short `modules` so the scene stays test-fast.
 */

import {
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
} from 'three/webgpu'

import { TOKEN, shade } from '../f1-kit-core/index.ts'
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

const ALONG = Math.PI / 2

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
    color: shade(TOKEN.INK_950, 0.12),
    roughness: 0.92,
    metalness: 0,
  })
  const groundMat = new MeshStandardMaterial({
    name: 'f1-kit / scene ground',
    color: shade(TOKEN.GRAPHITE_800, -0.2),
    roughness: 0.96,
    metalness: 0,
  })
  extras.push({
    dispose: () => {
      asphaltMat.dispose()
      groundMat.dispose()
    },
  })

  const ground = new Mesh(new PlaneGeometry(140, 120), groundMat)
  ground.name = 'scene-ground'
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.02
  ground.receiveShadow = true
  root.add(ground)
  extras.push({ dispose: () => { ground.geometry.dispose() } })

  const ribbon = new Mesh(new PlaneGeometry(12, 88), asphaltMat)
  ribbon.name = 'scene-asphalt'
  ribbon.rotation.x = -Math.PI / 2
  ribbon.position.set(0, 0.002, 0)
  ribbon.receiveShadow = true
  root.add(ribbon)
  extras.push({ dispose: () => { ribbon.geometry.dispose() } })

  const hairpin = new Mesh(new PlaneGeometry(28, 12), asphaltMat)
  hairpin.name = 'scene-hairpin'
  hairpin.rotation.x = -Math.PI / 2
  hairpin.position.set(8, 0.002, 38)
  hairpin.receiveShadow = true
  root.add(hairpin)
  extras.push({ dispose: () => { hairpin.geometry.dispose() } })

  // Ribbon — grid, SF, lights, kerbs, runoff tiles.
  add(createGridBox({ index: 1 }), 0, -6)
  add(createGridBox({ index: 2 }), 0, 3)
  add(createGridBox({ index: 3 }), 0, 12)
  add(createStartFinishLine({ kind: 'SF', width: 12 }), 0, -14, ALONG)
  add(createStartGantry({ span: 14, height: 7.2 }), 0, -18)
  add(createStartLights({ lit: 5 }), 0, -18.4, 0, 5.4)
  add(createChequeredFlag({ waving: true, windXZ: [0.9, -0.4] }), 6.6, -14, -0.4, 0)
  add(createKerb({ modules: 4 }), 5.6, -8, ALONG)
  add(createSausageKerb({ modules: 2 }), 6.2, 22, ALONG)
  add(createSlotDrain({ modules: 3 }), -5.7, 0, ALONG)
  add(createAstroturf({ modules: 2 }), 7.6, -4, ALONG)
  add(createGravelTrap({ modules: 1 }), 9.4, 18, ALONG)

  // Pit (−X).
  add(createGarageBox({ count: 3, number: '11', legend: 'CHECO' }), -24, 0, ALONG)
  add(createPitWall({ bays: 3, labels: ['11', '22', '33'] }), -9.2, 0, ALONG)
  add(createNameboard(), -9.0, -6, ALONG)
  add(createPitGantry({ span: 5, height: 2.5 }), -12.5, 2)
  add(createLollipop(), -11.2, 4)
  add(createPitBoard(), -10.4, 5.2)
  add(createTyre(), -11.6, -2)
  add(createStack(), -12.8, -3.4)
  add(createTyreGun(), -10.8, -1.2)
  add(createGunRack(), -13.4, 6)
  add(createPitJack(), -10.6, 0.8)
  add(createCabinet(), -13.6, 8)
  add(createExtinguisher(), -10.2, 7.4)
  add(createReel(), -13.2, -6)

  // Spectator (+X).
  add(createCatchFence({ length: 12, height: 5 }), 7.2, 4, ALONG)
  add(createCrowdFence({ length: 8 }), 16, 6, ALONG)
  add(createGrandstandBay({ rows: 4, width: 5 }), 22, 8, Math.PI)
  add(createJumbotron(), 18, -6, Math.PI)
  add(createFloodlight({ height: 8 }), 20, 18)
  add(createPaHorn(), 15, 14)
  add(createCctvMast(), 14.5, -2)
  add(createMarshalPost({ number: '11', flag: 'yellow' }), 11, 24, Math.PI)
  add(createOranjeCan({ lit: true }), 13, 20)
  add(createLedRibbon({ length: 8 }), 17, -16, Math.PI)

  // Hairpin / runoff (+Z).
  add(createArmco({ bays: 4 }), 6.5, 28, ALONG)
  add(createJersey({ modules: 3 }), 7.0, 36, 0.35)
  add(createConcreteWall({ bays: 2 }), 14, 42, 1.2)
  add(createAccessGate({ fits: 'armco', width: 3 }), 6.5, 32, ALONG)
  add(createCrashCushion({ fits: 'armco' }), 6.5, 24, ALONG)
  add(createTecpro({ columns: 3, rows: 2 }), 10, 40, 0.6)
  add(createTyreBarrier({ columns: 4, rows: 3, depth: 1 }), 16, 40, 1.1)
  add(createChevronBoard(), 8, 34, 0.4)
  add(createBrakeMarker({ distance: 100 }), 8.4, 20, Math.PI)
  add(createMarkerPost(), 8.2, 12)
  add(createCircuitSign({ kind: 'DRS' }), 8.4, 2, Math.PI)
  add(createFiaLightPanel(), 8.6, -22, Math.PI)
  add(createCameraTower({ height: 8 }), 18, 28)
  add(createFoamMonitor(), 12, 30, 0.5)
  add(createCone(), 5.4, -12)
  add(createBollard(), -6.4, -20)

  // Spans and heroes.
  add(createSectorGantry({ span: 14, sector: 2 }), 0, 16)
  add(createSpectatorBridge({ span: 16 }), 0, 8)
  add(createStairs({ kind: 'overpass', span: 14 }), 0, -28)
  add(createRaceControl(), -32, 22, ALONG)
  add(createTimingPylon(), 14, -10)
  add(createFlagPole({ height: 6 }), 20, -24)
  add(createCameraPlatform(), 12, -8)
  add(createTunnelPortal(), 4, 44, Math.PI)

  // Paddock / ceremony (−Z).
  add(createServiceTruck({ kind: 'box', lamps: false, wheelRpm: 0 }), -28, -28, ALONG)
  add(createParcFerme(), -22, -36, ALONG)
  add(createWeighbridge(), -16, -32, ALONG)
  add(createMedicalPost(), -34, -18)
  add(createGeneratorCabin(), -34, -12)
  add(createPodium(), -22, -48, Math.PI)
  add(createTrophyTable(), -22, -51)
  add(createTrophyCup(), -22, -50.6, 0, 0.75)
  add(createChampagne(), -21.2, -50.6, 0, 0.75)
  add(createIceBucket(), -22.8, -50.6, 0, 0.75)
  add(createInterviewBackdrop(), -16, -48, Math.PI)
  add(createCooldownBoard(), -18, -46, Math.PI)
  add(createSectorBoard({ sector: 1 }), 10, -26, Math.PI)

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

export function createPreview({ aspect, time }: { aspect: number; time?: number }) {
  const kit = createScene()
  const scene = new Scene()
  scene.name = 'f1-kit / circuit scene'
  scene.background = new Color(0x000000)
  scene.add(kit.root)

  scene.add(new HemisphereLight(0x91a4b0, 0x080b0f, 0.48))
  const key = new DirectionalLight(0xffeee0, 2.1)
  key.position.set(-40, 55, 30)
  scene.add(key)
  const fill = new DirectionalLight(0x83a8be, 0.5)
  fill.position.set(45, 18, 20)
  scene.add(fill)

  const camera = new PerspectiveCamera(38, aspect > 0 ? aspect : 1, 0.5, 280)
  camera.name = 'f1-kit / scene camera'
  camera.position.set(42, 32, -48)
  const focus = new Vector3(0, 1.2, 4)
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
