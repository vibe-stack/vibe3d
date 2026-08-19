// f1-pit-board — the numbered board a team hangs over the pit wall: a framed tray carrying rows of
// removable number cards, on a handle long enough to hold out over the wall.
//
// The cards are what make this a pit board rather than a sign, so they are real geometry — separate
// plates standing proud of a recessed tray, slotted behind full-width retaining rails, with a visible
// gap between each card. Faces stamp the shared 3×5 atlas (DataTexture — no canvas).

import {
  BufferGeometry,
  DataTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  type Material,
} from 'three/webgpu'

import {
  LAYER_CLEARANCE,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  marshalPlateTexture,
  mergeParts,
} from '../f1-kit-core/index.ts'

type Slot = 'pole' | 'board' | 'card' | 'rail'

export interface F1PitBoardConfig {
  /** Rows of number cards down the board face. */
  rowCount: number
  /** Cards per row. Three is the usual position / gap / lap layout. */
  cardsPerRow: number
  /** Per-card labels. No team or driver names — digits and short codes only. */
  labels: readonly (readonly string[])[]
}

export interface F1PitBoardOptions extends Partial<F1PitBoardConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1PitBoardInstance {
  readonly root: Group
  readonly parts: { pole: Group; board: Group; rows: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1PitBoardConfig>
  configure(patch: Partial<F1PitBoardConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1PitBoardConfig = {
  rowCount: 4,
  cardsPerRow: 3,
  labels: [
    ['FIA'],
    ['L2', 'P2'],
    ['36.7'],
    ['36.0'],
  ],
}

const BOARD_W = 0.85
const BOARD_H = 1.02
const BOARD_Y = 1.45
const BOARD_T = 0.016
const FRAME_W = 0.022
const FRAME_PROUD = 0.008
const CUT_W = 0.17
const CUT_H = 0.058

/** Re-colour the shared deterministic segmented atlas into fluorescent cards without adding a canvas. */
function fluorescentLabelTexture(text: string): DataTexture {
  const texture = marshalPlateTexture(text)
  const { data, width, height } = texture.image
  if (!data) return texture
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const edge = x < 5 || y < 5 || x >= width - 5 || y >= height - 5
      const dark = data[i]! + data[i + 1]! + data[i + 2]! < 240
      data[i] = edge || !dark ? 7 : 190
      data[i + 1] = edge || !dark ? 10 : 255
      data[i + 2] = edge || !dark ? 9 : 24
    }
  }
  texture.needsUpdate = true
  return texture
}

function defaultRow(row: number, cols: number): string[] {
  const cells: string[] = []
  for (let c = 0; c < cols; c++) {
    if (c === 0) cells.push(String(row + 1))
    else if (c === 1) cells.push(row === 0 ? '0.0' : `${row}.${row}`)
    else cells.push(String(12 + row))
  }
  return cells
}

function normalizeLabels(
  rowCount: number,
  cardsPerRow: number,
  labels?: readonly (readonly string[])[],
): string[][] {
  const source = labels ?? defaults.labels
  const rows: string[][] = []
  for (let r = 0; r < rowCount; r++) {
    const given = source[r]
    const row = defaultRow(r, cardsPerRow)
    if (given) {
      for (let c = 0; c < cardsPerRow; c++) {
        const cell = given[c]
        if (cell !== undefined && cell !== '') {
          row[c] = cell.replace(/[^0-9A-Za-z.+-]/g, '').slice(0, 4).toUpperCase() || row[c]!
        }
      }
    }
    rows.push(row)
  }
  return rows
}

export function createModel(options: F1PitBoardOptions = {}): F1PitBoardInstance {
  const rowCount = Math.min(6, Math.max(1, Math.round(options.rowCount ?? defaults.rowCount)))
  const cardsPerRow = Math.min(5, Math.max(1, Math.round(options.cardsPerRow ?? defaults.cardsPerRow)))
  const config: F1PitBoardConfig = {
    rowCount,
    cardsPerRow,
    labels: normalizeLabels(rowCount, cardsPerRow, options.labels),
  }

  const bundle = acquireF1Materials()
  const m = bundle.materials
  const ownsCard = options.materials?.card === undefined
  const materialSlots: Record<Slot, Material> = {
    pole: options.materials?.pole ?? m.ink,
    board: options.materials?.board ?? m.ink,
    card: options.materials?.card ?? m.ink,
    rail: options.materials?.rail ?? m.ink,
  }

  const root = new Group()
  root.name = 'f1-pit-board'
  const pole = new Group(); pole.name = 'pole'
  const board = new Group(); board.name = 'board'
  const rows = new Group(); rows.name = 'rows'
  root.add(pole, board, rows)

  const generated: BufferGeometry[] = []
  const extras: Material[] = []
  const textures: DataTexture[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { pole: [], board: [], card: [], rail: [] }

  const releaseGenerated = (): void => {
    for (const group of [pole, board, rows]) group.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const texture of textures) texture.dispose()
    textures.length = 0
    for (const material of extras) material.dispose()
    extras.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
  }

  const emit = (slot: Slot, geometry: BufferGeometry, group: Group, name: string): void => {
    generated.push(geometry)
    const mesh = new Mesh(geometry, materialSlots[slot])
    mesh.name = name
    mesh.castShadow = true
    mesh.receiveShadow = true
    meshesBySlot[slot].push(mesh)
    group.add(mesh)
  }

  const rebuild = (): void => {
    releaseGenerated()
    const { rowCount: nRows, cardsPerRow: nCols, labels } = config

    const fieldTop = BOARD_Y + BOARD_H / 2 - FRAME_W - 0.010
    const fieldBottom = BOARD_Y - BOARD_H / 2 + FRAME_W + 0.010
    const fieldH = fieldTop - fieldBottom
    const fieldW = BOARD_W - FRAME_W * 2 - 0.016
    const hierarchy = nRows >= 4 && nCols >= 2
    const headerH = hierarchy ? fieldH * 0.16 : 0
    const splitH = hierarchy ? fieldH * 0.28 : 0
    const remain = nRows - (hierarchy ? 2 : 0)
    const timeH = remain > 0 ? (fieldH - headerH - splitH) / remain : fieldH / Math.max(1, nRows)
    const plateZ = BOARD_T / 2 + 0.014
    const glyphZ = plateZ + 0.008 + LAYER_CLEARANCE

    const slatParts: BufferGeometry[] = []
    const slatCount = hierarchy ? nRows : nRows
    const slatPitch = fieldH / slatCount
    for (let i = 0; i < slatCount; i++) {
      const y = fieldTop - slatPitch * (i + 0.5)
      const slat = bevelBox(fieldW + 0.010, slatPitch - 0.028, 0.008, 0.002)
      slat.translate(0, y, BOARD_T / 2 + 0.002)
      slatParts.push(slat)
    }
    emit('board', mergeParts(slatParts, 'slats'), board, 'slats')

    const railParts: BufferGeometry[] = []
    const topY = BOARD_Y + BOARD_H / 2 - FRAME_W / 2
    const bottomY = BOARD_Y - BOARD_H / 2 + FRAME_W / 2
    const leftX = -(BOARD_W / 2 - FRAME_W / 2)
    const rightX = BOARD_W / 2 - FRAME_W / 2

    const topRail = bevelBox(BOARD_W - CUT_W, FRAME_W, BOARD_T + FRAME_PROUD, 0.003)
    topRail.translate(-CUT_W / 2, topY, FRAME_PROUD / 2)
    railParts.push(topRail)
    const bottomRail = bevelBox(BOARD_W, FRAME_W, BOARD_T + FRAME_PROUD, 0.003)
    bottomRail.translate(0, bottomY, FRAME_PROUD / 2)
    railParts.push(bottomRail)
    const leftRail = bevelBox(FRAME_W, BOARD_H - FRAME_W * 2, BOARD_T + FRAME_PROUD, 0.003)
    leftRail.translate(leftX, BOARD_Y, FRAME_PROUD / 2)
    railParts.push(leftRail)
    const rightRail = bevelBox(FRAME_W, BOARD_H - FRAME_W * 2 - CUT_H, BOARD_T + FRAME_PROUD, 0.003)
    rightRail.translate(rightX, BOARD_Y - CUT_H / 2, FRAME_PROUD / 2)
    railParts.push(rightRail)

    const gripParts: BufferGeometry[] = []
    const gripX = rightX - CUT_W / 2 + FRAME_W / 2
    const gripTop = bevelBox(CUT_W + FRAME_W, FRAME_W, BOARD_T + FRAME_PROUD, 0.003)
    gripTop.translate(gripX, topY + CUT_H, FRAME_PROUD / 2)
    gripParts.push(gripTop)
    const gripOuter = bevelBox(FRAME_W, CUT_H + FRAME_W, BOARD_T + FRAME_PROUD, 0.003)
    gripOuter.translate(rightX + 0.002, topY + CUT_H / 2, FRAME_PROUD / 2)
    gripParts.push(gripOuter)
    const gripInner = bevelBox(FRAME_W, CUT_H, BOARD_T + FRAME_PROUD, 0.003)
    gripInner.translate(rightX - CUT_W + FRAME_W, topY + CUT_H / 2, FRAME_PROUD / 2)
    gripParts.push(gripInner)
    emit('pole', mergeParts(gripParts, 'corner-cutout'), pole, 'corner-grip')
    emit('rail', mergeParts(railParts, 'rails'), board, 'frame')

    const addPlate = (x: number, y: number, w: number, h: number, label: string, key: string) => {
      const plate = bevelBox(w, h, 0.014, 0.002)
      plate.translate(x, y, plateZ)
      cardParts.push(plate)
      if (!ownsCard) return
      const tex = fluorescentLabelTexture(label || '0')
      textures.push(tex)
      const glyphMat = new MeshBasicMaterial({
        name: `f1-kit / pit-board ${key}`,
        map: tex,
        toneMapped: false,
      })
      extras.push(glyphMat)
      const face = new PlaneGeometry(w * 0.90, h * 0.76)
      face.translate(x, y, glyphZ)
      generated.push(face)
      const mesh = new Mesh(face, glyphMat)
      mesh.name = `glyph-${key}`
      mesh.castShadow = false
      rows.add(mesh)
    }

    const cardParts: BufferGeometry[] = []
    let cursor = fieldTop
    if (hierarchy) {
      const h = headerH - 0.018
      addPlate(0, cursor - h / 2, fieldW - 0.040, h, labels[0]?.[0] ?? 'FIA', 'header')
      cursor -= headerH
      const split = splitH - 0.022
      const half = (fieldW - 0.036) / 2
      addPlate(-half / 2 - 0.010, cursor - split / 2, half, split, labels[1]?.[0] ?? 'L2', 'lap')
      addPlate(half / 2 + 0.010, cursor - split / 2, half, split, labels[1]?.[1] ?? 'P2', 'pos')
      cursor -= splitH
      for (let row = 2; row < nRows; row++) {
        const h = timeH - 0.020
        addPlate(0, cursor - h / 2, fieldW - 0.028, h, labels[row]?.[0] ?? String(row), `time-${row}`)
        cursor -= timeH
      }
    } else {
      const rowPitch = fieldH / nRows
      for (let row = 0; row < nRows; row++) {
        const y = fieldTop - rowPitch * (row + 0.5)
        const cardH = rowPitch - 0.028
        const cardW = (fieldW - 0.016 * (nCols - 1)) / nCols
        for (let card = 0; card < nCols; card++) {
          const x = -fieldW / 2 + cardW / 2 + card * (cardW + 0.016)
          addPlate(x, y, cardW, cardH, labels[row]?.[card] ?? '', `${row}-${card}`)
        }
      }
    }
    emit('card', mergeParts(cardParts, 'cards'), rows, 'cards')

    const wearParts: BufferGeometry[] = []
    for (const [x, y, w] of [
      [-0.31, BOARD_Y + BOARD_H / 2 - 0.006, 0.045],
      [0.08, BOARD_Y + BOARD_H / 2 - 0.006, 0.032],
      [0.34, BOARD_Y - BOARD_H / 2 + 0.006, 0.052],
    ] as const) {
      const scuff = bevelBox(w, 0.008, 0.004, 0.001)
      scuff.translate(x, y, BOARD_T / 2 + FRAME_PROUD + LAYER_CLEARANCE)
      wearParts.push(scuff)
    }
    emit('board', mergeParts(wearParts, 'edge-wear'), board, 'edge-wear')
  }
  rebuild()

  return {
    root,
    parts: { pole, board, rows },
    materials: materialSlots,
    getConfig: () => ({
      rowCount: config.rowCount,
      cardsPerRow: config.cardsPerRow,
      labels: config.labels.map((row) => [...row]),
    }),
    configure(patch) {
      if (patch.rowCount !== undefined) config.rowCount = Math.min(6, Math.max(1, Math.round(patch.rowCount)))
      if (patch.cardsPerRow !== undefined) {
        config.cardsPerRow = Math.min(5, Math.max(1, Math.round(patch.cardsPerRow)))
      }
      config.labels = normalizeLabels(config.rowCount, config.cardsPerRow, patch.labels ?? config.labels)
      rebuild()
    },
    setMaterial(slot, material) {
      materialSlots[slot] = material
      for (const mesh of meshesBySlot[slot]) mesh.material = material
    },
    update: () => {},
    dispose() {
      releaseGenerated()
      disposeF1Materials(bundle)
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  return createF1Preview(createModel(), {
    aspect, target: [0, 1.52, 0], distance: 2.85, fov: 30, yaw: -0.28, pitch: 0.08,
  })
}
