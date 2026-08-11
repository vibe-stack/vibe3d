import { MeshPhysicalMaterial } from 'three/webgpu'

import {
  createWearMaterial,
  MaterialLibrary,
  tuneMaterial,
  type MaterialHandle,
  type WearProfile,
} from '../../../src/asset-forge/generator/index.ts'

export interface GateMaterials {
  shell: MeshPhysicalMaterial
  shellLight: MeshPhysicalMaterial
  shellShadow: MeshPhysicalMaterial
  graphite: MeshPhysicalMaterial
  graphiteLight: MeshPhysicalMaterial
  ink: MeshPhysicalMaterial
  steel: MeshPhysicalMaterial
  field: MeshPhysicalMaterial
  lime: MeshPhysicalMaterial
}

export interface GateMaterialSet {
  materials: GateMaterials
  handles: MaterialHandle[]
  profiles: Map<MeshPhysicalMaterial, WearProfile>
  wearMaterial: MeshPhysicalMaterial
}

export function acquireGateMaterials(): GateMaterialSet {
  const library = new MaterialLibrary()
  // MAT-02 coated alloy for the shell and structure, MAT-09 for every emissive
  // surface, MAT-17 for the painted bumper chips.
  const shell = library.acquire({ recipeId: 'MAT-02', palette: 'SHELL-200', condition: 'used', wear: 0.11, dirt: 0.09, seed: 4101, uvScale: [3.2, 3.2] })
  const shellLight = library.acquire({ recipeId: 'MAT-02', palette: 'SHELL-050', condition: 'used', wear: 0.09, dirt: 0.07, seed: 4102, uvScale: [3.2, 3.2] })
  const shellShadow = library.acquire({ recipeId: 'MAT-02', palette: 'SLATE-650', condition: 'used', wear: 0.13, dirt: 0.11, seed: 4103, uvScale: [3.6, 3.6] })
  const graphite = library.acquire({ recipeId: 'MAT-02', palette: 'GRAPHITE-800', condition: 'used', wear: 0.14, dirt: 0.16, seed: 4201, uvScale: [3, 3] })
  const graphiteLight = library.acquire({ recipeId: 'MAT-02', palette: 'GRAPHITE-800', condition: 'used', wear: 0.13, dirt: 0.13, seed: 4202, uvScale: [3, 3] })
  const ink = library.acquire({ recipeId: 'MAT-02', palette: 'INK-950', condition: 'used', wear: 0.06, dirt: 0.2, seed: 4203, uvScale: [3, 3] })
  const steel = library.acquire({ recipeId: 'MAT-02', palette: 'SLATE-650', condition: 'used', wear: 0.18, dirt: 0.14, seed: 4204, uvScale: [3, 3] })
  const lime = library.acquire({ recipeId: 'MAT-17', palette: 'AMBER-400', condition: 'used', wear: 0.16, dirt: 0.1, seed: 4301, uvScale: [3, 3] })
  const field = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'clean', dirt: 0.01, seed: 4901 })

  const materials: GateMaterials = {
    // Coated alloy, not bare metal: the reference shell is matte structural
    // paint, so metalness stays low and the highlight comes from clearcoat.
    shell: tuneMaterial(shell, 0xc6d2d6, 0.5, 0.16, { clearcoat: 0.28 }),
    shellLight: tuneMaterial(shellLight, 0xdde8ea, 0.46, 0.14, { clearcoat: 0.3 }),
    shellShadow: tuneMaterial(shellShadow, 0x8b9aa1, 0.56, 0.14, { clearcoat: 0.18 }),
    graphite: tuneMaterial(graphite, 0x1d2733, 0.46, 0.36, { clearcoat: 0.26 }),
    graphiteLight: tuneMaterial(graphiteLight, 0x2e3c4a, 0.44, 0.34, { clearcoat: 0.26 }),
    ink: tuneMaterial(ink, 0x080e15, 0.56, 0.5),
    steel: tuneMaterial(steel, 0x82919a, 0.34, 0.86),
    lime: tuneMaterial(lime, 0xe69013, 0.44, 0.24, { clearcoat: 0.18 }),
    field: tuneMaterial(field, 0xff6208, 0.22, 0, { emissive: 0.5 }),
  }

  // Only the broad coated masses go on the wear graph. The rub band is a fixed
  // 0.075 m from every rim, so a part thinner than ~0.5 m has no clean middle
  // left and rubs through to bare metal across its whole face. The graphite
  // structure, dark cavities, and lamps stay on plain PBR.
  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [materials.shell, { rub: 0.5, grime: 0.38, scratch: 0.045 }],
    [materials.shellLight, { rub: 0.4, grime: 0.32, scratch: 0.035 }],
    [materials.shellShadow, { rub: 0.38, grime: 0.44, scratch: 0.03 }],
  ])

  const handles = [shell, shellLight, shellShadow, graphite, graphiteLight, ink, steel, lime, field]
  const wearMaterial = createWearMaterial({ name: 'storm-point-large-gate / worn shell' })
  return { materials, handles, profiles, wearMaterial }
}
