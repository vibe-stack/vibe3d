/**
 * Kit-local soft-point plume shader — the GPU-resident scattering family from devlo-racing
 * `@visual/fx/plumePoints`, trimmed for handheld-scale props (oranje can). NormalBlending only.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  NormalBlending,
  ShaderMaterial,
  Sphere,
  Vector2,
  type IUniform,
} from 'three/webgpu'

/** Reference viewport half-height for perspective `gl_PointSize` (same as softPoints kit). */
export const REF_HALF_HEIGHT = 540

export interface PlumePointKindParams {
  cycle: number
  riseMax: number
  riseTau: number
  driftSpeed: number
  driftDelay: number
  driftCapTime: number
  wanderBase: number
  wanderGrowth: number
  wanderHz: number
  radiusStart: number
  radiusEnd: number
  radiusPow: number
  radiusCap: number
  alphaPeak: number
  fadeInFrac: number
  fadeOutFrac: number
  alphaFloorFrac: number
  albedoPow: number
  colBase: Color
  colTop: Color
}

export interface PlumePointParams {
  windXZ: readonly [number, number]
  plume: PlumePointKindParams
  haze: PlumePointKindParams
  sizeCapPx: number
}

export interface PlumePointHandle {
  readonly material: ShaderMaterial
  setHalfHeight(px: number): void
  setTime(elapsed: number): void
  setWindXZ(windXZ: readonly [number, number]): void
  setOpacity(opacity: number): void
}

function kindUniforms(p: PlumePointKindParams): Record<string, IUniform> {
  return {
    cycle: { value: p.cycle },
    riseMax: { value: p.riseMax },
    riseTau: { value: p.riseTau },
    driftSpeed: { value: p.driftSpeed },
    driftDelay: { value: p.driftDelay },
    driftCapTime: { value: p.driftCapTime },
    wanderBase: { value: p.wanderBase },
    wanderGrowth: { value: p.wanderGrowth },
    wanderHz: { value: p.wanderHz },
    radiusStart: { value: p.radiusStart },
    radiusEnd: { value: p.radiusEnd },
    radiusPow: { value: p.radiusPow },
    radiusCap: { value: p.radiusCap },
    alphaPeak: { value: p.alphaPeak },
    fadeInFrac: { value: p.fadeInFrac },
    fadeOutFrac: { value: p.fadeOutFrac },
    alphaFloorFrac: { value: p.alphaFloorFrac },
    albedoPow: { value: p.albedoPow },
    colBase: { value: p.colBase.clone() },
    colTop: { value: p.colTop.clone() },
  }
}

const KIND_STRUCT = /* glsl */ `
  struct Kind {
    float cycle; float riseMax; float riseTau;
    float driftSpeed; float driftDelay; float driftCapTime;
    float wanderBase; float wanderGrowth; float wanderHz;
    float radiusStart; float radiusEnd; float radiusPow; float radiusCap;
    float alphaPeak; float fadeInFrac; float fadeOutFrac; float alphaFloorFrac;
    float albedoPow; vec3 colBase; vec3 colTop;
  };
`

function uniformStructValue(p: PlumePointKindParams): Record<string, unknown> {
  const flat = kindUniforms(p)
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(flat)) out[key] = flat[key]!.value
  return out
}

