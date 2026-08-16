// f1-pit-board — a numbered pit signal board on a pole: a dark board plate with a stack of light
// indicator rows. The original scene baked numbers/symbols into the rows via textures; here the rows are
// plain plates on their own material slot so a host can texture, recolour, or leave them blank per team.
// `rowCount` (default 3) controls how many rows are laid out, evenly spaced down the board face.
// Ported from a private racing project's pit-signal board prop.

import {
  BoxGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  type Material,
} from 'three/webgpu'

import { ResourceBag } from '../f1-kit-core/resourceBag.ts'

export interface F1PitBoardConfig {
  /** Number of indicator rows stacked on the board face. */
  rowCount: number
}

export interface F1PitBoardOptions extends Partial<F1PitBoardConfig> {
  materials?: Partial<Record<'pole' | 'board' | 'row', Material>>
}

export interface F1PitBoardInstance {
  readonly root: Group
  readonly parts: { pole: Group; board: Group; rows: Group }
  readonly materials: Readonly<Record<'pole' | 'board' | 'row', Material>>
  getConfig(): Readonly<F1PitBoardConfig>
  configure(patch: Partial<F1PitBoardConfig>): void
  setMaterial(slot: 'pole' | 'board' | 'row', material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1PitBoardConfig = { rowCount: 3 }

export function createModel(options: F1PitBoardOptions = {}): F1PitBoardInstance {
  const config: F1PitBoardConfig = { rowCount: Math.max(1, Math.round(options.rowCount ?? defaults.rowCount)) }

  const bag = new ResourceBag()
  const poleMat = (options.materials?.pole ?? bag.mat(new MeshStandardMaterial({ color: 0x2a2e33, metalness: 0.5, roughness: 0.5 }))) as Material
  const boardMat = (options.materials?.board ?? bag.mat(new MeshStandardMaterial({ color: 0x111417, metalness: 0.1, roughness: 0.8 }))) as Material
  const rowMat = (options.materials?.row ?? bag.mat(new MeshStandardMaterial({ color: 0xffffff, metalness: 0.1, roughness: 0.7 }))) as Material
  const materialSlots: Record<'pole' | 'board' | 'row', Material> = { pole: poleMat, board: boardMat, row: rowMat }

  const root = new Group()
  root.name = 'f1-pit-board'
  const pole = new Group(); pole.name = 'pole'
  const board = new Group(); board.name = 'board'
  const rows = new Group(); rows.name = 'rows'
  root.add(pole, board, rows)

  // Track every mesh that uses a given material slot, so setMaterial can reassign all of them at once.
  const meshesBySlot: Record<'pole' | 'board' | 'row', Mesh[]> = { pole: [], board: [], row: [] }

  const poleMesh = new Mesh(bag.geo(new CylinderGeometry(0.035, 0.045, 2.0, 10)), materialSlots.pole)
  poleMesh.position.y = 1.0
  poleMesh.castShadow = true
  meshesBySlot.pole.push(poleMesh)
  pole.add(poleMesh)

  const boardMesh = new Mesh(bag.geo(new BoxGeometry(0.7, 1.0, 0.05)), materialSlots.board)
  boardMesh.position.set(0, 1.7, 0)
  boardMesh.castShadow = true
  boardMesh.receiveShadow = true
  meshesBySlot.board.push(boardMesh)
  board.add(boardMesh)

  // Rows are regenerated whenever rowCount changes; pole and board above are built once.
  const clearRows = (): void => {
    for (const object of rows.children) {
      if (object instanceof Mesh) object.geometry.dispose()
    }
    rows.clear()
    meshesBySlot.row.length = 0
  }

  const rebuildRows = (): void => {
    clearRows()
    const top = 2.05 // matches the original 3-row layout's top row when rowCount === 3
    const pitch = 0.3
    for (let i = 0; i < config.rowCount; i++) {
      const rowMesh = new Mesh(bag.geo(new BoxGeometry(0.5, 0.16, 0.02)), materialSlots.row)
      rowMesh.position.set(0, top - i * pitch, 0.035)
      rowMesh.castShadow = true
      meshesBySlot.row.push(rowMesh)
      rows.add(rowMesh)
    }
  }
  rebuildRows()

  return {
    root,
    parts: { pole, board, rows },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.rowCount !== undefined) config.rowCount = Math.max(1, Math.round(patch.rowCount))
      rebuildRows()
    },
    setMaterial(slot, material) {
      materialSlots[slot] = material
      for (const mesh of meshesBySlot[slot]) mesh.material = material
    },
    update: () => {},
    dispose() {
      clearRows()
      bag.dispose()
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  const model = createModel()
  const scene = new Scene()
  scene.add(model.root, new HemisphereLight(0x8ea3b2, 0x0a0c10, 0.6))
  const key = new DirectionalLight(0xfff2e2, 1.2)
  key.position.set(-2, 4, 3)
  scene.add(key)
  const camera = new PerspectiveCamera(32, aspect, 0.05, 30)
  camera.position.set(3.0, 1.6, 3.2)
  camera.lookAt(0, 1.3, 0)
  scene.add(camera)
  return { scene, root: model.root, camera, update: model.update, dispose: model.dispose }
}
