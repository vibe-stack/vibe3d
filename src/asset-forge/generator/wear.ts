import {
  Box3,
  Float32BufferAttribute,
  Mesh,
  MeshPhysicalMaterial,
  Vector3,
  type BufferGeometry,
  type Group,
} from 'three/webgpu'
import {
  abs,
  attribute,
  clamp,
  cos,
  float,
  floor,
  fract,
  hash,
  mix,
  normalWorld,
  oneMinus,
  positionLocal,
  positionWorld,
  pow,
  sin,
  normalize,
  max,
  sqrt,
  cross,
  smoothstep,
  step,
  transformNormalToView,
  uv,
  vec3,
  vec4,
} from 'three/tsl'

/**
 * Wear is placed by the form, never sprayed over it.
 *
 * Two attributes baked into the mesh at build time do all the placing: `aEdge`
 * marks the convex bevels and corner arcs the prism generator already knows
 * about, and `aOcc` is a short-ray occlusion bake against the other parts, so
 * grime lands in the seams and under the overhangs that actually exist. Noise
 * only breaks those masks up - a perfectly even rub outline is the tell that
 * nobody authored it by hand.
 */

const OCCLUSION_REACH = 0.34
const OCCLUSION_RAYS: Array<[number, number, number]> = [
  [0, 0, 1],
  [0.62, 0, 0.78],
  [-0.62, 0, 0.78],
  [0, 0.62, 0.78],
  [0, -0.62, 0.78],
]

/** Slab test: distance along `direction` at which the ray first enters `box`, or Infinity. */
function rayBoxEntry(origin: Vector3, direction: Vector3, box: Box3, limit: number): number {
  let near = 0
  let far = limit
  for (const axis of ['x', 'y', 'z'] as const) {
    const d = direction[axis]
    if (Math.abs(d) < 1e-6) {
      if (origin[axis] < box.min[axis] || origin[axis] > box.max[axis]) return Infinity
      continue
    }
    let t0 = (box.min[axis] - origin[axis]) / d
    let t1 = (box.max[axis] - origin[axis]) / d
    if (t0 > t1) [t0, t1] = [t1, t0]
    if (t0 > near) near = t0
    if (t1 < far) far = t1
    if (near > far) return Infinity
  }
  return near
}

/** An orthonormal basis around `normal`, so the ray cone spreads across the surface. */
function basisFor(normal: Vector3, tangent: Vector3, bitangent: Vector3): void {
  const helper = Math.abs(normal.y) > 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0)
  tangent.crossVectors(helper, normal).normalize()
  bitangent.crossVectors(normal, tangent).normalize()
}

/**
 * Bakes `aOcc` per vertex by marching a small cone of rays against every other
 * part's world bounds. A vertex on an exposed panel face sees nothing and stays
 * clean; one down a channel or under the lid overhang is hit from several
 * directions and collects grime.
 */
export interface OcclusionBakeOptions {
  /** Maximum world-space distance at which another part can occlude a vertex. */
  readonly reach?: number
}