export function createPlumePointMaterial(params: PlumePointParams): PlumePointHandle {
  const uniforms: Record<string, IUniform> = {
    uHalfHeight: { value: REF_HALF_HEIGHT },
    uSizeCap: { value: params.sizeCapPx },
    uOpacity: { value: 1 },
    uTime: { value: 0 },
    uWind: { value: new Vector2(params.windXZ[0], params.windXZ[1]) },
    uPlume: { value: uniformStructValue(params.plume) },
    uHaze: { value: uniformStructValue(params.haze) },
  }

  const material = new ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    vertexShader: /* glsl */ `
      ${KIND_STRUCT}
      attribute vec4 aSeed;
      attribute vec2 aSeed2;
      uniform float uHalfHeight;
      uniform float uSizeCap;
      uniform float uTime;
      uniform vec2 uWind;
      uniform Kind uPlume;
      uniform Kind uHaze;
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        bool haze = aSeed2.y > 0.5;
        Kind K;
        if (haze) { K = uHaze; } else { K = uPlume; }

        float age = fract((uTime - aSeed.x) / K.cycle) * K.cycle;
        float life = aSeed.y;
        vec3 world = position;
        float radius = 0.0;
        float alpha = 0.0;

        if (age < life) {
          float ageN = age / life;
          float rise, riseFrac, driftMag, wander;
          if (haze) {
            rise = K.riseMax + K.riseTau * ageN;
            riseFrac = ageN;
            driftMag = K.driftSpeed * min(age, K.driftCapTime);
            wander = (K.wanderBase + K.wanderGrowth) * sin(uTime * K.wanderHz + aSeed.w);
          } else {
            rise = K.riseMax * (1.0 - exp(-age / K.riseTau));
            riseFrac = rise / K.riseMax;
            driftMag = K.driftSpeed * min(max(age - K.driftDelay, 0.0), K.driftCapTime);
            wander = (K.wanderBase + K.wanderGrowth * riseFrac) * aSeed.z *
                     sin(uTime * K.wanderHz + aSeed.w);
          }
          vec2 perp = vec2(-uWind.y, uWind.x);
          world += vec3(uWind.x * driftMag + perp.x * wander,
                        rise,
                        uWind.y * driftMag + perp.y * wander);

          radius = min(K.radiusStart + (K.radiusEnd - K.radiusStart) * pow(ageN, K.radiusPow),
                       K.radiusCap);

          float fadeIn = smoothstep(0.0, K.fadeInFrac, ageN);
          float fadeOut = 1.0 - smoothstep(1.0 - K.fadeOutFrac, 1.0, ageN) * (1.0 - K.alphaFloorFrac);
          alpha = K.alphaPeak * fadeIn * fadeOut;

          float ct = pow(clamp(riseFrac, 0.0, 1.0), K.albedoPow);
          vColor = mix(K.colBase, K.colTop, ct) * aSeed2.x;
        } else {
          vColor = K.colBase;
        }

        vec4 mvPosition = modelViewMatrix * vec4(world, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        float px = 2.0 * radius * projectionMatrix[1][1] * uHalfHeight / max(-mvPosition.z, 0.05);
        gl_PointSize = min(px, uSizeCap);
        vAlpha = alpha;
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      uniform float uOpacity;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r2 = dot(d, d) * 4.0;
        float g = (exp(-3.0 * r2) - 0.049787) * 1.052374;
        float a = max(g, 0.0) * vAlpha * uOpacity;
        if (a < 0.004) discard;
        gl_FragColor = vec4(vColor, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })

  const flag = (): void => { material.uniformsNeedUpdate = true }
  return {
    material,
    setHalfHeight(px: number) {
      const u = material.uniforms.uHalfHeight
      if (u) u.value = px
      flag()
    },
    setTime(elapsed: number) {
      const u = material.uniforms.uTime
      if (u) u.value = elapsed
      flag()
    },
    setWindXZ(windXZ: readonly [number, number]) {
      const u = material.uniforms.uWind as IUniform<Vector2> | undefined
      if (u) u.value.set(windXZ[0], windXZ[1])
      flag()
    },
    setOpacity(opacity: number) {
      const u = material.uniforms.uOpacity
      if (u) u.value = opacity
      flag()
    },
  }
}

export function buildPlumePointGeometry(count: number): {
  geo: BufferGeometry
  pos: Float32Array
  seed: Float32Array
  seed2: Float32Array
} {
  const pos = new Float32Array(count * 3)
  const seed = new Float32Array(count * 4)
  const seed2 = new Float32Array(count * 2)
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(pos, 3))
  geo.setAttribute('aSeed', new BufferAttribute(seed, 4))
  geo.setAttribute('aSeed2', new BufferAttribute(seed2, 2))
  geo.boundingSphere = new Sphere(undefined, 64)
  return { geo, pos, seed, seed2 }
}
