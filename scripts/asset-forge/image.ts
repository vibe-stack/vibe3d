import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { PNG } from 'pngjs'

export interface RgbaImage {
  readonly width: number
  readonly height: number
  readonly data: Uint8Array
}

export async function writePng(path: string, image: RgbaImage): Promise<void> {
  const png = new PNG({ width: image.width, height: image.height })
  png.data.set(image.data)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, PNG.sync.write(png))
}
