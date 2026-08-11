import {
  Color,
  DataTexture,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  LinearFilter,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  RGBAFormat,
  SRGBColorSpace,
  Scene,
  Shape,
  SphereGeometry,
  UnsignedByteType,
} from 'three/webgpu'

import {
  MaterialLibrary,
  WEAR_ATTRIBUTES,
  bakeOcclusion,
  bakeSurfaceAttributes,
  createWearMaterial,
  cylinder,
  mergeStaticByMaterial,
  prism,
  tuneMaterial,
  type MaterialHandle,
  type Vec3,
  type WearProfile,
} from '../../../src/asset-forge/generator/index.ts'

/**
 * Neon arcade cabinet reconstructed from the commercial-interior reference.
 * Front is +Z, the hero/reference camera is on +X/+Z, and the four feet end at
 * y=0. Keeping every landmark in cabinet-scale metres makes later proportion
 * corrections mechanical rather than decorative guesswork.
 */
const CABINET_WIDTH = 4.1
const SIDE_X = CABINET_WIDTH * 0.5

interface CabinetMaterials {
  shell: MeshPhysicalMaterial
  shellShade: MeshPhysicalMaterial
  graphite: MeshPhysicalMaterial
  graphiteEdge: MeshPhysicalMaterial
  ink: MeshPhysicalMaterial
  screen: MeshPhysicalMaterial
  pink: MeshPhysicalMaterial
  pinkDim: MeshPhysicalMaterial
  cyan: MeshPhysicalMaterial
}

/** Extrude a Y/Z outline a short distance along X. */
function yzPlate(
  material: MeshPhysicalMaterial,
  profile: ReadonlyArray<readonly [number, number]>,
  thickness: number,
  x: number,
  bevel = 0.025,
): Mesh {
  const shape = new Shape()
  const first = profile[0]
  shape.moveTo(-first[1], first[0])
  for (let index = 1; index < profile.length; index += 1) {
    const [y, z] = profile[index]
    shape.lineTo(-z, y)
  }
  shape.closePath()
  const geometry = new ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: bevel > 0,
    bevelSegments: bevel > 0 ? 1 : 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 1,
    steps: 1,
  })
  geometry.translate(0, 0, -thickness * 0.5)
  const mesh = new Mesh(geometry, material)
  mesh.rotation.y = Math.PI * 0.5
  mesh.position.x = x
  return mesh
}

function addBox(
  parent: Group,
  material: MeshPhysicalMaterial,
  size: Vec3,
  position: Vec3,
  rotation: Vec3 = [0, 0, 0],
  chamfer = 0.06,
  bevel = 0.025,
): Mesh {
  const mesh = prism(material, size, position, {
    chamfer,
    fillet: Math.min(0.045, chamfer * 0.35),
    bevel,
    rotation,
  })
  parent.add(mesh)
  return mesh
}

function addSideBolt(parent: Group, m: CabinetMaterials, x: number, y: number, z: number): void {
  parent.add(cylinder(m.ink, 0.105, 0.045, [x, y, z], [0, 0, Math.PI * 0.5], 12))
  parent.add(cylinder(m.graphiteEdge, 0.052, 0.054, [x + Math.sign(x) * 0.018, y, z], [0, 0, Math.PI * 0.5], 10))
}

