import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'

const sourcePath = resolve('prop-list.md')

const sections = {
  1: ['universal-gameplay', 'Reusable / universal gameplay', 'reusable/universal-gameplay', 'L2', 'Axiom systems', 'All place families', 'player-facing systems must be readable, stateful, and consistent across every map'],
  2: ['architecture', 'Reusable / core architecture', 'reusable/architecture', 'L1', 'Axiom shared construction', 'All place families', 'the grid-aligned chassis that lets every district feel related while retaining local dressing'],
  3: ['industrial', 'Reusable / industrial', 'reusable/industrial', 'L2', 'Axiom Works', 'Industrial, thermal, military, and infrastructure spaces', 'functional machinery with visible service access, load paths, cooling, and maintenance logic'],
  4: ['cargo-logistics', 'Reusable / cargo and logistics', 'reusable/cargo-logistics', 'L2', 'Axiom Works / local freight operators', 'Docks, warehouses, roads, military yards, and combat cover', 'stackable, cover-friendly logistics objects that reveal a believable freight system'],
  5: ['military', 'Reusable / military and IMC reference kit', 'reusable/military', 'L2', 'Axiom Defense', 'Military compounds, armories, checkpoints, and frontier bases', 'robust defense infrastructure with clear fields of fire, access control, and repair history'],
  6: ['streets-infrastructure', 'Reusable / streets and city infrastructure', 'reusable/streets-infrastructure', 'L2', 'Axiom Civic / local utilities', 'Urban districts, settlements, roads, canals, and waterfronts', 'human-scale civic infrastructure that grounds large hero structures in daily life'],
  7: ['e-district-dressing', 'Reusable / E-District urban dressing', 'reusable/e-district-dressing', 'L2', 'Local / reclaimed urban operators', 'Dense nightlife, market, residential, and cyber-urban streets', 'social, layered, high-density dressing with a controlled night palette and strong wayfinding'],
  8: ['interiors', 'Reusable / interiors', 'reusable/interiors', 'L2', 'Mixed by interior type', 'Industrial, residential, commercial, medical, and laboratory interiors', 'interior objects that communicate occupancy, workflow, status, and local wealth level'],
  9: ['vegetation-terrain', 'Reusable / vegetation and terrain', 'reusable/vegetation-terrain', 'L1', 'Natural system / Axiom field context', 'Tropical, volcanic, frozen, lunar, coastal, civic, and cave spaces', 'biome-specific natural forms that integrate with manufactured foundations and sightlines'],
  10: ['destruction', 'Reusable / destruction', 'reusable/destruction', 'L2', 'Incident history', 'All damaged, abandoned, crashed, or contested spaces', 'destruction that reveals construction logic, preserves gameplay readability, and tells a cause'],
  11: ['vehicles', 'Reusable / vehicles and vehicle-like dressing', 'reusable/vehicles', 'L2', 'Axiom transport / local civilian operators', 'Roads, docks, hangars, landing pads, rail, and crash sites', 'large-scale mobility objects with a clear mass, service access, and believable resting state'],
  12: ['wildlife', 'Reusable / wildlife', 'reusable/wildlife', 'L2', 'Natural system / containment operators', 'Storm Point, Kings Canyon, and any controlled ecology zone', 'wildlife and traces that make ecology legible without hijacking the manufactured world language'],
  13: ['kings-canyon', 'Hero / Kings Canyon', 'hero/kings-canyon', 'L4', 'Axiom Defense / frontier ecology', 'Old military frontier, ecological disaster, and salvage zones', 'aged military infrastructure, hard terrain, containment, and visible catastrophe'],
  14: ['worlds-edge', "Hero / World's Edge", 'hero/worlds-edge', 'L4', 'Axiom Works / megatech extraction', 'Volcanic industry, frozen disaster, and dense worker city', 'thermal power and resource extraction framed by hard weather, ice, and industrial scale'],
  15: ['olympus', 'Hero / Olympus', 'hero/olympus', 'L4', 'Axiom Civic / scientific megastructure', 'Clean luxury utopia, research campuses, gardens, and phase transit', 'precise civic megastructures with bright shells, glass, controlled greenery, and quiet power'],
  16: ['storm-point', 'Hero / Storm Point', 'hero/storm-point', 'L4', 'Axiom Defense / field ecology', 'Tropical brutalism, weather infrastructure, coastline, and wildlife', 'storm-worn infrastructure with strong vertical weather machinery and ecological intrusion'],
  17: ['broken-moon', 'Hero / Broken Moon', 'hero/broken-moon', 'L4', 'Axiom Lunar Colony / terraforming operations', 'Lunar colony, terraforming megatech, civic gardens, and meteor disaster', 'low-gravity habitats and monumental terraforming machines grounded by dust and fracture'],
  18: ['e-district', 'Hero / E-District', 'hero/e-district', 'L4', 'Local civic, commercial, and nightlife operators', 'Dense urban districts with visible socioeconomic variety', 'layered city life: high-rises, markets, entertainment, civic unrest, utilities, and water systems'],
  19: ['graphics-signage', 'Reusable / graphics and signage', 'graphics-signage', 'L1', 'All operators', 'All place families', 'the graphic layer that gives ownership, navigation, state, and local identity to shared geometry'],
}

const groupOverrides = {
  'Information / respawn': 'information-respawn',
  'Map mechanics': 'map-mechanics',
  'Medical / laboratory': 'medical-laboratory',
}

