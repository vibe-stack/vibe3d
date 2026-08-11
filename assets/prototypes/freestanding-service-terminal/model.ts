import {
  CatmullRomCurve3,
  Color,
  DataTexture,
  DirectionalLight,
  Group,
  HemisphereLight,
  LinearFilter,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  TubeGeometry,
  UnsignedByteType,
  Vector3,
} from 'three/webgpu'

import {
  MaterialLibrary,
  WEAR_ATTRIBUTES,
  bakeOcclusion,
  bakeSurfaceAttributes,
  createWearMaterial,
  cylinder,
  extrudeProfile,
  groove,
  mergeStaticByMaterial,
  mirrorProfile,
  octagon,
  offsetProfile,
  prism,
  stepEdge,
  tuneMaterial,
  type MaterialHandle,
  type Vec2,
  type Vec3,
  type WearProfile,
} from '../../../src/asset-forge/generator/index.ts'

/**
 * Reconstructed from docs/assets/reusable/industrial/freestanding-terminal.png.
 *
 * The reference is three masses: a thin dark plinth, an angular tapered wedge,
 * and a portrait octagonal head whose face is almost entirely display. There is
 * no corner armour anywhere on it - the bezel is one clean octagonal frame.
 */

/**
 * Every edge comes from one of four break sizes, and the sizes are world
 * constants rather than per-call literals: one shop, one press brake, one set of
 * tooling. Scaling each part's chamfer to its own bounds destroys the cue that
 * tells the eye these pieces were made of the same stock by the same machine.
 */
const BREAK = 0.03
const TRIM = 0.10
const PANEL = 0.18
const HERO = 0.30

interface TerminalMaterials {
  shell: MeshPhysicalMaterial
  shellShade: MeshPhysicalMaterial
  graphite: MeshPhysicalMaterial
  edge: MeshPhysicalMaterial
  ink: MeshPhysicalMaterial
  rubber: MeshPhysicalMaterial
  amber: MeshPhysicalMaterial
}

function slot(x: number, y: number, width: number, height: number): Vec2[] {
  const hw = width * 0.5
  const hh = height * 0.5
  return [[x - hw, y - hh], [x + hw, y - hh], [x + hw, y + hh], [x - hw, y + hh]]
}

/**
 * A lit strip lying in a channel that was actually cut, not painted on. `groove`
 * runs its channel along Y, so a horizontal bar is rolled a quarter turn; the
 * lamp then nearly fills the channel and sits flush with the rim, because sunk
 * deeper it is only ever seen edge-on and stops reading as a light.
 */
function litChannel(
  parent: Group,
  m: TerminalMaterials,
  length: number,
  position: Vec3,
  width = 0.2,
): void {
  parent.add(groove(m.ink, length, width, 0.08, position, [0, 0, Math.PI * 0.5]))
  parent.add(prism(m.amber, [length * 0.9, width * 0.55, 0.06], [
    position[0], position[1], position[2] - 0.02,
  ], { chamfer: 0.014, bevel: 0.005 }))
}

function bolt(parent: Group, m: TerminalMaterials, x: number, y: number, z: number): void {
  parent.add(cylinder(m.edge, 0.05, 0.04, [x, y, z], [Math.PI * 0.5, 0, 0], 8))
}