function addShell(parent: Group, m: CabinetMaterials): void {
  // One coherent cabinet profile: tall rear tower, deep marquee, recessed
  // display neck, projecting control deck, and a heavy lower coin enclosure.
  const outline: ReadonlyArray<readonly [number, number]> = [
    [0.27, -1.18],
    [0.27, 1.28],
    [3.72, 1.42],
    [4.12, 1.76],
    [4.58, 1.82],
    [5.02, 1.46],
    [6.18, 1.14],
    [6.52, 1.38],
    [7.48, 1.28],
    [7.78, 0.94],
    [7.78, -0.95],
    [7.48, -1.18],
  ]
  parent.add(yzPlate(m.graphite, outline, 3.72, 0, 0.07))
  parent.add(yzPlate(m.shell, outline, 0.27, -1.91, 0.065))
  parent.add(yzPlate(m.shell, outline, 0.27, 1.91, 0.065))

  // Dark edge armor separates the pale outer side shells from the black front.
  const frontRail: ReadonlyArray<readonly [number, number]> = [
    [0.4, 1.3], [3.75, 1.43], [4.16, 1.8], [4.57, 1.86],
    [5.02, 1.49], [6.2, 1.17], [6.46, 1.36], [6.56, 1.24],
    [5.96, 0.94], [4.89, 1.24], [4.36, 1.52], [3.58, 1.16], [0.4, 1.03],
  ]
  for (const side of [-1, 1] as const) {
    parent.add(yzPlate(m.shellShade, frontRail, 0.22, side * 1.72, 0.035))
  }

  // Broad front masses stay slightly inset from the rails.
  addBox(parent, m.graphiteEdge, [3.42, 3.42, 0.28], [0, 2.04, 1.39], [0, 0, 0], 0.1, 0.045)
  addBox(parent, m.ink, [3.18, 3.08, 0.18], [0, 2.05, 1.57], [0, 0, 0], 0.08, 0.025)
  addBox(parent, m.graphite, [3.34, 0.25, 0.28], [0, 4.12, 1.56], [0.1, 0, 0], 0.08, 0.03)
  addBox(parent, m.graphiteEdge, [3.5, 0.36, 0.28], [0, 6.36, 1.2], [-0.22, 0, 0], 0.08, 0.03)
  addBox(parent, m.graphite, [3.58, 1.02, 0.36], [0, 7.03, 1.28], [0, 0, 0], 0.1, 0.05)
}

/**
 * Deterministic low-resolution arcade attract screen. It is generated from
 * analytic lines and tunnel rings, never sampled from reference pixels.
 */
function createScreenTexture(): DataTexture {
  const width = 256
  const height = 144
  const data = new Uint8Array(width * height * 4)
  const rayAngles = [-2.82, -2.37, -1.88, -1.22, -0.64, -0.08, 0.44, 0.96, 1.47, 2.02, 2.55]
  const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const x = (px / (width - 1) - 0.5) * 2
      const y = (py / (height - 1) - 0.5) * 1.12
      const radius = Math.hypot(x, y)
      const vignette = clamp01(1 - radius * 0.42)
      let glow = 0.06 + vignette * 0.13

      // Three concentric rotated square rings make the reference's receding
      // tunnel without adding even one piece of display geometry.
      const qx = (x + y) * Math.SQRT1_2
      const qy = (y - x) * Math.SQRT1_2
      const squareDistance = Math.max(Math.abs(qx), Math.abs(qy))
      for (const ring of [0.095, 0.165, 0.275]) {
        const distance = Math.abs(squareDistance - ring)
        glow += clamp01(1 - distance / 0.014) * (ring < 0.11 ? 0.95 : 0.68)
      }

      // Hard, restrained perspective streaks radiate only beyond the centre.
      for (const angle of rayAngles) {
        const along = x * Math.cos(angle) + y * Math.sin(angle)
        const across = Math.abs(-x * Math.sin(angle) + y * Math.cos(angle))
        const stagger = 0.15 + 0.07 * Math.sin(angle * 11.7)
        if (along > stagger && across < 0.006 + along * 0.0025) {
          glow += (1 - clamp01((along - stagger) / 1.15)) * 0.62
        }
      }

      // A few deterministic short dashes keep the screen alive without noise.
      const cellX = Math.floor((x + 1) * 14)
      const cellY = Math.floor((y + 0.56) * 12)
      const seed = Math.sin(cellX * 17.13 + cellY * 41.71) * 43758.5453
      const random = seed - Math.floor(seed)
      const dashX = ((x + 1) * 14) % 1
      const dashY = ((y + 0.56) * 12) % 1
      if (random > 0.84 && dashX > 0.12 && dashX < 0.72 && dashY > 0.46 && dashY < 0.53) glow += 0.38

      const intensity = clamp01(glow)
      const index = (py * width + px) * 4
      data[index] = Math.round(7 + intensity * 236)
      data[index + 1] = Math.round(1 + intensity * intensity * 24)
      data[index + 2] = Math.round(15 + intensity * 116)
      data[index + 3] = 255
    }
  }

  const texture = new DataTexture(data, width, height, RGBAFormat, UnsignedByteType)
  texture.name = 'neon-arcade-cabinet / generated tunnel display'
  texture.colorSpace = SRGBColorSpace
  texture.magFilter = LinearFilter
  texture.minFilter = LinearFilter
  texture.needsUpdate = true
  return texture
}

