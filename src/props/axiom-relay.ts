import {
  BoxGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  IcosahedronGeometry,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Shape,
  TorusGeometry,
} from 'three/webgpu'
import type { BufferGeometry, Material } from 'three/webgpu'
import type { ProceduralProp } from '../core/types.ts'

function roundedPanelGeometry(
  width: number,
  height: number,
  depth: number,
  radius: number,
): ExtrudeGeometry {
  const halfWidth = width / 2
  const halfHeight = height / 2
  const corner = Math.min(radius, halfWidth, halfHeight)
  const shape = new Shape()

  shape.moveTo(-halfWidth + corner, -halfHeight)
  shape.lineTo(halfWidth - corner, -halfHeight)
  shape.quadraticCurveTo(halfWidth, -halfHeight, halfWidth, -halfHeight + corner)
  shape.lineTo(halfWidth, halfHeight - corner)
  shape.quadraticCurveTo(halfWidth, halfHeight, halfWidth - corner, halfHeight)
  shape.lineTo(-halfWidth + corner, halfHeight)
  shape.quadraticCurveTo(-halfWidth, halfHeight, -halfWidth, halfHeight - corner)
  shape.lineTo(-halfWidth, -halfHeight + corner)
  shape.quadraticCurveTo(-halfWidth, -halfHeight, -halfWidth + corner, -halfHeight)

  const geometry = new ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    curveSegments: 8,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: Math.min(0.035, depth * 0.25),
    bevelThickness: Math.min(0.035, depth * 0.25),
  })
  geometry.center()
  return geometry
}

function part(
  name: string,
  geometry: BufferGeometry,
  material: Material,
  castShadow = true,
): Mesh {
  const mesh = new Mesh(geometry, material)
  mesh.name = name
  mesh.castShadow = castShadow
  mesh.receiveShadow = true
  return mesh
}

/**
 * A compact procedural power relay used as the initial kit-bashing subject.
 * It intentionally uses no DOM-loaded assets, so it is identical in Dawn.
 */