const customSpecs = {
  'floor slab tile': {
    level: 'L1',
    type: 'architectural connector',
    envelope: '2.0 m W × 2.0 m D × 0.20 m H; four-way snap edges on the 1 m grid.',
    sockets: 'Expose floor_snap_n, floor_snap_s, floor_snap_e, floor_snap_w, foundation_mount_*, and service_access_* sockets.',
    visual: 'Make this the canonical building floor module: a shallow structural tray with a hard perimeter, recessed removable service panel, four corner mounts, and one restrained status strip. It must read as a surface that can tile into a room, not as a decorative platform.',
    service: 'Show the load path, removable service panel, drainage or cable access, and the hard contact face below. Adjacent tiles must meet without visible gaps or accidental z-fighting.',
    plan: [
      'Block the 2 m square tile and its four snap edges.',
      'Add the structural tray, corner mounts, and recessed service panel.',
      'Add optional material variants for clean civic, industrial, military, and locally repaired floors without changing the connector contract.',
      'Validate a 2 × 2 tile patch and a wall-to-floor junction before approving the asset.',
    ],
  },
  'ceiling slab panel': {
    level: 'L1',
    type: 'architectural connector',
    envelope: '2.0 m W × 2.0 m D × 0.18 m H; overhead snap edges on the 1 m grid.',
    sockets: 'Expose ceiling_snap_n, ceiling_snap_s, ceiling_snap_e, ceiling_snap_w, roof_mount_*, service_access_*, and light_mount_* sockets.',
    visual: 'Build a reversible overhead panel with a shallow structural frame, dark service cavity, replaceable vent or light insert, and a clean top mounting face. The underside must read clearly when seen from inside a room.',
    service: 'Show panel seams, a removable service hatch, cable or ventilation paths, and a safe mounting relationship to the roof or floor above.',
    plan: [
      'Block the 2 m overhead panel and its four snap edges.',
      'Add the structural frame, underside service recess, and optional vent/light insert.',
      'Keep the top interface plain enough to accept a roof piece or another floor slab.',
      'Validate interior readability from a standing player camera.',
    ],
  },
  'interior wall corner': {
    level: 'L1',
    type: 'architectural connector',
    envelope: '2.0 m W × 2.0 m D × 3.0 m H inside-corner module; accepts two 0.25 m wall runs.',
    sockets: 'Expose wall_snap_a, wall_snap_b, floor_snap_*, ceiling_snap_*, and service_access_* sockets.',
    visual: 'Use a crisp inside corner with two authored wall returns, a dark vertical service seam, and a narrow maintenance access panel. Preserve a clean interior silhouette and a believable floor-to-ceiling closure.',
    service: 'Make the corner carry the hidden cable/pipe turn and keep the service seam accessible without widening the player route.',
    plan: [
      'Block two perpendicular wall interfaces on the shared 1 m grid.',
      'Add the inside trim, service seam, and floor/ceiling contact faces.',
      'Test against wall 2 m, wall 4 m, door bay, and window bay modules.',
    ],
  },
  'exterior wall corner': {
    level: 'L1',
    type: 'architectural connector',
    envelope: '2.0 m W × 2.0 m D × 3.0 m H outside-corner module; accepts two 0.25 m wall runs.',
    sockets: 'Expose wall_snap_a, wall_snap_b, floor_snap_*, roof_edge_*, and service_access_* sockets.',
    visual: 'Build a strong outside corner with a durable vertical edge cap, structural fasteners, and a controlled service break on the back side. The corner should solve the silhouette, not merely hide two intersecting planes.',
    service: 'Provide a believable structural and weather seal at the corner while leaving the exterior service path accessible.',
    plan: [
      'Block the outside corner and its two wall interfaces.',
      'Add the edge cap, fasteners, weather seal, and lower foundation contact.',
      'Test against clean, military, industrial, and E-District wall families.',
    ],
  },
  'wall t junction': {
    level: 'L1',
    type: 'architectural connector',
    envelope: '2.0 m W × 2.0 m D × 3.0 m H T-junction module; accepts three 0.25 m wall runs.',
    sockets: 'Expose wall_snap_main, wall_snap_branch, wall_snap_return, floor_snap_*, ceiling_snap_*, and service_access_* sockets.',
    visual: 'Create a three-way wall junction with a compact structural spine, a recessed service chase, and a clear branch opening. It should let rooms and corridors branch without bespoke boolean cuts.',
    service: 'Carry a cable/pipe branch through the spine and leave a removable access face on the non-player side.',
    plan: [
      'Block the three perpendicular wall interfaces on the 1 m grid.',
      'Add the structural spine, service chase, and branch seam.',
      'Validate corridor widths and door/window bay compatibility.',
    ],
  },
  'wall end cap': {
    level: 'L1',
    type: 'architectural connector',
    envelope: '0.50 m W × 0.25 m D × 3.0 m H wall termination; accepts one 0.25 m wall run.',
    sockets: 'Expose wall_snap_in, floor_snap_*, ceiling_snap_*, facade_attach_*, and service_access_* sockets.',
    visual: 'Make a deliberate wall termination with a protected edge, inset service seam, and optional fascia strip. The end cap must look finished in a street view and serviceable in a close view.',
    service: 'Close the structural and weather layers while providing a small access route for cables or pipes.',
    plan: [
      'Block the single wall termination and its floor/ceiling contacts.',
      'Add the edge protection, fascia, and service seam.',
      'Test open-ended corridors, facade edges, and damaged variants.',
    ],
  },
  'wall return': {
    level: 'L1',
    type: 'architectural connector',
    envelope: '1.0 m W × 1.0 m D × 3.0 m H return module; accepts one wall run and one perpendicular short return.',
    sockets: 'Expose wall_snap_main, wall_snap_return, floor_snap_*, roof_edge_*, and cover_attach_* sockets.',
    visual: 'Build a short perpendicular return that gives walls depth, cover, and a readable termination. Keep the service recess on the protected face and the exterior edge structurally capped.',
    service: 'Use the return to hide a cable/pipe turn or create a cover pocket without producing a snag-heavy silhouette.',
    plan: [
      'Block the main wall and short perpendicular return.',
      'Add the edge cap, service cavity, and lower contact condition.',
      'Validate as both a facade reveal and a gameplay cover module.',
    ],
  },
  'door bay': {
    level: 'L1',
    type: 'architectural connector',
    envelope: '2.0 m W × 0.30 m D × 3.0 m H opening module; standard clear opening 1.6 m W × 2.6 m H.',
    sockets: 'Expose wall_snap_left, wall_snap_right, door_leaf_*, door_control_*, floor_snap_*, and threshold_* sockets.',
    visual: 'Make the complete opening bay—not just the moving door—with jambs, lintel, gasket, track or hinge seat, control recess, and a clear side-wall interface.',
    service: 'Show the frame, gasket, moving-part hard stop, power/data entry, and safe clearance zone. The bay must accept multiple existing door leaves.',
    plan: [
      'Block the wall-sized opening and standard clear passage.',
      'Add jambs, lintel, frame recess, control socket, and threshold seat.',
      'Validate double sliding, single sliding, blast, bunker, and commercial door variants.',
    ],
    components: [
      {name: 'door frame', role: 'shared frame insert'},
      {name: 'building threshold', role: 'lower clearance and seal'},
    ],
  },
  'window bay': {
    level: 'L1',
    type: 'architectural connector',
    envelope: '2.0 m W × 0.25 m D × 2.0 m H opening module; accepts standard 1.5 m W × 1.4 m H glazing.',
    sockets: 'Expose wall_snap_left, wall_snap_right, window_insert_*, sunshade_*, floor_snap_*, and service_access_* sockets.',
    visual: 'Build the complete wall opening with a structural frame, gasketed glazing seat, sill, lintel, and optional exterior shading attachment. It should accept industrial, laboratory, luxury, and storefront inserts.',
    service: 'Show the frame depth, drainage sill, replacement clearance, and the attachment route for shutters or sunshades.',
    plan: [
      'Block the wall-sized opening and the standard glazing seat.',
      'Add frame, sill, lintel, gasket, and exterior attachment sockets.',
      'Validate small industrial, laboratory, luxury, and storefront window variants.',
    ],
    components: [
      {name: 'window frame', role: 'shared frame insert'},
    ],
  },
  'building threshold': {
    level: 'L1',
    type: 'architectural connector',
    envelope: '2.0 m W × 0.50 m D × 0.20 m H transition strip; aligns with the 1 m floor grid.',
    sockets: 'Expose floor_snap_*, door_bay_*, drainage_*, cable_crossing_*, and ramp_attach_* sockets.',
    visual: 'Create a durable threshold that resolves the floor, door, seal, and approach relationship. It should read as a physically loaded transition, not a decorative strip.',
    service: 'Include a replaceable wear plate, drainage channel, cable crossing option, and a hard clearance boundary for moving doors.',
    plan: [
      'Block the standard door-width transition and floor alignment.',
      'Add wear plate, seal, drainage, and optional cable crossing.',
      'Validate with interior floors, exterior roads, ramps, gates, and damaged states.',
    ],
  },
  'roof floor edge module': {
    level: 'L1',
    type: 'architectural connector',
    envelope: '2.0 m W × 0.50 m D × 0.35 m H edge module; accepts wall, floor, and roof snap faces.',
    sockets: 'Expose wall_snap_*, floor_snap_*, roof_snap_*, parapet_*, and service_access_* sockets.',
    visual: 'Make the edge module solve the transition between a horizontal slab and a vertical wall. Use a shallow fascia, weather seal, service recess, and a controlled parapet attachment.',
    service: 'Show drainage, flashing, cable access, and the structural load path across the edge.',
    plan: [
      'Block the wall-to-slab edge and its snap faces.',
      'Add fascia, flashing, drain path, and parapet attachment.',
      'Validate flat roofs, roof parapets, and open balcony edges.',
    ],
  },
  'foundation interface': {
    level: 'L1',
    type: 'architectural connector',
    envelope: '2.0 m W × 2.0 m D × 0.40 m H foundation pad; accepts floor, wall, and terrain contacts.',
    sockets: 'Expose foundation_snap_*, floor_mount_*, wall_mount_*, drain_*, anchor_*, and terrain_contact_* sockets.',
    visual: 'Build the quiet but essential base interface: a structural pad with anchor points, a recessed service/drain channel, and a clean terrain contact. It should support a building without becoming another hero prop.',
    service: 'Make load transfer, leveling, drainage, and utility entry physically legible.',
    plan: [
      'Block the pad, anchor points, and terrain contact patch.',
      'Add leveling feet, drain/service recess, and utility entry sockets.',
      'Validate on flat terrain, raised platforms, slopes, and damaged foundations.',
    ],
  },
  'gate post pair': {
    level: 'L1',
    type: 'architectural connector',
    envelope: '2.0 m W × 1.0 m D × 4.0 m H paired jamb towers; standard clear gate span 4.0 m.',
    sockets: 'Expose gate_leaf_left, gate_leaf_right, gate_lintel_*, wall_snap_left, wall_snap_right, foundation_mount_*, and gate_control_* sockets.',
    visual: 'Make the paired gate posts carry the silhouette and load path: thick jamb towers, protected hinge or track seats, service recesses, warning lights, and clean wall attachment faces.',
    service: 'Show the hinge/track load, access panels, power/data entry, and safe vehicle clearance through the opening.',
    plan: [
      'Block the paired jamb towers and standard clear vehicle span.',
      'Add hinge or track seats, control recesses, wall attachment faces, and signal lights.',
      'Validate checkpoint, perimeter, bunker, and large hero gate variants.',
    ],
  },
  'gate lintel': {
    level: 'L1',
    type: 'architectural connector',
    envelope: '4.0 m W × 1.0 m D × 0.75 m H header; bridges the gate post pair.',
    sockets: 'Expose gate_post_left, gate_post_right, gate_sign_*, light_mount_*, cable_entry_*, and wall_return_* sockets.',
    visual: 'Build a heavy but readable gate header with a clear structural span, recessed service bay, warning light housings, and a protected sign/number plate zone.',
    service: 'Show the load-bearing connection, cable route, maintenance access, and the reason for every light or panel.',
    plan: [
      'Block the header span and paired post interfaces.',
      'Add the service bay, light housings, sign plate, and cable entry.',
      'Validate the header with both clean and damaged gate states.',
    ],
  },
  'gate wall return': {
    level: 'L1',
    type: 'architectural connector',
    envelope: '2.0 m W × 1.0 m D × 3.0 m H wing-wall module; accepts a gate post and perimeter wall.',
    sockets: 'Expose gate_post_*, wall_snap_*, foundation_mount_*, fence_attach_*, and service_access_* sockets.',
    visual: 'Create the short wing wall that makes a gate feel embedded in a perimeter rather than floating between two posts. Give it a protected service face and an authored cover edge.',
    service: 'Resolve wall thickness, fence or barrier attachment, foundation anchoring, and the protected cable path into the gate post.',
    plan: [
      'Block the wing wall and its gate-post/perimeter-wall faces.',
      'Add foundation anchor, fence attachment, service recess, and cover edge.',
      'Validate left/right mirrored placement and damaged wall variants.',
    ],
  },
  'room shell': {
    level: 'L2',
    type: 'reusable prefab assembly',
    envelope: '4.0 m W × 4.0 m D × 3.0 m H single-room shell; all dimensions snap to whole metres.',
    sockets: 'Expose floor_*, ceiling_*, wall_*, door_bay_*, window_bay_*, utility_*, cover_*, and dressing_* sockets.',
    visual: 'Treat this as the smallest complete inhabitable volume: floor, ceiling, four wall edges, a standard opening, a service chase, and enough negative space for furniture or combat cover. Keep the shell neutral so military, industrial, residential, laboratory, and storefront dressing can sit on top.',
    service: 'Make the room shell explain structure, access, ventilation, utilities, and replacement surfaces before any furniture is added.',
    plan: [
      'Place the foundation and floor module.',
      'Close the four walls with corner/end/return connectors and install the standard ceiling panel.',
      'Add one door bay, one optional window bay, and a service chase.',
      'Validate furnished, empty, damaged, and open-front variants.',
    ],
    components: [
      {name: 'floor slab tile', role: 'blocking floor surface'},
      {name: 'ceiling slab panel', role: 'blocking overhead closure'},
      {name: 'wall 2 m', role: 'repeatable wall run'},
      {name: 'interior wall corner', role: 'room closure'},
      {name: 'exterior wall corner', role: 'outer closure'},
      {name: 'wall end cap', role: 'open-front termination'},
      {name: 'door bay', role: 'standard access opening'},
      {name: 'window bay', role: 'optional daylight/observation opening', optional: true},
      {name: 'building threshold', role: 'door-to-floor transition'},
      {name: 'foundation interface', role: 'terrain/load interface'},
      {name: 'roof/floor edge module', role: 'slab-to-wall closure'},
    ],
  },
  'small building shell': {
    level: 'L2',
    type: 'reusable prefab assembly',
    envelope: '8.0 m W × 6.0 m D × 4.0 m H two-bay building shell; add floors in whole-metre increments.',
    sockets: 'Expose foundation_*, floor_*, ceiling_*, wall_*, door_bay_*, window_bay_*, roof_*, utility_*, and dressing_* sockets.',
    visual: 'Build a two-bay shell that proves the kit can make an actual building: a structural footprint, repeated wall runs, real corners, opening bays, a service spine, roof/floor edge, and a readable roof cap. It must be a neutral host for military, civic, industrial, residential, and commercial identities.',
    service: 'Show load paths, vertical service routing, access clearance, roof drainage, and a clear separation between shell geometry and local dressing.',
    plan: [
      'Lay out two 4 m bays on foundation interfaces and floor slabs.',
      'Close the perimeter with wall runs, corners, T-junctions, end caps, and a service spine.',
      'Install door/window bays, ceiling panels, roof/floor edges, and optional roof dressing.',
      'Validate empty, furnished, open-front, damaged, and stacked-floor variants.',
    ],
    components: [
      {name: 'room shell', role: 'repeatable interior volume'},
      {name: 'floor slab tile', role: 'building floor surface'},
      {name: 'wall 4 m', role: 'long perimeter wall'},
      {name: 'interior wall corner', role: 'interior closure'},
      {name: 'exterior wall corner', role: 'outer closure'},
      {name: 'wall T-junction', role: 'bay/service branching'},
      {name: 'door bay', role: 'access opening'},
      {name: 'window bay', role: 'glazing opening', optional: true},
      {name: 'ceiling slab panel', role: 'overhead closure'},
      {name: 'roof/floor edge module', role: 'roof and slab edge'},
      {name: 'foundation interface', role: 'terrain/load interface'},
      {name: 'column', role: 'optional structural support', optional: true},
    ],
  },
  'checkpoint gate assembly': {
    level: 'L2',
    type: 'reusable prefab assembly',
    envelope: '12.0 m W × 6.0 m D × 4.0 m H checkpoint frontage; standard vehicle lane is 4.0 m clear.',
    sockets: 'Expose road_entry_*, gate_*, booth_*, barrier_*, signage_*, light_*, fence_*, and power_* sockets.',
    visual: 'Compose a complete checkpoint frontage from gate posts, lintel, wall returns, a vehicle threshold, operator booth, barriers, control hardware, and restrained identity graphics. The kit must read as an access-control place, not a freestanding gate prop.',
    service: 'Make traffic flow, operator sightline, power/data, maintenance clearance, and perimeter continuity obvious.',
    plan: [
      'Place the road module, threshold, gate post pair, lintel, and wall returns.',
      'Attach the checkpoint booth, control panel, barriers, fence, and directional/signage sockets.',
      'Validate active, open, locked, damaged, and abandoned states.',
    ],
    components: [
      {name: 'road module', role: 'vehicle approach'},
      {name: 'building threshold', role: 'lane transition'},
      {name: 'gate post pair', role: 'primary jamb structure'},
      {name: 'gate lintel', role: 'gate header'},
      {name: 'gate wall return', role: 'perimeter continuity'},
      {name: 'checkpoint booth', role: 'operator station'},
      {name: 'door control panel', role: 'gate control interface'},
      {name: 'security fence', role: 'side containment'},
      {name: 'road blocker', role: 'secondary denial state', optional: true},
      {name: 'directional sign', role: 'wayfinding', optional: true},
    ],
  },
  'storefront facade shell': {
    level: 'L2',
    type: 'reusable prefab assembly',
    envelope: '6.0 m W × 1.0 m D × 4.0 m H frontage shell; supports 1 m-grid depth extensions.',
    sockets: 'Expose floor_*, wall_*, door_bay_*, window_bay_*, sign_*, awning_*, service_*, and lighting_* sockets.',
    visual: 'Build the actual storefront host behind the themed dressing: floor strip, wall frame, glazed opening bays, entry door bay, fascia/sign band, canopy attachment, and service access. Keep the shell neutral enough to host convenience, restaurant, noodle shop, bar, nightclub, boutique, or arcade dressing.',
    service: 'Show the shop threshold, utility entry, ventilation, sign power route, glazing replacement logic, and attachment faces for awnings and shutters.',
    plan: [
      'Block the floor strip, wall frame, fascia, and standard storefront depth.',
      'Install window bays, door bay, threshold, service panel, and sign/awning sockets.',
      'Validate all named storefront dressing variants without changing the shell contract.',
    ],
    components: [
      {name: 'floor slab tile', role: 'shop floor/sidewalk transition'},
      {name: 'wall 4 m', role: 'frontage frame'},
      {name: 'window bay', role: 'glazed display opening'},
      {name: 'door bay', role: 'shop entry'},
      {name: 'building threshold', role: 'public entry transition'},
      {name: 'ceiling slab panel', role: 'interior overhead closure'},
      {name: 'roof/floor edge module', role: 'fascia and upper edge'},
      {name: 'foundation interface', role: 'street/building contact'},
      {name: 'storefront glazing', role: 'display insert', optional: true},
      {name: 'shop shutter', role: 'closed-state dressing', optional: true},
    ],
  },
  'utility enclosure': {
    level: 'L2',
    type: 'reusable prefab assembly',
    envelope: '4.0 m W × 3.0 m D × 3.0 m H service enclosure; accepts exterior utility runs on two sides.',
    sockets: 'Expose foundation_*, floor_*, wall_*, ceiling_*, door_bay_*, pipe_*, duct_*, cable_*, and equipment_mount_* sockets.',
    visual: 'Build a compact service building with a robust shell, one maintenance opening, vented overhead closure, cable/pipe penetrations, and a clear equipment mounting wall. It should support substations, generators, pumps, cooling units, and lab utilities.',
    service: 'The enclosure exists to connect machinery to architecture: show intake/exhaust, cable glands, pipe flanges, equipment anchors, drainage, and a safe service route.',
    plan: [
      'Place the foundation, floor, wall runs, corners, and ceiling panel.',
      'Install the door bay, vented roof panel, equipment mounts, and utility penetration sockets.',
      'Validate connection to pipes, ducts, cable conduits, and industrial equipment.',
    ],
    components: [
      {name: 'floor slab tile', role: 'service floor'},
      {name: 'wall 2 m', role: 'enclosure wall run'},
      {name: 'exterior wall corner', role: 'outer closure'},
      {name: 'door bay', role: 'maintenance opening'},
      {name: 'building threshold', role: 'service entry transition'},
      {name: 'ceiling slab panel', role: 'overhead closure'},
      {name: 'foundation interface', role: 'terrain/load interface'},
      {name: 'vented roof panel', role: 'air exchange', optional: true},
      {name: 'pipe support', role: 'utility connection', optional: true},
      {name: 'electrical cabinet', role: 'service equipment', optional: true},
    ],
  },
}

