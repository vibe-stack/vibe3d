import type { Group, PerspectiveCamera, Scene } from 'three/webgpu'

export interface ModelViewState {
  readonly focusY: number
  readonly fov: number
}

export interface ModelAction {
  readonly label: string
  readonly shortcut?: string
  run(): ModelViewState | void
}

export interface ModelViewer {
  readonly scene: Scene
  readonly root: Group
  readonly camera: PerspectiveCamera
  readonly initialView: ModelViewState
  readonly action?: ModelAction
  update(deltaSeconds: number): void
  resize(aspect: number): void
  dispose(): void
}

export interface ModelCatalogEntry {
  readonly id: string
  readonly label: string
  readonly category: string
  readonly description: string
  readonly tags: readonly string[]
  readonly exportName: string
  create(aspect: number): Promise<ModelViewer>
}

interface StaticPreviewAdapter {
  readonly scene: Scene
  readonly root: Group
  readonly camera: PerspectiveCamera
  update(deltaSeconds: number): void
  dispose(): void
}

function adaptStaticPreview(preview: StaticPreviewAdapter, focusY: number): ModelViewer {
  return {
    scene: preview.scene,
    root: preview.root,
    camera: preview.camera,
    initialView: { focusY, fov: preview.camera.fov },
    update: preview.update,
    resize(nextAspect) {
      preview.camera.aspect = nextAspect
      preview.camera.updateProjectionMatrix()
    },
    dispose: preview.dispose,
  }
}

/**
 * The single integration point for future models. Add metadata and a lazy
 * preview adapter here; the index page supplies rendering, controls, stats,
 * actions, selection, and GLB export automatically.
 */