export function createAxiomRelay(): ProceduralProp {
  const root = new Group()
  root.name = 'PROP / AXIOM RELAY 07'

  const shell = new MeshStandardMaterial({
    color: 0xd9e6e9,
    metalness: 0.62,
    roughness: 0.28,
  })
  const shellBright = new MeshStandardMaterial({
    color: 0xf5fbfb,
    metalness: 0.4,
    roughness: 0.22,
  })
  const darkMetal = new MeshStandardMaterial({
    color: 0x071019,
    metalness: 0.9,
    roughness: 0.24,
  })
  const graphite = new MeshStandardMaterial({
    color: 0x182633,
    metalness: 0.72,
    roughness: 0.34,
  })
  const cyan = new MeshStandardMaterial({
    color: 0x24dfff,
    emissive: 0x00bfe8,
    emissiveIntensity: 4.8,
    metalness: 0.15,
    roughness: 0.18,
  })
  const magenta = new MeshStandardMaterial({
    color: 0xff4fc8,
    emissive: 0xe21b9f,
    emissiveIntensity: 3.4,
    metalness: 0.18,
    roughness: 0.2,
  })

  const lowerBase = part(
    'BASE / LOWER',
    new CylinderGeometry(2.15, 2.34, 0.28, 48),
    darkMetal,
  )
  lowerBase.position.y = 0.18
  root.add(lowerBase)

  const baseShell = part(
    'BASE / SHELL',
    new CylinderGeometry(1.94, 2.14, 0.24, 48),
    shell,
  )
  baseShell.position.y = 0.43
  root.add(baseShell)

  const baseTop = part(
    'BASE / TOP',
    new CylinderGeometry(1.78, 1.92, 0.18, 48),
    graphite,
  )
  baseTop.position.y = 0.63
  root.add(baseTop)

  const baseLight = part(
    'BASE / STATUS RING',
    new TorusGeometry(1.83, 0.035, 8, 72),
    cyan,
    false,
  )
  baseLight.position.y = 0.73
  baseLight.rotation.x = Math.PI / 2
  root.add(baseLight)

  const footGeometry = new BoxGeometry(0.58, 0.14, 1.02)
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2
    const foot = part(`BASE / FOOT ${index + 1}`, footGeometry, shellBright)
    foot.position.set(Math.sin(angle) * 2.06, 0.16, Math.cos(angle) * 2.06)
    foot.rotation.y = angle
    root.add(foot)
  }

  const spine = part(
    'CORE / SPINE',
    new CylinderGeometry(0.62, 0.78, 2.55, 12),
    darkMetal,
  )
  spine.position.y = 1.82
  root.add(spine)

  const lowerCollar = part(
    'CORE / LOWER COLLAR',
    new CylinderGeometry(0.88, 1.18, 0.34, 12),
    graphite,
  )
  lowerCollar.position.y = 0.88
  root.add(lowerCollar)

  const panelGeometry = roundedPanelGeometry(0.72, 1.65, 0.12, 0.1)
  const insetGeometry = roundedPanelGeometry(0.34, 0.92, 0.045, 0.045)
  const stripGeometry = roundedPanelGeometry(0.055, 0.66, 0.025, 0.018)

  for (let index = 0; index < 6; index += 1) {
    const angle = (index / 6) * Math.PI * 2
    const x = Math.sin(angle)
    const z = Math.cos(angle)

    const panel = part(`SHELL / PANEL ${index + 1}`, panelGeometry, shell)
    panel.position.set(x * 0.91, 1.7, z * 0.91)
    panel.rotation.y = angle
    panel.rotation.z = index % 2 === 0 ? -0.025 : 0.025
    root.add(panel)

    const inset = part(`SHELL / INSET ${index + 1}`, insetGeometry, darkMetal)
    inset.position.set(x * 1.005, 1.7, z * 1.005)
    inset.rotation.y = angle
    inset.rotation.z = panel.rotation.z
    root.add(inset)

    const stripMaterial = index === 1 || index === 4 ? magenta : cyan
    const strip = part(
      `SHELL / LIGHT ${index + 1}`,
      stripGeometry,
      stripMaterial,
      false,
    )
    strip.position.set(x * 1.045, 1.7, z * 1.045)
    strip.rotation.y = angle
    strip.rotation.z = panel.rotation.z
    root.add(strip)
  }

  const shoulder = part(
    'CORE / SHOULDER',
    new CylinderGeometry(0.77, 1.02, 0.38, 12),
    shellBright,
  )
  shoulder.position.y = 2.7
  root.add(shoulder)

  const corePivot = new Group()
  corePivot.name = 'ENERGY CORE / PIVOT'
  corePivot.position.y = 3.02
  root.add(corePivot)

  const core = part(
    'ENERGY CORE',
    new IcosahedronGeometry(0.46, 2),
    cyan,
    false,
  )
  corePivot.add(core)

  const orbitA = part(
    'ENERGY CORE / ORBIT A',
    new TorusGeometry(0.69, 0.028, 8, 56),
    shellBright,
    false,
  )
  orbitA.rotation.x = Math.PI / 2
  orbitA.rotation.z = MathUtils.degToRad(18)
  corePivot.add(orbitA)

  const orbitB = part(
    'ENERGY CORE / ORBIT B',
    new TorusGeometry(0.78, 0.022, 8, 56),
    magenta,
    false,
  )
  orbitB.rotation.y = MathUtils.degToRad(62)
  orbitB.rotation.x = MathUtils.degToRad(18)
  corePivot.add(orbitB)

  const crown = part(
    'CROWN / HOUSING',
    new CylinderGeometry(0.52, 0.74, 0.45, 8),
    darkMetal,
  )
  crown.position.y = 3.86
  root.add(crown)

  const crownShell = part(
    'CROWN / SHELL',
    new CylinderGeometry(0.34, 0.54, 0.35, 8),
    shell,
  )
  crownShell.position.y = 4.2
  root.add(crownShell)

  const crownLight = part(
    'CROWN / BEACON',
    new CylinderGeometry(0.13, 0.22, 0.3, 16),
    magenta,
    false,
  )
  crownLight.position.y = 4.5
  root.add(crownLight)

  const scanner = new Group()
  scanner.name = 'SCANNER ASSEMBLY'
  scanner.position.y = 2.58
  root.add(scanner)

  const scannerArmGeometry = new BoxGeometry(1.15, 0.08, 0.09)
  for (let index = 0; index < 3; index += 1) {
    const arm = part(
      `SCANNER / ARM ${index + 1}`,
      scannerArmGeometry,
      index === 0 ? magenta : graphite,
      false,
    )
    arm.position.x = 1.25
    const armPivot = new Group()
    armPivot.rotation.y = (index / 3) * Math.PI * 2
    armPivot.add(arm)
    scanner.add(armPivot)
  }

  return {
    root,
    update(elapsedSeconds) {
      corePivot.rotation.y = elapsedSeconds * 0.58
      core.rotation.x = elapsedSeconds * 0.34
      core.rotation.z = elapsedSeconds * 0.22
      orbitA.rotation.z = MathUtils.degToRad(18) + elapsedSeconds * 0.24
      orbitB.rotation.x = MathUtils.degToRad(18) - elapsedSeconds * 0.31
      scanner.rotation.y = -elapsedSeconds * 0.38

      const pulse = 0.5 + 0.5 * Math.sin(elapsedSeconds * 2.4)
      cyan.emissiveIntensity = 4.2 + pulse * 1.5
      magenta.emissiveIntensity = 2.9 + (1 - pulse) * 1.2
    },
  }
}
