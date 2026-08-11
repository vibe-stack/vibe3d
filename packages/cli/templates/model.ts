import type { Group, Material, Object3D } from 'three'

export interface PartHandle<T extends Object3D = Object3D> {
  readonly anchor: T
  readonly content: Object3D
}

export interface ConfigureResult {
  readonly rebuilt: boolean
}

export interface ModelInstance<
  Config extends object,
  Parts extends object = Record<string, PartHandle>,
  Actions extends object = Record<string, never>,
> {
  readonly root: Group
  readonly parts: Parts
  readonly actions: Actions
  readonly materials: MaterialBindings
  getConfig(): Readonly<Config>
  configure(patch: Partial<Config>): ConfigureResult
  update(deltaSeconds: number): void
  dispose(): void
}

export interface MaterialBindings {
  get(slot: string): Material | undefined
  override(slot: string, material: Material): void
  reset(slot: string): void
}