/** Portrait amber diagnostic UI: hex sigil, dense trace field, side bar column. */
function createDisplayTexture(): DataTexture {
  const width = 256
  const height = 340
  const data = new Uint8Array(width * height * 4)
  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const u = px / (width - 1)
      const v = py / (height - 1)
      const x = (u - 0.5) * 2
      const y = (v - 0.52) * 2
      const index = (py * width + px) * 4
      let energy = 0.035

      // Line-work on a dark amber field, not a lit panel: the reference reads as
      // a display because bright thin strokes sit on something nearly black, and
      // filling the interior flattens the whole head back into one value.
      if ((px % 12 === 0 || py % 12 === 0)) energy = 0.075
      const hex = Math.max(Math.abs(x) * 0.866 + Math.abs(y) * 0.5, Math.abs(y))
      for (const radius of [0.30, 0.38, 0.46, 0.60, 0.78, 0.92]) {
        if (Math.abs(hex - radius) < 0.010) energy = radius < 0.5 ? 0.9 : 0.5
      }
      // Sigil: hex outline with a solid triangle inside it.
      if (Math.abs(hex - 0.21) < 0.022) energy = 1
      if (hex < 0.19 && y > -0.10 && Math.abs(x) * 2.1 < 0.15 - y) energy = 1

      // Right-hand instrument column and a few broken segment runs.
      if (u > 0.86 && u < 0.93 && v > 0.14 && v < 0.84) energy = Math.floor(v * 30) % 2 === 0 ? 0.95 : 0.05
      if (u > 0.10 && u < 0.34 && Math.abs(v - 0.20) < 0.006) energy = 0.7
      if (u > 0.10 && u < 0.26 && Math.abs(v - 0.235) < 0.005) energy = 0.45
      if (u > 0.62 && u < 0.82 && Math.abs(v - 0.78) < 0.005) energy = 0.55
      // Header and footer glyph rows.
      if (v > 0.065 && v < 0.095 && u > 0.09 && u < 0.52) energy = Math.floor(u * 52) % 3 === 0 ? 0.85 : 0.04
      if (v > 0.905 && v < 0.94 && u > 0.09 && u < 0.86) energy = Math.floor(u * 68) % 3 === 0 ? 0.9 : 0.05
      // Border frame.
      const border = Math.min(u, 1 - u, v, 1 - v)
      if (border > 0.018 && border < 0.028) energy = 0.7

      data[index] = Math.round(255 * Math.min(1, energy * 1.1))
      data[index + 1] = Math.round(255 * Math.min(1, energy * 0.52))
      data[index + 2] = Math.round(255 * Math.min(1, energy * 0.06))
      data[index + 3] = 255
    }
  }
  const texture = new DataTexture(data, width, height, RGBAFormat, UnsignedByteType)
  texture.name = 'freestanding-service-terminal / analytic display'
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.needsUpdate = true
  return texture
}

/** One thin dark octagonal slab, chamfered on all three axes. */
function addPlinth(parent: Group, m: TerminalMaterials): void {
  parent.add(extrudeProfile(m.graphite, octagon(2.66, 1.66, 0.5), 0.4, [0, 0.2, 0], {
    fillet: TRIM, bevel: BREAK, capChamfer: PANEL, rotation: [-Math.PI * 0.5, 0, 0],
  }))
  parent.add(extrudeProfile(m.edge, octagon(2.42, 1.48, 0.44), 0.16, [0, 0.48, 0], {
    fillet: TRIM, bevel: BREAK, capChamfer: TRIM, rotation: [-Math.PI * 0.5, 0, 0],
  }))
}

/**
 * The pedestal: one extruded silhouette, tapering hard from the plinth to the
 * neck, with the service bay cut clean through it as a trapezoid that narrows
 * downward exactly as the reference does.
 */
function addBase(parent: Group, m: TerminalMaterials): void {
  const outline = mirrorProfile([
    [0, 0.56],
    [2.38, 0.56],
    [2.28, 1.12],
    [1.44, 4.86],
    [1.36, 5.24],
    [0, 5.24],
  ])
  const bay: Vec2[] = [[0.64, 1.18], [1.02, 4.62], [-1.02, 4.62], [-0.64, 1.18]]

  parent.add(extrudeProfile(m.shell, outline, 2.5, [0, 0, 0], {
    fillet: HERO,
    bevel: BREAK,
    capChamfer: [HERO, PANEL],
    holes: [bay],
    arcSegments: 2,
  }))

  // Graphite funnel lining the cut. Bare shell walls are the same white as the
  // face they are cut into, so the opening flattens out no matter how much real
  // depth sits behind it.
  const linerOuter: Vec2[] = [[0.60, 1.22], [0.98, 4.58], [-0.98, 4.58], [-0.60, 1.22]]
  const linerBore: Vec2[] = [[0.40, 1.42], [0.74, 4.38], [-0.74, 4.38], [-0.40, 1.42]]
  parent.add(extrudeProfile(m.graphite, linerOuter, 1.5, [0, 0, 0.42], {
    fillet: TRIM, bevel: BREAK, capChamfer: BREAK * 2, holes: [linerBore],
  }))
  parent.add(prism(m.rubber, [1.9, 3.6, 0.3], [0, 2.9, -0.42], {
    chamfer: PANEL, capChamfer: BREAK * 2, bevel: BREAK,
  }))

  // Front intake at the foot, lit from behind - the brightest thing below the
  // head in the reference.
  parent.add(prism(m.amber, [1.5, 0.28, 0.05], [0, 0.86, 1.16], { chamfer: 0.02, bevel: 0.006 }))
  parent.add(extrudeProfile(m.graphite, octagon(0.86, 0.24, 0.08), 0.14, [0, 0.86, 1.24], {
    fillet: 0.05,
    bevel: BREAK,
    capChamfer: BREAK,
    holes: [0, 1, 2, 3, 4, 5, 6, 7, 8].map((index) => slot(-0.64 + index * 0.16, 0, 0.07, 0.32)),
  }))
  for (const x of [-1.5, 1.5]) {
    parent.add(prism(m.ink, [0.4, 0.16, 0.05], [x, 0.86, 1.2], { chamfer: 0.03, bevel: 0.006 }))
    parent.add(prism(m.amber, [0.26, 0.07, 0.03], [x, 0.86, 1.23], { chamfer: 0.012, bevel: 0.005 }))
  }

  // Left flank access hatch with its edge marker, and scattered fasteners.
  parent.add(extrudeProfile(m.shellShade, octagon(0.46, 0.92, 0.16), 0.12, [-1.62, 2.2, 1.2], {
    fillet: 0.09, bevel: BREAK, capChamfer: TRIM,
  }))
  parent.add(prism(m.amber, [0.06, 0.3, 0.03], [-1.2, 2.2, 1.22], { chamfer: 0.012, bevel: 0.005 }))
  parent.add(groove(m.shell, 2.6, 0.07, 0.045, [1.62, 2.6, 1.22]))
  for (const [x, y] of [[-1.62, 3.3], [1.62, 3.3], [-1.9, 1.3], [1.9, 1.3]] as const) {
    bolt(parent, m, x, y, 1.2)
  }
}

