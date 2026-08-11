import {
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  type Vector3Tuple,
} from 'three/webgpu'

import { createModel as createCorner } from '../exterior-wall-corner/model.ts'
import { createModel as createDoor } from '../door-bay/model.ts'
import { createModel as createWindow } from '../window-bay/model.ts'
import { createModel as createCap } from '../wall-end-cap/model.ts'
import { createModel as createFloor } from '../floor-slab-tile/model.ts'
import { createModel as createFoundation } from '../foundation-interface/model.ts'
import { createModel as createPosts } from '../gate-post-pair/model.ts'
import { createModel as createLintel } from '../gate-lintel/model.ts'
import { createModel as createGateReturn } from '../gate-wall-return/model.ts'
import { snapKitAsset } from './contract.ts'

interface Controller {
  root: Group
  update(deltaSeconds: number): void
  dispose(): void
}

interface AssemblyPreview {
  scene: Scene
  root: Group
  camera: PerspectiveCamera
  update(deltaSeconds: number): void
  dispose(): void
}

function preview(
  options: { aspect: number },
  name: string,
  controllers: Controller[],
  cameraPosition: Vector3Tuple,
  target: Vector3Tuple,
  fov = 32,
): AssemblyPreview {
  const root = new Group()
  root.name = name
  for (const controller of controllers) root.add(controller.root)
  const scene = new Scene()
  scene.name = `${name} / compatibility preview`
  scene.background = new Color(0x000000)
  scene.add(root, new HemisphereLight(0x91a7b3, 0x05070a, 0.38))
  const key = new DirectionalLight(0xffedda, 2.5)
  key.position.set(8, 11, 12)
  const fill = new DirectionalLight(0x668ba8, 0.68)
  fill.position.set(-8, 5, 7)
  const rim = new DirectionalLight(0x9bb9cb, 0.95)
  rim.position.set(-7, 8, -10)
  scene.add(key, fill, rim)
  const aspect = Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 1
  const camera = new PerspectiveCamera(fov, aspect, 0.04, 100)
  camera.position.set(...cameraPosition)
  camera.lookAt(...target)
  scene.add(camera)
  return {
    scene,
    root,
    camera,
    update(deltaSeconds) { for (const controller of controllers) controller.update(deltaSeconds) },
    dispose() {
      scene.remove(root)
      for (const controller of controllers) controller.dispose()
    },
  }
}

export function createWallCompatibilityPreview(options: { aspect: number }): AssemblyPreview {
  return wallCompatibilityPreview(options, [9.5, 5.7, 8.8], [3.1, 1.45, -0.9], 34)
}

export function createWallFrontPreview(options: { aspect: number }): AssemblyPreview {
  return wallCompatibilityPreview(options, [3, 3.2, 10.5], [3, 1.45, -0.45], 31)
}

export function createWallRearPreview(options: { aspect: number }): AssemblyPreview {
  return wallCompatibilityPreview(options, [3, 3.1, -11], [3, 1.45, -0.55], 31)
}

export function createWallLowPreview(options: { aspect: number }): AssemblyPreview {
  return wallCompatibilityPreview(options, [8.7, 0.55, 7.7], [3, 0.85, -0.7], 34)
}

function wallCompatibilityPreview(
  options: { aspect: number },
  cameraPosition: Vector3Tuple,
  target: Vector3Tuple,
  fov: number,
): AssemblyPreview {
  const corner = createCorner()
  const door = createDoor()
  const window = createWindow()
  const cap = createCap()
  const floorA = createFloor()
  const floorB = createFloor()
  const floorC = createFloor()
  snapKitAsset(door.root, 'wall_snap_left', corner.root, 'wall-east')
  snapKitAsset(window.root, 'wall_snap_left', door.root, 'wall_snap_right')
  snapKitAsset(cap.root, 'wall-west', window.root, 'wall_snap_right')
  snapKitAsset(floorB.root, 'floor_snap_w', floorA.root, 'floor_snap_e')
  snapKitAsset(floorC.root, 'floor_snap_w', floorB.root, 'floor_snap_e')
  return preview(
    options,
    'axiom wall compatibility',
    [corner, door, window, cap, floorA, floorB, floorC],
    cameraPosition,
    target,
    fov,
  )
}

export function createGateCompatibilityPreview(options: { aspect: number }): AssemblyPreview {
  return gateCompatibilityPreview(options, [12, 6.4, 11.5], [3, 1.8, -0.5], 32)
}

export function createGateRearPreview(options: { aspect: number }): AssemblyPreview {
  return gateCompatibilityPreview(options, [3, 4.2, -13], [3, 1.8, -0.7], 31)
}

export function createGateLowPreview(options: { aspect: number }): AssemblyPreview {
  return gateCompatibilityPreview(options, [10.5, 0.7, 10], [3, 1.25, -0.6], 33)
}

function gateCompatibilityPreview(
  options: { aspect: number },
  cameraPosition: Vector3Tuple,
  target: Vector3Tuple,
  fov: number,
): AssemblyPreview {
  const posts = createPosts()
  const lintel = createLintel()
  const leftReturn = createGateReturn()
  const rightReturn = createGateReturn()
  snapKitAsset(lintel.root, 'post-left-seat', posts.root, 'lintel-left')
  snapKitAsset(leftReturn.root, 'gate-post', posts.root, 'return-left')
  snapKitAsset(rightReturn.root, 'gate-post', posts.root, 'return-right')
  return preview(
    options,
    'axiom gate compatibility',
    [posts, lintel, leftReturn, rightReturn],
    cameraPosition,
    target,
    fov,
  )
}

export function createSlabCompatibilityPreview(options: { aspect: number }): AssemblyPreview {
  return slabCompatibilityPreview(options, [6.6, 3.0, 6.3], [2, 0.35, -1], 34)
}

export function createSlabLowPreview(options: { aspect: number }): AssemblyPreview {
  return slabCompatibilityPreview(options, [5.8, 0.22, 5.5], [2, 0.22, -1], 34)
}

function slabCompatibilityPreview(
  options: { aspect: number },
  cameraPosition: Vector3Tuple,
  target: Vector3Tuple,
  fov: number,
): AssemblyPreview {
  const foundationA = createFoundation()
  const foundationB = createFoundation()
  const floorA = createFloor()
  const floorB = createFloor()
  snapKitAsset(foundationB.root, 'foundation_snap_w', foundationA.root, 'foundation_snap_e')
  snapKitAsset(floorA.root, 'foundation_mount_center', foundationA.root, 'floor_mount_center')
  snapKitAsset(floorB.root, 'foundation_mount_center', foundationB.root, 'floor_mount_center')
  return preview(
    options,
    'axiom slab compatibility',
    [foundationA, foundationB, floorA, floorB],
    cameraPosition,
    target,
    fov,
  )
}
