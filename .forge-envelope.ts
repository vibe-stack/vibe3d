// Read-only authoring probe: compile a spec and report the LOD0 envelope the build will measure.
import { readFile } from 'node:fs/promises'
import { Box3, Mesh, Vector3 } from 'three/webgpu'
import { compileAsset } from './src/asset-forge/index.ts'

async function main() {
  const spec = JSON.parse(await readFile(process.argv[2]!, 'utf8'))
  const verbose = process.argv.includes('--parts')
  const asset = compileAsset(spec)
  asset.root.updateMatrixWorld(true)
  const lod0 = asset.root.children.find((child) => child.userData.lod === 0) ?? asset.root
  const bounds = new Box3()
  const rows: Array<{ name: string; min: number[]; max: number[] }> = []
  lod0.traverse((object) => {
    if (!(object instanceof Mesh)) return
    const box = new Box3().setFromObject(object)
    bounds.union(box)
    rows.push({
      name: String(object.userData.partId ?? object.name).slice(0, 34),
      min: box.min.toArray(),
      max: box.max.toArray(),
    })
  })
  if (verbose) {
    const axis = Number(process.argv[process.argv.indexOf('--parts') + 1] ?? 0)
    rows.sort((a, b) => Math.max(Math.abs(b.min[axis]!), Math.abs(b.max[axis]!)) - Math.max(Math.abs(a.min[axis]!), Math.abs(a.max[axis]!)))
    for (const row of rows.slice(0, 12)) {
      console.log(
        `  ${row.name.padEnd(36)} x[${row.min[0]!.toFixed(3)},${row.max[0]!.toFixed(3)}] y[${row.min[1]!.toFixed(3)},${row.max[1]!.toFixed(3)}] z[${row.min[2]!.toFixed(3)},${row.max[2]!.toFixed(3)}]`,
      )
    }
  }
  const size = bounds.getSize(new Vector3())
  const declared = spec.frame.dimensionsM as [number, number, number]
  const err = size.toArray().map((v, i) => Math.abs(v - declared[i]!) / declared[i]!)
  console.log('min      ', bounds.min.toArray().map((v) => v.toFixed(4)).join(', '))
  console.log('max      ', bounds.max.toArray().map((v) => v.toFixed(4)).join(', '))
  console.log('size     ', size.toArray().map((v) => v.toFixed(4)).join(', '))
  console.log('declared ', declared.join(', '))
  console.log('error    ', err.map((v) => (v * 100).toFixed(3) + '%').join(', '), ' max=', (Math.max(...err) * 100).toFixed(3) + '%', Math.max(...err) <= 0.005 ? 'OK' : 'FAIL')
  asset.dispose()
}
void main()
