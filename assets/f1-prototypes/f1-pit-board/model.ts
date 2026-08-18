// f1-pit-board — the numbered board a team hangs over the pit wall: a framed tray carrying rows of
// removable number cards, on a handle long enough to hold out over the wall.
//
// The cards are what make this a pit board rather than a sign, so they are real geometry — separate
// plates standing proud of a recessed tray, slotted behind full-width retaining rails, with a visible
// gap between each card. Faces stamp the shared 3×5 atlas (DataTexture — no canvas).

import {
  BufferGeometry,
  CylinderGeometry,
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
    ['1', '0.0', '12'],
    ['2', '0.3', '14'],
    ['3', '1.2', '14'],
    ['4', '2.1', '13'],
  ],
}

const BOARD_W = 0.85
const BOARD_H = 1.10
const BOARD_Y = 2.00
const BOARD_T = 0.040
const FRAME_W = 0.030
const FRAME_PROUD = 0.020

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
    pole: options.materials?.pole ?? m.graphite,
    board: options.materials?.board ?? m.ink,
    card: options.materials?.card ?? m.shell,
    rail: options.materials?.rail ?? m.slate,
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

    const backing = bevelBox(BOARD_W, BOARD_H, BOARD_T, 0.008)
    backing.translate(0, BOARD_Y, 0)
    emit('board', backing, board, 'panel')

    const railParts: BufferGeometry[] = []
    for (const sy of [-1, 1] as const) {
      const rail = bevelBox(BOARD_W, FRAME_W, BOARD_T + FRAME_PROUD, 0.005)
      rail.translate(0, BOARD_Y + sy * (BOARD_H / 2 - FRAME_W / 2), FRAME_PROUD / 2)
      railParts.push(rail)
    }
    for (const sx of [-1, 1] as const) {
      const rail = bevelBox(FRAME_W, BOARD_H - FRAME_W * 2, BOARD_T + FRAME_PROUD, 0.005)
      rail.translate(sx * (BOARD_W / 2 - FRAME_W / 2), BOARD_Y, FRAME_PROUD / 2)
      railParts.push(rail)
    }

    const fieldTop = BOARD_Y + BOARD_H / 2 - FRAME_W - 0.020
    const fieldBottom = BOARD_Y - BOARD_H / 2 + FRAME_W + 0.020
    const fieldH = fieldTop - fieldBottom
    const fieldW = BOARD_W - FRAME_W * 2 - 0.040
    const rowPitch = fieldH / nRows
    const cardH = rowPitch - 0.042
    const cardGap = 0.028
    const cardW = (fieldW - cardGap * (nCols - 1)) / nCols

    const cardParts: BufferGeometry[] = []
    for (let row = 0; row < nRows; row++) {
      const y = fieldTop - rowPitch * (row + 0.5)
      for (let card = 0; card < nCols; card++) {
        const x = -fieldW / 2 + cardW / 2 + card * (cardW + cardGap)
        const plate = bevelBox(cardW, cardH, 0.012, 0.003)
        plate.translate(x, y, BOARD_T / 2 + 0.006)
        cardParts.push(plate)

        if (ownsCard) {
          const label = labels[row]?.[card] ?? ''
          const tex = marshalPlateTexture(label || '0')
          textures.push(tex)
          const glyphMat = new MeshBasicMaterial({
            name: `f1-kit / pit-board card ${row}-${card}`,
            map: tex,
            toneMapped: false,
          })
          extras.push(glyphMat)
          const face = new PlaneGeometry(cardW * 0.86, cardH * 0.74)
          face.translate(x, y, BOARD_T / 2 + 0.012 + LAYER_CLEARANCE)
          generated.push(face)
          const mesh = new Mesh(face, glyphMat)
          mesh.name = `glyph-${row}-${card}`
          mesh.castShadow = false
          mesh.receiveShadow = false
          rows.add(mesh)
        }
      }

      const channel = bevelBox(fieldW + 0.020, 0.016, 0.026, 0.004)
      channel.translate(0, y - cardH / 2 - 0.008, BOARD_T / 2 + 0.013)
      railParts.push(channel)
    }
    emit('card', mergeParts(cardParts, 'cards'), rows, 'cards')
    emit('rail', mergeParts(railParts, 'rails'), board, 'frame')

    const poleParts: BufferGeometry[] = []
    const shaftZ = -BOARD_T / 2 - 0.055
    const shaft = new CylinderGeometry(0.021, 0.026, 1.72, 12)
    shaft.translate(0, BOARD_Y - BOARD_H / 2 - 0.86 + 0.20, shaftZ)
    poleParts.push(shaft)

    const grip = new CylinderGeometry(0.030, 0.030, 0.34, 12)
    grip.translate(0, BOARD_Y - BOARD_H / 2 - 1.30, shaftZ)
    poleParts.push(grip)
    const cap = new CylinderGeometry(0.031, 0.026, 0.035, 12)
    cap.translate(0, BOARD_Y - BOARD_H / 2 - 1.48, shaftZ)
    poleParts.push(cap)

    const bracket = bevelBox(0.10, 0.16, 0.055, 0.006)
    bracket.translate(0, BOARD_Y - BOARD_H / 2 + 0.09, -BOARD_T / 2 - 0.028)
    poleParts.push(bracket)

    const brace = new CylinderGeometry(0.014, 0.014, 0.40, 10)
    brace.rotateX(-Math.PI / 7)
    brace.translate(0, BOARD_Y - 0.18, -BOARD_T / 2 - 0.105)
    poleParts.push(brace)

    emit('pole', mergeParts(poleParts, 'pole'), pole, 'handle')
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
  return createF1Preview(createModel(), { aspect, target: [0, 1.28, 0], distance: 4.85, fov: 32 })
}
