// f1-race-control — Grade 1 race tower (10 × 8 m footprint, 14 m to the roof):
// a wide entrance plinth, a deeply recessed curtain-wall shaft between proud
// floor plates, a flared crown whose raked control-room glass cantilevers out
// over the track, and a matched pair of solid corner legs — the stair core on
// +X, a riser blade on -X — that bracket it. Not a flat glass sticker box.

import {
  BufferGeometry,
  CylinderGeometry,
  DataTexture,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector3,
  type Material,
} from 'three/webgpu'

import {
  LAYER_CLEARANCE,
  RACE_CONTROL,
  TOKEN,
  acquireF1Materials,
  bevelBox,
  bevelDisc,
  bevelRing,
  createF1Preview,
  disposeF1Materials,
  marshalPlateTexture,
  member,
  mergeParts,
  shade,
} from '../f1-kit-core/index.ts'

type Slot = 'tower' | 'deck'

export interface F1RaceControlConfig {
  height: number
}

export interface F1RaceControlOptions extends Partial<F1RaceControlConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1RaceControlInstance {
  readonly root: Group
  readonly parts: { tower: Group; deck: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1RaceControlConfig>
  configure(patch: Partial<F1RaceControlConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1RaceControlConfig = { height: RACE_CONTROL.height }
const W = RACE_CONTROL.width
const D = RACE_CONTROL.depth

/** Control-room glass leans out at the bottom so downward glare falls to the ground. */
const CROWN_RAKE = 0.22

/** Vision glass sits this far behind the mullion face; the reveal is the depth cue. */
const GLASS_REVEAL = 0.34

export function createModel(options: F1RaceControlOptions = {}): F1RaceControlInstance {
  const config: F1RaceControlConfig = {
    height: Math.max(8, options.height ?? defaults.height),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const textures: DataTexture[] = []
  const glassMat = new MeshStandardMaterial({
    name: 'f1-kit / race control glass',
    color: 0x070d13,
    roughness: 0.11,
    metalness: 0.55,
  })
  // Precast floor plates have to read as concrete, not as more painted steel:
  // the kit's structural greys are metallic, so the bands would sink into the
  // piers they are supposed to project from.
  const precastMat = new MeshStandardMaterial({
    name: 'f1-kit / race control precast',
    color: shade(TOKEN.SLATE_650, 0.12),
    roughness: 0.92,
    metalness: 0.0,
  })
  // The spandrel carries the only value step the curtain wall has left once the
  // grid is too fine to resolve, so it runs above the plates rather than
  // sharing their material and collapsing the wall into one flat tone.
  const spandrelMat = new MeshStandardMaterial({
    name: 'f1-kit / race control spandrel',
    color: shade(TOKEN.SLATE_650, 0.2),
    roughness: 0.78,
    metalness: 0.0,
  })
  extras.push(glassMat, precastMat, spandrelMat)
  const persistentExtras = extras.length

  const materialSlots: Record<Slot, Material> = {
    tower: options.materials?.tower ?? kit.shell,
    deck: options.materials?.deck ?? kit.graphite,
  }

  const root = new Group(); root.name = 'f1-race-control'
  const tower = new Group(); tower.name = 'tower'
  const deck = new Group(); deck.name = 'deck'
  root.add(tower, deck)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { tower: [], deck: [] }

  const releaseGenerated = (): void => {
    tower.clear(); deck.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
    for (const texture of textures) texture.dispose()
    textures.length = 0
    for (let i = persistentExtras; i < extras.length; i++) extras[i]!.dispose()
    extras.length = persistentExtras
  }

  const emit = (slot: Slot, geometry: BufferGeometry, group: Group, name: string, material?: Material): void => {
    generated.push(geometry)
    const mesh = new Mesh(geometry, material ?? materialSlots[slot])
    mesh.name = name
    mesh.userData.topologyRole = name.includes('glass') || name.includes('dish') || name.includes('antenna') || name.includes('plate') ? 'detail' : 'hull'
    mesh.castShadow = true
    mesh.receiveShadow = true
    meshesBySlot[slot].push(mesh)
    group.add(mesh)
  }

  const rebuild = (): void => {
    releaseGenerated()
    const h = config.height
    const w = W
    const d = D

    // Vertical layout: plaza, entrance plinth, glazed shaft, control-room crown.
    // The crown takes the largest single band so it, not the stair core, is the
    // mass the tower is read by.
    const apronTop = 0.28
    const plinthTop = Math.min(3.2, h * 0.28)
    const crownH = Math.min(4.6, (h - plinthTop) * 0.48)
    const shaftTop = h - crownH
    const shaftSpan = Math.max(1.2, shaftTop - plinthTop)
    const floors = Math.max(1, Math.round(shaftSpan / 3.9))
    const storey = shaftSpan / floors
    const bandT = Math.min(0.42, storey * 0.2)

    // Plan envelopes. The shaft sits well inside the plinth; the crown flares
    // back out over it and cantilevers two metres toward the track on +Z, which
    // is where its mass has to come from — widening it in X only buries the
    // corner legs that give the tower its structural read.
    const shw = w / 2 - 0.95
    const shd = d / 2 - 0.9
    const bandOut = 0.4
    const crw = w / 2 + 0.25
    const crBackZ = -d / 2 + 0.2
    const crFrontZ = d / 2 + 2.0
    const crd = (crFrontZ - crBackZ) / 2
    const crz = (crFrontZ + crBackZ) / 2

    // Crown slab and the shadow plane recessed under it. Both are needed before
    // the shaft is glazed: the top storey stops at the soffit, not in mid-air.
    const slabH = 0.8
    const soffitH = 0.3
    const slabBot = shaftTop - 0.16
    const slabTopY = slabBot + slabH
    const soffitBot = slabBot - soffitH + 0.02

    // Two solid legs bracket the crown, both standing proud of the fascia by
    // the same amount. The stair core overruns the roofline on +X; a riser
    // blade answers it on -X, set forward in Z so the pair is not a mirror.
    const legOuterX = w / 2 + 1.15
    const coreHalfX = 1.25
    const coreHalfZ = 1.7
    const coreX = legOuterX - coreHalfX
    const coreZ = -1.5
    const coreTop = h + 1.75
    const legHalfX = 1.2
    const legHalfZ = 2.05
    const legX = -(legOuterX - legHalfX)
    const legZ = 0.6
    const legTop = h + 1.45

    const structure: BufferGeometry[] = []  // plinth, piers, legs, flanks, soffit
    const precast: BufferGeometry[] = []    // floor plates, crown slab, fascia, canopy
    const spandrel: BufferGeometry[] = []   // curtain-wall spandrel blocks
    const glass: BufferGeometry[] = []
    const trim: BufferGeometry[] = []       // mullions, transoms, brackets, louvres
    const accent: BufferGeometry[] = []     // crown identity band
    const roofPlate: BufferGeometry[] = []  // roof slab, parapet, plant housings
    const roofTrim: BufferGeometry[] = []   // plant louvres, fan rings, camera pods
    const dishes: BufferGeometry[] = []
    const antennas: BufferGeometry[] = []

    // --- plaza and entrance plinth ----------------------------------------
    structure.push(bevelBox(w + 2.6, apronTop, d + 2.6, 0.02).translate(0, apronTop / 2, 0))
    structure.push(bevelBox(w, plinthTop - apronTop, d, 0.035)
      .translate(0, (plinthTop + apronTop) / 2, 0))
    precast.push(bevelBox(w + 0.14, 0.18, d + 0.14, 0.014).translate(0, plinthTop - 0.42, 0))
    precast.push(bevelBox(w + 0.14, 0.16, d + 0.14, 0.012).translate(0, apronTop + 0.3, 0))

    // Light precast portal around a dark glazed opening.
    const entranceX = -1.6
    const doorTop = apronTop + 2.4
    const portalH = doorTop - apronTop + 0.34
    for (const dx of [-2.15, 2.15] as const) {
      precast.push(bevelBox(0.44, portalH, 0.5, 0.025)
        .translate(entranceX + dx, apronTop + portalH / 2, d / 2 + 0.17))
    }
    precast.push(bevelBox(4.74, 0.4, 0.5, 0.025)
      .translate(entranceX, apronTop + portalH - 0.2, d / 2 + 0.17))
    structure.push(bevelBox(3.9, portalH - 0.4, 0.16, 0.014)
      .translate(entranceX, apronTop + (portalH - 0.4) / 2, d / 2 + 0.05))
    for (const dx of [-0.76, 0.76] as const) {
      glass.push(bevelBox(1.42, 2.35, 0.07, 0.008)
        .translate(entranceX + dx, apronTop + 1.18, d / 2 + 0.24))
      trim.push(bevelBox(0.09, 2.35, 0.13, 0.01)
        .translate(entranceX + dx, apronTop + 1.18, d / 2 + 0.3))
    }
    trim.push(bevelBox(3.2, 0.11, 0.14, 0.01).translate(entranceX, doorTop, d / 2 + 0.3))
    glass.push(bevelBox(3.2, 0.38, 0.06, 0.008).translate(entranceX, doorTop + 0.26, d / 2 + 0.24))

    const canopyY = plinthTop - 0.72
    precast.push(bevelBox(5.0, 0.18, 1.4, 0.022).translate(entranceX, canopyY, d / 2 + 0.66))
    for (const dx of [-2.1, 2.1] as const) {
      trim.push(member(
        new Vector3(entranceX + dx, canopyY + 0.78, d / 2 + 0.02),
        new Vector3(entranceX + dx, canopyY + 0.05, d / 2 + 1.26),
        0.032, 8,
      ))
    }

    // Plant grille and slot glazing keep the plinth from reading as a blank box.
    // The slots run only over the front third: the corner legs bury the rest.
    precast.push(bevelBox(2.4, 1.7, 0.12, 0.012).translate(3.1, apronTop + 0.98, d / 2 + 0.03))
    structure.push(bevelBox(2.0, 1.3, 0.16, 0.014).translate(3.1, apronTop + 0.98, d / 2 + 0.05))
    for (let i = 0; i < 5; i++) {
      trim.push(bevelBox(1.94, 0.07, 0.16, 0.01)
        .translate(3.1, apronTop + 0.46 + i * 0.26, d / 2 + 0.1))
    }
    for (const sx of [-1, 1] as const) {
      glass.push(bevelBox(0.07, 1.05, 2.9, 0.01)
        .translate(sx * (w / 2 - 0.05), plinthTop - 1.24, 2.35))
      trim.push(bevelBox(0.14, 0.11, 2.9, 0.01)
        .translate(sx * (w / 2 + 0.01), plinthTop - 1.8, 2.35))
    }
    glass.push(bevelBox(3.0, 1.05, 0.07, 0.01).translate(0, plinthTop - 1.24, -(d / 2 + 0.01)))

    // --- shaft: floor plates, corner piers, curtain wall -------------------
    for (let i = 0; i < floors; i++) {
      precast.push(bevelBox((shw + bandOut) * 2, bandT, (shd + bandOut) * 2, 0.018)
        .translate(0, plinthTop + i * storey, 0))
    }

    const pierH = shaftTop - plinthTop
    const pierY = plinthTop + pierH / 2
    const pierLong = 1.7
    const pierShort = 0.9
    for (const sx of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        structure.push(bevelBox(pierLong, pierH, pierShort, 0.02)
          .translate(sx * (shw + bandOut - pierLong / 2), pierY, sz * (shd + bandOut - pierShort / 2)))
        structure.push(bevelBox(pierShort, pierH, pierLong, 0.02)
          .translate(sx * (shw + bandOut - pierShort / 2), pierY, sz * (shd + bandOut - pierLong / 2)))
      }
    }

    /** One glazed storey: vision glass held back behind the mullion face, with a
     *  solid spandrel block plugging the bottom of that reveal. */
    const glazeStorey = (y0: number, y1: number): void => {
      const open = y1 - y0
      if (open < 0.5) return
      const spandrelH = Math.min(0.7, open * 0.23)
      const visionH = open - spandrelH
      const visionY = y1 - visionH / 2
      const spandrelY = y0 + spandrelH / 2
      const spanX = shw * 2 - 0.4
      const spanZ = shd * 2 - 0.4
      // Outermost plane of the frame; the floor plates overhang it by bandOut,
      // which is what puts a cast shadow across the top of every storey.
      const frameOut = 0.2
      // The spandrel is a block, not a skin, so the reveal is closed off below
      // instead of opening into the hollow shaft.
      const spandrelT = GLASS_REVEAL + 0.06

      for (const sz of [-1, 1] as const) {
        const face = sz * (shd + frameOut)
        glass.push(bevelBox(spanX, visionH, 0.06, 0.008)
          .translate(0, visionY, face - sz * GLASS_REVEAL))
        spandrel.push(bevelBox(spanX, spandrelH, spandrelT, 0.014)
          .translate(0, spandrelY, face - sz * (spandrelT / 2)))
        trim.push(bevelBox(spanX, 0.16, 0.26, 0.01)
          .translate(0, y0 + spandrelH, face - sz * 0.13))
        trim.push(bevelBox(spanX, 0.1, 0.2, 0.01)
          .translate(0, visionY, face - sz * 0.1))
      }
      for (const sx of [-1, 1] as const) {
        const face = sx * (shw + frameOut)
        glass.push(bevelBox(0.06, visionH, spanZ, 0.008)
          .translate(face - sx * GLASS_REVEAL, visionY, 0))
        spandrel.push(bevelBox(spandrelT, spandrelH, spanZ, 0.014)
          .translate(face - sx * (spandrelT / 2), spandrelY, 0))
        trim.push(bevelBox(0.26, 0.16, spanZ, 0.01)
          .translate(face - sx * 0.13, y0 + spandrelH, 0))
        trim.push(bevelBox(0.2, 0.1, spanZ, 0.01)
          .translate(face - sx * 0.1, visionY, 0))
      }

      const colsX = Math.max(3, Math.round(spanX / 0.95))
      for (let c = 0; c <= colsX; c++) {
        const x = -spanX / 2 + (c / colsX) * spanX
        for (const sz of [-1, 1] as const) {
          trim.push(bevelBox(0.12, open, 0.26, 0.012)
            .translate(x, y0 + open / 2, sz * (shd + 0.07)))
        }
      }
      const colsZ = Math.max(3, Math.round(spanZ / 0.95))
      for (let c = 0; c <= colsZ; c++) {
        const z = -spanZ / 2 + (c / colsZ) * spanZ
        for (const sx of [-1, 1] as const) {
          trim.push(bevelBox(0.26, open, 0.12, 0.012)
            .translate(sx * (shw + 0.07), y0 + open / 2, z))
        }
      }
    }

    for (let i = 0; i < floors; i++) {
      const y0 = plinthTop + i * storey + bandT / 2
      const y1 = i + 1 === floors ? soffitBot : plinthTop + (i + 1) * storey - bandT / 2
      glazeStorey(y0, y1)
    }

    // --- crown: cantilevered slab, raked control-room glass, solid flanks ---
    precast.push(bevelBox(crw * 2 + 0.34, slabH, crd * 2 + 0.34, 0.03)
      .translate(0, slabBot + slabH / 2, crz))
    // A dark plane recessed under the slab edge. The overhang needs one hard
    // shadow line or the whole cantilever flattens out at paddock distance.
    structure.push(bevelBox(crw * 2 - 0.44, soffitH, crd * 2 - 0.44, 0.02)
      .translate(0, soffitBot + soffitH / 2, crz))
    for (const sx of [-1, 1] as const) {
      structure.push(member(
        new Vector3(sx * 2.9, shaftTop - 2.8, shd + bandOut),
        new Vector3(sx * 3.3, soffitBot - 0.06, crFrontZ - 0.8),
        0.13, 8,
      ))
      structure.push(member(
        new Vector3(sx * (shw + bandOut), shaftTop - 2.2, -1.2),
        new Vector3(sx * (crw - 0.3), soffitBot - 0.06, -1.2),
        0.1, 8,
      ))
    }

    const fasciaH = 0.82
    const glassBot = slabTopY
    const glassTop = h - fasciaH
    const glassH = Math.max(0.8, glassTop - glassBot)
    const glassW = crw * 2 - 0.9
    const crownCy = (glassBot + glassTop) / 2
    const crownCz = crFrontZ - 0.26 - (Math.tan(CROWN_RAKE) * glassH) / 2

    const rakeInPlace = (geometry: BufferGeometry): BufferGeometry =>
      geometry.rotateX(-CROWN_RAKE).translate(0, crownCy, crownCz)

    glass.push(rakeInPlace(bevelBox(glassW, glassH, 0.07, 0.008)))

    const crownGrid: BufferGeometry[] = []
    const crownCols = Math.max(4, Math.round(glassW / 0.98))
    for (let c = 0; c <= crownCols; c++) {
      crownGrid.push(bevelBox(0.15, glassH, 0.26, 0.014)
        .translate(-glassW / 2 + (c / crownCols) * glassW, 0, 0.15))
    }
    crownGrid.push(bevelBox(glassW, 0.16, 0.28, 0.012).translate(0, glassH * 0.08, 0.16))
    crownGrid.push(bevelBox(glassW + 0.34, 0.3, 0.44, 0.02)
      .translate(0, -glassH / 2 - 0.15, 0.13))
    trim.push(rakeInPlace(mergeParts(crownGrid, 'crown-grid')))

    const flankFront = crFrontZ - 0.7
    const flankHalfD = (flankFront - crBackZ) / 2
    const flankZ = (flankFront + crBackZ) / 2
    for (const sx of [-1, 1] as const) {
      structure.push(bevelBox(0.5, glassH + 0.3, flankHalfD * 2, 0.025)
        .translate(sx * (crw - 0.25), crownCy, flankZ))
      for (let i = 0; i < 3; i++) {
        glass.push(bevelBox(0.08, Math.max(0.3, glassH - 1.0), 0.36, 0.01)
          .translate(sx * (crw - 0.02), crownCy, flankZ - 1.7 + i * 1.7))
      }
    }
    structure.push(bevelBox(crw * 2, glassH + 0.3, 0.55, 0.025)
      .translate(0, crownCy, crBackZ + 0.28))

    const fasciaY = h - fasciaH / 2
    const fasciaHalfW = crw + 0.12
    const fasciaFrontZ = crz + crd - 0.25
    precast.push(bevelBox(fasciaHalfW * 2, fasciaH, crd * 2 - 0.5, 0.025).translate(0, fasciaY, crz))
    accent.push(bevelBox(fasciaHalfW * 2 - 0.7, 0.4, 0.12, 0.014)
      .translate(0, fasciaY, fasciaFrontZ + 0.05))
    for (const sx of [-1, 1] as const) {
      accent.push(bevelBox(0.12, 0.4, crd * 2 - 1.2, 0.014)
        .translate(sx * (fasciaHalfW + 0.05), fasciaY, crz))
    }

    // --- corner legs: stair core on +X, riser blade on -X ------------------
    structure.push(bevelBox(coreHalfX * 2, coreTop, coreHalfZ * 2, 0.03)
      .translate(coreX, coreTop / 2, coreZ))
    precast.push(bevelBox(coreHalfX * 2 + 0.34, 0.32, coreHalfZ * 2 + 0.34, 0.02)
      .translate(coreX, coreTop + 0.16, coreZ))
    structure.push(bevelBox(legHalfX * 2, legTop, legHalfZ * 2, 0.03)
      .translate(legX, legTop / 2, legZ))
    precast.push(bevelBox(legHalfX * 2 + 0.34, 0.32, legHalfZ * 2 + 0.34, 0.02)
      .translate(legX, legTop + 0.16, legZ))

    const slotBot = apronTop + 2.2
    const slotTop = coreTop - 1.3
    glass.push(bevelBox(0.09, slotTop - slotBot, 0.64, 0.01)
      .translate(legOuterX - 0.02, (slotBot + slotTop) / 2, coreZ + 0.55))
    for (let i = 0; i < 7; i++) {
      trim.push(bevelBox(0.16, 0.11, coreHalfZ * 2 - 0.3, 0.012)
        .translate(legOuterX - 0.05, slotBot + (i / 6) * (slotTop - slotBot), coreZ))
    }
    const legSlotTop = legTop - 1.3
    glass.push(bevelBox(0.09, legSlotTop - slotBot, 0.64, 0.01)
      .translate(-(legOuterX - 0.02), (slotBot + legSlotTop) / 2, legZ - 0.7))
    for (let i = 0; i < 7; i++) {
      trim.push(bevelBox(0.16, 0.11, legHalfZ * 2 - 0.3, 0.012)
        .translate(-(legOuterX - 0.05), slotBot + (i / 6) * (legSlotTop - slotBot), legZ))
    }
    // Light band across each leg's exposed end face, so the pair is read as the
    // same element from either side of the tower.
    precast.push(bevelBox(legHalfX * 2 - 0.4, 0.34, 0.14, 0.014)
      .translate(legX, legTop - 0.62, legZ + legHalfZ + 0.05))
    precast.push(bevelBox(coreHalfX * 2 - 0.4, 0.34, 0.14, 0.014)
      .translate(coreX, coreTop - 0.62, coreZ + coreHalfZ + 0.05))

    // --- roof deck: slab, parapet, plant, dishes, masts, camera pods -------
    const roofY = h + 0.3
    const pw = crw + 0.3
    const pd = crd + 0.1
    roofPlate.push(bevelBox(crw * 2 + 0.6, 0.3, crd * 2 + 0.2, 0.02).translate(0, h + 0.15, crz))
    for (const sz of [-1, 1] as const) {
      roofPlate.push(bevelBox(pw * 2, 0.4, 0.16, 0.014).translate(0, roofY + 0.2, crz + sz * pd))
    }
    for (const sx of [-1, 1] as const) {
      roofPlate.push(bevelBox(0.16, 0.4, pd * 2, 0.014).translate(sx * pw, roofY + 0.2, crz))
    }

    const plantBoxes = [
      { x: -2.3, z: crz - 1.4, sx: 2.4, sy: 1.15, sz: 1.9 },
      { x: 1.5, z: crz - 2.4, sx: 2.0, sy: 0.85, sz: 1.5 },
    ] as const
    for (const box of plantBoxes) {
      roofPlate.push(bevelBox(box.sx, box.sy, box.sz, 0.02)
        .translate(box.x, roofY + box.sy / 2, box.z))
      const louvres = Math.max(2, Math.round(box.sy / 0.26))
      for (let i = 0; i < louvres; i++) {
        roofTrim.push(bevelBox(box.sx - 0.24, 0.07, box.sz + 0.06, 0.01)
          .translate(box.x, roofY + 0.2 + i * 0.26, box.z))
      }
    }
    for (const dx of [-0.7, 0.7] as const) {
      roofTrim.push(bevelRing(0.24, 0.36, 0.1, 0.014, 20)
        .rotateX(-Math.PI / 2)
        .translate(-2.3 + dx, roofY + 1.2, crz - 1.4))
    }
    for (const sx of [-1, 1] as const) {
      roofPlate.push(bevelBox(0.44, 0.34, 0.5, 0.02)
        .translate(sx * 3.6, roofY + 0.66, crz + pd + 0.17))
      roofTrim.push(new CylinderGeometry(0.1, 0.12, 0.3, 12)
        .rotateX(Math.PI / 2)
        .translate(sx * 3.6, roofY + 0.66, crz + pd + 0.45))
      roofTrim.push(member(
        new Vector3(sx * 3.6, roofY + 0.5, crz + pd + 0.17),
        new Vector3(sx * 3.6, roofY + 0.03, crz + pd - 0.1),
        0.03, 6,
      ))
    }

    for (const [x, z, tilt] of [[-4.1, crz + 2.4, -0.85], [3.6, crz + 1.4, -1.0]] as const) {
      dishes.push(bevelDisc(0.62, 0.07, 0.012, 18).rotateX(tilt).translate(x, roofY + 1.05, z))
      dishes.push(new CylinderGeometry(0.035, 0.05, 0.72, 8).translate(x, roofY + 0.36, z))
      dishes.push(member(
        new Vector3(x, roofY + 1.05, z),
        new Vector3(x, roofY + 1.1, z + 0.44),
        0.022, 6,
      ))
    }

    for (const [x, z, len] of [
      [-1.1, crz + 2.9, 2.0], [0.6, crz + 3.0, 1.5], [-3.2, crz - 2.6, 2.4],
    ] as const) {
      antennas.push(new CylinderGeometry(0.02, 0.03, len, 8).translate(x, roofY + len / 2, z))
    }
    antennas.push(new CylinderGeometry(0.016, 0.045, 3.0, 8).translate(coreX, coreTop + 1.9, coreZ))
    for (let i = 0; i < 3; i++) {
      antennas.push(bevelRing(0.1, 0.16, 0.05, 0.012, 14)
        .rotateX(-Math.PI / 2)
        .translate(coreX, coreTop + 0.95 + i * 0.7, coreZ))
    }
    antennas.push(new CylinderGeometry(0.015, 0.04, 2.1, 8).translate(legX, legTop + 1.42, legZ))
    for (let i = 0; i < 2; i++) {
      antennas.push(bevelRing(0.1, 0.16, 0.05, 0.012, 14)
        .rotateX(-Math.PI / 2)
        .translate(legX, legTop + 0.9 + i * 0.62, legZ))
    }

    // --- signage: core banner and entrance plate ---------------------------
    const tex = marshalPlateTexture('RC')
    textures.push(tex)
    const signMat = new MeshStandardMaterial({
      name: 'f1-kit / race control plate',
      map: tex,
      roughness: 0.5,
      metalness: 0.05,
    })
    extras.push(signMat)

    structure.push(bevelBox(0.1, 1.84, 2.64, 0.012)
      .translate(legOuterX - 0.04, h * 0.8, coreZ + 0.1))
    const coreSign = new PlaneGeometry(2.4, 1.6)
    coreSign.rotateY(Math.PI / 2)
    coreSign.translate(legOuterX + 0.02 + LAYER_CLEARANCE * 4, h * 0.8, coreZ + 0.1)
    emit('tower', coreSign, tower, 'sign-core', signMat)

    structure.push(bevelBox(1.9, 1.32, 0.1, 0.012).translate(1.1, plinthTop - 1.24, d / 2 + 0.04))
    const entranceSign = new PlaneGeometry(1.7, 1.13)
    entranceSign.translate(1.1, plinthTop - 1.24, d / 2 + 0.09 + LAYER_CLEARANCE * 4)
    emit('tower', entranceSign, tower, 'sign', signMat)

    emit('tower', mergeParts(structure, 'structure'), tower, 'structure', kit.graphite)
    emit('tower', mergeParts(precast, 'cladding'), tower, 'cladding', precastMat)
    emit('tower', mergeParts(spandrel, 'spandrels'), tower, 'spandrels', spandrelMat)
    emit('tower', mergeParts(glass, 'glazing'), tower, 'glazing', glassMat)
    emit('tower', mergeParts(trim, 'mullions'), tower, 'mullions', kit.steel)
    emit('tower', mergeParts(accent, 'identity-band'), tower, 'identity-band', kit.cobalt)
    emit('deck', mergeParts(roofPlate, 'roof'), deck, 'roof', precastMat)
    emit('deck', mergeParts(roofTrim, 'plant'), deck, 'plant', kit.steel)
    emit('deck', mergeParts(dishes, 'dishes'), deck, 'dishes', kit.steel)
    emit('deck', mergeParts(antennas, 'antennas'), deck, 'antennas', kit.steel)
  }
  rebuild()

  return {
    root,
    parts: { tower, deck },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.height !== undefined) config.height = Math.max(8, patch.height)
      rebuild()
    },
    setMaterial(slot, material) {
      materialSlots[slot] = material
      for (const mesh of meshesBySlot[slot]) mesh.material = material
    },
    update: () => {},
    dispose() {
      releaseGenerated()
      for (const material of extras) material.dispose()
      disposeF1Materials(bundle)
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  return createF1Preview(createModel(), {
    aspect,
    target: [0, 7.8, 0],
    distance: 40,
    fov: 30,
    yaw: 0.72,
    pitch: 0.2,
    ground: true,
  })
}