function customSpec(record) {
  const key = norm(record.name)
  if (customSpecs[key]) return customSpecs[key]
  const smallBuilding = customSpecs['small building shell']
  if (key === 'imc prefab barracks') {
    return {
      ...smallBuilding,
      type: 'reusable military prefab assembly',
      visual: 'Use the small building shell as the structural host, then apply an IMC prefab barracks identity: disciplined wall rhythm, durable entry, narrow observation windows, roof service access, and restrained military markings. Keep all shell connectors reusable.',
      components: [
        {name: 'small building shell', role: 'blocking shell'},
        {name: 'room shell', role: 'repeatable barracks room'},
        {name: 'wall 4 m', role: 'military perimeter run'},
        {name: 'door bay', role: 'barracks entry'},
        {name: 'window bay', role: 'observation opening'},
        {name: 'foundation interface', role: 'base anchoring'},
        {name: 'roof/floor edge module', role: 'roof closure'},
        {name: 'industrial corrugated wall', role: 'local material dressing', optional: true},
      ],
    }
  }
  if (key === 'imc modular base building') {
    return {
      ...smallBuilding,
      type: 'reusable military prefab assembly',
      visual: 'Use the small building shell as a modular IMC base-building host: repeatable bays, a clear public/service split, durable corners, controlled openings, rooftop service access, and a repairable military skin. The building must be placeable as a complete shell and expandable through its sockets.',
      components: [
        {name: 'small building shell', role: 'blocking shell'},
        {name: 'room shell', role: 'interior module'},
        {name: 'wall 4 m', role: 'long perimeter run'},
        {name: 'interior wall corner', role: 'room closure'},
        {name: 'exterior wall corner', role: 'outer closure'},
        {name: 'door bay', role: 'access opening'},
        {name: 'window bay', role: 'controlled glazing'},
        {name: 'foundation interface', role: 'base anchoring'},
        {name: 'roof/floor edge module', role: 'roof closure'},
        {name: 'wall with vent', role: 'service skin', optional: true},
      ],
    }
  }
  if (key === 'imc control building') {
    return {
      ...smallBuilding,
      type: 'reusable military prefab assembly',
      visual: 'Use the small building shell as an IMC control-building host with a readable operator face, reinforced service spine, controlled glazing, roof-mounted communications, and a clear cable/power relationship to surrounding infrastructure.',
      components: [
        {name: 'small building shell', role: 'blocking shell'},
        {name: 'room shell', role: 'control room volume'},
        {name: 'door bay', role: 'operator/service entry'},
        {name: 'window bay', role: 'observation glazing'},
        {name: 'wall with vent', role: 'cooling/service wall'},
        {name: 'foundation interface', role: 'base anchoring'},
        {name: 'roof/floor edge module', role: 'roof closure'},
        {name: 'wall terminal', role: 'operator interface', optional: true},
        {name: 'control cabinet', role: 'service equipment', optional: true},
      ],
    }
  }
  if (key === 'imc bunker') {
    return {
      ...smallBuilding,
      type: 'reusable military prefab assembly',
      envelope: '10.0 m W × 8.0 m D × 4.0 m H hardened shell; tunnel and entrance extensions snap to the 1 m grid.',
      visual: 'Use the small building shell as the base for a hardened IMC bunker: thick wall expression, recessed blast entrance, limited observation, protected service penetrations, and a low, defensible silhouette. The bunker skin should be a dressing layer over reusable shell connectors.',
      components: [
        {name: 'small building shell', role: 'blocking shell'},
        {name: 'room shell', role: 'interior volume'},
        {name: 'exterior wall corner', role: 'hardened outer closure'},
        {name: 'door bay', role: 'blast-door opening'},
        {name: 'bunker door', role: 'moving hardened closure'},
        {name: 'building threshold', role: 'protected entry transition'},
        {name: 'foundation interface', role: 'buried/base anchoring'},
        {name: 'roof/floor edge module', role: 'roof/earth closure'},
        {name: 'wall with vent', role: 'protected ventilation', optional: true},
      ],
    }
  }
  if (key === 'bunker entrance') {
    return {
      ...customSpecs['checkpoint gate assembly'],
      type: 'reusable bunker entrance assembly',
      envelope: '6.0 m W × 4.0 m D × 4.0 m H hardened entrance frontage.',
      visual: 'Compose a bunker entrance from the door bay, bunker door, gate posts, wall return, threshold, and foundation interface. It must read as a structural transition into a buried facility, not as a floating door leaf.',
      components: [
        {name: 'door bay', role: 'hardened opening'},
        {name: 'bunker door', role: 'moving blast closure'},
        {name: 'gate post pair', role: 'entry jamb structure'},
        {name: 'gate wall return', role: 'perimeter/hill continuity'},
        {name: 'building threshold', role: 'protected entry transition'},
        {name: 'foundation interface', role: 'ground anchoring'},
        {name: 'door control panel', role: 'entry control'},
        {name: 'tactical floodlight', role: 'night access signal', optional: true},
      ],
    }
  }
  if (/\bfacade\b|\bstorefront\b/.test(key) && !/storefront glazing|boarded storefront/.test(key)) {
    return {
      ...customSpecs['storefront facade shell'],
      type: 'reusable themed facade assembly',
      visual: 'Use the storefront facade shell as the structural host, then apply the named local identity as a restrained dressing pass: ' + record.name + '. Keep doors, glazing, service access, fascia, awning, and sign sockets compatible with the shared shell.',
    }
  }
  return null
}