function addScreen(parent: Group, m: CabinetMaterials): void {
  const screen = new Group()
  screen.name = 'neon-arcade-cabinet / display assembly'
  screen.position.set(0, 5.36, 1.28)
  screen.rotation.x = -0.285
  parent.add(screen)

  addBox(screen, m.ink, [3.42, 2.24, 0.25], [0, 0, 0], [0, 0, 0], 0.14, 0.05)
  addBox(screen, m.graphiteEdge, [3.13, 1.96, 0.13], [0, 0, 0.16], [0, 0, 0], 0.08, 0.025)
  const displaySurface = new Mesh(new PlaneGeometry(2.93, 1.76, 1, 1), m.screen)
  displaySurface.name = 'neon-arcade-cabinet / single procedural display surface'
  displaySurface.position.z = 0.245
  screen.add(displaySurface)

  // The paired pink light bars that frame the display are a major landmark.
  for (const x of [-1.66, 1.66]) {
    addBox(screen, m.graphiteEdge, [0.22, 1.91, 0.27], [x, 0, 0.02], [0, 0, 0], 0.065, 0.025)
    addBox(screen, m.pink, [0.095, 1.48, 0.045], [x, 0, 0.22], [0, 0, 0], 0.025, 0.008)
  }
}

function addMarquee(parent: Group, m: CabinetMaterials): void {
  addBox(parent, m.ink, [3.22, 0.53, 0.16], [0, 7.13, 1.49], [0, 0, 0], 0.1, 0.03)
  addBox(parent, m.pink, [2.76, 0.24, 0.06], [0, 7.13, 1.59], [0, 0, 0], 0.055, 0.012)
  addBox(parent, m.pinkDim, [2.48, 0.055, 0.022], [0, 7.18, 1.63], [0, 0, 0], 0.015, 0.004)

  // Two angular, fully supported carry handles sit on the top deck.
  for (const x of [-1.03, 1.03]) {
    addBox(parent, m.ink, [0.28, 0.44, 0.46], [x - 0.43, 8.0, -0.08], [0, 0, -0.08], 0.06, 0.025)
    addBox(parent, m.ink, [0.28, 0.44, 0.46], [x + 0.43, 8.0, -0.08], [0, 0, 0.08], 0.06, 0.025)
    addBox(parent, m.graphiteEdge, [1.12, 0.22, 0.34], [x, 8.22, -0.08], [0, 0, 0], 0.07, 0.025)
  }
}

