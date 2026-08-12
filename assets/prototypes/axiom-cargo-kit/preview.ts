import {
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
} from 'three/webgpu'

import type { Vec3 } from '../../../src/asset-forge/generator/index.ts'

/**
 * The pack's single deterministic capture rig.
 *
 * Fifty props photographed under fifty light rigs cannot be judged against each
 * other, and a contact sheet made from them looks like a marketplace rather than
 * a catalogue. This is the reference sheets' lighting expressed once: a
 * neutral-cool key from upper left, a cool bounce from the right, a rim from
 * behind, and a black ground.
 *
 * Only the framing arguments are meant to vary per prop. Changing the lights is
 * a pack-wide decision, not a per-model fix for a model that is too dark.
 */
export interface CargoPreviewOptions {
  readonly aspect?: number
  /** Point the camera looks at, in model space. */
  readonly target?: Vec3
  /** Camera distance from the target, in metres. */
  readonly distance?: number
  /** Turntable angle in radians. 0 faces the model's +Z. */
  readonly yaw?: number
  /** Elevation in radians above the horizon. */
  readonly pitch?: number
  readonly fov?: number
}

export interface CargoPreviewModel {
  readonly root: Group
  update?(deltaSeconds: number): void
  dispose(): void
}

export interface CargoPreview {
  readonly scene: Scene
  readonly root: Group
  readonly camera: PerspectiveCamera
  update(deltaSeconds: number): void
  dispose(): void
}

/** Default three-quarter product-reference framing, matching the brief sheets. */
export const DEFAULT_YAW = -0.72
export const DEFAULT_PITCH = 0.3

export function createCargoPreview(model: CargoPreviewModel, options: CargoPreviewOptions = {}): CargoPreview {
  const scene = new Scene()
  scene.name = 'axiom-cargo-kit / reference preview'
  scene.background = new Color(0x000000)
  scene.add(model.root)

  scene.add(new HemisphereLight(0x9fb3c2, 0x05070a, 0.5))
  const key = new DirectionalLight(0xfff1de, 2.5)
  key.position.set(-6, 8, 7)
  scene.add(key)
  const fill = new DirectionalLight(0x8fb4d2, 0.72)
  fill.position.set(7, 2.4, 5.5)
  scene.add(fill)
  const rim = new DirectionalLight(0xa9c6d6, 0.95)
  rim.position.set(4.5, 6, -7)
  scene.add(rim)

  const target = options.target ?? [0, 0, 0]
  const distance = options.distance ?? 3.4
  const yaw = options.yaw ?? DEFAULT_YAW
  const pitch = options.pitch ?? DEFAULT_PITCH
  const aspect = Number.isFinite(options.aspect) && (options.aspect ?? 0) > 0 ? options.aspect! : 1

  const camera = new PerspectiveCamera(options.fov ?? 30, aspect, 0.05, 200)
  camera.name = 'axiom-cargo-kit / reference camera'
  camera.position.set(
    target[0] + Math.sin(yaw) * Math.cos(pitch) * distance,
    target[1] + Math.sin(pitch) * distance,
    target[2] + Math.cos(yaw) * Math.cos(pitch) * distance,
  )
  camera.lookAt(target[0], target[1], target[2])
  camera.updateProjectionMatrix()
  scene.add(camera)

  return {
    scene,
    root: model.root,
    camera,
    update: (deltaSeconds: number) => model.update?.(deltaSeconds),
    dispose: () => {
      scene.remove(model.root)
      model.dispose()
    },
  }
}
