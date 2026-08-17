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
} from 'three/webgpu'

import type { Vec3 } from './parts.ts'

/**
 * The kit's single deterministic capture rig.
 *
 * Eleven props photographed under eleven light rigs cannot be judged against each other, and a contact
 * sheet made from them looks like a marketplace rather than a catalogue. Every prop here previously
 * hand-wrote its own hemisphere and key, and they had drifted.
 *
 * The numbers are the cargo wave's, not new ones. Photographing two waves under different fill is enough
 * on its own to make them look like different packs, so this wave adopts the existing rig rather than the
 * other way round. Only the framing arguments are meant to vary per prop — changing the lights is a
 * kit-wide decision, not a per-model fix for a model that is too dark.
 */
export interface F1PreviewOptions {
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
  /** Dark receive card for preview framing (optional emissive lamp read). */
  readonly ground?: boolean
}

export interface F1PreviewModel {
  readonly root: Group
  update?(deltaSeconds: number): void
  dispose(): void
}

export interface F1Preview {
  readonly scene: Scene
  readonly root: Group
  readonly camera: PerspectiveCamera
  update(deltaSeconds: number): void
  dispose(): void
}

/** Default three-quarter product-reference framing, matching the kit's reference sheets. */
export const DEFAULT_YAW = -0.72
export const DEFAULT_PITCH = 0.3

export function createF1Preview(model: F1PreviewModel, options: F1PreviewOptions = {}): F1Preview {
  const scene = new Scene()
  scene.name = 'f1-kit / reference preview'
  scene.background = new Color(0x000000)
  scene.add(model.root)

  scene.add(new HemisphereLight(0x91a4b0, 0x080b0f, 0.42))
  const key = new DirectionalLight(0xffeee0, 2.3)
  key.position.set(-6, 8, 7)
  scene.add(key)
  const fill = new DirectionalLight(0x83a8be, 0.58)
  fill.position.set(7, 2.4, 5.5)
  scene.add(fill)
  const rim = new DirectionalLight(0xa8bdca, 0.7)
  rim.position.set(4.5, 6, -7)
  scene.add(rim)

  const extras: Array<{ dispose: () => void }> = []
  if (options.ground) {
    const groundGeo = new PlaneGeometry(28, 28)
    groundGeo.rotateX(-Math.PI / 2)
    const groundMat = new MeshStandardMaterial({
      name: 'f1-kit / preview ground',
      color: 0x080a0c,
      roughness: 0.96,
      metalness: 0,
    })
    const ground = new Mesh(groundGeo, groundMat)
    ground.name = 'f1-kit / preview ground'
    ground.receiveShadow = true
    scene.add(ground)
    extras.push({
      dispose: () => {
        scene.remove(ground)
        groundGeo.dispose()
        groundMat.dispose()
      },
    })
  }

  const target = options.target ?? [0, 0, 0]
  const distance = options.distance ?? 3.4
  const yaw = options.yaw ?? DEFAULT_YAW
  const pitch = options.pitch ?? DEFAULT_PITCH
  const aspect = Number.isFinite(options.aspect) && (options.aspect ?? 0) > 0 ? options.aspect! : 1

  const camera = new PerspectiveCamera(options.fov ?? 30, aspect, 0.05, 200)
  camera.name = 'f1-kit / reference camera'
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
      for (const extra of extras) extra.dispose()
      scene.remove(model.root)
      model.dispose()
    },
  }
}
