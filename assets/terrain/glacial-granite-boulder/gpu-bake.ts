/**
 * WebGPU compute backend for the granite high-to-low surface bake.
 *
 * Geometry extraction and UV rasterization remain on the CPU. Adaptive traces
 * and every expensive analytic field sample for normals, AO, and curvature run
 * in parallel on the GPU. The CPU implementation remains the authoritative
 * fallback and equivalence oracle.
 */

import {
  COMPILED_SURFACE_BAKE_FORMAT,
  assertCompiledSurfaceBake,
  type CompiledSurfaceBake,
} from '../../../packages/terrain/src/index.ts'
import { create, globals } from 'webgpu'
import {
  dilate,
  rasterizeCharts,
  type SurfaceBakeIdentity,
  type SurfaceBakeResult,
} from '../shared/bake.ts'
import { graniteGpuParameters } from './field.ts'
import type { PreparedGraniteAsset } from './topology.ts'

const SEARCH_DISTANCE = 0.055
const GRADIENT_STEP = 0.0016
const DILATION_PASSES = 4

const shader = /* wgsl */ `
struct Params {
  ident: vec4<u32>,
  counts: vec4<u32>,
  values: vec4<f32>,
  radii: vec4<f32>,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> positions: array<f32>;
@group(0) @binding(2) var<storage, read> normals: array<f32>;
@group(0) @binding(4) var<storage, read> facets: array<f32>;
@group(0) @binding(5) var<storage, read> scars: array<f32>;
@group(0) @binding(6) var<storage, read> lobes: array<f32>;
@group(0) @binding(7) var<storage, read_write> trace_data: array<vec4<f32>>;
@group(0) @binding(9) var<storage, read> active_texels: array<u32>;

const INV_U32_RANGE: f32 = 1.0 / 4294967296.0;

fn hash_bits(x: i32, y: i32, z: i32, seed: i32) -> u32 {
  var value = bitcast<u32>(x) * 0x1f123bb5u;
  value = value ^ (bitcast<u32>(y) * 0x5f356495u);
  value = value ^ (bitcast<u32>(z) * 0x6c8e9cf5u);
  value = value ^ (bitcast<u32>(seed) * 0x27d4eb2du);
  value = value ^ (value >> 15u);
  value = value * 0x85ebca6bu;
  value = value ^ (value >> 13u);
  value = value * 0xc2b2ae35u;
  value = value ^ (value >> 16u);
  return value;
}

fn hash01(x: i32, y: i32, z: i32, seed: i32) -> f32 {
  return f32(hash_bits(x, y, z, seed)) * INV_U32_RANGE;
}

fn gradient(base: u32) -> vec3<f32> {
  switch base {
    case 0u, 12u: { return vec3<f32>(1.0, 1.0, 0.0); }
    case 1u: { return vec3<f32>(-1.0, 1.0, 0.0); }
    case 2u: { return vec3<f32>(1.0, -1.0, 0.0); }
    case 3u: { return vec3<f32>(-1.0, -1.0, 0.0); }
    case 4u: { return vec3<f32>(1.0, 0.0, 1.0); }
    case 5u: { return vec3<f32>(-1.0, 0.0, 1.0); }
    case 6u: { return vec3<f32>(1.0, 0.0, -1.0); }
    case 7u: { return vec3<f32>(-1.0, 0.0, -1.0); }
    case 8u: { return vec3<f32>(0.0, 1.0, 1.0); }
    case 9u, 13u: { return vec3<f32>(0.0, -1.0, 1.0); }
    case 10u: { return vec3<f32>(0.0, 1.0, -1.0); }
    case 11u, 15u: { return vec3<f32>(0.0, -1.0, -1.0); }
    default: { return vec3<f32>(-1.0, 1.0, 0.0); }
  }
}

fn gradient_dot(ix: i32, iy: i32, iz: i32, seed: i32, x: f32, y: f32, z: f32) -> f32 {
  let base = hash_bits(ix, iy, iz, seed) & 15u;
  return dot(gradient(base), vec3<f32>(x, y, z));
}

fn gradient_noise(p: vec3<f32>, seed: i32) -> f32 {
  let cell = vec3<i32>(floor(p));
  let f = p - vec3<f32>(cell);
  let u = f * f * f * (f * (f * 6.0 - vec3<f32>(15.0)) + vec3<f32>(10.0));
  let n000 = gradient_dot(cell.x, cell.y, cell.z, seed, f.x, f.y, f.z);
  let n100 = gradient_dot(cell.x + 1, cell.y, cell.z, seed, f.x - 1.0, f.y, f.z);
  let n010 = gradient_dot(cell.x, cell.y + 1, cell.z, seed, f.x, f.y - 1.0, f.z);
  let n110 = gradient_dot(cell.x + 1, cell.y + 1, cell.z, seed, f.x - 1.0, f.y - 1.0, f.z);
  let n001 = gradient_dot(cell.x, cell.y, cell.z + 1, seed, f.x, f.y, f.z - 1.0);
  let n101 = gradient_dot(cell.x + 1, cell.y, cell.z + 1, seed, f.x - 1.0, f.y, f.z - 1.0);
  let n011 = gradient_dot(cell.x, cell.y + 1, cell.z + 1, seed, f.x, f.y - 1.0, f.z - 1.0);
  let n111 = gradient_dot(cell.x + 1, cell.y + 1, cell.z + 1, seed, f.x - 1.0, f.y - 1.0, f.z - 1.0);
  let x00 = mix(n000, n100, u.x);
  let x10 = mix(n010, n110, u.x);
  let x01 = mix(n001, n101, u.x);
  let x11 = mix(n011, n111, u.x);
  return mix(mix(x00, x10, u.y), mix(x01, x11, u.y), u.z);
}

fn fbm(p: vec3<f32>, seed: i32, octaves: u32) -> f32 {
  var amplitude = 0.5;
  var frequency = 1.0;
  var total = 0.0;
  var weight = 0.0;
  for (var octave = 0u; octave < 4u; octave += 1u) {
    if (octave >= octaves) { break; }
    total += gradient_noise(p * frequency, seed + i32(octave) * 1013) * amplitude;
    weight += amplitude;
    amplitude *= 0.5;
    frequency *= 2.0173;
  }
  return (total / weight) * 0.71;
}

fn ridged(p: vec3<f32>, seed: i32, octaves: u32) -> f32 {
  var amplitude = 0.5;
  var frequency = 1.0;
  var total = 0.0;
  var weight = 0.0;
  for (var octave = 0u; octave < 4u; octave += 1u) {
    if (octave >= octaves) { break; }
    let raw = 1.0 - abs(gradient_noise(p * frequency, seed + i32(octave) * 1013) * 2.2);
    let band = max(0.0, raw);
    total += band * band * amplitude;
    weight += amplitude;
    amplitude *= 0.52;
    frequency *= 2.0173;
  }
  return total / weight;
}

fn worley_border(p: vec3<f32>, seed: i32) -> f32 {
  let cell = vec3<i32>(floor(p));
  var first = 1e30;
  var second = 1e30;
  for (var dz = -1; dz <= 1; dz += 1) {
    for (var dy = -1; dy <= 1; dy += 1) {
      for (var dx = -1; dx <= 1; dx += 1) {
        let c = cell + vec3<i32>(dx, dy, dz);
        let point = vec3<f32>(c) + vec3<f32>(
          hash01(c.x, c.y, c.z, seed),
          hash01(c.x, c.y, c.z, seed + 31),
          hash01(c.x, c.y, c.z, seed + 67)
        );
        let delta = p - point;
        let squared = dot(delta, delta);
        if (squared < first) {
          second = first;
          first = squared;
        } else if (squared < second) {
          second = squared;
        }
      }
    }
  }
  return sqrt(second) - sqrt(first);
}

fn smax(a: f32, b: f32, k: f32) -> f32 {
  if (k <= 0.0) { return max(a, b); }
  let h = k - abs(a - b);
  if (h <= 0.0) { return max(a, b); }
  return max(a, b) + (h * h) / (k * 4.0);
}

fn smin(a: f32, b: f32, k: f32) -> f32 {
  if (k <= 0.0) { return min(a, b); }
  let h = k - abs(a - b);
  if (h <= 0.0) { return min(a, b); }
  return min(a, b) - (h * h) / (k * 4.0);
}

fn boxoid(p: vec3<f32>, radii: vec3<f32>) -> f32 {
  let a = p / radii;
  let squared = a * a;
  let normalized = sqrt(sqrt(dot(squared, squared)));
  return (normalized - 1.0) * min(radii.x, min(radii.y, radii.z));
}

fn ellipsoid(p: vec3<f32>, radii: vec3<f32>) -> f32 {
  let n = p / radii;
  return (length(n) - 1.0) * min(radii.x, min(radii.y, radii.z));
}

fn mass_sdf(p: vec3<f32>, seed: i32) -> f32 {
  let radii = params.radii.xyz;
  let lean = vec3<f32>(p.x + p.y * 0.07, p.y, p.z - p.y * 0.09);
  let taper = 1.0 - clamp(p.y * 0.26, -0.1, 0.24);
  var distance: f32;
  switch params.ident.w {
    case 1u: {
      let body = boxoid(lean, vec3<f32>(radii.x * taper, radii.y, radii.z * taper));
      let shoulder = boxoid(lean + vec3<f32>(-0.28, -0.18, 0.08), vec3<f32>(radii.x * 0.55, radii.y * 0.48, radii.z * 0.78));
      distance = smin(body, shoulder, 0.04);
    }
    case 2u: {
      distance = boxoid(lean, vec3<f32>(radii.x * taper, radii.y, radii.z));
    }
    case 3u: {
      let base = boxoid(lean + vec3<f32>(0.12, 0.24, 0.0), vec3<f32>(radii.x * 0.9, radii.y * 0.7, radii.z));
      let crown = boxoid(lean + vec3<f32>(-0.18, -0.34, 0.08), vec3<f32>(radii.x * 0.68, radii.y * 0.48, radii.z * 0.82));
      let shoulder = boxoid(lean + vec3<f32>(0.38, -0.05, -0.12), vec3<f32>(radii.x * 0.42, radii.y * 0.5, radii.z * 0.64));
      distance = smin(smin(base, crown, 0.045), shoulder, 0.035);
    }
    case 4u: {
      let body = boxoid(lean + vec3<f32>(-0.12, 0.18, 0.0), vec3<f32>(radii.x * 0.82, radii.y * 0.78, radii.z));
      let shelf = boxoid(lean + vec3<f32>(0.16, -0.27, -0.05), vec3<f32>(radii.x, radii.y * 0.34, radii.z * 0.82));
      distance = smin(body, shelf, 0.035);
    }
    default: {
      distance = boxoid(lean, vec3<f32>(radii.x * taper, radii.y, radii.z * taper));
    }
  }

  for (var index = 0u; index < params.counts.x; index += 1u) {
    let offset = index * 5u;
    let plane = dot(p, vec3<f32>(facets[offset], facets[offset + 1u], facets[offset + 2u])) - facets[offset + 3u];
    distance = smax(distance, plane, facets[offset + 4u]);
  }
  for (var index = 0u; index < params.counts.z; index += 1u) {
    let offset = index * 8u;
    let local = p - vec3<f32>(lobes[offset], lobes[offset + 1u], lobes[offset + 2u]);
    let c = lobes[offset + 6u];
    let s = lobes[offset + 7u];
    let rotated = vec3<f32>(local.x * c - local.z * s, local.y, local.x * s + local.z * c);
    distance = smin(distance, boxoid(rotated, vec3<f32>(lobes[offset + 3u], lobes[offset + 4u], lobes[offset + 5u])), 0.05);
  }
  for (var index = 0u; index < params.counts.y; index += 1u) {
    let offset = index * 9u;
    let local = p - vec3<f32>(scars[offset], scars[offset + 1u], scars[offset + 2u]);
    let c = scars[offset + 7u];
    let s = scars[offset + 8u];
    let rotated = vec3<f32>(local.x * c - local.z * s, local.y, local.x * s + local.z * c);
    distance = smax(distance, -boxoid(rotated, vec3<f32>(scars[offset + 3u], scars[offset + 4u], scars[offset + 5u])), scars[offset + 6u]);
  }
  if (params.ident.w == 2u) {
    let opening_x = (hash01(seed, 901, 77, bitcast<i32>(0x2545f491u)) - 0.5) * 0.12;
    let local = p - vec3<f32>(opening_x, -0.62, 0.0);
    let shaft = boxoid(local, vec3<f32>(0.36, 0.43, 0.72));
    let crown = ellipsoid(p - vec3<f32>(opening_x, -0.14, 0.0), vec3<f32>(0.43, 0.43, 0.72));
    distance = smax(distance, -smin(shaft, crown, 0.025), 0.008);
  }
  return distance;
}

fn displacement(p: vec3<f32>, seed: i32) -> f32 {
  let wx = p.x + fbm(vec3<f32>(p.x * 1.05 + 3.1, p.y * 1.05, p.z * 1.05), seed + 11, 3u) * 0.4;
  let wy = p.y + fbm(vec3<f32>(p.x, p.y - 5.7, p.z), seed + 43, 3u) * 0.3;
  let wz = p.z + fbm(vec3<f32>(p.x * 1.1, p.y * 1.1, p.z * 1.1 + 8.4), seed + 79, 3u) * 0.4;
  let macro_spine = ridged(vec3<f32>(wx * 1.75, wy * 1.35, wz * 1.75), seed + 137, 3u);
  let broad = fbm(vec3<f32>(wx * 1.5, wy * 1.25, wz * 1.5), seed + 101, 3u) * 2.0;
  let macro_band = broad * 0.42 + (macro_spine - 0.4) * 1.15;

  let warp = fbm(vec3<f32>(p.x * 2.9 + 6.7, p.y * 2.9, p.z * 2.9), seed + 307, 3u) * 0.26;
  let cells = worley_border(vec3<f32>((p.x + warp) * 5.4, p.y * 4.3, (p.z - warp) * 5.4), seed + 389);
  let plate = 1.0 - min(1.0, cells / 0.44);
  let meso_spine = ridged(vec3<f32>((p.x + warp) * 4.6, p.y * 3.9, (p.z + warp) * 4.6), seed + 421, 2u);
  let broken = fbm(vec3<f32>((p.x + warp) * 5.6, (p.y - warp * 0.45) * 4.4, (p.z + warp) * 5.6), seed + 347, 3u) * 2.0;
  let meso = broken * 0.34 + (meso_spine - 0.42) * 0.7 - plate * plate * 0.62;

  let fine_warp = fbm(p * 7.0 + vec3<f32>(1.3, 0.0, 0.0), seed + 503, 2u) * 0.14;
  let chips = worley_border(vec3<f32>((p.x + fine_warp) * 14.5, p.y * 11.5, (p.z - fine_warp) * 14.5), seed + 541);
  let scar = 1.0 - min(1.0, chips / 0.42);
  let bedding = ridged(vec3<f32>(p.x * 6.5, p.y * 21.5, p.z * 6.5), seed + 577, 2u);
  let grit = fbm(p * 13.5, seed + 613, 3u) * 2.0;
  let fine = grit * 0.36 - scar * scar * 0.62 - (bedding - 0.4) * 0.5;
  return macro_band * 0.052 + meso * 0.017 + fine * 0.0055;
}

fn micro_relief(p: vec3<f32>, seed: i32) -> f32 {
  let grain = fbm(p * 44.0, seed + 701, 3u) * 2.0;
  let crystal = ridged(p * 72.0, seed + 743, 2u);
  let flake = worley_border(p * 56.0, seed + 787);
  let pit = 1.0 - min(1.0, flake / 0.36);
  return grain * 0.0021 + (crystal - 0.42) * 0.0017 - pit * pit * 0.0018;
}

fn detailed_sdf(p: vec3<f32>, seed: i32) -> f32 {
  return mass_sdf(p, seed) - displacement(p, seed) - micro_relief(p, seed);
}

@compute @workgroup_size(32)
fn trace_main(@builtin(global_invocation_id) id: vec3<u32>) {
  let active_index = id.x;
  if (active_index >= u32(params.values.z)) { return; }
  let texel = active_texels[active_index];
  let input_offset = texel * 3u;
  let p = vec3<f32>(positions[input_offset], positions[input_offset + 1u], positions[input_offset + 2u]);
  var n = vec3<f32>(normals[input_offset], normals[input_offset + 1u], normals[input_offset + 2u]);
  let n_length = length(n);
  if (n_length > 0.0) { n /= n_length; } else { n = vec3<f32>(0.0, 1.0, 0.0); }
  let seed = i32(params.ident.x);
  let search_distance = params.values.x;
  let maximum_distance = search_distance * 2.0;
  let origin = p + n * search_distance;
  var travelled = 0.0;
  var previous = detailed_sdf(origin, seed);
  var low = 0.0;
  var high = 0.0;
  var low_value = 0.0;
  var mode = 0u;
  var refinements = 0u;
  for (var iteration = 0u; iteration < 268u; iteration += 1u) {
    if (mode >= 2u) { break; }
    var distance: f32;
    if (mode == 0u) {
      if (travelled >= maximum_distance) { mode = 3u; break; }
      let advance = min(maximum_distance / 48.0, max(abs(previous) * 0.85, maximum_distance / 256.0));
      distance = travelled + advance;
    } else {
      distance = (low + high) * 0.5;
    }
    let value = detailed_sdf(origin - n * distance, seed);
    if (mode == 0u) {
      if ((value < 0.0) != (previous < 0.0)) {
        low = travelled; high = distance; low_value = previous; mode = 1u;
      } else {
        travelled = distance; previous = value;
      }
    } else {
      if ((value < 0.0) == (low_value < 0.0)) { low = distance; low_value = value; }
      else { high = distance; }
      refinements += 1u;
      if (refinements >= 12u) { travelled = (low + high) * 0.5; mode = 2u; }
    }
  }
  var hit = vec4<f32>(p, 0.0);
  if (mode == 2u) {
    let relief = search_distance - travelled;
    hit = vec4<f32>(origin - n * travelled, relief);
  }
  trace_data[active_index * 2u] = hit;
  trace_data[active_index * 2u + 1u] = vec4<f32>(select(0.0, 1.0, mode == 2u), 0.0, 0.0, 0.0);
}

@group(0) @binding(10) var<storage, read> queries: array<vec4<f32>>;
@group(0) @binding(11) var<storage, read_write> query_results: array<vec4<f32>>;

@compute @workgroup_size(32)
fn evaluate_main(@builtin(global_invocation_id) id: vec3<u32>) {
  let index = id.x;
  if (index >= arrayLength(&queries)) { return; }
  query_results[index] = vec4<f32>(detailed_sdf(queries[index].xyz, i32(params.ident.x)), 0.0, 0.0, 0.0);
}
`

