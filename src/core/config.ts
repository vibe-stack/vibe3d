import type { Viewport } from './types.ts'

export const RENDER_SETTINGS = {
  alpha: false,
  antialias: true,
  depth: true,
  stencil: false,
  powerPreference: 'high-performance',
  maxBrowserPixelRatio: 2,
  exposure: 1.15,
} as const

export const DEFAULT_CAPTURE: Viewport = {
  width: 1280,
  height: 720,
  pixelRatio: 1,
}

export const DEFAULT_CAPTURE_TIME = 1.75