export function bakeOcclusion(root: Group, options: OcclusionBakeOptions = {}): void {
  const reach = options.reach ?? OCCLUSION_REACH
  root.updateMatrixWorld(true)

  const meshes: Mesh[] = []
  root.traverse((object) => {
    if (object instanceof Mesh) meshes.push(object)
  })

  const bounds = meshes.map((mesh) => {
    const box = new Box3().setFromObject(mesh)
    return {
      box,
      centre: box.getCenter(new Vector3()),
      radius: box.getSize(new Vector3()).length() * 0.5,
    }
  })

  const position = new Vector3()
  const normal = new Vector3()
  const tangent = new Vector3()
  const bitangent = new Vector3()
  const origin = new Vector3()
  const direction = new Vector3()

  for (const [index, mesh] of meshes.entries()) {
    const geometry = mesh.geometry as BufferGeometry
    const positions = geometry.getAttribute('position')
    const normals = geometry.getAttribute('normal')
    if (!positions || !normals) continue
    const occlusion = new Float32Array(positions.count)

    for (let v = 0; v < positions.count; v += 1) {
      position.fromBufferAttribute(positions, v).applyMatrix4(mesh.matrixWorld)
      normal.fromBufferAttribute(normals, v).transformDirection(mesh.matrixWorld).normalize()
      basisFor(normal, tangent, bitangent)
      // Lift off the surface so a part never occludes itself at its own skin.
      origin.copy(position).addScaledVector(normal, 0.014)

      let hits = 0
      for (const [tx, ty, tz] of OCCLUSION_RAYS) {
        direction
          .copy(normal)
          .multiplyScalar(tz)
          .addScaledVector(tangent, tx)
          .addScaledVector(bitangent, ty)
          .normalize()

        let nearest = Infinity
        for (const [other, bound] of bounds.entries()) {
          if (other === index) continue
          if (origin.distanceTo(bound.centre) - bound.radius > reach) continue
          const entry = rayBoxEntry(origin, direction, bound.box, reach)
          if (entry < nearest) nearest = entry
        }
        if (nearest < reach) hits += 1 - nearest / reach
      }
      occlusion[v] = Math.min(1, hits / (OCCLUSION_RAYS.length * 0.7))
    }

    geometry.setAttribute('aOcc', new Float32BufferAttribute(occlusion, 1))
  }
}

export interface WearProfile {
  /** How readily this surface rubs through to bare metal on its edges. */
  readonly rub: number
  /** How much grime this surface collects in its occluded areas. */
  readonly grime: number
  /** Scratch visibility. Rubber and lenses take almost none. */
  readonly scratch: number
}

/**
 * Bakes each part's surface identity into vertex attributes: base colour,
 * roughness/metalness, and its wear character.
 *
 * This exists because the whole case is deliberately one material. Giving each
 * part its own node material instead would make several materials compile to
 * structurally identical graphs, and they then share a program and bindings -
 * every surface ends up wearing the colour of whichever material compiled last.
 * Baking to attributes also collapses the prop to a handful of draw calls,
 * which is what a real hand-authored asset would ship as anyway.
 */
