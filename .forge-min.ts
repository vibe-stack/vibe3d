import { readFile } from 'node:fs/promises'
import { Box3, Mesh } from 'three/webgpu'
import { compileAsset } from './src/asset-forge/index.ts'
async function main() {
  const spec = JSON.parse(await readFile(process.argv[2]!, 'utf8'))
  const asset = compileAsset(spec)
  asset.root.updateMatrixWorld(true)
  const lod0 = asset.root.children.find((c) => c.userData.lod === 0) ?? asset.root
  const rows: Array<[string, Box3]> = []
  lod0.traverse((o) => {
    if (!(o instanceof Mesh)) return
    // own geometry only, excluding descendants
    o.geometry.computeBoundingBox()
    const box = o.geometry.boundingBox!.clone().applyMatrix4(o.matrixWorld)
    rows.push([String(o.userData.partId ?? o.name).slice(0, 32), box])
  })
  rows.sort((a, b) => a[1].min.y - b[1].min.y)
  for (const [n, b] of rows.slice(0, 6)) console.log(`ymin ${b.min.y.toFixed(3)}  ${n}`)
  rows.sort((a, b) => b[1].max.x - a[1].max.x)
  for (const [n, b] of rows.slice(0, 5)) console.log(`xmax ${b.max.x.toFixed(3)}  ${n}`)
  asset.dispose()
}
void main()