function addControls(parent: Group, m: CabinetMaterials): void {
  const deck = new Group()
  deck.name = 'neon-arcade-cabinet / unified sloped control deck'
  deck.position.set(0, 4.42, 1.45)
  deck.rotation.x = 0.36
  parent.add(deck)

  // Structural tray, inset control surface, and front crash rail share exactly
  // one plane. The rear edge intersects the screen sill and the front edge is
  // carried by the lower cabinet return, so this cannot read as a floating UI.
  addBox(deck, m.graphiteEdge, [3.58, 0.18, 1.42], [0, 0, 0.34], [0, 0, 0], 0.11, 0.035)
  addBox(deck, m.graphite, [3.3, 0.08, 1.2], [0, 0.12, 0.34], [0, 0, 0], 0.07, 0.02)

  // Joystick socket overlaps the control surface, its shaft overlaps the
  // socket, and the ball overlaps the shaft: one continuous playable control.
  deck.add(cylinder(m.ink, 0.24, 0.06, [-1.08, 0.155, 0.28], [0, 0, 0], 20))
  deck.add(cylinder(m.graphiteEdge, 0.16, 0.07, [-1.08, 0.195, 0.28], [0, 0, 0], 18))
  deck.add(cylinder(m.ink, 0.072, 0.48, [-1.08, 0.45, 0.28], [0, 0, 0], 14))
  const ball = new Mesh(new SphereGeometry(0.225, 18, 10), m.pink)
  ball.name = 'neon-arcade-cabinet / faceted joystick ball'
  ball.position.set(-1.08, 0.71, 0.28)
  deck.add(ball)

  // Five-plus-four stagger reproduces the dense reference layout while
  // preserving a comfortable 0.38–0.42 unit playable pitch. Every socket is
  // sunk through the same deck face by 0.012 units.
  const buttons: ReadonlyArray<readonly [number, number]> = [
    [-0.36, 0.45], [0.02, 0.45], [0.4, 0.45], [0.78, 0.45], [1.16, 0.45],
    [-0.17, 0.8], [0.21, 0.8], [0.59, 0.8], [0.97, 0.8],
  ]
  for (const [x, z] of buttons) {
    deck.add(cylinder(m.ink, 0.135, 0.05, [x, 0.145, z], [0, 0, 0], 16))
    deck.add(cylinder(m.pink, 0.095, 0.055, [x, 0.178, z], [0, 0, 0], 16))
  }

  for (const x of [-1.32, -0.9, -0.48, -0.06, 0.36, 0.78, 1.2]) {
    addBox(deck, x === 0.78 ? m.pinkDim : m.cyan, [0.24, 0.02, 0.035], [x, 0.174, -0.22], [0, 0, 0], 0.008, 0.003)
  }
}

function addFrontServiceDetails(parent: Group, m: CabinetMaterials): void {
  // Coin/service hatch: layered frame, recessed door, payment light and handle.
  addBox(parent, m.graphiteEdge, [1.68, 1.92, 0.14], [0, 2.1, 1.78], [0, 0, 0], 0.14, 0.035)
  addBox(parent, m.ink, [1.43, 1.63, 0.09], [0, 2.08, 1.88], [0, 0, 0], 0.09, 0.025)
  addBox(parent, m.pinkDim, [0.75, 0.16, 0.035], [0.08, 2.7, 1.96], [0, 0, 0], 0.035, 0.008)
  addBox(parent, m.graphiteEdge, [0.24, 0.72, 0.08], [-0.48, 2.12, 1.97], [0, 0, 0], 0.035, 0.012)
  addBox(parent, m.graphiteEdge, [0.17, 0.38, 0.08], [0.49, 1.9, 1.97], [0, 0, 0], 0.03, 0.012)
  addBox(parent, m.cyan, [0.1, 0.16, 0.03], [0.5, 2.38, 2.025], [0, 0, 0], 0.02, 0.005)

  // Recessed fasteners and coin-door direction chevrons carry the reference's
  // serviceable-machinery read without covering the broad front plates.
  for (const [x, y] of [[-0.62, 1.43], [0.62, 1.43], [-0.62, 2.74], [0.62, 2.74]] as const) {
    parent.add(cylinder(m.ink, 0.052, 0.035, [x, y, 2.01], [Math.PI * 0.5, 0, 0], 10))
  }
  addBox(parent, m.pinkDim, [0.18, 0.045, 0.025], [-0.63, 2.7, 1.985], [0, 0, 0.82], 0.01, 0.004)
  addBox(parent, m.pinkDim, [0.18, 0.045, 0.025], [0.78, 2.7, 1.985], [0, 0, -0.82], 0.01, 0.004)

  // Lower plinth vents are deep black recesses rather than painted rectangles.
  for (const x of [-0.98, 0.68]) {
    addBox(parent, m.graphiteEdge, [1.15, 0.35, 0.14], [x, 0.48, 1.55], [0, 0, 0], 0.06, 0.02)
    addBox(parent, m.ink, [0.92, 0.18, 0.07], [x, 0.48, 1.65], [0, 0, 0], 0.035, 0.01)
  }
}

