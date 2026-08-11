import {
  BoxGeometry,
  CircleGeometry,
  Color,
  DirectionalLight,
  Fog,
  GridHelper,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  RingGeometry,
  Scene,
  Vector3,
} from 'three/webgpu'
import type { Material } from 'three/webgpu'
import { disposeObjectTree } from '../core/dispose.ts'
import type { Playground, PlaygroundOptions } from '../core/types.ts'
import { createAxiomRelay } from '../props/axiom-relay.ts'

function makeBackdropPylon(angle: number, radius: number): Group {
  const pylon = new Group()
  pylon.name = 'STAGE / PYLON'
  pylon.position.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius)
  pylon.rotation.y = angle

  const frameMaterial = new MeshStandardMaterial({
    color: 0x1a2a38,
    metalness: 0.78,
    roughness: 0.36,
  })
  const lightMaterial = new MeshStandardMaterial({
    color: 0x21d9ff,
    emissive: 0x00a9d6,
    emissiveIntensity: 2.8,
    roughness: 0.22,
  })

  const frame = new Mesh(new BoxGeometry(0.24, 4.5, 0.24), frameMaterial)
  frame.position.y = 2.25
  frame.castShadow = true
  frame.receiveShadow = true
  pylon.add(frame)

  const light = new Mesh(new BoxGeometry(0.035, 3.1, 0.03), lightMaterial)
  light.position.set(0, 2.35, 0.137)
  pylon.add(light)

  const cap = new Mesh(new BoxGeometry(0.68, 0.18, 0.54), frameMaterial)
  cap.position.y = 4.52
  cap.castShadow = true
  pylon.add(cap)

  return pylon
}

export function createRelayShowcase(options: PlaygroundOptions): Playground {
  const scene = new Scene()
  scene.name = 'PLAYGROUND / RELAY SHOWCASE'
  scene.background = new Color(0x040912)
  scene.fog = new Fog(0x040912, 16, 35)

  const camera = new PerspectiveCamera(38, options.aspect, 0.1, 80)
  camera.name = 'CAMERA / HERO'
  camera.position.set(8.6, 5.4, 10.8)

  const focus = new Vector3(0, 2.05, 0)
  camera.lookAt(focus)

  const world = new Group()
  world.name = 'WORLD'
  scene.add(world)

  const floor = new Mesh(
    new PlaneGeometry(40, 40),
    new MeshStandardMaterial({
      color: 0x07111b,
      metalness: 0.38,
      roughness: 0.72,
    }),
  )
  floor.name = 'STAGE / FLOOR'
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  world.add(floor)

  const platform = new Mesh(
    new CircleGeometry(5.2, 72),
    new MeshStandardMaterial({
      color: 0x0c1824,
      metalness: 0.62,
      roughness: 0.48,
    }),
  )
  platform.name = 'STAGE / PLATFORM'
  platform.position.y = 0.012
  platform.rotation.x = -Math.PI / 2
  platform.receiveShadow = true
  world.add(platform)

  const grid = new GridHelper(26, 26, 0x249ac0, 0x14293b)
  grid.name = 'STAGE / GRID'
  grid.position.y = 0.025
  const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material]
  for (const material of gridMaterials as Material[]) {
    material.transparent = true
    material.opacity = 0.38
  }
  world.add(grid)

  const ringMaterial = new MeshBasicMaterial({
    color: 0x16c9f3,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  })
  for (const [inner, outer] of [
    [3.12, 3.16],
    [4.7, 4.74],
  ] as const) {
    const ring = new Mesh(new RingGeometry(inner, outer, 96), ringMaterial)
    ring.name = 'STAGE / GUIDE RING'
    ring.position.y = 0.035
    ring.rotation.x = -Math.PI / 2
    world.add(ring)
  }

  for (const angle of [Math.PI - 0.72, Math.PI + 0.72]) {
    world.add(makeBackdropPylon(angle, 7.8))
  }

  const relay = createAxiomRelay()
  world.add(relay.root)

  const skyLight = new HemisphereLight(0xbcd9ff, 0x10141d, 1.7)
  skyLight.name = 'LIGHT / SKY'
  scene.add(skyLight)

  const keyLight = new DirectionalLight(0xe7f5ff, 4.2)
  keyLight.name = 'LIGHT / KEY'
  keyLight.position.set(6, 9, 5)
  keyLight.castShadow = true
  keyLight.shadow.mapSize.set(2048, 2048)
  keyLight.shadow.camera.near = 0.5
  keyLight.shadow.camera.far = 28
  keyLight.shadow.camera.left = -6
  keyLight.shadow.camera.right = 6
  keyLight.shadow.camera.top = 7
  keyLight.shadow.camera.bottom = -4
  keyLight.shadow.bias = -0.0004
  scene.add(keyLight)

  const cyanFill = new PointLight(0x19d9ff, 32, 14, 2)
  cyanFill.name = 'LIGHT / CYAN FILL'
  cyanFill.position.set(-4.5, 2.4, 3.2)
  scene.add(cyanFill)

  const magentaRim = new PointLight(0xff3ab7, 25, 13, 2)
  magentaRim.name = 'LIGHT / MAGENTA RIM'
  magentaRim.position.set(4.2, 3.4, -4.5)
  scene.add(magentaRim)

  return {
    id: 'relay-showcase',
    label: 'AXIOM RELAY // 07',
    scene,
    camera,
    focus,
    update(elapsedSeconds) {
      relay.update(elapsedSeconds)
      cyanFill.position.x = -4.2 + Math.sin(elapsedSeconds * 0.22) * 0.45
      magentaRim.position.z = -4.2 + Math.cos(elapsedSeconds * 0.18) * 0.4
    },
    resize(aspect) {
      camera.aspect = aspect
      camera.updateProjectionMatrix()
    },
    dispose() {
      disposeObjectTree(scene)
      scene.clear()
    },
  }
}