function customSpecForName(name) {
  return customSpec({name})
}

const clean = (value) => value.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim()
const slug = (value) => clean(value).toLowerCase().replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 96) || 'unnamed-asset'
const norm = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const has = (value, regex) => regex.test(norm(value))
const quote = (value) => JSON.stringify(String(value))
const titleCase = (value) => value.split(/[-\s]+/).filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join(' ')

function link(from, to, label) {
  let path = relative(dirname(resolve(from)), resolve(to)).replaceAll('\\', '/')
  if (!path.startsWith('.')) path = `./${path}`
  return `[${label}](${path})`
}

function parse() {
  const lines = readFileSync(sourcePath, 'utf8').split(/\r?\n/)
  const records = []
  let section = null
  let group = null
  for (let i = 0; i < lines.length; i += 1) {
    const sectionMatch = lines[i].match(/^#\s+(\d+)\.\s+(.*)$/)
    if (sectionMatch) {
      section = Number(sectionMatch[1])
      group = null
      continue
    }
    const groupMatch = lines[i].match(/^###\s+(.*)$/)
    if (groupMatch) {
      group = clean(groupMatch[1])
      continue
    }
    const bulletMatch = lines[i].match(/^\*\s+(.*)$/)
    if (!bulletMatch || !section) continue
    const name = clean(bulletMatch[1])
    const hero = section >= 13 && section <= 18
    records.push({
      number: records.length + 1,
      sourceLine: i + 1,
      section,
      group: group || (section === 19 ? 'Graphics and signage' : 'General'),
      name,
      hero,
    })
  }
  return records
}

function assignPaths(records) {
  const used = new Map()
  for (const record of records) {
    const meta = sections[record.section]
    const groupFolder = record.hero
      ? slug(record.group)
      : (record.section === 19 ? '' : (groupOverrides[record.group] || (record.group === 'General' ? '' : slug(record.group))))
    const folder = ['docs/assets', meta[2], groupFolder].filter(Boolean).join('/')
    const base = slug(record.name)
    const key = `${folder}/${base}`
    const occurrence = (used.get(key) || 0) + 1
    used.set(key, occurrence)
    record.meta = meta
    record.groupFolder = groupFolder
    record.fileSlug = occurrence === 1 ? base : `${base}-${String(occurrence).padStart(2, '0')}`
    record.relativePath = `${folder}/${record.fileSlug}.md`
    record.assetId = `asset.${meta[0]}.${slug(record.group)}.${record.fileSlug}`
    record.level = customSpec(record)?.level || (record.hero ? 'L3' : meta[3])
  }
}

function typeOf(name, section, hero) {
  const value = norm(name)
  if (hero) return 'POI hero component'
  if (section === 19) return 'graphic, decal, or signage system'
  if (/wall|door|window|roof|ceiling|floor|stair|ladder|catwalk|walkway|bridge|ramp|railing|rail|fence|balcony|scaffold|beam|truss|column|brace|pylon|foundation|platform|pad|parapet|hatch|frame|shutter|sunshade|corner|junction|threshold|shell|facade|storefront|gate/.test(value)) return 'architectural or traversal module'
  if (/pipe|duct|cable|conduit|hose|tank|silo|hopper|reservoir|vessel|cylinder|valve|gauge|pump|compressor|turbine|fan|vent|generator|transformer|cabinet|switchboard|fuse|battery|coolant|exchanger|machinery|crane|winch|hoist|robot arm|welding|trolley|workbench|rack/.test(value)) return 'industrial service prop'
  if (/crate|container|pallet|barrel|drum|bottle|sack|bag|net|strap|cart|trailer|dock|shelf|storage|case|chest|spool|equipment/.test(value)) return 'cargo or logistics prop'
  if (/tree|bush|hedge|grass|reed|fern|vine|flower|lily|mushroom|root|moss|coral|vegetation|driftwood|rock|cliff|boulder|scree|stalagmite|stalactite|lava rock|frozen rock|lunar rock|beach rock|river rock/.test(value)) return 'vegetation or terrain prop'
  if (/wildlife|flyer|prowler|spider|leviathan|beast|carcass|nest|egg|perch|cage/.test(value)) return 'wildlife or ecological prop'
  if (/car|van|truck|vehicle|shuttle|ship|dropship|aircraft|locomotive|train|gondola|trolley|wing|engine|gear|freight/.test(value)) return 'vehicle or vehicle-like prop'
  if (/chair|sofa|table|bed|mattress|cabinet|wardrobe|counter|island|shelf|locker|bench|desk|monitor|keyboard|screen|computer|server|arcade|kiosk|booth|stool|bar|planter|lamp|rug|divider|microscope|scanner|medical|hospital|specimen|operating|cart/.test(value)) return 'interior or furnishing prop'
  if (/bin|beacon|console|terminal|loot|arsenal|replicator|respawn|survey|ring console|zipline|jump tower|gravity|charge tower|explosive hold|armory|cargo bot|loot tick|mrvn|vault|blast wall/.test(value)) return 'gameplay system prop'
  return 'world dressing or functional prop'
}

function envelope(name, section, hero) {
  const value = norm(name)
  const custom = customSpecForName(name)
  if (custom?.envelope) return custom.envelope
  if (hero) return 'Assembly-derived; dimension the component in whole-metre increments against its POI parent before modeling.'
  if (section === 19) return 'Graphic plane or volume sized to the host surface; keep a 0.02–0.05 m offset to prevent z-fighting.'
  if (/wall 1 m/.test(value)) return '1.0 m W × 0.25 m D × 3.0 m H'
  if (/wall 2 m/.test(value)) return '2.0 m W × 0.25 m D × 3.0 m H'
  if (/wall 4 m/.test(value)) return '4.0 m W × 0.25 m D × 3.0 m H'
  if (/wall 8 m/.test(value)) return '8.0 m W × 0.25 m D × 3.0 m H'
  if (/door|hatch/.test(value)) return '1.6 m W × 0.30 m D × 2.6 m H; double variants expand to 2.8 m W.'
  if (/window|glazing/.test(value)) return '1.5 m W × 0.20 m D × 1.4 m H; long and curtain variants tile on the 1 m grid.'
  if (/pipe|duct|cable|conduit|hose/.test(value)) return '1.0 m service segment; length and radius are explicit parameters, with 0.25 m clearance around fittings.'
  if (/rock|boulder|cliff|stalagmite|stalactite|tree|palm|bush|hedge|grass|fern|vine|flower|moss|coral/.test(value)) return 'Natural blockout envelope authored per silhouette; keep the contact patch stable and the tallest point within the named size class.'
  if (/small/.test(value)) return '0.75 m W × 0.75 m D × 1.0 m H starting envelope'
  if (/medium/.test(value)) return '1.5 m W × 1.5 m D × 2.0 m H starting envelope'
  if (/large|long/.test(value)) return '2.5 m W × 2.0 m D × 2.5 m H starting envelope'
  if (/tiny/.test(value)) return '0.35 m W × 0.35 m D × 0.35 m H starting envelope'
  if (/floor|road|sidewalk|platform|pad|bridge|wall|roof/.test(value)) return '2.0 m W × 2.0 m D × 0.25 m H base module; tile on the 1 m grid.'
  return 'Module-scale starting envelope: 1.0 m W × 1.0 m D × 1.8 m H; confirm the final envelope in the placement pass.'
}

function signals(name, section) {
  const value = norm(name)
  if (/phase|rift|portal|gravity|stasis|energy|hologram|repulsor/.test(value)) return ['VIOLET-500', 'CYAN-400']
  if (/neon|arcade|nightclub|billboard|advertising|lantern|menu|sign|poster|banner|graffiti|party/.test(value)) return ['MAGENTA-400', 'CYAN-400']
  if (/tree|bush|hedge|grass|fern|vine|flower|lily|mushroom|root|moss|coral|garden|grow|cultivation|biology|prowler|spider|flyer|wildlife|beast|leviathan|echo/.test(value)) return ['LIME-400', 'FIELD-500']
  if (/lava|thermal|furnace|geyser|heat|siphon|volcan|fire|flaming|fuel|exhaust/.test(value)) return ['ORANGE-500', 'AMBER-400']
  if (/broken|damaged|destroyed|wreck|crashed|ruin|debris|scorch|burned|collapsed|severed|blast|hazmat|quarantine|toxic|chemical|danger|riot|barrier/.test(value)) return ['RED-500', 'AMBER-400']
  if (section === 1) return ['CYAN-400', 'COBALT-500']
  if (section === 7 || section === 18) return ['MAGENTA-400', 'CYAN-400']
  if (section === 15) return ['COBALT-500', 'CYAN-400']
  if (section === 16 || section === 12) return ['FIELD-500', 'LIME-400']
  if (section === 17) return ['COBALT-500', 'VIOLET-500']
  if (section === 5) return ['AMBER-400', 'COBALT-500']
  return ['AMBER-400', 'CYAN-400']
}

function materials(name, section, group) {
  const value = norm(name)
  if (section === 19) return ['MAT-17', 'MAT-01', 'MAT-09']
  if (section === 9) {
    if (/ice|frozen|snow/.test(value)) return ['MAT-20', 'MAT-21']
    if (/lava|volcanic|thermal/.test(value)) return ['MAT-19', 'MAT-21']
    if (/wood|driftwood|root/.test(value)) return ['MAT-16', 'MAT-15']
    return ['MAT-15', 'MAT-11']
  }
  if (section === 12) return ['MAT-15', 'MAT-04', 'MAT-17']
  if (section === 10) return ['MAT-21', 'MAT-04', 'MAT-17']
  if (section === 11) return ['MAT-02', 'MAT-04', 'MAT-07', 'MAT-17']
  if (section === 7 || section === 18) return ['MAT-06', 'MAT-08', 'MAT-09', 'MAT-17']
  if (section === 8 && /medical|laboratory/.test(group)) return ['MAT-06', 'MAT-08', 'MAT-09', 'MAT-03']
  if (section === 8 && /residential|commercial/.test(group)) return ['MAT-06', 'MAT-10', 'MAT-17']
  if (section === 8) return ['MAT-02', 'MAT-03', 'MAT-07', 'MAT-17']
  if (section === 4) return ['MAT-02', 'MAT-07', 'MAT-17', 'MAT-04']
  if (section === 5) return ['MAT-02', 'MAT-04', 'MAT-05', 'MAT-17']
  if (section === 6) return ['MAT-11', 'MAT-12', 'MAT-02', 'MAT-17']
  if (section === 3) return ['MAT-04', 'MAT-03', 'MAT-07', 'MAT-17']
  if (section === 2) return ['MAT-02', 'MAT-06', 'MAT-11', 'MAT-17']
  return ['MAT-02', 'MAT-01', 'MAT-09', 'MAT-17']
}

function shapeRecipe(name, hero) {
  const value = norm(name)
  if (/wall|door|window|roof|floor|panel|facade|building|structure|tower|platform|bridge|road|sidewalk/.test(value)) return 'Use a bold planar silhouette with a clear module seam, a dark service recess, and one purposeful opening or edge condition. Keep the mounting face square to the construction grid.'
  if (/pipe|duct|cable|conduit|hose|rail|wire|truss|beam|brace/.test(value)) return 'Build the primary run first, then add repeatable collars, brackets, flanges, and a service break at each change in direction. The run must communicate where it starts, terminates, and is supported.'
  if (/tank|silo|vessel|reservoir|cylinder|barrel|drum|bottle/.test(value)) return 'Give the vessel a legible container silhouette, a top/bottom service relationship, and a visible pressure, fill, or access cue. Avoid perfectly blank cylinders.'
  if (/screen|console|terminal|monitor|billboard|sign|menu|poster|advertising|kiosk/.test(value)) return 'Frame the information surface with a physical bezel, mount, cable/power path, and a restrained graphic hierarchy. The graphic must remain readable as a block before text is legible.'
  if (/crate|container|case|chest|pallet|shelf|rack|locker|cabinet/.test(value)) return 'Make the load boundary and handling points obvious: corners, latches, feet, fork gaps, handles, straps, or stack guides. The silhouette should support cover and repeatable stacking.'
  if (/tree|bush|hedge|grass|fern|vine|flower|root|moss|coral|plant|garden/.test(value)) return 'Use a species-specific primary silhouette and a clear contact patch. Cluster secondary growth in authored groups; keep negative space open enough for gameplay sightlines.'
  if (/rock|cliff|boulder|scree|stalagmite|stalactite|lava rock|frozen rock|lunar rock/.test(value)) return 'Build a readable mass from a few large fracture planes, one contact plane, and controlled secondary chips. Orient the major face to support cover or composition where applicable.'
  if (/flyer|prowler|spider|leviathan|beast|carcass|wildlife/.test(value)) return 'Favor a recognizable silhouette, believable weight/contact, and one ecological behavior cue. Surface detail should follow anatomy or growth direction.'
  if (/car|van|truck|vehicle|shuttle|ship|dropship|aircraft|train|locomotive|gondola/.test(value)) return 'Establish the resting mass and wheel/landing/rail contact first, then service access, glazing, cargo, and damage seams. The parked state should tell the viewer how the vehicle normally moves.'
  if (hero) return 'Treat this as a landmark component: one unmistakable macro form, a supporting service rhythm, and a focal state signal. It must be modular enough to assemble with the POI parent without losing its identity.'
  return 'Use one strong mass, one functional interface, and one controlled state cue. Every visible part should explain use, mounting, maintenance, or wear.'
}

function serviceRecipe(name, section) {
  const value = norm(name)
  if (/pipe|duct|cable|conduit|hose/.test(value)) return 'Service logic is the asset: include supports at regular spans, a coupling at each module boundary, and a believable connection to a larger utility run.'
  if (/door|window|hatch|shutter/.test(value)) return 'Show the frame, gasket, hinge/track, control surface, and safe clearance zone. Moving parts need a hard stop and a readable reset state.'
  if (/console|terminal|screen|monitor|computer|cabinet|switchboard/.test(value)) return 'Show power/data entry, ventilation or heat rejection, access panel seams, and an operator-facing interface. Avoid a black screen unless the inactive state is intentional.'
  if (/tank|generator|pump|turbine|fan|compressor|transformer|machinery/.test(value)) return 'Expose intake, output, access, maintenance, and safety zones. Use brackets, pipe runs, or cable glands to connect it to the surrounding system.'
  if (/crate|container|pallet|barrel|case|shelf|rack/.test(value)) return 'Expose handling points and the load path. Stack variants need stable contact faces and repeatable orientation so clutter remains authored rather than random.'
  if (section === 9 || section === 12) return 'Replace service detail with ecological attachment: roots, soil, nesting, staining, tracks, or environmental contact must explain how the object sits in its biome.'
  return 'Add only the service detail that explains operation or placement: access seams, fasteners, drains, labels, braces, and a clear contact or mounting condition.'
}

function statesFor(name, section, hero) {
  const value = norm(name)
  if (hero) return ['default landmark', 'damaged / incident pass', 'legacy or alternate POI dressing']
  if (section === 1) return ['default / reset', 'active / available', 'depleted or disabled']
  if (section === 10 || /broken|damaged|destroyed|wreck|ruin|collapsed|severed|burned/.test(value)) return ['intact or default', 'damaged', 'destroyed / debris pass']
  if (/open|doors|deployed|active|charging|rotating|moving|animated/.test(value)) return ['stowed / default', 'active or open', 'reset / maintenance']
  if (section === 19) return ['day / low-emission', 'night / active', 'worn / replaced']
  if (section === 9 || section === 12) return ['healthy / natural', 'weathered or seasonal', 'damaged / ecological trace']
  return ['default', 'weathered / locally repaired', 'damaged / service-off']
}

function relatedRecords(record, records) {
  const value = norm(record.name)
  const results = []
  const add = (test, label, filter = () => true) => {
    const found = records.find((candidate) => candidate !== record && test(norm(candidate.name)) && filter(candidate))
    if (found && !results.some((item) => item.record === found)) results.push({ label, record: found })
  }
  if (/open|reset|legendary|mythic|support|compartment/.test(value)) add((name) => /supply bin/.test(name), 'base supply-bin state')
  if (/door|hatch|shutter/.test(value)) add((name) => /door frame/.test(name), 'shared door frame')
  if (/pipe|duct|cable|conduit|hose/.test(value)) add((name) => /support|flange|straight|elbow|junction/.test(name), 'adjacent utility module', (candidate) => candidate.section === 3)
  if (/crate|container|pallet|barrel|drum|case/.test(value)) add((name) => /cargo crate|container|pallet/.test(name), 'stacking/handling family', (candidate) => candidate.section === 4)
  if (/sign|billboard|screen|menu|poster|banner|advertising/.test(value)) add(() => true, 'shared graphics system', (candidate) => candidate.section === 19)
  if (record.hero) add(() => true, 'POI sibling component', (candidate) => candidate.hero && candidate.section === record.section && candidate.group === record.group)
  return results.slice(0, 3)
}

function heroKitDependencies(record, records) {
  if (!record.hero) return []
  const value = norm(record.name)
  const primitiveException = [
    /^settlement sheet metal wall$/,
    /^(bunker|hangar|laboratory) door$/,
    /^bunker blast door$/,
    /^(laboratory|storefront) window$/,
    /^storefront glazing$/,
    /^warehouse shelf$/,
    /^mall (bench|planter)$/,
    /^lab (table|computer)$/,
    /^laboratory storage$/,
    /^(laboratory logos|facility numbers|giant building numbers)$/,
    /^boarded storefront$/,
  ]
  if (primitiveException.some((pattern) => pattern.test(value))) return []
  const structuralCue = /\bfacade\b|\bstorefront\b|\b(building|buildings|barracks|bunker|bunkers|compound|compounds|complex|complexes|campus|facility|facilities|hangar|hangars|warehouse|warehouses|settlement|settlements|mall|malls|university|universities|clinic|clinics|laboratory|laboratories|lab)\b|\b(base building|control building|service building|research building|industrial building|commercial building|residential structure|cliff building|suspended building|building kit|stilt building kit)\b|\b(internal rooms?|bridge connected facilities|complete offshore platform|multi level|two level|multi storey|tower assemblies|cooling tower assemblies|connecting structures)\b|\b(modular base building|modular lab structures|greenhouse modules|habitat modules|prefabricated structures)\b/.test(value)
  if (!structuralCue) return []
  const dependencies = []
  const add = (name, role, optional = false) => {
    const target = records.find((candidate) => norm(candidate.name) === norm(name))
    if (target && !dependencies.some((item) => item.record === target)) dependencies.push({record: target, role, optional})
  }
  const addBuildingShell = () => {
    add('small building shell', 'primary reusable shell')
    add('floor slab tile', 'repeatable floor surface')
    add('foundation interface', 'terrain and load interface')
    add('ceiling slab panel', 'overhead closure')
    add('door bay', 'standard access opening')
    add('window bay', 'glazing/observation opening', true)
    add('roof/floor edge module', 'roof and slab closure')
  }
  if (/\b(gate|gateway|checkpoint)\b/.test(value)) {
    add('checkpoint gate assembly', 'reusable access-control frontage')
    add('gate post pair', 'primary jamb structure')
    add('gate lintel', 'gate header')
    add('gate wall return', 'perimeter continuity')
    add('building threshold', 'vehicle/pedestrian transition')
    add('foundation interface', 'terrain and load interface')
  } else if (/\b(facade|storefront|mall|commercial|nightlife|shopping)\b/.test(value)) {
    add('storefront facade shell', 'reusable frontage host')
    add('floor slab tile', 'public floor/sidewalk transition')
    add('door bay', 'public entry opening')
    add('window bay', 'display/glazing opening')
    add('building threshold', 'public entry transition')
  } else if (/\b(bunker|tunnel|corridor|internal rooms?|underground|blast door)\b/.test(value)) {
    add('room shell', 'repeatable interior volume')
    add('floor slab tile', 'interior floor surface')
    add('ceiling slab panel', 'overhead closure')
    add('door bay', 'hardened access opening')
    add('building threshold', 'protected entry transition')
    add('foundation interface', 'terrain and load interface')
    add('wall return', 'corridor termination/cover', true)
  } else if (/\b(platform|bridge|pier|wharf|dock|runway|pad|tower|pylon|station|crane|plaza|arena)\b/.test(value)) {
    add('floor slab tile', 'repeatable structural surface')
    add('foundation interface', 'load and terrain interface')
    add('wall return', 'edge/termination module', true)
    add('utility enclosure', 'service-room host', true)
  } else {
    addBuildingShell()
  }
  if (/\b(industrial|processing|facility|lab|laboratory|research|chemical|treatment|sewage|agricultural|greenhouse|machinery|production|harvester|power|station)\b/.test(value)) {
    add('utility enclosure', 'service-building host', true)
  }
  if (/\b(greenhouse|habitat|dome|agricultural|biology)\b/.test(value)) {
    add('window bay', 'controlled daylight/glazing opening', true)
    add('ceiling slab panel', 'overhead environmental closure', true)
  }
  return dependencies
}

function heroDependencyLines(record, records) {
  const dependencies = heroKitDependencies(record, records)
  if (!dependencies.length) return ''
  return '\n## Reusable kit dependencies\n\n' + dependencies.map(({record: target, role, optional}) => (
    '- **' + (optional ? 'optional' : 'blocking') + ':** ' + link(record.relativePath, target.relativePath, target.name) + ' — ' + role + '.'
  )).join('\n') + '\n'
}

function customComponentLines(record, spec, records, mode = 'inventory') {
  if (!spec?.components?.length) return ''
  return spec.components.map((component) => {
    const target = records.find((candidate) => norm(candidate.name) === norm(component.name))
    const kind = component.optional ? 'optional' : 'blocking'
    const role = component.role ? ' — ' + component.role : ''
    if (!target) return '- **' + kind + ': ' + component.name + '** — MISSING SOURCE ITEM' + role
    if (mode === 'dependency') return '- **' + kind + ' component:** ' + link(record.relativePath, target.relativePath, target.name) + role + '.'
    return '- **' + kind + ': ' + component.name + '** — ' + link(record.relativePath, target.relativePath, target.name) + role + '.'
  }).join('\n')
}

function assetBrief(record, records) {
  const meta = record.meta
  const custom = customSpec(record)
  const type = custom?.type || typeOf(record.name, record.section, record.hero)
  const stateList = statesFor(record.name, record.section, record.hero)
  const signalList = signals(record.name, record.section)
  const materialList = materials(record.name, record.section, record.group)
  const related = relatedRecords(record, records)
  const sockets = custom?.sockets || 'Expose the appropriate mount_*, power_*, pipe_*, cable_*, cover_*, door_*, rail_*, or fx_* sockets implied by the name and construction.'
  const visualBrief = custom?.visual || shapeRecipe(record.name, record.hero)
  const serviceBrief = custom?.service || serviceRecipe(record.name, record.section)
  const constructionPlan = custom?.plan?.map((step, index) => String(index + 1) + '. ' + step).join('\n') || [
    '1. Block the public envelope and contact/mounting faces on the Axiom grid.',
    '2. Build the primary silhouette as a small number of named chassis parts.',
    '3. Add the service layer: seams, brackets, access panels, hoses, drains, handles, hinges, vents, or labels that make the function credible.',
    '4. Add the signal layer and author the named states below. Keep state changes modular so clean, active, and damaged versions can share the base mesh.',
    '5. Test the asset in neutral light, its home place family, and one unrelated place family. It should feel local in dressing but global in construction.',
  ].join('\n')
  const componentInventory = custom?.components?.length
    ? '\n## Component inventory\n\n' + customComponentLines(record, custom, records) + '\n'
    : ''
  const customDependencies = custom?.components?.length
    ? '\n' + customComponentLines(record, custom, records, 'dependency')
    : ''
  const heroDependencies = heroDependencyLines(record, records)
  const temporal = /legacy|historical/.test(norm(record.name))
    ? 'This is an archival or event-library item. Keep it available for historical worlds, but exclude it from current-map assembly by default.'
    : 'Map-specific availability belongs to the assembly brief; do not delete a reusable item because one current map no longer uses it.'
  const relatedText = related.length
    ? related.map(({ label, record: target }) => `- **${label}:** ${link(record.relativePath, target.relativePath, target.name)}.`).join('\n')
    : '- No direct sibling dependency was inferred from the source label. Review the family folder before introducing a new mechanism.'
  const stateText = stateList.map((state, index) => `${index + 1}. **${titleCase(state)}** — ${index === 0 ? 'recognition state and public contract.' : index === 1 ? 'state-bearing geometry, signal, decal, and collision change.' : 'reuse the chassis with a focused dressing or service pass.'}`).join('\n')
  return `<!-- generated from prop-list.md; edit the source brief or generator for durable changes -->
---
asset_id: ${quote(record.assetId)}
source_label: ${quote(record.name)}
source_section: ${quote(meta[1])}
source_group: ${quote(record.group)}
source_line: ${record.sourceLine}
level: ${record.level}
status: planned
place_family: ${quote(meta[5])}
owner: ${quote(meta[4])}
---

# ${record.name}

## Identity

- **Asset ID:** ${record.assetId}
- **Type:** ${type}
- **Source:** prop-list.md:${record.sourceLine}
- **Family:** ${meta[1]}
- **Place family:** ${meta[5]}
- **Owner / story role:** ${meta[4]}

## Reference render

![${record.name} reference render](${record.fileSlug}.png)

## Intent

The **${record.name}** is a ${type} for the Axiom Relay kit. It exists to support
${meta[6]}. Its primary read should be **${record.name}** as a useful,
maintained, or visibly altered thing—not anonymous sci-fi decoration. At far
distance, the silhouette and mass locate it; at mid distance, the operational
face and state signal explain it; up close, the service layer rewards inspection
without changing the core language.

${/legacy|historical/.test(norm(record.name)) ? 'Preserve the source label as a production reference, but use the neutral Axiom mark set for new graphics and avoid reproducing third-party logos or exact branded geometry.' : 'Keep the source label as the production name while applying the neutral Axiom Relay visual system defined in the world docs.'}

## Public contract

- **Blockout envelope:** ${envelope(record.name, record.section, record.hero)}
- **Grid:** 1 m world unit; snap structural breaks to 0.25 m increments.
- **Pivot:** ${record.hero ? 'the POI assembly mounting origin; do not recenter this component after assembly.' : 'the functional ground contact or lower-left mounting corner; keep placement stable across variants.'}
- **Orientation:** operational/front face points toward local +Z in the preview; document any intentional radial, overhead, or mirrored placement in implementation.
- **Sockets:** ${sockets}
- **Read distance:** far = silhouette and footprint; mid = use, ownership, and state; near = fasteners, seams, labels, wear, and material response.
- **Collision:** keep the gameplay mass simple and stable; tertiary cables, foliage, loose debris, and clutter must not become accidental snag surfaces.

## Performance and implementation

- **LOD0:** full silhouette, service layer, articulated parts, and state signal for hero/near read.
- **LOD1:** merge small repeated parts while preserving silhouette, openings, interaction face, and signal.
- **LOD2:** keep only primary mass, cover boundary, major supports, and the state-bearing accent.
- **Instancing:** repeated bolts, slats, cables, foliage clusters, crates, panels, and sibling modules should be instanced where possible.
- **Preview:** validate in neutral light, home-map light, and a 1280×720 thumbnail so value hierarchy survives the app's current capture target.

## Visual brief

${visualBrief}

The construction follows the shared **chassis → service → signal** order.
${serviceBrief} Keep the strongest value break on the
operational face, frame any screen or opening with a physical bezel, and leave
negative space around the interaction point. Do not add unmotivated greebles;
each visible repetition needs a fastening, cooling, handling, safety, or
identity reason.

### State signal

Use ${signalList[0]} as the dominant signal token and ${signalList[1]} only
as support. Reinforce signal color with position, shape, label, pulse, or
material response. Place emission inside a lens, recess, tube, projector, or
screen housing; never float a bright line over an unexplained surface.

## Construction plan

${constructionPlan}
${componentInventory}
${heroDependencies}

## Materials and color

Use these canonical materials in descending surface importance:

${materialList.map((material) => `- ${material} — ${link(record.relativePath, 'docs/world/material-library.md', 'canonical definition')}.`).join('\n')}

Apply these exact semantic color tokens:

- dominant signal: ${signalList[0]};
- supporting signal: ${signalList[1]};
- neutral chassis: SHELL-200 or GRAPHITE-800 according to owner and place;
- service cavity: INK-950;
- identity, safety, or state graphics: MAT-17 over the correct substrate.

Never introduce a near-match hex value for a local fix. If a new role is truly
needed, update ${link(record.relativePath, 'docs/world/color-system.md', 'the central color system')} first.

## Variants and states

${stateText}

${temporal}

## Dependencies

- **Blocking:** ${link(record.relativePath, 'docs/world/concept.md', 'world concept')}, ${link(record.relativePath, 'docs/world/visual-language.md', 'visual language')}, ${link(record.relativePath, 'docs/world/production-rules.md', 'production rules')}, and ${link(record.relativePath, 'docs/world/dependency-model.md', 'dependency model')}.
- **Materials/colors:** ${link(record.relativePath, 'docs/world/material-library.md', 'material library')} and ${link(record.relativePath, 'docs/world/color-system.md', 'color system')}.
${record.hero ? `- **Map context:** ${link(record.relativePath, 'docs/world/map-identity.md', 'map identity')} and ${link(record.relativePath, 'docs/world/source-context.md', 'source context')}.` : ''}
${record.hero ? `- **Parent assembly:** ${link(record.relativePath, `docs/assets/${meta[2]}/${record.groupFolder}/_assembly.md`, `${record.group} assembly`)}.` : ''}
${customDependencies}
${relatedText}

## Acceptance checklist

- [ ] silhouette reads at far distance without texture detail;
- [ ] function and ownership read at mid distance;
- [ ] public envelope, pivot, sockets, and orientation are preserved;
- [ ] chassis, service, and signal layers are visibly distinct;
- [ ] only canonical MAT-* materials and color tokens are used;
- [ ] every state/variant has explicit geometry, emission, decal, and collision decisions;
- [ ] collision and LOD intent are suitable for procedural placement;
- [ ] damage or ecological contact, where relevant, has a believable cause;
- [ ] the asset works in its home place family and remains an Axiom Relay relative elsewhere.

`
}

function assemblyBrief(record, records) {
  const meta = record.meta
  const assemblyPath = `docs/assets/${meta[2]}/${record.groupFolder}/_assembly.md`
  const children = records.filter((candidate) => candidate.hero && candidate.section === record.section && candidate.group === record.group)
  const signalsForAssembly = signals(record.group, record.section)
  const childLinks = children.map((child) => `- ${link(assemblyPath, child.relativePath, child.name)} — component brief.`).join('\n')
  return `<!-- generated assembly brief from prop-list.md -->
---
assembly_id: ${quote(`assembly.${meta[0]}.${record.groupFolder}`)}
source_label: ${quote(record.group)}
source_section: ${quote(meta[1])}
source_line: ${record.sourceLine}
level: L4
status: planned
---

# ${record.group} — hero assembly

## Identity

- **Assembly ID:** assembly.${meta[0]}.${record.groupFolder}
- **Map family:** ${meta[1]}
- **Place identity:** ${meta[5]}
- **Owner / story role:** ${meta[4]}
- **Source:** prop-list.md:${record.sourceLine}

## Landmark promise

${record.group} is a landmark, not a pile of unrelated props. The full assembly
must read from a distance as one place with one dominant silhouette, one
supporting circulation/utility rhythm, and one state signal. Its identity comes
from the named component set below, while the shared Axiom chassis keeps the
world coherent. The assembly should communicate ${meta[6]}.

## Composition rules

- Start with the largest silhouette and the player approach/view corridor;
  establish the landmark before dressing the perimeter.
- Place functional mass, traversal, and cover in a readable hierarchy. Do not
  let service clutter erase the route through the space.
- Use the shared 1 m grid for foundations, platforms, walls, bridges, and
  equipment mounts. Components may scale in whole-metre increments only.
- Give the assembly a public face, service/back-of-house face, and damage/event
  face. Each side should tell a compatible but distinct story.
- Use ${signalsForAssembly[0]} as the dominant hero signal and
  ${signalsForAssembly[1]} only as a supporting state or traversal cue.
- Keep repeated subassemblies instanced. The setpiece is large because of
  footprint and composition, not because every bolt is unique.

## Named component inventory

${childLinks}

## Construction order

1. Lock the site envelope, foundation, skyline silhouette, and camera approach.
2. Place primary hero components and traversal/cover anchors.
3. Connect power, cooling, data, drainage, and access using reusable
   architectural and industrial modules.
4. Add local dressing, vegetation, terrain, destruction, and graphics as a
   deliberate story pass.
5. Author default, damaged/event, and legacy/alternate states without changing
   the public landmark silhouette unless the POI explicitly calls for collapse,
   quarantine, or a crashed state.

## Dependencies

- ${link(assemblyPath, 'docs/world/concept.md', 'world concept')}
- ${link(assemblyPath, 'docs/world/visual-language.md', 'visual language')}
- ${link(assemblyPath, 'docs/world/material-library.md', 'material library')}
- ${link(assemblyPath, 'docs/world/color-system.md', 'color system')}
- ${link(assemblyPath, 'docs/world/map-identity.md', 'map identity')}
- ${link(assemblyPath, 'docs/world/source-context.md', 'source context')}
- ${link(assemblyPath, 'docs/world/production-rules.md', 'production rules')}
- Reusable architecture, industrial, cargo, streets, destruction, vegetation,
  graphics, and traversal modules as called out by child briefs.

## Acceptance checklist

- [ ] the POI reads as a unique landmark at far distance;
- [ ] all named components are present or explicitly deferred;
- [ ] approach, traversal, cover, and service areas are legible;
- [ ] the hero signal is semantic and does not become generic neon noise;
- [ ] modules snap to the shared grid and reuse canonical materials;
- [ ] local dressing reinforces socioeconomic/ecological identity;
- [ ] damage, weather, or contamination has a clear cause;
- [ ] the assembly remains compatible with focused component agents.

`
}

function write(relativePath, content) {
  const path = resolve(relativePath)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content.replace(/\n+$/g, '\n'))
}

function renderIndexes(records) {
  const bySection = new Map()
  for (const record of records) {
    if (!bySection.has(record.section)) bySection.set(record.section, [])
    bySection.get(record.section).push(record)
  }
  const totals = [...bySection.entries()].map(([number, items]) => `| ${number} | ${sections[number][1]} | ${items.length} |`).join('\n')
  const full = [...bySection.entries()].map(([number, items]) => {
    const groups = new Map()
    for (const item of items) {
      if (!groups.has(item.group)) groups.set(item.group, [])
      groups.get(item.group).push(item)
    }
    const blocks = [...groups.entries()].map(([group, groupItems]) => `### ${group} (${groupItems.length})\n\n${groupItems.map((item) => `- ${link('docs/indexes/asset-index.md', item.relativePath, item.name)} — \`${item.assetId}\` (source line ${item.sourceLine})`).join('\n')}`).join('\n\n')
    return `## ${sections[number][1]} — ${items.length} items\n\n${blocks}`
  }).join('\n\n')
  write('docs/indexes/asset-index.md', `# Asset index

Generated from prop-list.md (../../prop-list.md) by
generate-asset-bible.mjs (../../scripts/generate-asset-bible.mjs). Every
source bullet is represented exactly once below.

## Coverage summary

| # | Family | Items |
| ---: | --- | ---: |
${totals}

**Total named inventory items:** ${records.length}

${full}

`)
  const summaryRows = [...bySection.entries()].flatMap(([number, items]) => {
    const groups = new Map()
    for (const item of items) groups.set(item.group, (groups.get(item.group) || 0) + 1)
    return [...groups.entries()].map(([group, count]) => `| ${number} | ${sections[number][1]} | ${group} | ${count} |`)
  }).join('\n')
  write('docs/indexes/inventory-summary.md', `# Inventory summary

Generated coverage report for the named bullets in prop-list.md (../../prop-list.md).

| Section | Family | Subgroup / POI | Items |
| ---: | --- | --- | ---: |
${summaryRows}

**Total:** ${records.length} named items. The source brief's approximate 1,070
authored-piece target is treated as a production optimization target; this
bible keeps every named bullet so no design intent is lost.

`)
  const coverageRows = records.map((record) => `| ${record.sourceLine} | ${record.section} | ${record.group} | ${record.name.replaceAll('|', '\\|')} | ${link('docs/indexes/source-coverage.md', record.relativePath, 'spec')} |`).join('\n')
  write('docs/indexes/source-coverage.md', `# Source coverage

Every bullet line in the source inventory maps to one focused brief. Rerun the
generator after editing prop-list.md (../../prop-list.md), then review the
count and links.

| Source line | Section | Group / POI | Source label | Brief |
| ---: | ---: | --- | --- | --- |
${coverageRows}

`)
}