function addFeet(parent: Group, m: CabinetMaterials): void {
  // Four broad bumpers overlap the chassis underside and terminate exactly at
  // ground y=0. Opposite-angle captures can therefore prove the rear supports.
  for (const x of [-1.7, 1.7]) {
    for (const z of [-0.96, 1.22]) {
      addBox(parent, m.graphiteEdge, [0.67, 0.72, 0.69], [x, 0.36, z], [0, 0, 0], 0.12, 0.045)
      addBox(parent, m.ink, [0.56, 0.16, 0.48], [x, 0.1, z + (z > 0 ? 0.13 : -0.08)], [0, 0, 0], 0.045, 0.018)
      if (z > 0) addBox(parent, m.pinkDim, [0.32, 0.08, 0.035], [x, 0.16, 1.58], [0, 0, 0], 0.016, 0.005)
    }
  }
}

function addRightSideDetails(parent: Group, m: CabinetMaterials): void {
  const faceX = SIDE_X + 0.07
  const speakerOuter: ReadonlyArray<readonly [number, number]> = [
    [2.25, -0.54], [2.48, -0.82], [3.65, -0.75], [4.2, -0.42],
    [5.46, -0.55], [5.78, -0.28], [5.66, 0.62], [5.34, 0.85],
    [4.05, 0.73], [3.54, 0.48], [2.4, 0.57],
  ]
  const speakerInner: ReadonlyArray<readonly [number, number]> = [
    [2.34, -0.49], [2.54, -0.74], [3.61, -0.68], [4.13, -0.36],
    [5.37, -0.48], [5.68, -0.23], [5.57, 0.52], [5.29, 0.74],
    [4.08, 0.65], [3.6, 0.4], [2.48, 0.5],
  ]
  parent.add(yzPlate(m.pinkDim, speakerOuter, 0.055, faceX, 0.018))
  parent.add(yzPlate(m.ink, speakerInner, 0.06, faceX + 0.045, 0.018))
  // Sparse grille ribs preserve the broad black speaker mass while keeping it
  // from reading as an empty painted polygon in clean side profile.
  for (const [y, z, length] of [
    [2.7, 0.03, 0.72], [3.18, -0.05, 1.0], [3.72, -0.08, 1.18],
    [4.28, 0.02, 1.2], [4.85, 0.06, 1.18], [5.34, 0.08, 0.82],
  ] as const) {
    addBox(parent, m.graphite, [0.035, 0.035, length], [faceX + 0.13, y, z], [0, 0, -0.08], 0.008, 0.003)
  }

  // Recessed side ventilation block and louvers.
  addBox(parent, m.graphiteEdge, [0.065, 0.62, 0.86], [faceX + 0.05, 1.64, -0.12], [0, 0, 0], 0.04, 0.012)
  for (const y of [1.45, 1.58, 1.71, 1.84]) {
    addBox(parent, m.ink, [0.075, 0.055, 0.68], [faceX + 0.095, y, -0.12], [0, 0, 0], 0.014, 0.005)
  }

  // Magenta carry bar and hanging stitched restraint strap. Both brackets
  // intersect the bar and the strap begins directly beneath it.
  parent.add(cylinder(m.pink, 0.095, 0.9, [faceX + 0.16, 6.71, 0.02], [Math.PI * 0.5, 0, 0], 16))
  for (const z of [-0.43, 0.47]) {
    addBox(parent, m.ink, [0.18, 0.43, 0.2], [faceX + 0.12, 6.65, z], [0, 0, 0], 0.04, 0.015)
  }
  addBox(parent, m.graphite, [0.07, 0.9, 0.39], [faceX + 0.16, 6.15, 0.02], [0, 0, 0], 0.035, 0.012)
  for (const y of [5.83, 6.05, 6.27, 6.49]) {
    addBox(parent, m.pinkDim, [0.035, 0.025, 0.3], [faceX + 0.21, y, 0.02], [0, 0, y % 0.4 > 0.2 ? 0.55 : -0.55], 0.006, 0.003)
  }

  // Bottom utility plate and three recessed connectors.
  addBox(parent, m.shellShade, [0.07, 0.64, 1.07], [faceX + 0.025, 0.72, -0.12], [0, 0, 0], 0.08, 0.025)
  for (const [z, material] of [[-0.41, m.ink], [-0.12, m.ink], [0.18, m.cyan]] as const) {
    parent.add(cylinder(material, 0.11, 0.07, [faceX + 0.09, 0.72, z], [0, 0, Math.PI * 0.5], 12))
  }

  for (const [y, z] of [[0.75, -0.92], [1.25, 0.91], [2.9, -0.94], [4.32, 0.98], [6.12, -0.9], [7.1, 0.82]] as const) {
    addSideBolt(parent, m, faceX + 0.07, y, z)
  }
  for (const [y, z] of [[2.34, -0.67], [3.53, 0.62], [5.18, -0.54]] as const) {
    addBox(parent, m.cyan, [0.035, 0.18, 0.04], [faceX + 0.16, y, z], [0, 0, -0.25], 0.008, 0.003)
  }
}

