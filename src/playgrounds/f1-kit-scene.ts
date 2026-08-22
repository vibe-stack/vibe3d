import {
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
} from 'three/webgpu'

import { disposeObjectTree } from '../core/dispose.ts'
import type { Playground, PlaygroundOptions } from '../core/types.ts'
import { createScene } from '../../assets/f1-prototypes/f1-kit-scene/kit-scene.ts'

export function createF1KitPlayground(options: PlaygroundOptions): Playground {
  const scene = new Scene()
  scene.name = 'PLAYGROUND / F1 KIT SCENE'
  scene.background = new Color(0x04070b)
  scene.fog = new Fog(0x04070b, 140, 280)

  const camera = new PerspectiveCamera(34, options.aspect, 0.4, 420)
  camera.name = 'CAMERA / F1 STRAIGHT'
  camera.position.set(15, 14, -36)

  const focus = new Vector3(2, 1.2, 12)
  camera.lookAt(focus)

  const world = new Group()
  world.name = 'WORLD'
  scene.add(world)

  const floor = new Mesh(
    new PlaneGeometry(120, 250),
    new MeshStandardMaterial({
      color: 0x071018,
      roughness: 0.94,
      metalness: 0,
    }),
  )
  floor.name = 'STAGE / FLOOR'
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.04
  floor.receiveShadow = true
  world.add(floor)

  const kit = createScene()
  kit.update(0.38)
  world.add(kit.root)

  const sky = new HemisphereLight(0x91a4b0, 0x080b0f, 0.5)
  sky.name = 'LIGHT / SKY'
  scene.add(sky)

  const key = new DirectionalLight(0xffeee0, 2.2)
  key.name = 'LIGHT / KEY'
  key.position.set(-36, 58, 28)
  key.castShadow = true
  scene.add(key)

  const fill = new DirectionalLight(0x83a8be, 0.52)
  fill.name = 'LIGHT / FILL'
  fill.position.set(40, 16, 22)
  scene.add(fill)

  let last = 0
  return {
    id: 'f1-kit-scene',
    label: 'F1 KIT // PIT STRAIGHT',
    scene,
    camera,
    focus,
    update(elapsedSeconds) {
      const dt = last === 0 ? 0 : Math.max(0, elapsedSeconds - last)
      last = elapsedSeconds
      kit.update(dt > 0.25 ? 1 / 60 : dt)
    },
    resize(aspect) {
      camera.aspect = aspect
      camera.updateProjectionMatrix()
    },
    dispose() {
      kit.dispose()
      disposeObjectTree(scene)
      scene.clear()
    },
  }
}