export const MODEL_CATALOG: readonly ModelCatalogEntry[] = [
  {
    id: 'gantry-crane',
    label: 'Gantry Crane',
    category: 'Industrial / Heavy Machinery',
    description: 'Large portal crane with travelling trolley, extensible twin-cable hoist, and articulated hook assembly.',
    tags: ['prop', 'industrial', 'crane', 'interactive'],
    exportName: 'gantry-crane.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/gantry-crane/model.ts')
      const preview = createPreview({ aspect })
      return {
        scene: preview.scene,
        root: preview.root,
        camera: preview.camera,
        initialView: { focusY: 4.25, fov: preview.camera.fov },
        action: {
          label: 'Run lift cycle',
          shortcut: 'Space',
          run() {
            preview.triggerLiftCycle()
          },
        },
        update: preview.update,
        resize(nextAspect) {
          preview.camera.aspect = nextAspect
          preview.camera.updateProjectionMatrix()
        },
        dispose: preview.dispose,
      }
    },
  },
  {
    id: 'pressure-gauge',
    label: 'Pressure Gauge',
    category: 'Industrial / Instrumentation',
    description: 'Wall-mounted analogue service gauge with amber level vial, layered flange, and pipe coupling.',
    tags: ['prop', 'industrial', 'instrumentation'],
    exportName: 'pressure-gauge.glb',
    async create(aspect) {
      const preview = createGaugePreview(await import('../../assets/prototypes/pressure-gauge/model.ts'), aspect)
      return {
        scene: preview.scene,
        root: preview.root,
        camera: preview.camera,
        initialView: { focusY: 2.5, fov: preview.camera.fov },
        action: {
          label: 'Run pressure test',
          shortcut: 'Space',
          run() {
            preview.triggerPressureTest()
          },
        },
        update: preview.update,
        resize(nextAspect) {
          preview.camera.aspect = nextAspect
          preview.camera.updateProjectionMatrix()
        },
        dispose: preview.dispose,
      }
    },
  },
  {
    id: 'industrial-toolbox',
    label: 'Industrial Toolbox',
    category: 'Industrial / Storage',
    description: 'Armored field case with articulated lid, emissive signals, and baked surface wear.',
    tags: ['prop', 'storage', 'interactive'],
    exportName: 'industrial-toolbox.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/industrial-toolbox/model.ts')
      const preview = createPreview({ aspect })
      const closedFov = preview.camera.fov
      let open = false
      return {
        scene: preview.scene,
        root: preview.root,
        camera: preview.camera,
        initialView: { focusY: 1.5, fov: closedFov },
        action: {
          label: 'Toggle lid',
          shortcut: 'Space',
          run() {
            open = !open
            preview.toggleLid()
            return { focusY: open ? 2.4 : 1.5, fov: open ? 25 : closedFov }
          },
        },
        update: preview.update,
        resize(nextAspect) {
          preview.camera.aspect = nextAspect
          preview.camera.updateProjectionMatrix()
        },
        dispose: preview.dispose,
      }
    },
  },
  {
    id: 'respawn-beacon',
    label: 'Respawn Beacon',
    category: 'Gameplay / Information',
    description: 'Octagonal recall beacon: splayed service plinth, raked corner struts, a lit recall cell on each face, and an open crown well.',
    tags: ['prop', 'gameplay', 'landmark', 'emissive'],
    exportName: 'respawn-beacon.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/respawn-beacon/model.ts')
      const preview = createPreview({ aspect })
      return {
        scene: preview.scene,
        root: preview.root,
        camera: preview.camera,
        initialView: { focusY: 0.9, fov: preview.camera.fov },
        update: preview.update,
        resize(nextAspect) {
          preview.camera.aspect = nextAspect
          preview.camera.updateProjectionMatrix()
        },
        dispose: preview.dispose,
      }
    },
  },
  {
    id: 'civic-bench',
    label: 'Civic Bench',
    category: 'Streets / Furnishing',
    description: 'Three-seat cast civic bench with amber perforated back grille, pendant service box, and baked shell wear.',
    tags: ['prop', 'streets', 'furnishing'],
    exportName: 'civic-bench.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/civic-bench/model.ts')
      const preview = createPreview({ aspect })
      return {
        scene: preview.scene,
        root: preview.root,
        camera: preview.camera,
        initialView: { focusY: 2.4, fov: preview.camera.fov },
        // Static prop: no animation channel, so the frame callback is a no-op.
        update: () => {},
        resize(nextAspect) {
          preview.camera.aspect = nextAspect
          preview.camera.updateProjectionMatrix()
        },
        dispose: preview.dispose,
      }
    },
  },
  {
    id: 'armored-supply-crate',
    label: 'Armored Supply Crate',
    category: 'Industrial / Logistics',
    description: 'Armoured freight container with a pale armour frame, dark corner gussets, and a side-hinged octagonal cargo hatch over a lit bay.',
    tags: ['prop', 'industrial', 'logistics', 'storage', 'interactive'],
    exportName: 'armored-supply-crate.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/armored-supply-crate/model.ts')
      const preview = createPreview({ aspect })
      const shutFov = preview.camera.fov
      return {
        scene: preview.scene,
        root: preview.root,
        camera: preview.camera,
        initialView: { focusY: 1.0, fov: shutFov },
        action: {
          label: 'Open hatch',
          shortcut: 'Space',
          run() {
            preview.toggleHatch()
            // The hatch swings well clear of the body, so back off while it is
            // open or the leaf leaves frame on the left.
            return { focusY: 1.0, fov: preview.isOpen() ? shutFov + 6 : shutFov }
          },
        },
        update: preview.update,
        resize(nextAspect) {
          preview.camera.aspect = nextAspect
          preview.camera.updateProjectionMatrix()
        },
        dispose: preview.dispose,
      }
    },
  },
  {
    id: 'robotic-medical-arm',
    label: 'Robotic Medical Arm',
    category: 'Medical / Robotics',
    description: 'Wall-mounted articulated surgical arm with an oblique shoulder gimbal, supported service conduits, and an amber precision tool.',
    tags: ['prop', 'medical', 'robotics', 'interactive'],
    exportName: 'robotic-medical-arm.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/robotic-medical-arm/model.ts')
      const preview = createPreview({ aspect })
      return {
        scene: preview.scene,
        root: preview.root,
        camera: preview.camera,
        initialView: { focusY: 3.0, fov: preview.camera.fov },
        action: {
          label: 'Run calibration',
          shortcut: 'Space',
          run() {
            preview.triggerCalibration()
          },
        },
        update: preview.update,
        resize(nextAspect) {
          preview.camera.aspect = nextAspect
          preview.camera.updateProjectionMatrix()
        },
        dispose: preview.dispose,
      }
    },
  },
  {
    id: 'neon-arcade-cabinet',
    label: 'Neon Arcade Cabinet',
    category: 'Commercial / Entertainment',
    description: 'Armored arcade cabinet with a recessed magenta display, nine-button control bank, side speaker grille, and service hardware.',
    tags: ['prop', 'commercial', 'arcade', 'interactive'],
    exportName: 'neon-arcade-cabinet.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/neon-arcade-cabinet/model.ts')
      const preview = createPreview({ aspect })
      return {
        scene: preview.scene,
        root: preview.root,
        camera: preview.camera,
        initialView: { focusY: 4.15, fov: preview.camera.fov },
        update: preview.update,
        resize(nextAspect) {
          preview.camera.aspect = nextAspect
          preview.camera.updateProjectionMatrix()
        },
        dispose: preview.dispose,
      }
    },
  },
  {
    id: 'amber-specimen-tank',
    label: 'Amber Specimen Tank',
    category: 'Medical / Laboratory',
    description: 'Grounded culture vessel with layered armor rings, supported service plumbing, and a tethered organic specimen in amber fluid.',
    tags: ['prop', 'medical', 'laboratory', 'containment'],
    exportName: 'amber-specimen-tank.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/amber-specimen-tank/model.ts')
      const preview = createPreview({ aspect })
      return {
        scene: preview.scene,
        root: preview.root,
        camera: preview.camera,
        initialView: { focusY: 3.2, fov: preview.camera.fov },
        update: preview.update,
        resize(nextAspect) {
          preview.camera.aspect = nextAspect
          preview.camera.updateProjectionMatrix()
        },
        dispose: preview.dispose,
      }
    },
  },
  {
    id: 'portable-field-generator',
    label: 'Portable Field Generator',
    category: 'Industrial / Power',
    description: 'Grounded portable generator with a layered power module, guarded chassis, terminated load cables, and worn field-service hardware.',
    tags: ['prop', 'industrial', 'power', 'generator', 'interactive'],
    exportName: 'portable-field-generator.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/portable-field-generator/model.ts')
      const preview = createPreview({ aspect })
      return {
        scene: preview.scene,
        root: preview.root,
        camera: preview.camera,
        initialView: { focusY: 1.7, fov: preview.camera.fov },
        action: {
          label: 'Run load test',
          shortcut: 'Space',
          run() {
            preview.triggerLoadPulse()
          },
        },
        update: preview.update,
        resize(nextAspect) {
          preview.camera.aspect = nextAspect
          preview.camera.updateProjectionMatrix()
        },
        dispose: preview.dispose,
      }
    },
  },
  {
    id: 'armored-ventilation-fan',
    label: 'Armored Ventilation Fan',
    category: 'Industrial / Ventilation',
    description: 'Armored field ventilator with a guarded rotating impeller, compound duct throat, connected service plumbing, and grounded protective framing.',
    tags: ['prop', 'industrial', 'ventilation', 'fan', 'animated'],
    exportName: 'armored-ventilation-fan.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/armored-ventilation-fan/model.ts')
      const preview = createPreview({ aspect })
      return {
        scene: preview.scene,
        root: preview.root,
        camera: preview.camera,
        initialView: { focusY: 3.55, fov: preview.camera.fov },
        update: preview.update,
        resize(nextAspect) {
          preview.camera.aspect = nextAspect
          preview.camera.updateProjectionMatrix()
        },
        dispose: preview.dispose,
      }
    },
  },
  {
    id: 'industrial-welding-station',
    label: 'Industrial Welding Station',
    category: 'Industrial / Fabrication',
    description: 'Grounded fabrication station with a cable-fed animated toolhead, perforated work bed, articulated fixtures, and process-specific heat wear.',
    tags: ['prop', 'industrial', 'fabrication', 'welding', 'animated'],
    exportName: 'industrial-welding-station.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/industrial-welding-station/model.ts')
      const preview = createPreview({ aspect })
      return {
        scene: preview.scene,
        root: preview.root,
        camera: preview.camera,
        initialView: { focusY: 3.45, fov: preview.camera.fov },
        update: preview.update,
        resize(nextAspect) {
          preview.camera.aspect = nextAspect
          preview.camera.updateProjectionMatrix()
        },
        dispose: preview.dispose,
      }
    },
  },
  {
    id: 'armored-battery-bank',
    label: 'Armored Battery Bank',
    category: 'Industrial / Power',
    description: 'Grounded armored power bank with six captured battery cartridges, a layered connector throat, and animated charge indicators.',
    tags: ['prop', 'industrial', 'power', 'battery', 'animated'],
    exportName: 'armored-battery-bank.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/armored-battery-bank/model.ts')
      const preview = createPreview({ aspect })
      return {
        scene: preview.scene,
        root: preview.root,
        camera: preview.camera,
        initialView: { focusY: 2.45, fov: preview.camera.fov },
        update: preview.update,
        resize(nextAspect) {
          preview.camera.aspect = nextAspect
          preview.camera.updateProjectionMatrix()
        },
        dispose: preview.dispose,
      }
    },
  },
  {
    id: 'freestanding-service-terminal',
    label: 'Freestanding Service Terminal',
    category: 'Industrial / Interface',
    description: 'Tall grounded service terminal with a recessed procedural display, connected handset, captured cradle, and worn compound shell.',
    tags: ['prop', 'industrial', 'terminal', 'interface', 'animated'],
    exportName: 'freestanding-service-terminal.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/freestanding-service-terminal/model.ts')
      const preview = createPreview({ aspect })
      return {
        scene: preview.scene,
        root: preview.root,
        camera: preview.camera,
        initialView: { focusY: 4.45, fov: preview.camera.fov },
        update: preview.update,
        resize(nextAspect) {
          preview.camera.aspect = nextAspect
          preview.camera.updateProjectionMatrix()
        },
        dispose: preview.dispose,
      }
    },
  },
  {
    id: 'industrial-compressor',
    label: 'Industrial Compressor',
    category: 'Industrial / Machinery',
    description: 'Grounded horizontal compressor with a captured rotating turbine, flange-connected service manifold, compound shell bands, and heavy support bed.',
    tags: ['prop', 'industrial', 'machinery', 'compressor', 'animated'],
    exportName: 'industrial-compressor.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/industrial-compressor/model.ts')
      const preview = createPreview({ aspect })
      return {
        scene: preview.scene,
        root: preview.root,
        camera: preview.camera,
        initialView: { focusY: 2.4, fov: preview.camera.fov },
        update: preview.update,
        resize(nextAspect) {
          preview.camera.aspect = nextAspect
          preview.camera.updateProjectionMatrix()
        },
        dispose: preview.dispose,
      }
    },
  },
  {
    id: 'industrial-winch',
    label: 'Industrial Winch',
    category: 'Industrial / Machinery',
    description: 'Grounded armored winch with a captured rotating drum, densely wound cable package, seated guide and fairlead hardware, and restrained service wear.',
    tags: ['prop', 'industrial', 'machinery', 'winch', 'animated'],
    exportName: 'industrial-winch.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/industrial-winch/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 1.65)
    },
  },
  {
    id: 'military-radar-dish',
    label: 'Military Radar Dish',
    category: 'Military / Surveillance',
    description: 'Grounded tracking radar with a deep reinforced dish, collar-supported feed horn, articulated elevation yoke, and animated azimuth sweep.',
    tags: ['prop', 'military', 'radar', 'surveillance', 'animated'],
    exportName: 'military-radar-dish.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/military-radar-dish/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 3.05)
    },
  },
  {
    id: 'medical-imaging-scanner',
    label: 'Medical Imaging Scanner',
    category: 'Medical / Imaging',
    description: 'Grounded medical scanner with a layered illuminated bore, rail-captured translating patient bed, mounted control pod, and connected service hardware.',
    tags: ['prop', 'medical', 'scanner', 'imaging', 'animated'],
    exportName: 'medical-imaging-scanner.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/medical-imaging-scanner/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 1.9)
    },
  },
  {
    id: 'industrial-pump',
    label: 'Industrial Pump',
    category: 'Industrial / Machinery',
    description: 'Grounded process pump with a captured impeller, flange-connected top and side manifolds, collared service cables, and a toggleable operating cycle.',
    tags: ['prop', 'industrial', 'machinery', 'pump', 'interactive'],
    exportName: 'industrial-pump.glb',
    async create(aspect) {
      const { createPreview, togglePump } = await import('../../assets/prototypes/industrial-pump/model.ts')
      const preview = createPreview({ aspect })
      let enabled = false
      return {
        scene: preview.scene,
        root: preview.root,
        camera: preview.camera,
        initialView: { focusY: 2.3, fov: preview.camera.fov },
        action: {
          label: 'Toggle pump',
          shortcut: 'Space',
          run() {
            enabled = !enabled
            togglePump(enabled)
          },
        },
        update: preview.update,
        resize(nextAspect) {
          preview.camera.aspect = nextAspect
          preview.camera.updateProjectionMatrix()
        },
        dispose() {
          togglePump(false)
          preview.dispose()
        },
      }
    },
  },
  {
    id: 'military-sensor-array',
    label: 'Military Sensor Array',
    category: 'Military / Surveillance',
    description: 'Grounded articulated sensor head with seven recessed amber optics, coaxial yoke bearings, a layered azimuth base, and toggleable tracking.',
    tags: ['prop', 'military', 'sensor', 'surveillance', 'interactive'],
    exportName: 'military-sensor-array.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/military-sensor-array/model.ts')
      const preview = createPreview({ aspect })
      return {
        scene: preview.scene,
        root: preview.root,
        camera: preview.camera,
        initialView: { focusY: 2.75, fov: preview.camera.fov },
        action: {
          label: 'Toggle tracking',
          shortcut: 'Space',
          run() {
            preview.toggleTracking()
          },
        },
        update: preview.update,
        resize(nextAspect) {
          preview.camera.aspect = nextAspect
          preview.camera.updateProjectionMatrix()
        },
        dispose: preview.dispose,
      }
    },
  },
  {
    id: 'microscope-science-station',
    label: 'Microscope Science Station',
    category: 'Medical / Laboratory',
    description: 'Grounded laboratory microscope with captured binocular optics, supported sample stage, objective stack, service instrumentation, and a toggleable scan.',
    tags: ['prop', 'medical', 'laboratory', 'microscope', 'interactive'],
    exportName: 'microscope-science-station.glb',
    async create(aspect) {
      const { createPreview, toggleScan } = await import('../../assets/prototypes/microscope-science-station/model.ts')
      const preview = createPreview({ aspect })
      let enabled = false
      return {
        scene: preview.scene,
        root: preview.root,
        camera: preview.camera,
        initialView: { focusY: 1.85, fov: preview.camera.fov },
        action: {
          label: 'Toggle scan',
          shortcut: 'Space',
          run() {
            enabled = !enabled
            toggleScan(enabled)
          },
        },
        update: preview.update,
        resize(nextAspect) {
          preview.camera.aspect = nextAspect
          preview.camera.updateProjectionMatrix()
        },
        dispose() {
          toggleScan(false)
          preview.dispose()
        },
      }
    },
  },
  {
    id: 'industrial-heat-exchanger',
    label: 'Industrial Heat Exchanger',
    category: 'Industrial / Machinery',
    description: 'Grounded armored heat exchanger with a dense copper coil bank, load-bearing face braces, socketed return plumbing, and a retained amber sight cylinder.',
    tags: ['prop', 'industrial', 'machinery', 'heat-exchanger', 'static'],
    exportName: 'industrial-heat-exchanger.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/industrial-heat-exchanger/model.ts')
      const preview = createPreview({ aspect })
      return {
        scene: preview.scene,
        root: preview.root,
        camera: preview.camera,
        initialView: { focusY: 2.35, fov: preview.camera.fov },
        update() {},
        resize(nextAspect) {
          preview.camera.aspect = nextAspect
          preview.camera.updateProjectionMatrix()
        },
        dispose: preview.dispose,
      }
    },
  },
  {
    id: 'medical-operating-light',
    label: 'Medical Operating Light',
    category: 'Medical / Laboratory',
    description: 'Compact mounted examination light with an asymmetric compound support, deep graphite optical throat, ribbed amber diffuser, and toggleable illumination pulse.',
    tags: ['prop', 'medical', 'laboratory', 'light', 'interactive'],
    exportName: 'medical-operating-light.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/medical-operating-light/model.ts')
      const preview = createPreview({ aspect })
      let enabled = false
      return {
        scene: preview.scene,
        root: preview.root,
        camera: preview.camera,
        initialView: { focusY: 1.3, fov: preview.camera.fov },
        action: {
          label: 'Toggle light pulse',
          shortcut: 'Space',
          run() {
            enabled = !enabled
            preview.toggleLightPulse(enabled)
          },
        },
        update: preview.update,
        resize(nextAspect) {
          preview.camera.aspect = nextAspect
          preview.camera.updateProjectionMatrix()
        },
        dispose() {
          preview.toggleLightPulse(false)
          preview.dispose()
        },
      }
    },
  },
  {
    id: 'military-tactical-floodlight',
    label: 'Military Tactical Floodlight',
    category: 'Military / Equipment',
    description: 'Grounded pan-and-tilt floodlight with a deep armored head, unified amber glazing over eight recessed cells, bilateral yoke bearings, and toggleable tracking.',
    tags: ['prop', 'military', 'equipment', 'floodlight', 'interactive'],
    exportName: 'military-tactical-floodlight.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/military-tactical-floodlight/model.ts')
      const preview = createPreview({ aspect })
      let enabled = false
      return {
        scene: preview.scene,
        root: preview.root,
        camera: preview.camera,
        initialView: { focusY: 2.2, fov: preview.camera.fov },
        action: {
          label: 'Toggle tracking',
          shortcut: 'Space',
          run() {
            enabled = !enabled
            preview.toggleTracking(enabled)
          },
        },
        update: preview.update,
        resize(nextAspect) {
          preview.camera.aspect = nextAspect
          preview.camera.updateProjectionMatrix()
        },
        dispose() {
          preview.toggleTracking(false)
          preview.dispose()
        },
      }
    },
  },
  {
    id: 'industrial-hose-reel',
    label: 'Industrial Hose Reel',
    category: 'Industrial / Machinery',
    description: 'Grounded wall-backed hose reel with dense yellow windings, captured drum bearings, continuous upper and lower plumbing, and a retained payout handpiece.',
    tags: ['prop', 'industrial', 'machinery', 'hose-reel', 'interactive'],
    exportName: 'industrial-hose-reel.glb',
    async create(aspect) {
      const { createPreview, toggleHoseReel } = await import('../../assets/prototypes/industrial-hose-reel/model.ts')
      const preview = createPreview({ aspect })
      let enabled = false
      return {
        scene: preview.scene,
        root: preview.root,
        camera: preview.camera,
        initialView: { focusY: 2.45, fov: preview.camera.fov },
        action: {
          label: 'Toggle reel motion',
          shortcut: 'Space',
          run() {
            enabled = !enabled
            toggleHoseReel(enabled)
          },
        },
        update: preview.update,
        resize(nextAspect) {
          preview.camera.aspect = nextAspect
          preview.camera.updateProjectionMatrix()
        },
        dispose() {
          toggleHoseReel(false)
          preview.dispose()
        },
      }
    },
  },
  {
    id: 'medical-examination-table',
    label: 'Medical Examination Table',
    category: 'Medical / Laboratory',
    description: 'Grounded articulated examination table with five captured cushions, compound lift hardware, a deep service base, and toggleable lift-and-tilt motion.',
    tags: ['prop', 'medical', 'laboratory', 'examination-table', 'interactive'],
    exportName: 'medical-examination-table.glb',
    async create(aspect) {
      const { createPreview, toggleTableMotion } = await import('../../assets/prototypes/medical-examination-table/model.ts')
      const preview = createPreview({ aspect })
      let enabled = false
      return {
        scene: preview.scene,
        root: preview.root,
        camera: preview.camera,
        initialView: { focusY: 1.65, fov: preview.camera.fov },
        action: {
          label: 'Toggle table motion',
          shortcut: 'Space',
          run() {
            enabled = !enabled
            toggleTableMotion(enabled)
          },
        },
        update: preview.update,
        resize(nextAspect) {
          preview.camera.aspect = nextAspect
          preview.camera.updateProjectionMatrix()
        },
        dispose() {
          toggleTableMotion(false)
          preview.dispose()
        },
      }
    },
  },
  {
    id: 'military-communications-mast',
    label: 'Military Communications Mast',
    category: 'Military / Communications',
    description: 'Tall grounded communications mast with a segmented truss spine, armored service cabinets, four captured guy struts, broad outriggers, and toggleable antenna tracking.',
    tags: ['prop', 'military', 'communications', 'mast', 'interactive'],
    exportName: 'military-communications-mast.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/military-communications-mast/model.ts')
      const preview = createPreview({ aspect })
      let enabled = false
      return {
        scene: preview.scene,
        root: preview.root,
        camera: preview.camera,
        initialView: { focusY: 4.2, fov: preview.camera.fov },
        action: {
          label: 'Toggle antenna tracking',
          shortcut: 'Space',
          run() {
            enabled = !enabled
            preview.toggleTracking(enabled)
          },
        },
        update: preview.update,
        resize(nextAspect) {
          preview.camera.aspect = nextAspect
          preview.camera.updateProjectionMatrix()
        },
        dispose() {
          preview.toggleTracking(false)
          preview.dispose()
        },
      }
    },
  },
  {
    id: 'industrial-electrical-switchboard',
    label: 'Industrial Electrical Switchboard',
    category: 'Industrial / Electrical',
    description: 'Grounded armored switchboard with a deep breaker bay, mechanically captured amber lever, status bank, vented service panels, and terminated conduits.',
    tags: ['prop', 'industrial', 'electrical', 'switchboard', 'interactive'],
    exportName: 'industrial-electrical-switchboard.glb',
    async create(aspect) {
      const { createPreview, toggleSwitchboard } = await import('../../assets/prototypes/industrial-electrical-switchboard/model.ts')
      const preview = createPreview({ aspect })
      let enabled = false
      return {
        scene: preview.scene,
        root: preview.root,
        camera: preview.camera,
        initialView: { focusY: 2.85, fov: preview.camera.fov },
        action: {
          label: 'Toggle breaker',
          shortcut: 'Space',
          run() {
            enabled = !enabled
            toggleSwitchboard(enabled)
          },
        },
        update: preview.update,
        resize(nextAspect) {
          preview.camera.aspect = nextAspect
          preview.camera.updateProjectionMatrix()
        },
        dispose() {
          toggleSwitchboard(false)
          preview.dispose()
        },
      }
    },
  },
  {
    id: 'medical-hospital-bed',
    label: 'Medical Hospital Bed',
    category: 'Medical / Laboratory',
    description: 'Long grounded hospital bed with segmented cushions, thick open end boards, supported side guards, an open service undercarriage, and toggleable lift motion.',
    tags: ['prop', 'medical', 'laboratory', 'hospital-bed', 'interactive'],
    exportName: 'medical-hospital-bed.glb',
    async create(aspect) {
      const { createPreview, toggleBedMotion } = await import('../../assets/prototypes/medical-hospital-bed/model.ts')
      const preview = createPreview({ aspect })
      let enabled = false
      return {
        scene: preview.scene,
        root: preview.root,
        camera: preview.camera,
        initialView: { focusY: 1.45, fov: preview.camera.fov },
        action: {
          label: 'Toggle bed motion',
          shortcut: 'Space',
          run() {
            enabled = !enabled
            toggleBedMotion(enabled)
          },
        },
        update: preview.update,
        resize(nextAspect) {
          preview.camera.aspect = nextAspect
          preview.camera.updateProjectionMatrix()
        },
        dispose() {
          toggleBedMotion(false)
          preview.dispose()
        },
      }
    },
  },
  {
    id: 'military-sentry-emplacement',
    label: 'Military Sentry Emplacement',
    category: 'Military / Surveillance',
    description: 'Grounded sensor emplacement with a broad armored service base, deep azimuth ring, bilateral articulated yoke, recessed amber optic, and toggleable tracking.',
    tags: ['prop', 'military', 'surveillance', 'sentry', 'interactive'],
    exportName: 'military-sentry-emplacement.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/military-sentry-emplacement/model.ts')
      const preview = createPreview({ aspect })
      let enabled = false
      return {
        scene: preview.scene,
        root: preview.root,
        camera: preview.camera,
        initialView: { focusY: 2.4, fov: preview.camera.fov },
        action: {
          label: 'Toggle sentry tracking',
          shortcut: 'Space',
          run() {
            enabled = !enabled
            preview.toggleTracking(enabled)
          },
        },
        update: preview.update,
        resize(nextAspect) {
          preview.camera.aspect = nextAspect
          preview.camera.updateProjectionMatrix()
        },
        dispose() {
          preview.toggleTracking(false)
          preview.dispose()
        },
      }
    },
  },
  {
    id: 'industrial-control-desk',
    label: 'Industrial Control Desk',
    category: 'Industrial / Controls',
    description: 'Grounded operator desk with a broad armored work surface, raked three-bay control face, single analytic screen, physical breaker banks, rear cooling, and toggleable controls.',
    tags: ['prop', 'industrial', 'control-desk', 'console', 'interactive'],
    exportName: 'industrial-control-desk.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/industrial-control-desk/model.ts')
      const preview = createPreview({ aspect })
      let enabled = false
      return {
        scene: preview.scene,
        root: preview.root,
        camera: preview.camera,
        initialView: { focusY: 2.5, fov: preview.camera.fov },
        action: {
          label: 'Toggle control banks',
          shortcut: 'Space',
          run() {
            enabled = !enabled
            preview.toggleControls(enabled)
          },
        },
        update: preview.update,
        resize(nextAspect) {
          preview.camera.aspect = nextAspect
          preview.camera.updateProjectionMatrix()
        },
        dispose() {
          preview.toggleControls(false)
          preview.dispose()
        },
      }
    },
  },
  {
    id: 'medical-cart',
    label: 'Medical Cart',
    category: 'Medical / Laboratory',
    description: 'Four-caster medical cart with a heavy pull chassis, captured drawer bank, integrated side service bay, guarded worktop cargo, and toggleable supply drawer.',
    tags: ['prop', 'medical', 'laboratory', 'cart', 'interactive'],
    exportName: 'medical-cart.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/medical-cart/model.ts')
      const preview = createPreview({ aspect })
      let enabled = false
      return {
        scene: preview.scene,
        root: preview.root,
        camera: preview.camera,
        initialView: { focusY: 2.45, fov: preview.camera.fov },
        action: {
          label: 'Toggle supply drawer',
          shortcut: 'Space',
          run() {
            enabled = !enabled
            preview.toggleService(enabled)
          },
        },
        update: preview.update,
        resize(nextAspect) {
          preview.camera.aspect = nextAspect
          preview.camera.updateProjectionMatrix()
        },
        dispose() {
          preview.toggleService(false)
          preview.dispose()
        },
      }
    },
  },
  {
    id: 'military-checkpoint-booth',
    label: 'Military Checkpoint Booth',
    category: 'Military / Infrastructure',
    description: 'Continuous armored checkpoint cabin with one deep staffed viewport, closed rear service shell, projecting analytic console, collared side handles, and toggleable status lights.',
    tags: ['prop', 'military', 'checkpoint', 'booth', 'interactive'],
    exportName: 'military-checkpoint-booth.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/military-checkpoint-booth/model.ts')
      const preview = createPreview({ aspect })
      let enabled = false
      return {
        scene: preview.scene,
        root: preview.root,
        camera: preview.camera,
        initialView: { focusY: 3.0, fov: preview.camera.fov },
        action: {
          label: 'Toggle booth lights',
          shortcut: 'Space',
          run() {
            enabled = !enabled
            preview.toggleBoothLights(enabled)
          },
        },
        update: preview.update,
        resize(nextAspect) {
          preview.camera.aspect = nextAspect
          preview.camera.updateProjectionMatrix()
        },
        dispose() {
          preview.toggleBoothLights(false)
          preview.dispose()
        },
      }
    },
  },
  {
    id: 'industrial-air-intake',
    label: 'Industrial Air Intake',
    category: 'Industrial / Ventilation',
    description: 'Grounded armored intake with a deep mesh-backed throat, three captured amber vanes, top exhaust grille, broad mounting feet, and a toggleable internal rotor.',
    tags: ['prop', 'industrial', 'ventilation', 'air-intake', 'interactive'],
    exportName: 'industrial-air-intake.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/industrial-air-intake/model.ts')
      const preview = createPreview({ aspect })
      let enabled = false
      return {
        scene: preview.scene,
        root: preview.root,
        camera: preview.camera,
        initialView: { focusY: 2.0, fov: preview.camera.fov },
        action: {
          label: 'Toggle intake rotor',
          shortcut: 'Space',
          run() {
            enabled = !enabled
            preview.toggleIntake(enabled)
          },
        },
        update: preview.update,
        resize(nextAspect) {
          preview.camera.aspect = nextAspect
          preview.camera.updateProjectionMatrix()
        },
        dispose() {
          preview.toggleIntake(false)
          preview.dispose()
        },
      }
    },
  },
  {
    id: 'industrial-cable-spool',
    label: 'Industrial Cable Spool',
    category: 'Industrial / Utilities',
    description: 'Grounded utility spool with open load towers, a captured axle and drum, twenty dense cable windings, a hosted payout run, top guide, and toggleable rotation.',
    tags: ['prop', 'industrial', 'utility', 'cable-spool', 'interactive'],
    exportName: 'industrial-cable-spool.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/industrial-cable-spool/model.ts')
      const preview = createPreview({ aspect })
      let enabled = false
      return {
        scene: preview.scene,
        root: preview.root,
        camera: preview.camera,
        initialView: { focusY: 2.25, fov: preview.camera.fov },
        action: {
          label: 'Toggle spool rotation',
          shortcut: 'Space',
          run() {
            enabled = !enabled
            preview.toggleSpool(enabled)
          },
        },
        update: preview.update,
        resize(nextAspect) {
          preview.camera.aspect = nextAspect
          preview.camera.updateProjectionMatrix()
        },
        dispose() {
          preview.toggleSpool(false)
          preview.dispose()
        },
      }
    },
  },
  {
    id: 'industrial-maintenance-trolley',
    label: 'Industrial Maintenance Trolley',
    category: 'Industrial / Service',
    description: 'Long grounded service trolley with four captured casters, a guarded work tray, deep retained tool bay, recessed end console, pull loop, and toggleable drawer.',
    tags: ['prop', 'industrial', 'service', 'maintenance', 'trolley', 'interactive'],
    exportName: 'industrial-maintenance-trolley.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/industrial-maintenance-trolley/model.ts')
      const preview = createPreview({ aspect })
      let enabled = false
      return {
        scene: preview.scene,
        root: preview.root,
        camera: preview.camera,
        initialView: { focusY: 2.45, fov: preview.camera.fov },
        action: {
          label: 'Toggle service drawer',
          shortcut: 'Space',
          run() {
            enabled = !enabled
            preview.toggleService(enabled)
          },
        },
        update: preview.update,
        resize(nextAspect) {
          preview.camera.aspect = nextAspect
          preview.camera.updateProjectionMatrix()
        },
        dispose() {
          preview.toggleService(false)
          preview.dispose()
        },
      }
    },
  },
  {
    id: 'industrial-cylinder-rack',
    label: 'Industrial Cylinder Rack',
    category: 'Industrial / Storage',
    description: 'Deep armored transport rack with six retained service cylinders, individual saddles, layered pressure caps, handling bars, a closed service back, and bounded latch state.',
    tags: ['prop', 'industrial', 'storage', 'cylinder-rack', 'interactive'],
    exportName: 'industrial-cylinder-rack.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/industrial-cylinder-rack/model.ts')
      const preview = createPreview({ aspect })
      let enabled = false
      return {
        scene: preview.scene,
        root: preview.root,
        camera: preview.camera,
        initialView: { focusY: 2.5, fov: preview.camera.fov },
        action: { label: 'Toggle vessel latches', shortcut: 'Space', run() { enabled = !enabled; preview.toggleRack(enabled) } },
        update: preview.update,
        resize(nextAspect) { preview.camera.aspect = nextAspect; preview.camera.updateProjectionMatrix() },
        dispose() { preview.toggleRack(false); preview.dispose() },
      }
    },
  },
  {
    id: 'industrial-workbench',
    label: 'Industrial Workbench',
    category: 'Industrial / Service',
    description: 'Grounded armored workbench with a recessed tool wall, retained hand tools and bins, grille and service well, framed drawers, equipment bay, and captured service drawer.',
    tags: ['prop', 'industrial', 'service', 'workbench', 'interactive'],
    exportName: 'industrial-workbench.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/industrial-workbench/model.ts')
      const preview = createPreview({ aspect })
      let enabled = false
      return {
        scene: preview.scene,
        root: preview.root,
        camera: preview.camera,
        initialView: { focusY: 2.8, fov: preview.camera.fov },
        action: { label: 'Toggle service drawer', shortcut: 'Space', run() { enabled = !enabled; preview.toggleBench(enabled) } },
        update: preview.update,
        resize(nextAspect) { preview.camera.aspect = nextAspect; preview.camera.updateProjectionMatrix() },
        dispose() { preview.toggleBench(false); preview.dispose() },
      }
    },
  },
  {
    id: 'industrial-hopper',
    label: 'Industrial Hopper',
    category: 'Industrial / Processing',
    description: 'Squat enclosed processing hopper with a true converging intake cavity, sloped floor, captured amber lip, rear metering gate, hinge dampers, continuous side armor, and grounded service base.',
    tags: ['prop', 'industrial', 'processing', 'hopper', 'interactive'],
    exportName: 'industrial-hopper.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/industrial-hopper/model.ts')
      const preview = createPreview({ aspect })
      let enabled = false
      return {
        scene: preview.scene,
        root: preview.root,
        camera: preview.camera,
        initialView: { focusY: 2.2, fov: preview.camera.fov },
        action: { label: 'Toggle metering gate', shortcut: 'Space', run() { enabled = !enabled; preview.toggleHopper(enabled) } },
        update: preview.update,
        resize(nextAspect) { preview.camera.aspect = nextAspect; preview.camera.updateProjectionMatrix() },
        dispose() { preview.toggleHopper(false); preview.dispose() },
      }
    },
  },
  {
    id: 'storm-point-large-gate',
    label: 'Large Gate',
    category: 'Hero / Storm Point',
    description: 'Armored twin-leaf vehicle gate with deep guide towers, a rising center interlock, and alarm-red opening state.',
    tags: ['hero', 'storm-point', 'architecture', 'interactive'],
    exportName: 'storm-point-large-gate.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/storm-point-large-gate/model.ts')
      const preview = createPreview({ aspect })
      const shutFov = preview.camera.fov
      return {
        scene: preview.scene,
        root: preview.root,
        camera: preview.camera,
        initialView: { focusY: 9.4, fov: shutFov },
        action: {
          label: 'Open gate',
          shortcut: 'Space',
          run() {
            preview.toggleGate()
            // Pull back a little while the leaves are travelling so both towers
            // and the full opening stay in frame.
            return { focusY: 9.4, fov: preview.isOpen() ? shutFov + 4 : shutFov }
          },
        },
        update: preview.update,
        resize(nextAspect) {
          preview.camera.aspect = nextAspect
          preview.camera.updateProjectionMatrix()
        },
        dispose: preview.dispose,
      }
    },
  },
  {
    id: 'building-threshold',
    label: 'Building Threshold',
    category: 'Architecture / Modular Pieces',
    description: 'Vented modular doorway tread with amber guides, captured service bay, and exact two-metre snap envelope.',
    tags: ['architecture', 'modular', 'threshold', 'door'],
    exportName: 'building-threshold.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/building-threshold/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 0.2)
    },
  },
  {
    id: 'ceiling-slab-panel',
    label: 'Ceiling Slab Panel',
    category: 'Architecture / Modular Pieces',
    description: 'Two-metre ceiling cassette with a supported underside grille, perimeter return, mounts, and central luminaire.',
    tags: ['architecture', 'modular', 'ceiling', 'slab'],
    exportName: 'ceiling-slab-panel.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/ceiling-slab-panel/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 0.1)
    },
  },
  {
    id: 'door-bay',
    label: 'Door Bay',
    category: 'Architecture / Modular Pieces',
    description: 'Three-metre modular doorway bay with nested receiver frame, service controls, socket blocks, and grounded sill.',
    tags: ['architecture', 'modular', 'wall', 'door'],
    exportName: 'door-bay.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/door-bay/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 1.5)
    },
  },
  {
    id: 'exterior-wall-corner',
    label: 'Exterior Wall Corner',
    category: 'Architecture / Modular Pieces',
    description: 'Exterior two-way modular wall corner with grounded load frame, service chase, and east/south snap faces.',
    tags: ['architecture', 'modular', 'wall', 'corner'],
    exportName: 'exterior-wall-corner.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/exterior-wall-corner/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 1.5)
    },
  },
  {
    id: 'floor-slab-tile',
    label: 'Floor Slab Tile',
    category: 'Architecture / Modular Pieces',
    description: 'Two-metre floor tile with inset center plate, corner receivers, perimeter contact rail, and seated amber strips.',
    tags: ['architecture', 'modular', 'floor', 'slab'],
    exportName: 'floor-slab-tile.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/floor-slab-tile/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 0.15)
    },
  },
  {
    id: 'foundation-interface',
    label: 'Foundation Interface',
    category: 'Architecture / Modular Pieces',
    description: 'Grounded foundation interface with four piston receivers, compound deck, outriggers, and service ports.',
    tags: ['architecture', 'modular', 'foundation', 'floor'],
    exportName: 'foundation-interface.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/foundation-interface/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 0.25)
    },
  },
  {
    id: 'interior-wall-corner',
    label: 'Interior Wall Corner',
    category: 'Architecture / Modular Pieces',
    description: 'Interior two-way modular wall corner with a maintained load frame, service chase, and exact snap datums.',
    tags: ['architecture', 'modular', 'wall', 'corner', 'interior'],
    exportName: 'interior-wall-corner.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/interior-wall-corner/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 1.5)
    },
  },
  {
    id: 'roof-floor-edge-module',
    label: 'Roof / Floor Edge Module',
    category: 'Architecture / Modular Pieces',
    description: 'Shallow two-metre edge module with sculpted cap runs, captured service pipe, end armor, and snap surfaces.',
    tags: ['architecture', 'modular', 'roof', 'floor', 'edge'],
    exportName: 'roof-floor-edge-module.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/roof-floor-edge-module/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 0.2)
    },
  },
  {
    id: 'wall-end-cap',
    label: 'Wall End Cap',
    category: 'Architecture / Modular Pieces',
    description: 'Narrow armored C-section wall termination with tiered crown, grounded plinth, service spine, and open throat.',
    tags: ['architecture', 'modular', 'wall', 'end-cap'],
    exportName: 'wall-end-cap.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/wall-end-cap/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 1.5)
    },
  },
  {
    id: 'wall-return',
    label: 'Wall Return',
    category: 'Architecture / Modular Pieces',
    description: 'One-metre right-angle wall return with modular east/south connections and grounded structural shell.',
    tags: ['architecture', 'modular', 'wall', 'return'],
    exportName: 'wall-return.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/wall-return/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 1.5)
    },
  },
  {
    id: 'wall-t-junction',
    label: 'Wall T-Junction',
    category: 'Architecture / Modular Pieces',
    description: 'Three-way wall junction with continuous T-plan crown/plinth, framed branch cassettes, and serviced central hub.',
    tags: ['architecture', 'modular', 'wall', 'junction'],
    exportName: 'wall-t-junction.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/wall-t-junction/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 1.5)
    },
  },
  {
    id: 'window-bay',
    label: 'Window Bay',
    category: 'Architecture / Modular Pieces',
    description: 'Two-metre window bay with deep stepped receiver, broad load piers, vented sill, glazing, and cyan service pods.',
    tags: ['architecture', 'modular', 'wall', 'window'],
    exportName: 'window-bay.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/window-bay/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 1.0)
    },
  },
  {
    id: 'gate-lintel',
    label: 'Gate Lintel',
    category: 'Architecture / Modular Pieces',
    description: 'Four-metre modular gate lintel with end machinery, supported service race, and post seating sockets.',
    tags: ['architecture', 'modular', 'gate', 'lintel'],
    exportName: 'gate-lintel.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/gate-lintel/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 0.4)
    },
  },
  {
    id: 'gate-post-pair',
    label: 'Gate Post Pair',
    category: 'Architecture / Modular Pieces',
    description: 'Six-metre gate-post pair preserving a four-metre clear span with grounded posts, guide channels, and return sockets.',
    tags: ['architecture', 'modular', 'gate', 'posts'],
    exportName: 'gate-post-pair.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/gate-post-pair/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 2.0)
    },
  },
  {
    id: 'gate-wall-return',
    label: 'Gate Wall Return',
    category: 'Architecture / Modular Pieces',
    description: 'Two-metre gate wing return with tiered base, service socket, conduit anatomy, and gate-post connection.',
    tags: ['architecture', 'modular', 'gate', 'wall', 'return'],
    exportName: 'gate-wall-return.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/gate-wall-return/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 1.5)
    },
  },
  {
    id: 'checkpoint-gate-assembly',
    label: 'Checkpoint Gate Assembly',
    category: 'Architecture / Prefabs',
    description: 'Twelve-metre checkpoint prefab with compound portal, wing returns, booth, barrier system, lane, and service islands.',
    tags: ['architecture', 'prefab', 'gate', 'checkpoint'],
    exportName: 'checkpoint-gate-assembly.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/checkpoint-gate-assembly/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 2.0)
    },
  },
  {
    id: 'room-shell',
    label: 'Room Shell',
    category: 'Architecture / Prefabs',
    description: 'Four-metre room-shell prefab with open roof, interior divider, framed openings, wall cassettes, and grounded plinth.',
    tags: ['architecture', 'prefab', 'room', 'shell'],
    exportName: 'room-shell.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/room-shell/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 1.5)
    },
  },
  {
    id: 'small-building-shell',
    label: 'Small Building Shell',
    category: 'Architecture / Prefabs',
    description: 'Two-bay grid prefab from the reference plate: square bays either side of a full-height partition, on a 9 x 5 m plinth.',
    tags: ['architecture', 'prefab', 'building', 'shell'],
    exportName: 'small-building-shell.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/small-building-shell/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 2.0)
    },
  },
  {
    id: 'clinic-facade-module',
    label: 'Clinic Facade Module',
    category: 'Architecture / Modular Pieces',
    description: 'One 4 m Olympus clinic elevation: pale cassette courses, a vented base band, the cobalt cross badge, and a corner column at each end.',
    tags: ['architecture', 'modular', 'wall', 'facade', 'olympus', 'medical'],
    exportName: 'clinic-facade-module.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/clinic-facade-module/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 1.7)
    },
  },
  {
    id: 'treatment-rooms',
    label: 'Treatment Rooms',
    category: 'Architecture / Prefabs',
    description: 'The clinic pod fit-out: lined shell interior, examination berth, wall stores, corner lamp column, and cobalt cove lighting.',
    tags: ['architecture', 'prefab', 'interior', 'medical', 'olympus'],
    exportName: 'treatment-rooms.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/treatment-rooms/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 1.5)
    },
  },
  {
    id: 'lifeline-clinic',
    label: 'Lifeline Clinic',
    category: 'Architecture / Prefabs',
    description: 'Olympus civic pod assembled from four clinic facade modules around one treatment-room fit-out, with a portal, boarding ramp, and roof beacon.',
    tags: ['architecture', 'prefab', 'hero', 'medical', 'olympus', 'landmark'],
    exportName: 'lifeline-clinic.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/lifeline-clinic/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 1.8)
    },
  },
  {
    id: 'compact-outpost-shell',
    label: 'Compact Outpost Shell',
    category: 'Architecture / Prefabs',
    description: 'Single-bay grid prefab: one room, front door, side and rear windows on a 5 x 5 m plinth.',
    tags: ['architecture', 'prefab', 'building', 'shell', 'small'],
    exportName: 'compact-outpost-shell.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/compact-outpost-shell/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 1.6)
    },
  },
  {
    id: 'long-hall-shell',
    label: 'Long Hall Shell',
    category: 'Architecture / Prefabs',
    description: 'Three-bay grid prefab with no partitions: a single 11.7 m undivided span under a continuous ring beam.',
    tags: ['architecture', 'prefab', 'building', 'shell', 'hall'],
    exportName: 'long-hall-shell.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/long-hall-shell/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 1.8)
    },
  },
  {
    id: 'quad-barracks-shell',
    label: 'Quad Barracks Shell',
    category: 'Architecture / Prefabs',
    description: 'Four-room grid prefab on a 2 x 2 plan, with a full partition cross and a four-way junction post at the centre.',
    tags: ['architecture', 'prefab', 'building', 'shell', 'rooms'],
    exportName: 'quad-barracks-shell.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/quad-barracks-shell/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 1.8)
    },
  },
  {
    id: 'l-wing-shell',
    label: 'L-Wing Shell',
    category: 'Architecture / Prefabs',
    description: 'L-shaped grid prefab: a two-bay front range with a rear wing, resolving a re-entrant structural corner.',
    tags: ['architecture', 'prefab', 'building', 'shell', 'l-shape'],
    exportName: 'l-wing-shell.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/l-wing-shell/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 1.8)
    },
  },
  {
    id: 'courtyard-compound-shell',
    label: 'Courtyard Compound Shell',
    category: 'Architecture / Prefabs',
    description: 'Eight-bay ring prefab enclosing an open courtyard, with exterior walls facing both outward and inward.',
    tags: ['architecture', 'prefab', 'building', 'shell', 'courtyard'],
    exportName: 'courtyard-compound-shell.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/courtyard-compound-shell/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 1.8)
    },
  },
  {
    id: 'storefront-facade-shell',
    label: 'Storefront Facade Shell',
    category: 'Architecture / Prefabs',
    description: 'Six-metre storefront prefab with glazed display bays, framed entry, supported canopy, sign crown, and sidewalk.',
    tags: ['architecture', 'prefab', 'storefront', 'commercial'],
    exportName: 'storefront-facade-shell.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/storefront-facade-shell/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 2.0)
    },
  },
  {
    id: 'utility-enclosure',
    label: 'Utility Enclosure',
    category: 'Architecture / Prefabs',
    description: 'Four-metre utility prefab with armored door, roof grille, grounded corner frame, service vent, and closed U-manifolds.',
    tags: ['architecture', 'prefab', 'utility', 'service'],
    exportName: 'utility-enclosure.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/prototypes/utility-enclosure/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 1.5)
    },
  },
  {
    id: 'f1-tyre',
    label: 'F1 Tyre',
    category: 'Vehicles / Motorsport',
    description: 'Loose pit-lane wet tyre on an 18-inch rim: a swept tread with four cut circumferential grooves and a directional V pattern, five paired spoke arms in a dished barrel, a recessed centre-lock hub, and official compound grading arcs on the sidewall, dressed on both faces.',
    tags: ['prop', 'vehicles', 'motorsport', 'tyre'],
    exportName: 'f1-tyre.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/f1-prototypes/f1-tyre/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 0.15)
    },
  },
  {
    id: 'f1-pit-jack',
    label: 'F1 Pit Jack',
    category: 'Vehicles / Motorsport',
    description: 'Low lever jack with an oval-section lift arm, T-bar pad, and up-swept handle; the lever angle drives an honest vertical rise for matching a lifted car.',
    tags: ['prop', 'vehicles', 'motorsport', 'pit-lane', 'interactive'],
    exportName: 'f1-pit-jack.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/f1-prototypes/f1-pit-jack/model.ts')
      const preview = createPreview({ aspect })
      return {
        scene: preview.scene,
        root: preview.root,
        camera: preview.camera,
        initialView: { focusY: 0.15, fov: preview.camera.fov },
        action: {
          label: 'Toggle lift',
          shortcut: 'Space',
          run() {
            preview.toggleLift()
          },
        },
        update: preview.update,
        resize(nextAspect) {
          preview.camera.aspect = nextAspect
          preview.camera.updateProjectionMatrix()
        },
        dispose: preview.dispose,
      }
    },
  },
  {
    id: 'f1-tyre-gun',
    label: 'F1 Tyre Gun',
    category: 'Vehicles / Motorsport',
    description: 'Chunky impact wrench with a lofted rounded-rect body, curved pistol grip, and a spinning hex socket that seats on a hub with a status LED.',
    tags: ['prop', 'vehicles', 'motorsport', 'pit-lane', 'interactive'],
    exportName: 'f1-tyre-gun.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/f1-prototypes/f1-tyre-gun/model.ts')
      const preview = createPreview({ aspect })
      return {
        scene: preview.scene,
        root: preview.root,
        camera: preview.camera,
        initialView: { focusY: 0.05, fov: preview.camera.fov },
        action: {
          label: 'Toggle run',
          shortcut: 'Space',
          run() {
            preview.toggleRun()
          },
        },
        update: preview.update,
        resize(nextAspect) {
          preview.camera.aspect = nextAspect
          preview.camera.updateProjectionMatrix()
        },
        dispose: preview.dispose,
      }
    },
  },
  {
    id: 'f1-tool-cabinet',
    label: 'F1 Tool Cabinet',
    category: 'Vehicles / Motorsport',
    description: 'Rolling drawer chest on casters: rounded cabinet body, work-surface top, and a stack of pull-handled drawer faces.',
    tags: ['prop', 'vehicles', 'motorsport', 'pit-lane'],
    exportName: 'f1-tool-cabinet.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/f1-prototypes/f1-tool-cabinet/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 0.55)
    },
  },
  {
    id: 'f1-fire-extinguisher',
    label: 'F1 Fire Extinguisher',
    category: 'Vehicles / Motorsport',
    description: 'Fire extinguisher: domed lathe-revolved body, valve and carry handle, and a curved hose to a nozzle.',
    tags: ['prop', 'vehicles', 'motorsport', 'pit-lane'],
    exportName: 'f1-fire-extinguisher.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/f1-prototypes/f1-fire-extinguisher/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 0.4)
    },
  },
  {
    id: 'f1-hose-reel',
    label: 'F1 Hose Reel',
    category: 'Vehicles / Motorsport',
    description: 'Air-hose reel: a multi-layer helical coil on a drum between open spoked flanges, carried in a bent-tube frame with a carry bow, an offset crank handle, and a lead hose running over a guide roller to the floor.',
    tags: ['prop', 'vehicles', 'motorsport', 'pit-lane'],
    exportName: 'f1-hose-reel.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/f1-prototypes/f1-hose-reel/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 0.4)
    },
  },
  {
    id: 'f1-lollipop-board',
    label: 'F1 Lollipop Board',
    category: 'Vehicles / Motorsport',
    description: 'Pit-lane stop/go paddle on a pole — the board a mechanic holds at the front of the car; paddle colour is a repaintable material slot.',
    tags: ['prop', 'vehicles', 'motorsport', 'pit-lane'],
    exportName: 'f1-lollipop-board.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/f1-prototypes/f1-lollipop-board/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 1.1)
    },
  },
  {
    id: 'f1-pit-board',
    label: 'F1 Pit Board',
    category: 'Vehicles / Motorsport',
    description: 'Numbered pit signal board on a pole, with a configurable count of indicator rows for per-team texturing.',
    tags: ['prop', 'vehicles', 'motorsport', 'pit-lane'],
    exportName: 'f1-pit-board.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/f1-prototypes/f1-pit-board/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 1.0)
    },
  },
  {
    id: 'f1-pit-gantry',
    label: 'F1 Pit Gantry',
    category: 'Vehicles / Motorsport',
    description: 'Overhead post-and-beam pit gantry with a top beam and banner, sized by span and height — no team livery baked in.',
    tags: ['prop', 'vehicles', 'motorsport', 'pit-lane'],
    exportName: 'f1-pit-gantry.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/f1-prototypes/f1-pit-gantry/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 2.6)
    },
  },
  {
    id: 'f1-tyre-stack',
    label: 'F1 Tyre Stack',
    category: 'Vehicles / Motorsport',
    description: 'Blanketed stack of F1 Tyre tyres: a quilted warmer wrap bulging over each course and cinched between them by buckled straps, with an overlap seam, rolled hems, and a power cable running from a gland to the floor. The bottom tyre is left uncovered.',
    tags: ['prop', 'vehicles', 'motorsport', 'pit-lane'],
    exportName: 'f1-tyre-stack.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/f1-prototypes/f1-tyre-stack/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 0.6)
    },
  },
  {
    id: 'f1-gun-rack',
    label: 'F1 Gun Rack',
    category: 'Vehicles / Motorsport',
    description: 'Tubular A-frame rack holding F1 Tyre Gun instances, sockets down.',
    tags: ['prop', 'vehicles', 'motorsport', 'pit-lane'],
    exportName: 'f1-gun-rack.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/f1-prototypes/f1-gun-rack/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 0.6)
    },
  },
  {
    id: 'f1-catch-fence',
    label: 'F1 Catch Fence',
    category: 'Vehicles / Motorsport',
    description: 'Chain-link debris fence on steel posts. Configurable span and height. Mesh is a DataTexture, not a canvas.',
    tags: ['prop', 'vehicles', 'motorsport', 'trackside'],
    exportName: 'f1-catch-fence.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/f1-prototypes/f1-catch-fence/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 2.4)
    },
  },
  {
    id: 'f1-armco',
    label: 'F1 Armco',
    category: 'Vehicles / Motorsport',
    description: 'W-beam guardrail with boxed posts and alternating red/shell bays.',
    tags: ['prop', 'vehicles', 'motorsport', 'trackside'],
    exportName: 'f1-armco.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/f1-prototypes/f1-armco/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 0.4)
    },
  },
  {
    id: 'f1-tyre-barrier',
    label: 'F1 Tyre Barrier',
    category: 'Vehicles / Motorsport',
    description: 'Tyre wall instanced from the kit f1-tyre — three high, two deep.',
    tags: ['prop', 'vehicles', 'motorsport', 'trackside'],
    exportName: 'f1-tyre-barrier.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/f1-prototypes/f1-tyre-barrier/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 0.9)
    },
  },
  {
    id: 'f1-tecpro',
    label: 'F1 TecPro',
    category: 'Vehicles / Motorsport',
    description: 'Stacked energy-absorbing foam blocks in a plastic wrap, cinched with straps.',
    tags: ['prop', 'vehicles', 'motorsport', 'trackside'],
    exportName: 'f1-tecpro.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/f1-prototypes/f1-tecpro/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 0.55)
    },
  },
  {
    id: 'f1-start-lights',
    label: 'F1 Start Lights',
    category: 'Vehicles / Motorsport',
    description: 'FIA five-column start-light panel on a short gantry. configure({ lit }) lights columns.',
    tags: ['prop', 'vehicles', 'motorsport', 'trackside'],
    exportName: 'f1-start-lights.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/f1-prototypes/f1-start-lights/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 4.2)
    },
  },
  {
    id: 'f1-kerb',
    label: 'F1 Kerb',
    category: 'Vehicles / Motorsport',
    description: 'FIA rumble-strip run of raised modules with a 50 mm ramp, alternating shell and red.',
    tags: ['prop', 'vehicles', 'motorsport', 'trackside'],
    exportName: 'f1-kerb.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/f1-prototypes/f1-kerb/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 0.05)
    },
  },
  {
    id: 'f1-floodlight',
    label: 'F1 Floodlight',
    category: 'Vehicles / Motorsport',
    description: 'Circuit flood mast with a four-can head on a tapered pole.',
    tags: ['prop', 'vehicles', 'motorsport', 'trackside'],
    exportName: 'f1-floodlight.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/f1-prototypes/f1-floodlight/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 6.2)
    },
  },
  {
    id: 'f1-timing-pylon',
    label: 'F1 Timing Pylon',
    category: 'Vehicles / Motorsport',
    description: 'Tall scoring tower with a generic LED board — no driver names.',
    tags: ['prop', 'vehicles', 'motorsport', 'trackside'],
    exportName: 'f1-timing-pylon.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/f1-prototypes/f1-timing-pylon/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 4.4)
    },
  },
  {
    id: 'f1-brake-marker',
    label: 'F1 Brake Marker',
    category: 'Vehicles / Motorsport',
    description: '150 / 100 / 50 distance board on twin posts.',
    tags: ['prop', 'vehicles', 'motorsport', 'trackside'],
    exportName: 'f1-brake-marker.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/f1-prototypes/f1-brake-marker/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 1.0)
    },
  },
  {
    id: 'f1-jumbotron',
    label: 'F1 Jumbotron',
    category: 'Vehicles / Motorsport',
    description: 'Trackside screen on a steel frame. Face is a material slot.',
    tags: ['prop', 'vehicles', 'motorsport', 'trackside'],
    exportName: 'f1-jumbotron.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/f1-prototypes/f1-jumbotron/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 4.2)
    },
  },
  {
    id: 'f1-marshal-post',
    label: 'F1 Marshal Post',
    category: 'Vehicles / Motorsport',
    description: 'White trackside hut, two orange marshals, and a signal flag.',
    tags: ['prop', 'vehicles', 'motorsport', 'trackside'],
    exportName: 'f1-marshal-post.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/f1-prototypes/f1-marshal-post/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 1.0)
    },
  },
  {
    id: 'f1-start-gantry',
    label: 'F1 Start Gantry',
    category: 'Vehicles / Motorsport',
    description: 'Start/finish overhead: two posts, a box beam, and a blank banner.',
    tags: ['prop', 'vehicles', 'motorsport', 'trackside'],
    exportName: 'f1-start-gantry.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/f1-prototypes/f1-start-gantry/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 4.2)
    },
  },
  {
    id: 'f1-grandstand-bay',
    label: 'F1 Grandstand Bay',
    category: 'Vehicles / Motorsport',
    description: 'One seating bay with stepped benches and a roof canopy.',
    tags: ['prop', 'vehicles', 'motorsport', 'trackside'],
    exportName: 'f1-grandstand-bay.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/f1-prototypes/f1-grandstand-bay/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 2.4)
    },
  },
  {
    id: 'f1-oranje-can',
    label: 'F1 Oranje Support Can',
    category: 'Vehicles / Motorsport',
    description: 'Handheld Dutch-GP orange smoke flare: lathed can, striker, closed-form smoke clouds and spark jets imported from Zandvoort OranjeSmoke / OranjeSparkFountains.',
    tags: ['prop', 'vehicles', 'motorsport', 'trackside'],
    exportName: 'f1-oranje-can.glb',
    async create(aspect) {
      const { createPreview } = await import('../../assets/f1-prototypes/f1-oranje-can/model.ts')
      return adaptStaticPreview(createPreview({ aspect }), 0.55)
    },
  },
]

function createGaugePreview(
  module: typeof import('../../assets/prototypes/pressure-gauge/model.ts'),
  aspect: number,
) {
  return module.createPreview({ aspect })
}

export function findCatalogEntry(id: string | null): ModelCatalogEntry {
  return MODEL_CATALOG.find((entry) => entry.id === id) ?? MODEL_CATALOG[0]!
}
