import { MODULE_SPECS } from '../axiom-modular-kit/contract.ts'
import { buildModule, buildPreview } from './family.ts'

const MODULE_ID = 'exterior-wall-corner' as const
void MODULE_SPECS[MODULE_ID]

export function createModel() {
  return buildModule(MODULE_ID)
}

export function createPreview(options: { aspect: number; time?: number }) {
  return buildPreview(MODULE_ID, options)
}