/** Handheld scanner parked in the bay on one continuous coiled cable. */
function addBayInternals(parent: Group, m: TerminalMaterials): void {
  const body = mirrorProfile([
    [0, 2.24],
    [0.3, 2.32],
    [0.34, 3.9],
    [0.26, 4.12],
    [0, 4.12],
  ])
  parent.add(extrudeProfile(m.graphite, body, 0.46, [0, 0, 0.3], {
    fillet: TRIM, bevel: BREAK, capChamfer: TRIM,
  }))
  parent.add(prism(m.edge, [0.5, 0.16, 0.3], [0, 4.02, 0.32], {
    chamfer: 0.05, capChamfer: 0.05, bevel: BREAK,
  }))
  parent.add(prism(m.amber, [0.12, 0.1, 0.03], [0, 2.46, 0.54], { chamfer: 0.02, bevel: 0.005 }))
  parent.add(cylinder(m.rubber, 0.11, 0.16, [0, 2.24, 0.3], [0, 0, 0], 10))

  const cablePath = new CatmullRomCurve3([
    new Vector3(0, 2.24, 0.3),
    new Vector3(0.16, 2.02, 0.26),
    new Vector3(-0.14, 1.86, 0.18),
    new Vector3(0.16, 1.7, 0.1),
    new Vector3(-0.1, 1.56, 0.02),
    new Vector3(0, 1.42, -0.08),
  ])
  const cable = new Mesh(new TubeGeometry(cablePath, 36, 0.075, 8, false), m.rubber)
  cable.name = 'freestanding-service-terminal / continuous service cable'
  parent.add(cable)
}

/**
 * Portrait octagonal head: a white shell ring, a graphite bezel recessed into
 * it, and the display filling almost the whole of that. Three tonal steps front
 * to back - white, graphite, lit amber - and nothing bolted to the corners.
 */