export function bakeSurfaceAttributes(
  root: Group,
  profiles: ReadonlyMap<MeshPhysicalMaterial, WearProfile>,
): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh) || Array.isArray(object.material)) return
    const material = object.material as MeshPhysicalMaterial
    const profile = profiles.get(material)
    if (!profile) return
    const geometry = object.geometry as BufferGeometry
    const positions = geometry.getAttribute('position')
    const normals = geometry.getAttribute('normal')
    const count = positions.count

    // An engraved mark needs its cut direction in world space so the shader can
    // tilt the two walls apart. The local cross axis is known at authoring time;
    // the world matrix is still available here, before the merge flattens it.
    const cross = object.userData.grooveCross as 'x' | 'y' | undefined
    const direction = new Vector3(cross === 'x' ? 1 : 0, cross === 'y' ? 1 : 0, 0)
    if (cross) direction.transformDirection(object.matrixWorld).normalize()

    const edge = geometry.getAttribute('aEdge')
    const occlusion = geometry.getAttribute('aOcc')

    // WebGPU allows eight vertex buffers and position/normal/uv take three, so
    // everything the wear shader needs is packed into four.
    const mask = new Float32Array(count * 4)
    const plane = new Float32Array(count * 2)
    const vertex = new Vector3()
    const faceNormal = new Vector3()
    const source = geometry.getAttribute('aPlane')
    // Flake frequency relative to the part. One world frequency makes a bolt
    // and a lid wear at the same absolute grain, so small parts read as camo.
    geometry.computeBoundingBox()
    const extent = geometry.boundingBox!.getSize(new Vector3())
    const span = Math.max(0.06, (extent.x + extent.y + extent.z) / 3)
    const flakeScale = Math.min(2.6, Math.max(0.55, 0.9 / span))
    const origin = new Vector3().setFromMatrixPosition(object.matrixWorld)
    const offsetU = origin.x * 3.17 + origin.y * 1.41 + origin.z * 0.83
    const offsetV = origin.z * 2.71 + origin.y * 0.97 - origin.x * 1.13
    const colour = new Float32Array(count * 3)
    const surface = new Float32Array(count * 4)
    const wearDir = new Float32Array(count * 4)
    for (let v = 0; v < count; v += 1) {
      mask[v * 4] = edge ? edge.getX(v) : 0
      mask[v * 4 + 1] = occlusion ? occlusion.getX(v) : 0
      // Groove state packed into one slot: 0 none, 1 cut across X, 2 across Y.
      mask[v * 4 + 2] = cross ? (cross === 'y' ? 2 : 1) : 0

      // Prisms and flat marks bake a real surface parameter in the generator.
      // Offset it per part, or two identical parts wear identically - and that
      // repeat is far more obvious than any noise pattern.
      vertex.fromBufferAttribute(positions, v).applyMatrix4(object.matrixWorld)
      if (source) {
        plane[v * 2] = source.getX(v) + offsetU
        plane[v * 2 + 1] = source.getY(v) + offsetV
      } else {
        // Lathe primitives have no unwrap; project them, they are small enough
        // that the stretch never reads.
        faceNormal.fromBufferAttribute(normals, v).transformDirection(object.matrixWorld)
        const ax = Math.abs(faceNormal.x)
        const ay = Math.abs(faceNormal.y)
        const az = Math.abs(faceNormal.z)
        const dominant = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2
        plane[v * 2] = dominant === 0 ? vertex.z : vertex.x
        plane[v * 2 + 1] = dominant === 1 ? vertex.z : vertex.y
      }
      mask[v * 4 + 3] = flakeScale

      colour[v * 3] = material.color.r
      colour[v * 3 + 1] = material.color.g
      colour[v * 3 + 2] = material.color.b
      surface[v * 4] = material.roughness
      surface[v * 4 + 1] = material.metalness
      surface[v * 4 + 2] = profile.rub
      surface[v * 4 + 3] = profile.grime
      wearDir[v * 4] = profile.scratch
      wearDir[v * 4 + 1] = direction.x
      wearDir[v * 4 + 2] = direction.y
      wearDir[v * 4 + 3] = direction.z
    }
    geometry.setAttribute('aMask', new Float32BufferAttribute(mask, 4))
    geometry.setAttribute('aPlane', new Float32BufferAttribute(plane, 2))
    geometry.setAttribute('aSurface', new Float32BufferAttribute(surface, 4))
    geometry.setAttribute('aWearDir', new Float32BufferAttribute(wearDir, 4))
    geometry.deleteAttribute('aEdge')
    geometry.deleteAttribute('aOcc')
    geometry.setAttribute('aColor', new Float32BufferAttribute(colour, 3))
  })
}

export const WEAR_ATTRIBUTES = ['aMask', 'aColor', 'aSurface', 'aWearDir', 'aPlane'] as const

/**
 * The single wear material.
 *
 * Deliberately no fractal noise in any placement term. Fractal noise is
 * isotropic, so it produces soft clouds, and clouds read as fog rather than as
 * damage. Real wear is structured and hard-edged: paint chips off in discrete
 * flakes with crisp boundaries, scratches are thin straight cuts, and grime is
 * placed by cavities and gravity with noise only varying its density.
 */
export interface WearMaterialOptions {
  readonly name?: string
  readonly clearcoat?: number
  readonly clearcoatRoughness?: number
}

export function createWearMaterial(options: WearMaterialOptions = {}): MeshPhysicalMaterial {
  const material = new MeshPhysicalMaterial({ name: options.name ?? 'asset-forge / worn surface' })
  material.clearcoat = options.clearcoat ?? 0.3
  material.clearcoatRoughness = options.clearcoatRoughness ?? 0.3
  // One graph, shared across all four outputs. Calling wearOutputs() per output
  // builds the whole noise stack once per channel and costs four times as much.
  const outputs = wearOutputs()
  material.colorNode = outputs.colour
  material.roughnessNode = outputs.roughness
  material.metalnessNode = outputs.metalness
  material.normalNode = outputs.normal
  return material
}