function createBuffer(
  device: GPUDevice,
  data: ArrayBufferView,
  usage: GPUBufferUsageFlags,
): GPUBuffer {
  const size = Math.max(4, Math.ceil(data.byteLength / 4) * 4)
  const buffer = device.createBuffer({ size, usage, mappedAtCreation: true })
  const destination = new Uint8Array(buffer.getMappedRange())
  destination.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
  buffer.unmap()
  return buffer
}

function identityFor(asset: PreparedGraniteAsset): SurfaceBakeIdentity {
  const topology = asset.topology
  return {
    assetId: topology.assetId,
    topologyKey: topology.topologyKey,
    recipeHash: topology.recipeHash,
    compilerHash: topology.compilerHash,
    profile: topology.profile,
  }
}

export interface GraniteGpuBaker {
  compile(asset: PreparedGraniteAsset, seed: number, atlasSize: number): Promise<SurfaceBakeResult>
  dispose(): void
}

export async function createGraniteGpuBaker(): Promise<GraniteGpuBaker> {
  const debug = process.env.TERRAIN_GPU_DEBUG === '1'
  Object.assign(globalThis, globals)
  const gpuOwner = create([])
  let disposed = false
  const adapter = await gpuOwner.requestAdapter({ powerPreference: 'high-performance' })
  if (!adapter) throw new Error('Dawn could not find a compatible WebGPU adapter')
  if (debug) console.error('granite gpu: adapter ready')
  const device = await adapter.requestDevice()
  if (debug) console.error('granite gpu: device ready')
  device.addEventListener('uncapturederror', (event) => {
    console.error(`Granite GPU uncaptured error: ${event.error.message}`)
  })
  void device.lost.then((info) => {
    if (!disposed) console.error(`Granite GPU device lost (${info.reason}): ${info.message}`)
  })
  const module = device.createShaderModule({ label: 'granite surface bake', code: shader })
  const compilation = await module.getCompilationInfo()
  if (debug) console.error('granite gpu: shader translated')
  const errors = compilation.messages.filter((message) => message.type === 'error')
  if (errors.length > 0) {
    throw new Error(`Granite GPU shader failed to compile:\n${errors.map((message) => message.message).join('\n')}`)
  }
  const tracePipeline = await device.createComputePipelineAsync({
    label: 'granite surface trace',
    layout: 'auto',
    compute: { module, entryPoint: 'trace_main' },
  })
  if (debug) console.error('granite gpu: trace pipeline ready')
  const evaluatePipeline = await device.createComputePipelineAsync({
    label: 'granite field evaluator',
    layout: 'auto',
    compute: { module, entryPoint: 'evaluate_main' },
  })
  if (debug) console.error('granite gpu: evaluator pipeline ready')

  return {
    async compile(asset, seed, atlasSize) {
      // `webgpu` owns Dawn through this object; retaining only the device is
      // insufficient and lets the native implementation be finalized early.
      if (disposed) throw new Error('Granite GPU baker has been disposed')
      void gpuOwner
      const raster = rasterizeCharts(asset.unwrapped, atlasSize, atlasSize)
      const texelCount = atlasSize * atlasSize
      const activeTexels = new Uint32Array(raster.covered.reduce((sum, value) => sum + value, 0))
      let activeCursor = 0
      for (let index = 0; index < texelCount; index += 1) {
        if (raster.covered[index]) activeTexels[activeCursor++] = index
      }
      const authored = graniteGpuParameters(seed)
      const usage = globalThis.GPUBufferUsage
      const createParamsBuffer = (activeCount: number) => {
        const uniform = new ArrayBuffer(64)
        const uniformU32 = new Uint32Array(uniform)
        const uniformF32 = new Float32Array(uniform)
        uniformU32.set([seed, atlasSize, atlasSize, authored.formation], 0)
        uniformU32.set([authored.facetCount, authored.scarCount, authored.lobeCount, 0], 4)
        uniformF32.set([SEARCH_DISTANCE, GRADIENT_STEP, activeCount, 0], 8)
        uniformF32.set([authored.radii[0], authored.radii[1], authored.radii[2], 0], 12)
        return createBuffer(device, new Uint8Array(uniform), usage.UNIFORM)
      }
      const paramsBuffer = createParamsBuffer(activeTexels.length)
      const positionBuffer = createBuffer(device, raster.position, usage.STORAGE)
      const normalBuffer = createBuffer(device, raster.normal, usage.STORAGE)
      const activeBuffer = createBuffer(device, activeTexels, usage.STORAGE)
      const facetBuffer = createBuffer(device, new Float32Array(authored.facets), usage.STORAGE)
      const scarBuffer = createBuffer(device, new Float32Array(authored.scars), usage.STORAGE)
      const lobeBuffer = createBuffer(device, new Float32Array(authored.lobes), usage.STORAGE)
      const traceSize = Math.max(32, activeTexels.length * 32)
      const traceBuffer = device.createBuffer({ size: traceSize, usage: usage.STORAGE | usage.COPY_SRC })
      const traceReadBuffer = device.createBuffer({ size: traceSize, usage: usage.COPY_DST | usage.MAP_READ })
      const buffers = [
        paramsBuffer, positionBuffer, normalBuffer, activeBuffer,
        facetBuffer, scarBuffer, lobeBuffer, traceBuffer, traceReadBuffer,
      ]
      // Keep native wrapper objects strongly reachable until all submitted
      // work completes; node-webgpu's Metal bindings can otherwise finalize a
      // bind group while Dawn still references it.
      const resources: unknown[] = []
      try {
        const evaluate = async (points: Float32Array): Promise<Float32Array> => {
          const count = points.length / 3
          const values = new Float32Array(count)
          const maximumQueriesPerDispatch = Math.max(1, Math.min(
            1_048_576,
            Math.floor(device.limits.maxStorageBufferBindingSize / 16),
            device.limits.maxComputeWorkgroupsPerDimension * 32,
          ))
          for (let start = 0; start < count; start += maximumQueriesPerDispatch) {
            const chunkCount = Math.min(maximumQueriesPerDispatch, count - start)
            const queries = new Float32Array(chunkCount * 4)
            for (let index = 0; index < chunkCount; index += 1) {
              queries[index * 4] = points[(start + index) * 3]!
              queries[index * 4 + 1] = points[(start + index) * 3 + 1]!
              queries[index * 4 + 2] = points[(start + index) * 3 + 2]!
            }
            const queryBuffer = createBuffer(device, queries, usage.STORAGE)
            const resultSize = Math.max(16, queries.byteLength)
            const resultBuffer = device.createBuffer({ size: resultSize, usage: usage.STORAGE | usage.COPY_SRC })
            const resultReadBuffer = device.createBuffer({ size: resultSize, usage: usage.COPY_DST | usage.MAP_READ })
            buffers.push(queryBuffer, resultBuffer, resultReadBuffer)
            const bindGroup = device.createBindGroup({
              layout: evaluatePipeline.getBindGroupLayout(0),
              entries: [
                { binding: 0, resource: { buffer: paramsBuffer } },
                { binding: 4, resource: { buffer: facetBuffer } },
                { binding: 5, resource: { buffer: scarBuffer } },
                { binding: 6, resource: { buffer: lobeBuffer } },
                { binding: 10, resource: { buffer: queryBuffer } },
                { binding: 11, resource: { buffer: resultBuffer } },
              ],
            })
            resources.push(bindGroup)
            const encoder = device.createCommandEncoder({ label: 'granite field queries' })
            const pass = encoder.beginComputePass()
            pass.setPipeline(evaluatePipeline)
            pass.setBindGroup(0, bindGroup)
            pass.dispatchWorkgroups(Math.ceil(chunkCount / 32))
            pass.end()
            encoder.copyBufferToBuffer(resultBuffer, 0, resultReadBuffer, 0, resultSize)
            device.queue.submit([encoder.finish()])
            await resultReadBuffer.mapAsync(globalThis.GPUMapMode.READ)
            const packed = new Float32Array(resultReadBuffer.getMappedRange())
            for (let index = 0; index < chunkCount; index += 1) values[start + index] = packed[index * 4]!
            resultReadBuffer.unmap()
          }
          return values
        }

        const traceBindGroup = device.createBindGroup({
          layout: tracePipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: paramsBuffer } },
            { binding: 1, resource: { buffer: positionBuffer } },
            { binding: 2, resource: { buffer: normalBuffer } },
            { binding: 4, resource: { buffer: facetBuffer } },
            { binding: 5, resource: { buffer: scarBuffer } },
            { binding: 6, resource: { buffer: lobeBuffer } },
            { binding: 7, resource: { buffer: traceBuffer } },
            { binding: 9, resource: { buffer: activeBuffer } },
          ],
        })
        resources.push(traceBindGroup)
        const traceEncoder = device.createCommandEncoder({ label: 'granite surface trace' })
        if (activeTexels.length > 0) {
          const tracePass = traceEncoder.beginComputePass()
          tracePass.setPipeline(tracePipeline)
          tracePass.setBindGroup(0, traceBindGroup)
          tracePass.dispatchWorkgroups(Math.ceil(activeTexels.length / 32))
          tracePass.end()
        }
        traceEncoder.copyBufferToBuffer(traceBuffer, 0, traceReadBuffer, 0, traceSize)
        device.queue.submit([traceEncoder.finish()])
        await traceReadBuffer.mapAsync(globalThis.GPUMapMode.READ)
        const traceOutput = new Float32Array(traceReadBuffer.getMappedRange())
        const hitPoints = new Float32Array(activeTexels.length * 3)
        const reliefs = new Float32Array(activeTexels.length)
        const hits = new Uint8Array(activeTexels.length)
        for (let index = 0; index < activeTexels.length; index += 1) {
          hitPoints[index * 3] = traceOutput[index * 8]!
          hitPoints[index * 3 + 1] = traceOutput[index * 8 + 1]!
          hitPoints[index * 3 + 2] = traceOutput[index * 8 + 2]!
          reliefs[index] = traceOutput[index * 8 + 3]!
          hits[index] = traceOutput[index * 8 + 4]! > 0.5 ? 1 : 0
        }
        traceReadBuffer.unmap()
        if (debug) console.error('granite gpu: trace complete')

        const normalQueries = new Float32Array(activeTexels.length * 4 * 3)
        const signs = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]] as const
        for (let index = 0; index < activeTexels.length; index += 1) {
          for (let sample = 0; sample < 4; sample += 1) {
            const target = (index * 4 + sample) * 3
            normalQueries[target] = hitPoints[index * 3]! + signs[sample]![0] * GRADIENT_STEP
            normalQueries[target + 1] = hitPoints[index * 3 + 1]! + signs[sample]![1] * GRADIENT_STEP
            normalQueries[target + 2] = hitPoints[index * 3 + 2]! + signs[sample]![2] * GRADIENT_STEP
          }
        }
        const normalSamples = await evaluate(normalQueries)
        if (process.env.TERRAIN_GPU_DEBUG === '1') console.error('granite gpu: normal queries complete')
        const detailNormals = new Float32Array(activeTexels.length * 3)
        const normalFrom = (values: Float32Array, offset: number, target: Float32Array, targetOffset: number) => {
          const base = values[offset]!
          const dx = values[offset + 1]!
          const dy = values[offset + 2]!
          const dz = values[offset + 3]!
          let nx = base + dx - dy - dz
          let ny = base - dx + dy - dz
          let nz = base - dx - dy + dz
          const length = Math.sqrt(nx * nx + ny * ny + nz * nz)
          if (length < 1e-12) { nx = 0; ny = 1; nz = 0 }
          else { nx /= length; ny /= length; nz /= length }
          target[targetOffset] = nx; target[targetOffset + 1] = ny; target[targetOffset + 2] = nz
        }
        for (let index = 0; index < activeTexels.length; index += 1) {
          normalFrom(normalSamples, index * 4, detailNormals, index * 3)
        }

        const responseQueries = new Float32Array(activeTexels.length * 9 * 3)
        for (let index = 0; index < activeTexels.length; index += 1) {
          const px = hitPoints[index * 3]!
          const py = hitPoints[index * 3 + 1]!
          const pz = hitPoints[index * 3 + 2]!
          const nx = detailNormals[index * 3]!
          const ny = detailNormals[index * 3 + 1]!
          const nz = detailNormals[index * 3 + 2]!
          let tx = -ny; let ty = nx; const tz = 0
          const tangentLength = Math.sqrt(tx * tx + ty * ty)
          if (tangentLength < 1e-6) { tx = 1; ty = 0 }
          else { tx /= tangentLength; ty /= tangentLength }
          const aheadX = px + tx * 0.004
          const aheadY = py + ty * 0.004
          const aheadZ = pz + tz * 0.004
          for (let sample = 0; sample < 4; sample += 1) {
            const target = (index * 9 + sample) * 3
            responseQueries[target] = aheadX + signs[sample]![0] * GRADIENT_STEP
            responseQueries[target + 1] = aheadY + signs[sample]![1] * GRADIENT_STEP
            responseQueries[target + 2] = aheadZ + signs[sample]![2] * GRADIENT_STEP
          }
          for (let sample = 1; sample <= 5; sample += 1) {
            const distance = sample * 0.012
            const target = (index * 9 + sample + 3) * 3
            responseQueries[target] = px + nx * distance
            responseQueries[target + 1] = py + ny * distance
            responseQueries[target + 2] = pz + nz * distance
          }
        }
        const responseSamples = await evaluate(responseQueries)
        if (process.env.TERRAIN_GPU_DEBUG === '1') console.error('granite gpu: response queries complete')
        const normalData = new Uint8Array(texelCount * 3)
        const heightData = new Uint8Array(texelCount)
        const aoData = new Uint8Array(texelCount)
        const curvatureData = new Uint8Array(texelCount)
        normalData.fill(128)
        for (let index = 2; index < normalData.length; index += 3) normalData[index] = 255
        heightData.fill(128)
        aoData.fill(255)
        curvatureData.fill(128)
        let coveredTexels = 0
        let hitTexels = 0
        let peakHeight = 0
        const encodeUnorm = (value: number) => ((Math.max(0, Math.min(1, value)) * 255 + 0.5) | 0)
        const ahead = new Float32Array(3)
        for (let index = 0; index < activeTexels.length; index += 1) {
          const texel = activeTexels[index]!
          coveredTexels += 1
          const nx = detailNormals[index * 3]!
          const ny = detailNormals[index * 3 + 1]!
          const nz = detailNormals[index * 3 + 2]!
          normalData[texel * 3] = encodeUnorm(nx * 0.5 + 0.5)
          normalData[texel * 3 + 1] = encodeUnorm(ny * 0.5 + 0.5)
          normalData[texel * 3 + 2] = encodeUnorm(nz * 0.5 + 0.5)
          const relief = reliefs[index]!
          heightData[texel] = encodeUnorm(relief / (SEARCH_DISTANCE * 2) + 0.5)
          let occlusion = 0
          let weight = 0.6
          for (let sample = 0; sample < 5; sample += 1) {
            const distance = (sample + 1) * 0.012
            occlusion += Math.max(0, distance - responseSamples[index * 9 + sample + 4]!) * weight / distance
            weight *= 0.72
          }
          aoData[texel] = encodeUnorm(Math.max(0, Math.min(1, 1 - occlusion * 0.55)))
          normalFrom(responseSamples, index * 9, ahead, 0)
          let tx = -ny; let ty = nx
          const tangentLength = Math.sqrt(tx * tx + ty * ty)
          if (tangentLength < 1e-6) { tx = 1; ty = 0 }
          else { tx /= tangentLength; ty /= tangentLength }
          const divergence = (ahead[0]! - nx) * tx + (ahead[1]! - ny) * ty
          curvatureData[texel] = encodeUnorm(divergence * 6 + 0.5)
          hitTexels += hits[index]!
          if (Math.abs(relief) > peakHeight) peakHeight = Math.abs(relief)
        }
        dilate(
          [normalData, heightData, aoData, curvatureData],
          [3, 1, 1, 1],
          raster.covered,
          atlasSize,
          atlasSize,
          DILATION_PASSES,
        )
        const channels: CompiledSurfaceBake['channels'] = [
          { semantic: 'normal-object', components: 3, encoding: 'unorm8', scale: 2, bias: -1, data: normalData },
          { semantic: 'height', components: 1, encoding: 'unorm8', scale: SEARCH_DISTANCE * 4, bias: -SEARCH_DISTANCE * 2, data: heightData },
          { semantic: 'ambient-occlusion', components: 1, encoding: 'unorm8', data: aoData },
          { semantic: 'curvature', components: 1, encoding: 'unorm8', scale: 2, bias: -1, data: curvatureData },
        ]
        const identity = identityFor(asset)
        const bake: CompiledSurfaceBake = {
          format: COMPILED_SURFACE_BAKE_FORMAT,
          ...identity,
          domain: 'uv-atlas',
          width: atlasSize,
          height: atlasSize,
          channels,
        }
        assertCompiledSurfaceBake(bake)
        return {
          bake,
          stats: {
            width: atlasSize,
            height: atlasSize,
            coveredTexels,
            coverage: coveredTexels / texelCount,
            hitTexels,
            peakHeight,
            dilationPasses: DILATION_PASSES,
          },
        }
      } finally {
        for (const buffer of buffers) buffer.destroy()
      }
    },
    dispose() {
      disposed = true
      device.destroy()
      // Keep gpuOwner alive. node-webgpu 0.3.0 can finalize Dawn out of order
      // and segfault if its owning object is explicitly released after use.
      void gpuOwner
    },
  }
}
