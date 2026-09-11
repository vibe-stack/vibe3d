// f1-garage-box — one F1 pit garage bay (7 m pitch, 20 m deep, 3.3 × 3.0 m door). The bay is a thick
// structure, not a printed elevation: chunky front piers, a fascia beam that cantilevers 0.7 m over the
// pit lane on a dark soffit, a coiled-shutter barrel behind the reveal, guide tracks, a coped roof edge,
// and a cast plinth that steps down over a threshold nosing onto a drained apron.
//
// The white is a value ramp, not one flat coat: fascia face, coping, applied faces, column return,
// flank, roof deck and soffit lining are each the shell colour moved along its own ramp with `shade`,
// so the thickness of every mass reads in light instead of only in silhouette.
//
// Fascia is procedural: pass `number` / `legend` / `style` to stamp a built-in plate, or
// `setMaterial('fascia', yours)` to hang an image. `count` tiles boxes along X at GARAGE_BAY_PITCH —
// bays occupy the full pitch, so neighbours share a pier and the run reads as one continuous facade.

import {
  BufferGeometry,
  DataTexture,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  type Material,
} from 'three/webgpu'

import {
  AXIS_X,
  FACE_CLEARANCE,
  GARAGE,
  GARAGE_BAY_PITCH,
  LAYER_CLEARANCE,
  TOKEN,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  fasciaTexture,
  isFasciaStyle,
  mergeParts,
  shade,
  tubeSection,
  type FasciaStyle,
} from '../f1-kit-core/index.ts'

type Slot = 'shell' | 'shutter' | 'fascia' | 'floor' | 'trim' | 'glass'

export interface F1GarageBoxConfig {
  count: number
  /** Starting bay number (stamped). String so 'P1' works. */
  number: string
  /** Secondary fascia legend. Empty = number only. */
  legend: string
  /** Built-in plate. Ignored after `setMaterial('fascia', …)`. */
  style: FasciaStyle
  /** How many bays, from the first, have the shutter raised. */
  open: number
  /**
   * Storeys, ground up: 1 = today's garage box (roof deck, nothing above). 2-3 add glazed Paddock Club
   * levels — a mullioned curtain wall, a pit-lane terrace with a guard rail, and a red leading-edge
   * fascia band under each terrace. The top storey caps with a flat roof slab and parapet.
   * estimate:official-max-height (Madring pit building, 18.5 m official max at floors:3).
   */
  floors: number
  /**
   * A glazed entry tower, one bay wide, at the model's -X end — rising two storeys above the top floor.
   * estimate:photo (S/F straight reference).
   */
  tower: boolean
}