export interface WearOutputs {
  colour: typeof positionWorld
  roughness: typeof positionWorld.x
  metalness: typeof positionWorld.x
  normal: typeof positionWorld
  worldNormal: typeof positionWorld
}

/**
 * The whole wear stack as node expressions.
 *
 * Everything is evaluated in the surface's own plane rather than in 3D. Slicing
 * a 3D noise field with a surface is both the reason the cracks read as flat
 * polygonal cells and the reason this was costing three 27-cell worley lookups
 * per pixel per output. Cracks and chips are surface phenomena, so 2D is both
 * cheaper and correct. All noise here is a four-tap value noise.
 */
export function wearOutputs(): WearOutputs {
  /** A plain float-valued node; the concrete TSL node classes vary by helper. */
  type Scalar = typeof positionLocal.x

  const mask = attribute('aMask', 'vec4') as unknown as ReturnType<typeof vec4>
  const packed = attribute('aSurface', 'vec4') as unknown as ReturnType<typeof vec4>
  const wearDir = attribute('aWearDir', 'vec4') as unknown as ReturnType<typeof vec4>
  const baseColour = attribute('aColor', 'vec3') as unknown as ReturnType<typeof vec3>

  const edge = mask.x
  const occ = mask.y
  const grooveOn = step(float(0.5), mask.z)
  const grooveCross = step(float(1.5), mask.z)
  const surface = packed
  const character = vec3(packed.z, packed.w, wearDir.x)
  const grooveDir = vec3(wearDir.y, wearDir.z, wearDir.w)

  const metalColour = vec3(0.56, 0.575, 0.59)
  const grimeColour = vec3(0.16, 0.15, 0.13)
  const dustColour = vec3(0.47, 0.46, 0.42)

  // Object-local coordinates keep the procedural surface attached to an
  // animated assembly. The geometry is merged into root/lid local space before
  // rendering, so this costs the same as positionWorld while following the
  // lid's hinge transform instead of swimming through it in world space.
  const p = positionLocal

  // Surface-plane coordinates and the axis they came from, both baked per vertex
  // so they are stable no matter how the shading normal wobbles.
  const planeCoord = attribute('aPlane', 'vec2') as unknown as ReturnType<typeof vec4>
  const planeU = planeCoord.x.toVar()
  const planeV = planeCoord.y.toVar()
  // A surface basis from the normal, so nothing here depends on world axes.
  const helper = mix(vec3(0, 1, 0), vec3(1, 0, 0), step(float(0.9), abs(normalWorld.y)))
  const tangentU = normalize(cross(helper, normalWorld))
  const tangentV = cross(normalWorld, tangentU)

  const lattice = (x: Scalar, y: Scalar) => hash(x.mul(127.1).add(y.mul(311.7)))
  /** Four-tap 2D value noise, for the surface-space grain only. */
  const noise = (x: Scalar, y: Scalar) => {
    const ix = floor(x)
    const iy = floor(y)
    const fx = fract(x)
    const fy = fract(y)
    const ux = fx.mul(fx).mul(fx.mul(-2).add(3))
    const uy = fy.mul(fy).mul(fy.mul(-2).add(3))
    return mix(
      mix(lattice(ix, iy), lattice(ix.add(1), iy), ux),
      mix(lattice(ix, iy.add(1)), lattice(ix.add(1), iy.add(1)), ux),
      uy,
    )
  }

  /**
   * Eight-tap 3D value noise.
   *
   * Everything that should read as belonging to the object rather than to one
   * panel is evaluated in object-local space with this. A 2D surface parameter cannot
   * be continuous across a part boundary, or across the seam between a face and
   * its own bevel, so patterns built on one always die at those edges - which is
   * exactly the "bound to a single face" break. 3D has no seams and no
   * projection stretch. It costs eight hashes; the worley field this replaces
   * cost twenty-seven.
   */
  const noise3 = (q: typeof positionWorld) => {
    const i = floor(q)
    const f = fract(q)
    const u = f.mul(f).mul(f.mul(-2).add(3))
    const corner = (dx: number, dy: number, dz: number) =>
      hash(i.x.add(dx).mul(127.1).add(i.y.add(dy).mul(311.7)).add(i.z.add(dz).mul(74.7)))
    return mix(
      mix(
        mix(corner(0, 0, 0), corner(1, 0, 0), u.x),
        mix(corner(0, 1, 0), corner(1, 1, 0), u.x),
        u.y,
      ),
      mix(
        mix(corner(0, 0, 1), corner(1, 0, 1), u.x),
        mix(corner(0, 1, 1), corner(1, 1, 1), u.x),
        u.y,
      ),
      u.z,
    )
  }

  // Paint chips. Frequency is scaled per part, so a bolt gets flakes sized to a
  // bolt rather than the one world frequency that made small parts read as
  // camouflage. Chipping is an edge phenomenon, so the mask is tied hard to the
  // edge attribute and blended in rather than stepped, which stops it shouting.
  const flakeScale = mask.w
  const flakeField = noise3(p.mul(flakeScale.mul(22)))
  const cluster = smoothstep(float(0.36), float(0.56), noise3(p.mul(flakeScale.mul(3.4))))
  const flake = smoothstep(float(0.52), float(0.36), flakeField)
  const rub = pow(edge, float(3))
    .mul(flake)
    .mul(cluster)
    .mul(oneMinus(occ.mul(0.85)))
    .mul(character.x)
    .toVar()

  // Scratches as 3D slabs. A drag event picks a direction in object-local space
  // and lays parallel planes along it; wherever a surface cuts those planes it
  // gets straight parallel cuts that carry on across bevels and onto the next part.
  const region = floor(p.mul(0.4))
  const seed = region.x.mul(37.3).add(region.y.mul(91.7)).add(region.z.mul(53.1))
  const azimuth = hash(seed).mul(6.2831853)
  const height = hash(seed.add(3.7)).mul(2).sub(1)
  const ring = sqrt(clamp(oneMinus(height.mul(height)), 0, 1))
  const slab = vec3(cos(azimuth).mul(ring), height, sin(azimuth).mul(ring))
  const pitch = hash(seed.add(5.1)).mul(24).add(26)
  const band = p.dot(slab).mul(pitch).add(hash(seed.add(11.3)).mul(20))
  const cell = floor(band)
  const offset = fract(band).sub(0.5)
  const across = abs(offset).mul(2)
  const halfWidth = hash(cell.mul(7.7).add(seed)).mul(0.13).add(0.05)
  const line = step(across, halfWidth)
  const picked = step(float(0.78), hash(cell.mul(13.1).add(seed.mul(3.3))))
  const alongDir = normalize(cross(slab, vec3(0.31, 0.79, 0.53)))
  const run = step(float(0.36), hash(floor(p.dot(alongDir).mul(1.7)).mul(19.7).add(cell.mul(3.1))))
  // A slab lying nearly parallel to the surface would smear into a wide wash,
  // so fade the cut out as the two approach alignment.
  const bite = oneMinus(abs(slab.dot(normalWorld)))
  const exposure = oneMinus(occ).mul(smoothstep(float(-0.2), float(0.5), normalWorld.y.add(0.25)))
  const cut = line.mul(picked).mul(run).mul(exposure).mul(smoothstep(float(0.15), float(0.5), bite)).toVar()
  const scratch = cut.mul(character.z)
  const trough = oneMinus(clamp(across.div(halfWidth), 0, 1)).mul(scratch).toVar()
  const lip = clamp(across.div(halfWidth), 0, 1).mul(scratch).toVar()

  // Brushed finish. Deliberately carried by roughness rather than by the normal:
  // the grain's fast axis is the baked surface parameter, but the direction it
  // can be tilted along comes from a cross-product basis that has no relation to
  // it, so where the two disagree a normal-driven grain visibly stretches and
  // thins from face to face. Roughness has no direction to get wrong, and a
  // brushed surface reads through the specular anyway.
  const grain = noise(planeU.mul(3.1), planeV.mul(68)).sub(0.5).toVar()
  const grainFine = noise(planeU.mul(9), planeV.mul(165)).sub(0.5)
  const finish = grain.mul(0.68).add(grainFine.mul(0.32)).mul(surface.y.add(0.4)).toVar()

  // Engraved marks are flat geometry, so their depth comes from a V profile
  // read across the mark's own UVs.
  const grooveCoord = mix(uv().x, uv().y, grooveCross)
  const grooveFloor = oneMinus(abs(grooveCoord.sub(0.5)).mul(2)).mul(grooveOn).toVar()
  const grooveWall = clamp(grooveCoord.sub(0.5).mul(2), -1, 1).mul(grooveOn)

  // Grime. Occlusion and gravity place all of it; noise only varies density.
  const down = clamp(normalWorld.y.negate(), 0, 1)
  const up = clamp(normalWorld.y, 0, 1)
  const splash = smoothstep(float(1.05), float(0.12), p.y)
  const streak = noise3(p.mul(vec3(9, 0.9, 9)))
  const grime = clamp(occ.mul(1.15).add(down.mul(0.24)).add(splash.mul(0.3)), 0, 1)
    .mul(streak.mul(0.4).add(0.7))
    .mul(character.y)
    .toVar()
  const dust = up.mul(0.26).mul(streak.mul(0.5).add(0.5)).mul(oneMinus(rub)).mul(character.y)

  let colour = mix(baseColour, grimeColour, grime.mul(0.6))
  colour = mix(colour, dustColour, dust.mul(0.28))
  colour = mix(colour, metalColour, rub.mul(0.55))
  colour = mix(colour, grimeColour, trough.mul(0.85))
  colour = mix(colour, metalColour, lip.mul(0.6))
  colour = colour.mul(oneMinus(grooveFloor.mul(0.35)))

  const roughness = clamp(
    surface.x
      .add(grime.mul(0.3))
      .add(trough.mul(0.38))
      .add(grooveFloor.mul(0.2))
      .sub(rub.mul(0.2))
      .sub(lip.mul(0.18))
      .add(finish.mul(0.1)),
    0.04,
    1,
  )
  const metalness = clamp(
    surface.y.add(rub.mul(0.35)).add(lip.mul(0.25)).sub(grime.mul(0.22)),
    0,
    1,
  )

  // Normals. The scratch walls tilt across the cut, the crack walls tilt along
  // the gradient of the ridge field - which is what gives a crack actual depth
  // rather than leaving it a grey line - and engraved marks use their baked axis.
  // A cut leans its walls toward its own centre: on the +across side the normal
  // tilts to -across. Adding +across instead builds a raised welt, which is why
  // every scratch read as sticking out of the surface rather than into it.
  // A cut leans its walls toward its own centre: on the +across side the normal
  // tilts to -across. Adding +across instead builds a raised welt, which is why
  // every scratch read as sticking out of the surface rather than into it.
  const wall = clamp(offset.div(halfWidth), -1, 1).mul(cut).mul(character.z).mul(1.9)
  const inPlane = slab.sub(normalWorld.mul(slab.dot(normalWorld)))
  const acrossCut = inPlane.div(max(inPlane.length(), float(1e-4)))

  const perturbed = normalWorld
    .sub(acrossCut.mul(wall))
    .sub(grooveDir.mul(grooveWall.mul(0.85)))
    .add(tangentV.mul(finish.mul(0.055)))
    .normalize()

  return {
    colour,
    roughness,
    metalness,
    normal: transformNormalToView(perturbed),
    worldNormal: perturbed,
  }
}
