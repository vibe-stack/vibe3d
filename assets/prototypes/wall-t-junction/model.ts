import { MODULE_SPECS } from '../axiom-modular-kit/contract.ts'
import { buildModule, buildPreview } from '../exterior-wall-corner/family.ts'

const MODULE_ID = 'wall-t-junction' as const
void MODULE_SPECS[MODULE_ID]

export function createModel() {
  return buildModule(MODULE_ID)
}

export function createPreview(options: { aspect: number; time?: number }) {
  return buildPreview(MODULE_ID, options)
}