export interface F1GarageBoxOptions extends Partial<F1GarageBoxConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1GarageBoxInstance {
  readonly root: Group
  readonly parts: { shell: Group; shutter: Group; fascia: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1GarageBoxConfig>
  configure(patch: Partial<F1GarageBoxConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1GarageBoxConfig = {
  count: 1, number: '11', legend: 'CHECO', style: 'stamp', open: 0, floors: 1, tower: false,
}

const BAY = GARAGE_BAY_PITCH
const D = GARAGE.depth
/** Roof level. The coping and roof plant are the only things allowed above it. */
const H = GARAGE.height
const FASCIA_H = GARAGE.fascia
/** Facade datum. In front of this is cantilever, behind it is reveal. */
const FRONT = D / 2

/** Clear shutter aperture width — the locked Yas-class door, and the datum the facade is set out from. */
const OPEN_W = GARAGE.door
/**
 * Half-pier each side of the aperture. A bay fills its whole pitch, so this falls out of the door
 * rather than being chosen: 3.3 m of opening in a 7 m module leaves a 3.7 m column shared by
 * neighbours.
 */
const PIER = (BAY - OPEN_W) / 2
/** Reveal joint splitting each pier face, which at 1.85 m is too wide for one sheet. */
const PANEL_JOINT = 0.06
/** Front columns are thickened; the party wall behind them stays thin. */
const PIER_D = 1.1
const PARTY_T = GARAGE.wall
/** The party wall is cast into the column it meets, rather than stopping dead on a coincident face. */
const WALL_BITE = 0.03
/** Piers stand this far proud of the facade; the fascia beam much further. */
const PROUD = 0.1
/** The plane every applied front detail is measured from. */
const PIER_FACE = FRONT + PROUD
const HEADER_D = 0.7
/** Aperture set back behind the facade, which is what gives the mouth its depth. */
const REVEAL = 0.32

const DECK_T = 0.16
const COPING_H = 0.14
const COPING_T = 0.24

/** Finished garage floor. The box stands on this as a cast plinth, not on a thin floor plate. */
const SLAB = 0.3
/** Step down from the plinth onto the apron. */
const LIP = 0.1
/** The apron ends under the coping drip line: the slab the overhang protects, not the pit lane. */
const APRON = 0.74
const APRON_T = SLAB - LIP
/** The apron is two pours with a drainage channel between them, so its edge is a read, not a line. */
const APRON_INNER = 0.42
const CHANNEL = 0.14
const APRON_OUTER = APRON - APRON_INNER - CHANNEL

const SOFFIT_T = 0.08
/** Radius of the rolled curtain. The housing is that barrel, so it shades as a cylinder, not a box. */
const HEAD_R = 0.28
/** Curtain head — the clear aperture height, and the datum the head assembly hangs from. */
const HEAD_Y = GARAGE.head
/** Barrel crown, tucked up into the soffit slot under the beam. */
const HEAD_TOP = HEAD_Y + HEAD_R * 2
/** Pushed out to the column line: a barrel hidden in the reveal is just more cavity. */
const HEAD_Z = FRONT - 0.26
const TRACK_W = 0.15
const RAIL_H = 0.16
/** Curtain rear face, tucked inside the reveal so the tracks read proud of it. */
const CURTAIN_Z = FRONT - REVEAL - 0.05
const LATH = 0.115
const LATH_GAP = 0.014

const FACE_Z = FRONT + HEADER_D
/** Where the hung soffit starts. In front of it the underside is lit lining, behind it a black slot. */
const SOFFIT_BACK = FACE_Z - 1.1
/** Stamp plate, at the 400 × 130 texture's aspect. A 0.9 m fascia only clears 0.52 m between bands. */
const PLATE_W = 1.48
const PLATE_H = 0.48

/**
 * Value bands, as offsets along each slot's own colour ramp.
 *
 * A pit garage really is painted one white, so a handful of hand-picked greys would be a lie and would
 * also drift the moment the shell token is retuned. Every band here is that same coat moved up or down
 * by {@link shade}, which is what separates the fascia bar from the column face from the roof deck
 * without the building turning into a patchwork.
 *
 * The steps are wide, and almost all of the range is downward, because `SHELL-200` is already close to
 * white: there is nowhere to go up, and a lit white surface tone-maps into a narrow band, so anything
 * under about a fifth of the ramp disappears in the render.
 */
const TONE = {
  /** Sign band: the plane the whole facade is composed around. */
  fascia: 0.22,
  /** Drip line, catching sky above everything else. */
  coping: 0,
  /** Painted barrel housing, kept bright so the machinery reads against the dark reveal. */
  hood: -0.12,
  /** Lit faces: column plates and flank pilasters. */
  relief: -0.18,
  /** Column body — the returns that give those faces their thickness. */
  pier: -0.38,
  /** Flanks and back, read as a plane behind the column line. */
  flank: -0.46,
  /** Roof membrane, not paint. */
  deck: -0.52,
  /** Cantilever underside: lit, but facing down. */
  soffit: -0.62,
  /** Metal threshold nosing. */
  nosing: -0.24,
  /** Cast plinth (from the floor slot). */
  plinth: 0.26,
  apron: 0.14,
  /** The apron's cast front edge. */
  kerb: 0.4,
  /** Bolted shutter hardware (from the trim slot). */
  hoodGear: 0.1,
} as const

/**
 * Upper-storey geometry — the Madring pit building (Paddock Club levels + entry tower, #915 CP5).
 *
 * `STOREY_H` is solved backward from the circuit's official envelope rather than chosen: garage roof +
 * two storeys + a roof slab lands at 18.5 m for `floors: 3`. estimate:official-max-height — there is no
 * measured section drawing to the millimetre, only the published max height and storey count.
 */
const MAX_HEIGHT = 18.5
const MAX_FLOORS = 3
/** Roof slab capping the top storey. */
const ROOF_SLAB_T = 0.3
const PARAPET_H = 0.45
const STOREY_H = (MAX_HEIGHT - H - ROOF_SLAB_T) / (MAX_FLOORS - 1)
/** Spandrel band top and bottom of each curtain wall, so the glass never runs slab-to-slab. */
const SPANDREL_T = 0.35
const MULLION_PITCH = BAY / 4
const MULLION_W = 0.09
const MULLION_D = 0.05
/** How far the terrace projects past the garage apron line — the catalogue tell in the render. estimate:photo. */
const TERRACE_D = 1.4
const TERRACE_T = 0.22
const GUARD_RAIL_H = 1.1
const BALUSTER_PITCH = 1.4
const BALUSTER_W = 0.05
/** Red leading-edge fascia band under each terrace. */
const TERRACE_FASCIA_H = 0.3
/**
 * Storeys the glazed entry tower rises above the top floor. estimate:photo — in the S/F straight
 * reference (f1com-YDRAY-foto-pit-building.webp) the tower at the building's start clears the main roof
 * line by about one storey, not two.
 */
const TOWER_EXTRA_STOREYS = 1

function bayNumber(start: string, offset: number): string {
  const n = Number.parseInt(start, 10)
  if (Number.isFinite(n)) return String(n + offset)
  return start
}

export function createModel(options: F1GarageBoxOptions = {}): F1GarageBoxInstance {
  const config: F1GarageBoxConfig = {
    count: Math.max(1, Math.round(options.count ?? defaults.count)),
    number: String(options.number ?? defaults.number).slice(0, 3),
    legend: String(options.legend ?? defaults.legend).slice(0, 8),
    style: options.style && isFasciaStyle(options.style) ? options.style : defaults.style,
    open: Math.max(0, Math.round(options.open ?? defaults.open)),
    floors: Math.min(MAX_FLOORS, Math.max(1, Math.round(options.floors ?? defaults.floors))),
    tower: Boolean(options.tower ?? defaults.tower),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const textures: DataTexture[] = []
  let ownsFascia = options.materials?.fascia === undefined
  // The kit has no shared "glass" token (Materials §glass is per-model, e.g. f1-team-motorhome): a
  // non-transmissive coat kept local here, same as that model's own glazing — never `transmission`,
  // which the host forbids for perf. RED_500 direct rather than the shared `kit.red` instance, which is
  // reserved for fire equipment, not a catalogue accent band.
  // Near-opaque dark curtain wall, not a see-through box: the reference (pit-building-render.png,
  // imagen-paddock.webp) reads as blue-black glass with the mullion grid as the only light lines and the
  // floor plates behind only faintly visible. estimate:render.
  const localGlass = new MeshStandardMaterial({
    name: 'f1-kit / garage glazing', color: 0x050a10, roughness: 0.05, metalness: 0.55,
    transparent: true, opacity: 0.9,
  })
  const terraceFasciaMat = new MeshStandardMaterial({
    name: 'f1-kit / garage terrace fascia', color: TOKEN.RED_500, roughness: 0.42, metalness: 0.04,
  })
  const ownedExtras: Material[] = options.materials?.glass === undefined
    ? [localGlass, terraceFasciaMat]
    : [terraceFasciaMat]
  const materialSlots: Record<Slot, Material> = {
    shell: options.materials?.shell ?? kit.shell,
    shutter: options.materials?.shutter ?? kit.slate,
    fascia: options.materials?.fascia ?? kit.shell,
    floor: options.materials?.floor ?? kit.graphite,
    trim: options.materials?.trim ?? kit.graphite,
    glass: options.materials?.glass ?? localGlass,
  }

  const root = new Group(); root.name = 'f1-garage-box'
  const shell = new Group(); shell.name = 'shell'
  const shutter = new Group(); shutter.name = 'shutter'
  const fascia = new Group(); fascia.name = 'fascia'
  root.add(shell, shutter, fascia)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = {
    shell: [], shutter: [], fascia: [], floor: [], trim: [], glass: [],
  }
  const bands = new Map<string, MeshStandardMaterial>()
  const bandedSlots = new Set<Slot>()

  /**
   * One value band of a slot's coat. Derived per rebuild and owned here; the slot's own material is
   * never touched, so a consumer override still drives the whole ramp (rule 16).
   */
  const tone = (slot: Slot, amount: number): Material => {
    const base = materialSlots[slot]
    if (!(base instanceof MeshStandardMaterial)) return base
    const key = `${slot}:${amount}`
    const cached = bands.get(key)
    if (cached) return cached
    const derived = base.clone()
    derived.name = `${base.name} ${amount > 0 ? '+' : ''}${amount}`
    derived.color.setHex(shade(base.color.getHex(), amount))
    bands.set(key, derived)
    bandedSlots.add(slot)
    return derived
  }

  const releaseOwnedFascia = (): void => {
    for (const texture of textures) texture.dispose()
    textures.length = 0
    for (const material of extras) material.dispose()
    extras.length = 0
  }

  const releaseGenerated = (): void => {
    shell.clear(); shutter.clear(); fascia.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const material of bands.values()) material.dispose()
    bands.clear()
    bandedSlots.clear()
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
    if (ownsFascia) releaseOwnedFascia()
  }

  const emit = (slot: Slot, geometry: BufferGeometry, group: Group, name: string, material?: Material): void => {
    generated.push(geometry)
    const mesh = new Mesh(geometry, material ?? materialSlots[slot])
    mesh.name = name
    mesh.userData.topologyRole = name.startsWith('shutter') || name.startsWith('fascia') || name.includes('gear') || name.includes('trim') || name.includes('relief') || name.includes('coping') || name.includes('soffit') || name.includes('threshold') || name.includes('head-box') ? 'detail' : 'hull'
    mesh.castShadow = true
    mesh.receiveShadow = true
    meshesBySlot[slot].push(mesh)
    group.add(mesh)
  }

  const rebuild = (): void => {
    releaseGenerated()
    const count = config.count
    config.open = Math.min(config.open, count)
    const span = count * BAY
    const pierZ = FRONT + PROUD - PIER_D / 2
    const partyLen = FRONT + pierZ - PIER_D / 2 + WALL_BITE
    const barrelY = HEAD_Y + HEAD_R

    for (let i = 0; i < count; i++) {
      const x = -span / 2 + (i + 0.5) * BAY
      const raised = i < config.open

      // The box stands on a cast plinth rather than a floor plate, and the apron is a separate pour a
      // lip lower, so the base of the facade is a volume with a lit edge and a shadowed step.
      const plinth = bevelBox(BAY, SLAB, D, 0.02)
      plinth.translate(x, SLAB / 2, 0)
      emit('floor', plinth, shell, `plinth-${i}`, tone('floor', TONE.plinth))

      const innerApron = bevelBox(BAY, APRON_T, APRON_INNER, 0.016)
      innerApron.translate(x, APRON_T / 2, FRONT + APRON_INNER / 2)
      const outerApron = bevelBox(BAY, APRON_T, APRON_OUTER, 0.016)
      outerApron.translate(x, APRON_T / 2, FRONT + APRON - APRON_OUTER / 2)
      emit('floor', mergeParts([innerApron, outerApron], `apron-${i}`), shell, `apron-${i}`,
        tone('floor', TONE.apron))

      const kerb = bevelBox(BAY, APRON_T, 0.04, 0.012)
      kerb.translate(x, APRON_T / 2, FRONT + APRON + 0.02 - FACE_CLEARANCE)
      emit('floor', kerb, shell, `kerb-${i}`, tone('floor', TONE.kerb))

      // Dark topping inside the building, so the plinth reads as concrete only where it is outdoors.
      const toppingLen = D - 0.58
      const topping = bevelBox(BAY - PARTY_T * 2, 0.04, toppingLen, 0.01)
      topping.translate(x, SLAB, -FRONT + PARTY_T + toppingLen / 2)
      emit('floor', topping, shell, `floor-${i}`)

      // Front columns, graded rather than mirrored. Body and applied face are separate value bands: the
      // face takes the key, the return falls away, and the column stops being a flat white strip.
      const piers: BufferGeometry[] = []
      const leftPier = bevelBox(PIER, H, PIER_D, 0.022)
      leftPier.translate(x - BAY / 2 + PIER / 2, H / 2, pierZ)
      piers.push(leftPier)
      const rightPier = bevelBox(PIER, H, PIER_D, 0.016)
      rightPier.translate(x + BAY / 2 - PIER / 2, H / 2, pierZ)
      piers.push(rightPier)
      emit('shell', mergeParts(piers, `piers-${i}`), shell, `piers-${i}`, tone('shell', TONE.pier))

      const reliefs: BufferGeometry[] = []
      const faceBase = SLAB + 0.12
      const faceH = H - FASCIA_H - 0.1 - faceBase
      for (const [side, margin] of [[-1, 0.05], [1, 0.07]] as const) {
        const faceW = PIER - margin * 2
        const panelW = (faceW - PANEL_JOINT) / 2
        for (const half of [-1, 1] as const) {
          const plate = bevelBox(panelW, faceH, 0.035, 0.008)
          plate.translate(x + side * (BAY / 2 - PIER / 2) + half * (panelW + PANEL_JOINT) / 2,
            faceBase + faceH / 2, PIER_FACE + 0.035 / 2 - FACE_CLEARANCE)
          reliefs.push(plate)
        }
      }
      // Pilasters on the outer face of the party wall. Buried by the neighbour mid-run; at the end of a
      // run they are what stops a 20 m flank reading as one blank sheet — so they carry the face value.
      for (const side of [-1, 1] as const) {
        for (const rz of [-8.3, -4.8, -1.2, 2.5, 6.1]) {
          const rib = bevelBox(0.09, H - 0.28, 0.55, 0.014)
          rib.translate(x + side * (BAY / 2 + 0.035), (H - 0.28) / 2, rz)
          reliefs.push(rib)
        }
      }
      emit('shell', mergeParts(reliefs, `reliefs-${i}`), shell, `reliefs-${i}`,
        tone('shell', TONE.relief))

      const flanks: BufferGeometry[] = []
      for (const side of [-1, 1] as const) {
        const party = bevelBox(PARTY_T, H, partyLen, 0.012)
        party.translate(x + side * (BAY / 2 - PARTY_T / 2), H / 2, -FRONT + partyLen / 2)
        flanks.push(party)
      }
      const back = bevelBox(BAY, H, PARTY_T, 0.012)
      back.translate(x, H / 2, -FRONT + PARTY_T / 2)
      flanks.push(back)
      emit('shell', mergeParts(flanks, `flanks-${i}`), shell, `flanks-${i}`, tone('shell', TONE.flank))

      // The landmark: a deep fascia beam cantilevered over the apron, carried back through the reveal.
      // It is the brightest plane on the building, which is what pulls it off the columns behind it.
      const headerLen = HEADER_D + REVEAL + 0.55
      const header = bevelBox(BAY, FASCIA_H, headerLen, 0.024)
      header.translate(x, H - FASCIA_H / 2, FACE_Z - headerLen / 2)
      emit('shell', header, shell, `fascia-beam-${i}`, tone('shell', TONE.fascia))

      // Roof deck is a grey membrane under a white coping, so the top of the box is two bands and the
      // parapet has a thickness of its own.
      const deckLen = D + PROUD
      const deck = bevelBox(BAY, DECK_T, deckLen, 0.012)
      deck.translate(x, H - DECK_T / 2, -FRONT + deckLen / 2)
      emit('shell', deck, shell, `deck-${i}`, tone('shell', TONE.deck))

      // Coping runs the whole roof edge and overhangs it, so the top of the facade is a drip line
      // rather than the cut edge of a slab.
      const coping: BufferGeometry[] = []
      const frontCoping = bevelBox(BAY, COPING_H, COPING_T + 0.12, 0.014)
      frontCoping.translate(x, H + COPING_H / 2, FACE_Z + 0.06 - (COPING_T + 0.12) / 2)
      coping.push(frontCoping)
      const flankLen = FRONT + FACE_Z
      for (const side of [-1, 1] as const) {
        const flankCoping = bevelBox(COPING_T, COPING_H, flankLen, 0.014)
        flankCoping.translate(x + side * (BAY / 2 - COPING_T / 2 + 0.03), H + COPING_H / 2, -FRONT + flankLen / 2)
        coping.push(flankCoping)
      }
      const rearCoping = bevelBox(BAY, COPING_H, COPING_T, 0.014)
      rearCoping.translate(x, H + COPING_H / 2, -FRONT + COPING_T / 2 - 0.03)
      coping.push(rearCoping)
      emit('shell', mergeParts(coping, `coping-${i}`), shell, `coping-${i}`, tone('shell', TONE.coping))

      // Everything in front of the columns is lit lining; only the slot behind them is a black recess.
      // Two bands under one beam is what makes the cantilever read as thick from below.
      const liningLen = FACE_Z - 0.04 - PIER_FACE
      const lining = bevelBox(BAY - 0.26, SOFFIT_T, liningLen, 0.01)
      lining.translate(x, H - FASCIA_H - 0.04, PIER_FACE + liningLen / 2)
      emit('shell', lining, shell, `soffit-lining-${i}`, tone('shell', TONE.soffit))

      // Metal threshold: a nosing capping the plinth arris, plus the plate down the step face. This is
      // the catch a car crosses, and the hard edge that stops the base looking like paper.
      const nosing: BufferGeometry[] = []
      const nosingW = OPEN_W + PIER * 0.6
      const cap = bevelBox(nosingW, 0.05, 0.18, 0.012)
      cap.translate(x, SLAB + 0.015, FRONT - 0.09)
      nosing.push(cap)
      const stepFace = bevelBox(nosingW, LIP + 0.06, 0.035, 0.01)
      stepFace.translate(x, SLAB - LIP / 2, FRONT + 0.035 / 2 - FACE_CLEARANCE)
      nosing.push(stepFace)
      emit('shell', mergeParts(nosing, `threshold-${i}`), shell, `threshold-${i}`,
        tone('shell', TONE.nosing))

      const trim: BufferGeometry[] = []

      // Dark soffit slot behind the columns, inset so its edge throws a shadow line along the run.
      const recessLen = PIER_FACE - SOFFIT_BACK
      const recess = bevelBox(BAY - 0.26, SOFFIT_T, recessLen, 0.01)
      recess.translate(x, H - FASCIA_H - 0.04, PIER_FACE - recessLen / 2)
      trim.push(recess)

      // Drip rail and top band bracket the fascia field; battens break it into panels.
      for (const [bandY, bandH] of [[H - FASCIA_H + 0.13, 0.11], [H - 0.13, 0.13]] as const) {
        const band = bevelBox(BAY, bandH, 0.07, 0.012)
        band.translate(x, bandY, FACE_Z + 0.035 - FACE_CLEARANCE)
        trim.push(band)
      }
      for (const bx of [-BAY / 2 + 0.1, -1.86, 2.02, BAY / 2 - 0.1]) {
        const batten = bevelBox(0.11, FASCIA_H - 0.4, 0.06, 0.01)
        batten.translate(x + bx, H - FASCIA_H / 2, FACE_Z + 0.03 - FACE_CLEARANCE)
        trim.push(batten)
      }

      // Seal channel on the door line, and the apron's drain slot between its two pours.
      const seal = bevelBox(OPEN_W + 0.1, 0.05, 0.2, 0.01)
      seal.translate(x, SLAB + 0.005, CURTAIN_Z + 0.01)
      trim.push(seal)
      const grate = bevelBox(BAY, 0.06, CHANNEL, 0.008)
      grate.translate(x, APRON_T - 0.06, FRONT + APRON_INNER + CHANNEL / 2)
      trim.push(grate)

      // Low roof plant, offset per bay so a long run does not repeat perfectly.
      const duct = bevelBox(BAY - 0.7, 0.3, 0.42, 0.02)
      duct.translate(x, H + 0.15, -4.1)
      trim.push(duct)
      const plant = bevelBox(1.5, 0.38, 1.15, 0.024)
      plant.translate(x + (i % 2 === 0 ? -0.5 : 0.7), H + 0.19, i % 2 === 0 ? 2.2 : 5.1)
      trim.push(plant)

      if (raised) {
        // An open mouth has to look into a lined room, not a white void.
        const linerH = HEAD_Y + 0.4 - SLAB
        const liner = bevelBox(BAY - PARTY_T * 2, linerH, 0.06, 0.01)
        liner.translate(x, SLAB + linerH / 2, -FRONT + PARTY_T + 0.04)
        trim.push(liner)
      }

      emit('trim', mergeParts(trim, `trim-${i}`), shell, `trim-${i}`)

      // Head gear belongs to the shutter whether or not the curtain is down. The housing is the barrel
      // itself, pushed out to the column line and hung just under the beam soffit: a cylinder shades
      // bright over dark on its own, which is what makes it read as a machine bolted above the door
      // rather than as more cavity.
      const barrel: BufferGeometry[] = []
      barrel.push(tubeSection(HEAD_R, OPEN_W + 0.16, [x, barrelY, HEAD_Z], AXIS_X, 24))
      const backing = bevelBox(OPEN_W + 0.16, HEAD_R * 2, 0.3, 0.014)
      backing.translate(x, barrelY, HEAD_Z - HEAD_R - 0.05)
      barrel.push(backing)
      emit('shell', mergeParts(barrel, `head-box-${i}`), shutter, `head-box-${i}`,
        tone('shell', TONE.hood))

      const gear: BufferGeometry[] = []
      // Bearing plates cap the barrel; the straps between them are what stop it reading as a pipe.
      for (const side of [-1, 1] as const) {
        const bearing = bevelBox(0.1, HEAD_R * 2 + 0.04, HEAD_R * 2 + 0.04, 0.012)
        bearing.translate(x + side * (OPEN_W / 2 - 0.02), barrelY, HEAD_Z)
        gear.push(bearing)
      }
      for (const ox of [-1.28, -0.42, 0.46, 1.24]) {
        gear.push(tubeSection(HEAD_R + 0.022, 0.07, [x + ox, barrelY, HEAD_Z], AXIS_X, 24))
      }
      // Drive end: a gearbox hanging below the barrel line, with its shaft running back to the wall.
      const motor = bevelBox(0.34, 0.32, 0.34, 0.02)
      motor.translate(x + OPEN_W / 2 - 0.36, HEAD_Y + 0.04, HEAD_Z - 0.2)
      gear.push(motor)
      gear.push(tubeSection(0.05, 0.5, [x + OPEN_W / 2 - 0.66, HEAD_Y + 0.04, HEAD_Z - 0.2], AXIS_X, 12))
      const trackH = HEAD_TOP - 0.08 - SLAB
      for (const side of [-1, 1] as const) {
        const track = bevelBox(TRACK_W, trackH, 0.22, 0.014)
        track.translate(x + side * (OPEN_W / 2 - TRACK_W / 2 + 0.03), SLAB + trackH / 2, CURTAIN_Z - 0.01)
        gear.push(track)
      }
      emit('trim', mergeParts(gear, `shutter-gear-${i}`), shutter, `shutter-gear-${i}`,
        tone('trim', TONE.hoodGear))

      if (raised) {
        const stowed = bevelBox(OPEN_W - 0.12, 0.15, 0.09, 0.016)
        stowed.translate(x, HEAD_Y - 0.24, CURTAIN_Z + 0.02)
        emit('shutter', stowed, shutter, `shutter-${i}`)
      } else {
        // Laths at their own physical pitch with a real joint between them, so the curtain reads as a
        // rolling door rather than a tinted panel.
        const curtain: BufferGeometry[] = []
        const rail = bevelBox(OPEN_W - 0.1, RAIL_H, 0.11, 0.018)
        rail.translate(x, SLAB + RAIL_H / 2, CURTAIN_Z + 0.025)
        curtain.push(rail)
        const stackH = HEAD_Y - SLAB - RAIL_H
        const laths = Math.max(4, Math.round(stackH / LATH))
        const pitch = stackH / laths
        for (let s = 0; s < laths; s++) {
          const lath = bevelBox(OPEN_W - 0.12, pitch - LATH_GAP, 0.055, 0.013)
          lath.translate(x, SLAB + RAIL_H + (s + 0.5) * pitch, CURTAIN_Z)
          curtain.push(lath)
        }
        emit('shutter', mergeParts(curtain, `shutter-${i}`), shutter, `shutter-${i}`)
      }

      const plate = new PlaneGeometry(PLATE_W, PLATE_H)
      plate.translate(x, H - FASCIA_H / 2, FACE_Z + LAYER_CLEARANCE * 3)
      if (ownsFascia) {
        const tex = fasciaTexture({
          number: bayNumber(config.number, i),
          legend: config.legend,
          style: config.style,
          width: 400,
          height: 130,
        })
        textures.push(tex)
        const mat = new MeshStandardMaterial({
          name: `f1-kit / garage fascia ${i}`,
          map: tex,
          roughness: 0.55,
          metalness: 0.05,
        })
        extras.push(mat)
        emit('fascia', plate, fascia, `fascia-${i}`, mat)
      } else {
        emit('fascia', plate, fascia, `fascia-${i}`)
      }
    }

    // Paddock Club levels: glazed storeys stacked above the garage roof, each the full run wide and the
    // garage's own depth. `floors: 1` (today's box) takes none of this — the block never runs.
    if (config.floors > 1) {
      const upperCount = config.floors - 1
      for (let s = 0; s < upperCount; s++) {
        const y0 = H + s * STOREY_H
        const isTop = s === upperCount - 1

        // Spandrel at the storey's own floor line — the same read as the ground plinth, so the stack
        // looks poured rather than stacked on.
        const slab = bevelBox(span, SPANDREL_T, D, 0.02)
        slab.translate(0, y0 + SPANDREL_T / 2, 0)
        emit('shell', slab, shell, `floor-slab-${s}`, tone('shell', TONE.flank))

        // Full-depth floor plate at the storey's head — the garage's own depth, read as a thin deck
        // rather than a solid mass that would sit behind the glass and hide it.
        const plateT = DECK_T
        const plate = bevelBox(span, plateT, D, 0.02)
        plate.translate(0, y0 + STOREY_H - plateT / 2, 0)
        emit('shell', plate, shell, `floor-plate-${s}`, tone('shell', TONE.deck))

        // Curtain wall: a mullion grid framing glass infill on the pit-lane face.
        const glazeH = STOREY_H - SPANDREL_T * 2
        const glazeY = y0 + SPANDREL_T + glazeH / 2
        const paneZ = FRONT - 0.02
        const pane = bevelBox(span - MULLION_W, glazeH - MULLION_W, 0.03, 0.006)
        pane.translate(0, glazeY, paneZ)
        emit('glass', pane, shell, `floor-glazing-${s}`)

        const divisions = Math.max(1, Math.round(span / MULLION_PITCH))
        const pitch = span / divisions
        const mullions: BufferGeometry[] = []
        for (let m = 0; m <= divisions; m++) {
          const mx = -span / 2 + m * pitch
          const mullion = bevelBox(MULLION_W, glazeH, MULLION_D, 0.01)
          mullion.translate(mx, glazeY, FRONT - MULLION_D / 2)
          mullions.push(mullion)
        }
        const transom = bevelBox(span, MULLION_W, MULLION_D, 0.01)
        transom.translate(0, glazeY, FRONT - MULLION_D / 2)
        mullions.push(transom)
        emit('trim', mergeParts(mullions, `floor-mullions-${s}`), shell, `floor-mullions-${s}`, kit.graphite)

        // Continuous terrace at the storey's floor line, with a glazed guard rail on its outer edge and
        // the red leading-edge fascia band under it — the catalogue tell in the render.
        const terrace = bevelBox(span, TERRACE_T, TERRACE_D, 0.02)
        terrace.translate(0, y0 - TERRACE_T / 2, FRONT + TERRACE_D / 2)
        emit('floor', terrace, shell, `terrace-${s}`, tone('floor', TONE.apron))

        const railZ = FRONT + TERRACE_D - 0.03
        const railParts: BufferGeometry[] = []
        const topRail = bevelBox(span, 0.05, 0.06, 0.012)
        topRail.translate(0, y0 + GUARD_RAIL_H, railZ)
        railParts.push(topRail)
        const postDivisions = Math.max(2, Math.round(span / BALUSTER_PITCH))
        const postPitch = span / postDivisions
        for (let p = 0; p <= postDivisions; p++) {
          const px = -span / 2 + p * postPitch
          const post = bevelBox(BALUSTER_W, GUARD_RAIL_H, BALUSTER_W, 0.008)
          post.translate(px, y0 + GUARD_RAIL_H / 2, railZ)
          railParts.push(post)
        }
        emit('trim', mergeParts(railParts, `terrace-rail-${s}`), shell, `terrace-rail-${s}`, kit.graphite)

        const railGlass = bevelBox(span - BALUSTER_W, GUARD_RAIL_H - 0.15, 0.02, 0.004)
        railGlass.translate(0, y0 + GUARD_RAIL_H / 2, railZ - 0.02)
        emit('glass', railGlass, shell, `terrace-rail-glass-${s}`)

        const fasciaBand = bevelBox(span, TERRACE_FASCIA_H, 0.08, 0.012)
        fasciaBand.translate(0, y0 - TERRACE_T - TERRACE_FASCIA_H / 2, FRONT + TERRACE_D - 0.05)
        emit('trim', fasciaBand, shell, `terrace-fascia-${s}`, terraceFasciaMat)

        if (isTop) {
          // Flat roof slab and a shallow parapet cap the stack.
          const roofY = y0 + STOREY_H
          const roofSlab = bevelBox(span, ROOF_SLAB_T, D, 0.02)
          roofSlab.translate(0, roofY + ROOF_SLAB_T / 2, 0)
          emit('shell', roofSlab, shell, 'floors-roof-slab', tone('shell', TONE.deck))

          const parapetParts: BufferGeometry[] = []
          for (const sz of [-1, 1] as const) {
            const edge = bevelBox(span, PARAPET_H, 0.12, 0.012)
            edge.translate(0, roofY + ROOF_SLAB_T + PARAPET_H / 2, sz * (FRONT - 0.06))
            parapetParts.push(edge)
          }
          for (const side of [-1, 1] as const) {
            const flank = bevelBox(0.12, PARAPET_H, D, 0.012)
            flank.translate(side * (span / 2 - 0.06), roofY + ROOF_SLAB_T + PARAPET_H / 2, 0)
            parapetParts.push(flank)
          }
          emit('shell', mergeParts(parapetParts, 'floors-parapet'), shell, 'floors-parapet',
            tone('shell', TONE.coping))
        }
      }
    }

    // Glass entry tower — one bay wide at the model's -X end, rising two storeys above the top floor.
    if (config.tower) {
      const towerX = -span / 2 - BAY / 2
      const towerBaseY = SLAB
      const towerTopFloorY = H + Math.max(0, config.floors - 1) * STOREY_H
      const towerTopY = towerTopFloorY + TOWER_EXTRA_STOREYS * STOREY_H
      const towerH = towerTopY - towerBaseY
      const towerHalfW = BAY / 2 - 0.08
      const towerHalfD = D / 2 - 0.08

      const towerPlinth = bevelBox(BAY, SLAB, D, 0.02)
      towerPlinth.translate(towerX, SLAB / 2, 0)
      emit('floor', towerPlinth, shell, 'tower-plinth', tone('floor', TONE.plinth))

      // Four corner posts carry the load; everything between them is glass.
      const posts: BufferGeometry[] = []
      for (const sx of [-1, 1] as const) {
        for (const sz of [-1, 1] as const) {
          const post = bevelBox(0.16, towerH, 0.16, 0.02)
          post.translate(towerX + sx * towerHalfW, towerBaseY + towerH / 2, sz * towerHalfD)
          posts.push(post)
        }
      }
      emit('shell', mergeParts(posts, 'tower-posts'), shell, 'tower-posts', tone('shell', TONE.pier))

      // Storey-height transom bands tie the tower's glazing rhythm to the podium below it.
      const towerStoreys = Math.max(1, Math.round(towerH / STOREY_H))
      const towerStoreyH = towerH / towerStoreys
      const bands: BufferGeometry[] = []
      for (let t = 0; t <= towerStoreys; t++) {
        const band = bevelBox(BAY, MULLION_W, D, 0.01)
        band.translate(towerX, towerBaseY + t * towerStoreyH, 0)
        bands.push(band)
      }
      emit('trim', mergeParts(bands, 'tower-bands'), shell, 'tower-bands', kit.graphite)

      const panes: BufferGeometry[] = []
      for (let t = 0; t < towerStoreys; t++) {
        const centreY = towerBaseY + (t + 0.5) * towerStoreyH
        const paneH = towerStoreyH - MULLION_W * 1.5
        for (const sz of [-1, 1] as const) {
          const facePane = bevelBox(BAY - MULLION_W * 2, paneH, 0.03, 0.006)
          facePane.translate(towerX, centreY, sz * towerHalfD)
          panes.push(facePane)
        }
        for (const sx of [-1, 1] as const) {
          const sidePane = bevelBox(0.03, paneH, D - MULLION_W * 2, 0.006)
          sidePane.translate(towerX + sx * towerHalfW, centreY, 0)
          panes.push(sidePane)
        }
      }
      emit('glass', mergeParts(panes, 'tower-glazing'), shell, 'tower-glazing')

      const towerRoof = bevelBox(BAY, ROOF_SLAB_T, D, 0.02)
      towerRoof.translate(towerX, towerBaseY + towerH + ROOF_SLAB_T / 2, 0)
      emit('shell', towerRoof, shell, 'tower-roof', tone('shell', TONE.deck))

      const towerParapet: BufferGeometry[] = []
      for (const sz of [-1, 1] as const) {
        const edge = bevelBox(BAY, PARAPET_H, 0.1, 0.012)
        edge.translate(towerX, towerBaseY + towerH + ROOF_SLAB_T + PARAPET_H / 2, sz * (towerHalfD - 0.05))
        towerParapet.push(edge)
      }
      emit('shell', mergeParts(towerParapet, 'tower-parapet'), shell, 'tower-parapet',
        tone('shell', TONE.coping))
    }
  }
  rebuild()

  return {
    root,
    parts: { shell, shutter, fascia },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.count !== undefined) config.count = Math.max(1, Math.round(patch.count))
      if (patch.number !== undefined) config.number = String(patch.number).slice(0, 3)
      if (patch.legend !== undefined) config.legend = String(patch.legend).slice(0, 8)
      if (patch.style !== undefined && isFasciaStyle(patch.style)) config.style = patch.style
      if (patch.open !== undefined) config.open = Math.max(0, Math.round(patch.open))
      if (patch.floors !== undefined) {
        config.floors = Math.min(MAX_FLOORS, Math.max(1, Math.round(patch.floors)))
      }
      if (patch.tower !== undefined) config.tower = Boolean(patch.tower)
      rebuild()
    },
    setMaterial(slot, material) {
      if (slot === 'fascia' && ownsFascia) {
        releaseOwnedFascia()
        ownsFascia = false
      }
      const banded = bandedSlots.has(slot)
      materialSlots[slot] = material
      // A banded slot drives a whole value ramp, so its bands have to be re-derived from the new coat.
      if (banded) {
        rebuild()
        return
      }
      for (const mesh of meshesBySlot[slot]) mesh.material = material
    },
    update: () => {},
    dispose() {
      releaseGenerated()
      disposeF1Materials(bundle)
      for (const material of ownedExtras) material.dispose()
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  return createF1Preview(
    createModel({ count: 3, number: '11', legend: 'CHECO', style: 'stamp', open: 1 }),
    {
      aspect,
      target: [0, 2.0, 1.5],
      distance: 44,
      fov: 38,
      yaw: -0.62,
      pitch: 0.12,
    },
  )
}