function addHead(parent: Group, m: TerminalMaterials): {
  screen: Mesh
  texture: DataTexture
  material: MeshPhysicalMaterial
} {
  const head = new Group()
  head.name = 'freestanding-service-terminal / head'
  head.position.set(0, 7.4, 0.34)
  head.rotation.x = -0.11
  parent.add(head)

  // One outline, authored once, with a step across the top of it. Everything
  // that has to fit around it is derived from it rather than retyped: the
  // shell's opening is that outline plus a hairline of clearance, and the white
  // lip is the same outline pushed out a constant three tenths. Move the step or
  // change the octagon and all three follow, which is the only way a fit like
  // this survives being edited.
  const bezelOutline = stepEdge(octagon(1.72, 2.08, 0.46), 'top', 0.58, 0.18)
  const shellOpening = offsetProfile(bezelOutline, 0.02)
  const headOutline = offsetProfile(bezelOutline, 0.3)

  // The white lip is only three tenths wide. Chamfering both its outer edge and
  // the opening at panel scale would leave a knife edge between them, so the
  // opening stays crisp and the chunky read comes from the corner clips - which
  // is what the reference does.
  head.add(extrudeProfile(m.shell, headOutline, 1.5, [0, 0, 0], {
    fillet: PANEL,
    bevel: BREAK,
    capChamfer: [0.07, 0.05],
    holes: [shellOpening],
    arcSegments: 2,
  }))

  head.add(extrudeProfile(m.ink, bezelOutline, 0.6, [0, 0, 0.33], {
    fillet: TRIM,
    bevel: BREAK,
    capChamfer: TRIM,
    holes: [octagon(1.18, 1.58, 0.34)],
    arcSegments: 2,
  }))
  head.add(prism(m.ink, [2.7, 3.4, 0.24], [0, 0, 0.06], {
    chamfer: PANEL, capChamfer: BREAK * 2, bevel: BREAK,
  }))

  litChannel(head, m, 2.2, [0, 1.83, 0.635], 0.2)
  litChannel(head, m, 2.2, [0, -1.83, 0.635], 0.2)

  // Left flank: vent grille above a small hatch with its state marker.
  const vent = extrudeProfile(m.graphite, octagon(0.42, 0.66, 0.1), 0.14, [0, 0, 0], {
    fillet: 0.06,
    bevel: BREAK,
    capChamfer: BREAK,
    holes: [0, 1, 2, 3, 4, 5, 6].map((index) => slot(0, 0.48 - index * 0.16, 0.62, 0.07)),
    rotation: [0, -Math.PI * 0.5, 0],
  })
  vent.position.set(-2.03, 1.1, 0.05)
  head.add(vent)

  const hatch = extrudeProfile(m.shellShade, octagon(0.34, 0.6, 0.12), 0.1, [0, 0, 0], {
    fillet: 0.07, bevel: BREAK, capChamfer: 0.05, rotation: [0, -Math.PI * 0.5, 0],
  })
  hatch.position.set(-2.05, -0.5, 0.05)
  head.add(hatch)
  const marker = prism(m.amber, [0.03, 0.16, 0.06], [-2.1, -0.98, 0.05], { chamfer: 0.01, bevel: 0.004 })
  head.add(marker)

  for (const [y, z] of [[2.16, 0.55], [-2.16, 0.55]] as const) {
    bolt(head, m, -1.86, y, z)
    bolt(head, m, 1.86, y, z)
  }

  const texture = createDisplayTexture()
  const screenMaterial = new MeshPhysicalMaterial({
    name: 'freestanding-service-terminal / single analytic screen',
    color: 0x0a0400,
    emissive: new Color(0xff9418),
    emissiveIntensity: 1.5,
    emissiveMap: texture,
    map: texture,
    metalness: 0.08,
    roughness: 0.24,
    clearcoat: 0.5,
    clearcoatRoughness: 0.2,
  })
  const screen = new Mesh(new PlaneGeometry(2.34, 3.14, 1, 1), screenMaterial)
  screen.name = 'freestanding-service-terminal / single recessed display plane'
  screen.position.set(0, 0, 0.3)
  head.add(screen)
  return { screen, texture, material: screenMaterial }
}

function acquireMaterials(): { materials: TerminalMaterials; handles: MaterialHandle[] } {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-100', condition: 'maintained', seed: 10301 })
  const shellShade = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-350', condition: 'maintained', seed: 10302 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'maintained', seed: 10303 })
  const edge = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-650', condition: 'maintained', seed: 10304 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'maintained', seed: 10305 })
  const rubber = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-900', condition: 'maintained', seed: 10306 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-500', condition: 'active', seed: 10307 })
  return {
    handles: [shell, shellShade, graphite, edge, ink, rubber, amber],
    materials: {
      shell: tuneMaterial(shell, 0xc6cac9, 0.44, 0.14, { clearcoat: 0.16 }),
      shellShade: tuneMaterial(shellShade, 0xa8aeb0, 0.5, 0.2, { clearcoat: 0.12 }),
      graphite: tuneMaterial(graphite, 0x191d21, 0.54, 0.3, { clearcoat: 0.08 }),
      edge: tuneMaterial(edge, 0x353b41, 0.46, 0.46, { clearcoat: 0.12 }),
      ink: tuneMaterial(ink, 0x0d1114, 0.62, 0.24),
      rubber: tuneMaterial(rubber, 0x14181c, 0.8, 0.08),
      amber: tuneMaterial(amber, 0xffa428, 0.24, 0.04, { emissive: 2.3 }),
    },
  }
}