function acquireMaterials(): { materials: CabinetMaterials; handles: MaterialHandle[] } {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'maintained', seed: 7801 })
  const shellShade = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-400', condition: 'maintained', seed: 7802 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'maintained', seed: 7803 })
  const graphiteEdge = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-650', condition: 'maintained', seed: 7804 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'maintained', seed: 7805 })
  const screen = library.acquire({ recipeId: 'MAT-09', palette: 'MAGENTA-950', condition: 'active', seed: 7806 })
  const pink = library.acquire({ recipeId: 'MAT-09', palette: 'MAGENTA-400', condition: 'active', seed: 7807 })
  const pinkDim = library.acquire({ recipeId: 'MAT-09', palette: 'MAGENTA-500', condition: 'active', seed: 7808 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 7809 })
  return {
    handles: [shell, shellShade, graphite, graphiteEdge, ink, screen, pink, pinkDim, cyan],
    materials: {
      shell: tuneMaterial(shell, 0x8793a1, 0.42, 0.42, { clearcoat: 0.2 }),
      shellShade: tuneMaterial(shellShade, 0x56616f, 0.48, 0.46, { clearcoat: 0.12 }),
      graphite: tuneMaterial(graphite, 0x20242c, 0.55, 0.38, { clearcoat: 0.12 }),
      graphiteEdge: tuneMaterial(graphiteEdge, 0x343b46, 0.42, 0.52, { clearcoat: 0.16 }),
      ink: tuneMaterial(ink, 0x07090e, 0.72, 0.18),
      screen: tuneMaterial(screen, 0xffffff, 0.26, 0.02, { emissive: 0.82 }),
      pink: tuneMaterial(pink, 0xf51b8c, 0.22, 0.08, { emissive: 1.9 }),
      pinkDim: tuneMaterial(pinkDim, 0xc91470, 0.28, 0.1, { emissive: 1.15 }),
      cyan: tuneMaterial(cyan, 0x2ee9ee, 0.23, 0.08, { emissive: 2.2 }),
    },
  }
}

