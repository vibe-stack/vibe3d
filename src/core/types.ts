import type { Group, PerspectiveCamera, Scene, Vector3 } from 'three/webgpu'

export interface Viewport {
  width: number
  height: number
  pixelRatio: number
}

export interface PlaygroundOptions {
  aspect: number
}

/** A complete, platform-neutral scene that browser and Node can both render. */
export interface Playground {
  readonly id: string
  readonly label: string
  readonly scene: Scene
  readonly camera: PerspectiveCamera
  readonly focus: Vector3
  update(elapsedSeconds: number): void
  resize(aspect: number): void
  dispose(): void
}

export interface ProceduralProp {
  readonly root: Group
  update(elapsedSeconds: number): void
}