export function createModel(): {
  root: Group
  update: (deltaSeconds: number) => void
  dispose: () => void
} {
  const { materials, handles } = acquireMaterials()
  const root = new Group()
  root.name = 'freestanding-service-terminal'

  addPlinth(root, materials)
  addBase(root, materials)
  addBayInternals(root, materials)
  const head = addHead(root, materials)
  // Preserve the display as the one unbatched plane. Attach once to bake its
  // angled-head transform into root space, then detach during static baking.
  root.attach(head.screen)
  root.remove(head.screen)

  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [materials.shell, { rub: 0.4, grime: 0.42, scratch: 0.05 }],
    [materials.shellShade, { rub: 0.36, grime: 0.46, scratch: 0.045 }],
    [materials.graphite, { rub: 0.14, grime: 0.42, scratch: 0.035 }],
    [materials.edge, { rub: 0.22, grime: 0.38, scratch: 0.04 }],
    [materials.ink, { rub: 0.1, grime: 0.46, scratch: 0.022 }],
  ])
  bakeOcclusion(root, { reach: 0.32 })
  bakeSurfaceAttributes(root, profiles)
  const wearMaterial = createWearMaterial({
    name: 'freestanding-service-terminal / baked production wear',
    clearcoat: 0.14,
    clearcoatRoughness: 0.48,
  })
  root.traverse((object) => {
    if (!(object instanceof Mesh) || Array.isArray(object.material)) return
    if (profiles.has(object.material as MeshPhysicalMaterial)) object.material = wearMaterial
  })
  const staticGeometries = mergeStaticByMaterial(root, {
    retainedAttributes: (material) => material === wearMaterial ? WEAR_ATTRIBUTES : [],
    meshName: (material) => `freestanding-service-terminal / ${material.name}`,
  })
  root.add(head.screen)

  return {
    root,
    update: (deltaSeconds: number) => {
      const delta = Math.min(Math.max(deltaSeconds, 0), 0.05)
      const phase = ((head.screen.userData.phase as number | undefined) ?? 0) + delta
      head.screen.userData.phase = phase
      head.material.emissiveIntensity = 1.42 + Math.sin(phase * 1.4) * 0.12
    },
    dispose: () => {
      for (const geometry of staticGeometries) geometry.dispose()
      head.screen.geometry.dispose()
      head.material.dispose()
      head.texture.dispose()
      for (const handle of handles) handle.release()
    },
  }
}

export function createPreview(options: { aspect: number; time?: number }): {
  scene: Scene
  root: Group
  camera: PerspectiveCamera
  update: (deltaSeconds: number) => void
  dispose: () => void
} {
  const controller = createModel()
  const scene = new Scene()
  scene.name = 'freestanding-service-terminal / reference preview'
  scene.background = new Color(0x050505)
  scene.add(controller.root)
  scene.add(new HemisphereLight(0x8e9aa4, 0x05070a, 0.55))
  const key = new DirectionalLight(0xfff2e0, 3.0)
  key.position.set(-8, 12, 11)
  scene.add(key)
  const fill = new DirectionalLight(0x6d84b0, 0.7)
  fill.position.set(10, 5, 7)
  scene.add(fill)
  const rim = new DirectionalLight(0x9fb8c8, 1.1)
  rim.position.set(-7, 8, -10)
  scene.add(rim)

  const aspect = Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 1
  const mode = Math.floor(options.time ?? 0)
  const camera = new PerspectiveCamera(mode >= 2 ? 29 : 30, aspect, 0.15, 100)
  if (mode === 2) {
    camera.position.set(-17.5, 6.4, 11.5)
    camera.lookAt(0, 5.1, 0.3)
  } else if (mode === 3) {
    camera.position.set(12.6, 6.4, -15.2)
    camera.lookAt(0, 5.2, 0)
  } else if (mode >= 4) {
    camera.position.set(-12.5, 2.2, 15.0)
    camera.lookAt(0, 4.0, 0.6)
  } else {
    camera.position.set(-8.6, 6.6, 18.2)
    camera.lookAt(0, 5.15, 0.25)
  }
  scene.add(camera)
  return {
    scene,
    root: controller.root,
    camera,
    update: controller.update,
    dispose: () => {
      scene.remove(controller.root)
      controller.dispose()
    },
  }
}