export function createModel(): {
  root: Group
  update: (deltaSeconds: number) => void
  dispose: () => void
} {
  const { materials, handles } = acquireMaterials()
  const screenTexture = createScreenTexture()
  materials.screen.map = screenTexture
  materials.screen.emissiveMap = screenTexture
  materials.screen.color.setHex(0x4a0635)
  materials.screen.emissive.setHex(0xff2d9c)
  materials.screen.needsUpdate = true
  const root = new Group()
  root.name = 'neon-arcade-cabinet'

  addShell(root, materials)
  addScreen(root, materials)
  addMarquee(root, materials)
  addControls(root, materials)
  addFrontServiceDetails(root, materials)
  addFeet(root, materials)
  addRightSideDetails(root, materials)

  // The reference's cabinet is broad and imposing rather than a narrow tower.
  // Apply the measured horizontal correction uniformly so rails, feet, screen,
  // handles, and side hardware preserve their authored clearances together.
  root.scale.x = 1.12

  // Form-aware wear is derived while every seam, overhang, recess, and source
  // surface still exists independently. Only the painted/metalled chassis is
  // weathered; screens and active emissive controls remain clean and readable.
  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [materials.shell, { rub: 0.035, grime: 0.08, scratch: 0.05 }],
    [materials.shellShade, { rub: 0.03, grime: 0.1, scratch: 0.045 }],
    [materials.graphite, { rub: 0.025, grime: 0.12, scratch: 0.035 }],
    [materials.graphiteEdge, { rub: 0.04, grime: 0.11, scratch: 0.045 }],
  ])
  bakeOcclusion(root, { reach: 0.28 })
  bakeSurfaceAttributes(root, profiles)
  const wearMaterial = createWearMaterial({
    name: 'neon-arcade-cabinet / baked worn chassis',
    clearcoat: 0.18,
    clearcoatRoughness: 0.44,
  })
  root.traverse((object) => {
    if (!(object instanceof Mesh) || Array.isArray(object.material)) return
    if (profiles.has(object.material as MeshPhysicalMaterial)) object.material = wearMaterial
  })

  const mergedGeometries = mergeStaticByMaterial(root, {
    retainedAttributes: (material) => material === wearMaterial ? WEAR_ATTRIBUTES : [],
    meshName: (material) => `neon-arcade-cabinet / ${material.name}`,
  })

  let elapsed = 0
  return {
    root,
    update: (deltaSeconds: number) => {
      elapsed += Math.min(Math.max(deltaSeconds, 0), 0.05)
      const pulse = Math.sin(elapsed * 2.15) * 0.5 + 0.5
      materials.screen.emissiveIntensity = 0.72 + pulse * 0.2
      materials.pink.emissiveIntensity = 1.7 + pulse * 0.45
      materials.pinkDim.emissiveIntensity = 1.0 + pulse * 0.34
    },
    dispose: () => {
      for (const geometry of mergedGeometries) geometry.dispose()
      screenTexture.dispose()
      wearMaterial.dispose()
      for (const handle of handles) handle.release()
    },
  }
}

/** Registry-compatible, reference-matched presentation for the shared viewer. */
export function createPreview(options: { aspect: number; time?: number }): {
  scene: Scene
  root: Group
  camera: PerspectiveCamera
  update: (deltaSeconds: number) => void
  dispose: () => void
} {
  const controller = createModel()
  const scene = new Scene()
  scene.name = 'neon-arcade-cabinet / reference-matched preview'
  scene.background = new Color(0x05080c)
  scene.add(controller.root)

  scene.add(new HemisphereLight(0xa8bdcc, 0x07090d, 0.9))
  const key = new DirectionalLight(0xfff2e2, 2.65)
  key.position.set(8, 12, 13)
  scene.add(key)
  const fill = new DirectionalLight(0x768ee8, 1.05)
  fill.position.set(-9, 6, 7)
  scene.add(fill)
  const rim = new DirectionalLight(0x91b8cd, 0.8)
  rim.position.set(7, 10, -10)
  scene.add(rim)

  const aspect = Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 1
  const diagnostic = Math.floor(options.time ?? 0)
  const camera = new PerspectiveCamera(diagnostic >= 2 ? 29 : 32, aspect, 0.12, 80)
  if (diagnostic === 2) {
    camera.name = 'neon-arcade-cabinet / low right control diagnostic'
    camera.position.set(6.7, 4.0, 7.1)
    camera.lookAt(0, 4.46, 1.36)
  } else if (diagnostic >= 3) {
    camera.name = 'neon-arcade-cabinet / low left control diagnostic'
    camera.position.set(-6.4, 4.08, 7.3)
    camera.lookAt(0, 4.46, 1.34)
  } else {
    camera.name = 'neon-arcade-cabinet / accepted beauty camera'
    camera.position.set(7.8, 6.8, 12.7)
    camera.lookAt(0, 4.22, 0.28)
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