function renderHeroIndex(records) {
  const assemblies = records.filter((record, index, all) => record.hero && all.findIndex((candidate) => candidate.section === record.section && candidate.group === record.group) === index)
  const rows = assemblies.map((record) => {
    const path = `docs/assets/${record.meta[2]}/${record.groupFolder}/_assembly.md`
    const count = records.filter((candidate) => candidate.hero && candidate.section === record.section && candidate.group === record.group).length
    return `| ${record.meta[1]} | ${record.group} | ${link('docs/indexes/hero-assemblies.md', path, 'assembly')} | ${count} |`
  }).join('\n')
  write('docs/indexes/hero-assemblies.md', `# Hero assembly index

Open the assembly first, then work from its named component links.

| Family | POI | Assembly brief | Components |
| --- | --- | --- | ---: |
${rows}

`)
}

const records = parse()
assignPaths(records)
for (const record of records) write(record.relativePath, assetBrief(record, records))
const assemblies = records.filter((record, index, all) => record.hero && all.findIndex((candidate) => candidate.section === record.section && candidate.group === record.group) === index)
for (const record of assemblies) write(`docs/assets/${record.meta[2]}/${record.groupFolder}/_assembly.md`, assemblyBrief(record, records))
renderIndexes(records)
renderHeroIndex(records)
console.log(JSON.stringify({ source: 'prop-list.md', namedItems: records.length, heroAssemblies: assemblies.length, generatedRoot: 'docs/assets' }, null, 2))
