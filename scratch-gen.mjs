import { writeFileSync } from 'node:fs'
const r = n => Math.round(n * 1000) / 1000
const cham = (w,h,c) => [[-w/2+c,-h/2],[w/2-c,-h/2],[w/2,-h/2+c],[w/2,h/2-c],[w/2-c,h/2],[-w/2+c,h/2],[-w/2,h/2-c],[-w/2,-h/2+c]].map(([x,y])=>[r(x),r(y)])
const rect = (w,h) => [[-w/2,-h/2],[-w/2,h/2],[w/2,h/2],[w/2,-h/2]].map(([x,y])=>[r(x),r(y)])
const P = (id,name,parentId,recipe,position,material,maxLod=1,extra={}) =>
  ({ id, name, ...(parentId?{parentId}:{}) , recipe, transform:{position}, material, topologyClass:'closed-manifold', maxLod, ...extra })
const mat = (recipeId,palette,extra={}) => ({ recipeId, palette, ...extra })

const parts = [
  // ---- frame group -------------------------------------------------------
  P('frame','FRAME',null,
    { kind:'extrude', outline:cham(1.6,1.75,0.14), holes:[rect(1.22,1.37)], depth:0.3, bevel:{radius:0.025,segments:4} },
    [0,0.875,0], mat('MAT-02','SHELL-200',{condition:'used',wear:0.22}), 2),
  P('fstep','FRAME STEP','frame',
    { kind:'extrude', outline:cham(1.5,1.65,0.12), holes:[rect(1.3,1.45)], depth:0.06, bevel:{radius:0.014,segments:3} },
    [0,0,0.12], mat('MAT-02','SHELL-050',{condition:'used',wear:0.15}), 1),
  P('fbolts','FRAME BOLTS','frame',
    { kind:'repeat', source:{kind:'archetype',archetypeId:'fastener',params:{radius:0.019,depth:0.014,sides:8}},
      count:5, mode:'linear', axis:[0,1,0], spacing:0.33 },
    [-0.71,-0.66,0.151], mat('MAT-03','GRAPHITE-800',{condition:'used',wear:0.4}), 0),
  P('fbolts2','FRAME BOLTS R','frame',
    { kind:'instance', sourcePartId:'fbolts', transforms:[{position:[1.42,0,0]}] },
    [-0.71,-0.66,0.151], mat('MAT-03','GRAPHITE-800',{condition:'used',wear:0.4}), 0),
  // ---- recess ------------------------------------------------------------
  P('jamb','JAMB','frame',
    { kind:'extrude', outline:rect(1.22,1.37), holes:[cham(0.94,1.09,0.08)], depth:0.26, bevel:{radius:0.012,segments:2} },
    [0,0,-0.02], mat('MAT-02','INK-950',{condition:'used',wear:0.45}), 2),
  P('jback','RECESS FLOOR','jamb',
    { kind:'primitive', shape:'box', size:[1.2,1.35,0.025] },
    [0,0,-0.115], mat('MAT-02','INK-950',{condition:'used',wear:0.5}), 2),
  P('lamps','SIGNAL STRIPS','jamb',
    { kind:'repeat', source:{kind:'archetype',archetypeId:'screen',params:{width:0.7,height:0.05,depth:0.022,radius:0.01}},
      count:2, mode:'linear', axis:[0,1,0], spacing:1.15 },
    [0,-0.575,0.1], mat('MAT-09','AMBER-400',{emissiveState:'active'}), 1),
  P('ram','ACTUATOR RAM','jamb',
    { kind:'archetype', archetypeId:'pipe', params:{radius:0.034,length:1.06,segments:24} },
    [-0.5,0,0.05], mat('MAT-03','GRAPHITE-800',{condition:'used',wear:0.45}), 1),
  P('collars','RAM COLLARS','jamb',
    { kind:'repeat', source:{kind:'archetype',archetypeId:'flange',params:{radius:0.055,boreRadius:0.036,depth:0.05}},
      count:3, mode:'linear', axis:[0,1,0], spacing:0.45 },
    [-0.5,-0.45,0.05], mat('MAT-03','GRAPHITE-800',{condition:'used',wear:0.5}), 1),
  // ---- leaf --------------------------------------------------------------
  P('leaf','LEAF','frame',
    { kind:'csg', operation:'subtract',
      left:{ kind:'csg', operation:'subtract',
        left:{ kind:'extrude', outline:cham(0.88,1.03,0.11), depth:0.12, bevel:{radius:0.03,segments:4} },
        right:{ kind:'primitive', shape:'box', size:[0.29,0.33,0.16] },
        rightTransform:{ position:[-0.18,-0.04,0.06] } },
      right:{ kind:'primitive', shape:'box', size:[1.35,0.05,0.06] },
      rightTransform:{ position:[0.1,0.1,0.1], rotationDeg:[0,0,-36] } },
    [0.01,0,0.01], mat('MAT-02','SHELL-200',{condition:'used',wear:0.24}), 2),
  P('lplate','LEAF PLATE','leaf',
    { kind:'extrude', outline:cham(0.62,0.76,0.1), depth:0.028, bevel:{radius:0.018,segments:3} },
    [0.05,-0.01,0.072], mat('MAT-02','SHELL-200',{condition:'used',wear:0.18}), 1),
  P('vliner','VIEWPORT LINER','leaf',
    { kind:'extrude', outline:cham(0.27,0.31,0.07), depth:0.05, bevel:{radius:0.012,segments:2} },
    [-0.18,-0.04,0.028], mat('MAT-02','INK-950',{condition:'used',wear:0.4}), 1),
  P('vhaz','VIEWPORT HAZARD','leaf',
    { kind:'archetype', archetypeId:'trim', params:{length:0.2,height:0.028,depth:0.02} },
    [-0.18,-0.185,0.05], mat('MAT-09','AMBER-400',{emissiveState:'active'}), 0),
  P('edge','SIGNAL EDGE','leaf',
    { kind:'archetype', archetypeId:'trim', params:{length:0.048,height:0.6,depth:0.04} },
    [0.185,0.0,0.062], mat('MAT-09','AMBER-400',{emissiveState:'active'}), 1),
  P('panel','CONTROL HOUSING','leaf',
    { kind:'archetype', archetypeId:'panel', params:{width:0.19,height:0.4,depth:0.06,radius:0.022} },
    [0.28,-0.03,0.076], mat('MAT-06','SHELL-050',{condition:'clean'}), 1),
  P('lens','CYCLE LENS','panel',
    { kind:'archetype', archetypeId:'screen', params:{width:0.12,height:0.21,depth:0.022,radius:0.028} },
    [0,-0.01,0.042], mat('MAT-09','AMBER-400',{emissiveState:'active'}), 0),
  P('status','SEAL STATUS','panel',
    { kind:'archetype', archetypeId:'screen', params:{width:0.085,height:0.026,depth:0.016,radius:0.008} },
    [0,-0.155,0.042], mat('MAT-09','CYAN-400',{emissiveState:'active'}), 0),
  P('handle','GRAB HANDLE','leaf',
    { kind:'archetype', archetypeId:'handle', params:{width:0.26,depth:0.055,radius:0.017} },
    [0.1,-0.02,0.066], mat('MAT-07','INK-900',{condition:'used',wear:0.4}), 1,
    { transform:{position:[0.1,-0.02,0.066],rotationDeg:[0,0,90]} }),
  P('lbolts','LEAF BOLTS','leaf',
    { kind:'repeat', source:{kind:'archetype',archetypeId:'fastener',params:{radius:0.015,depth:0.011,sides:6}},
      count:4, mode:'linear', axis:[0,1,0], spacing:0.26 },
    [-0.36,-0.39,0.062], mat('MAT-03','GRAPHITE-800',{condition:'used',wear:0.35}), 0),
]
const ix = id => parts.findIndex(p => p.id === id)
const geo = (id, path='/recipe') => ({ kind:'geometry', partId:id, path:`/parts/${ix(id)}${path}` })

const spec = {
  schemaVersion:1,
  assetId:'asset.architecture.doors.airlock-door',
  familyId:'doors', tier:'hero',
  source:{ brief:'docs/assets/reusable/architecture/doors/airlock-door.md',
    image:'docs/assets/reusable/architecture/doors/airlock-door.png',
    briefHash:'750169b51c1ce7842bd906b66d698c8cd81f100c8f0c9d7ed98e06c25117f626',
    imageHash:'3503d97bad0d4f2b0c145a99cb855a962307f713c46ebd21bc0db260dcee5ba8' },
  frame:{ dimensionsM:[1.6,1.75,0.3], pivotM:[0,0,0], forward:'+Z', up:'+Y' },
  camera:{ projection:'perspective', position:[1.2,1.515,3.95], target:[0,0.875,0], fovDeg:27.7 },
  parameters:[
    { id:'cx', target:'/camera/position/0', value:1.2, min:0.85, max:1.75, stage:'camera' },
    { id:'cy', target:'/camera/position/1', value:1.515, min:1.25, max:1.8, stage:'camera' },
    { id:'cz', target:'/camera/position/2', value:3.95, min:3.5, max:4.45, stage:'camera' },
    { id:'fov', target:'/camera/fovDeg', value:27.7, min:25, max:31, stage:'camera' },
  ],
  parts,
  detailZones:[
    { id:'mass', zone:'frame mass, step and recess', salience:1, frequency:'macro', requirements:[
      { id:'fvol', feature:'chamfered frame slab', implementation:geo('frame'), minPixels:400 },
      { id:'fstepr', feature:'stepped frame face', implementation:geo('fstep'), minPixels:80 },
      { id:'jchan', feature:'deep dark recess channel', implementation:geo('jamb'), minPixels:160 },
      { id:'fskin', feature:'observed frame finish', implementation:{kind:'decal',partId:'frame',path:'/projections/1'} } ]},
    { id:'leaf-face', zone:'leaf, viewport and panel break', salience:0.96, frequency:'macro', requirements:[
      { id:'lvol', feature:'chamfered armoured leaf', implementation:geo('leaf'), minPixels:300 },
      { id:'vcut', feature:'viewport aperture cut', implementation:geo('leaf','/recipe/left/right'), minPixels:60 },
      { id:'brk', feature:'angled panel break groove', implementation:geo('leaf','/recipe/right'), minPixels:40 },
      { id:'lpl', feature:'raised inner plate', implementation:geo('lplate'), minPixels:120 },
      { id:'vlin', feature:'dark viewport liner', implementation:geo('vliner'), minPixels:40 },
      { id:'lskin', feature:'observed leaf finish', implementation:{kind:'decal',partId:'leaf',path:'/projections/0'} } ]},
    { id:'service', zone:'controls, signal and mechanism', salience:0.88, frequency:'meso', requirements:[
      { id:'house', feature:'raised control housing', implementation:geo('panel'), minPixels:45 },
      { id:'cycle', feature:'amber cycle lens', implementation:geo('lens'), minPixels:20 },
      { id:'seal', feature:'cyan seal status', implementation:geo('status'), minPixels:6 },
      { id:'edg', feature:'amber leaf signal edge', implementation:geo('edge'), minPixels:18 },
      { id:'thresh', feature:'header and sill strips', implementation:geo('lamps'), minPixels:14 },
      { id:'act', feature:'exposed actuator ram', implementation:geo('ram'), minPixels:40 },
      { id:'col', feature:'ram collars', implementation:geo('collars'), minPixels:12 },
      { id:'grip', feature:'grab handle', implementation:geo('handle'), minPixels:14 },
      { id:'blt', feature:'frame fastener columns', implementation:geo('fbolts'), minPixels:5 } ]},
  ],
  projections:[
    { id:'leafskin', zoneId:'leaf-face', partId:'leaf', atlasSize:1024, delightAlbedo:true, fallback:'canonical-material' },
    { id:'frameskin', zoneId:'mass', partId:'frame', atlasSize:1024, delightAlbedo:true, fallback:'canonical-material' },
  ],
  runtime:{
    defaultState:'default',
    sockets:[
      { id:'mount_left', parentPartId:'frame', transform:{position:[-0.8,0,0],rotationDeg:[0,-90,0]} },
      { id:'mount_right', parentPartId:'frame', transform:{position:[0.8,0,0],rotationDeg:[0,90,0]} },
      { id:'door_slide', parentPartId:'leaf', transform:{position:[0,0,0]} },
      { id:'rail_ram', parentPartId:'jamb', transform:{position:[-0.5,0,0.05]} },
      { id:'power_ctrl', parentPartId:'frame', transform:{position:[0.62,-0.7,-0.15],rotationDeg:[0,180,0]} },
      { id:'fx_seal', parentPartId:'jamb', transform:{position:[0,-0.575,0.1]} },
    ],
    colliders:[
      { id:'fcol', parentPartId:'frame', shape:'box', size:[1.6,1.75,0.3] },
      { id:'lcol', parentPartId:'leaf', shape:'box', size:[0.88,1.03,0.12] },
    ],
    attachments:[
      ['afstep','fstep','frame','embedded',0.02],['afb','fbolts','frame','embedded',0.007],
      ['afb2','fbolts2','frame','embedded',0.007],['ajamb','jamb','frame','embedded',0.03],
      ['ajback','jback','jamb','embedded',0.012],['alamps','lamps','jamb','embedded',0.01],
      ['aram','ram','jamb','suspended',0],['acol','collars','jamb','embedded',0.02],
      ['aleaf','leaf','frame','hinged',0],['alpl','lplate','leaf','embedded',0.014],
      ['avlin','vliner','leaf','embedded',0.025],['avhaz','vhaz','leaf','embedded',0.01],
      ['aedge','edge','leaf','embedded',0.02],['apanel','panel','leaf','surface',0],
      ['alens','lens','panel','embedded',0.011],['astat','status','panel','embedded',0.008],
      ['agrip','handle','leaf','surface',0],['albolt','lbolts','leaf','embedded',0.005],
    ].map(([id,childPartId,parentPartId,contactType,embedDepthM]) =>
      ({ id, childPartId, parentPartId, contactType, embedDepthM,
         gapToleranceM: contactType==='hinged'?0.008:contactType==='suspended'?0.012:0.002,
         ...(contactType==='suspended'?{parentSocket:'rail_ram'}:{}) })),
    states:[
      { id:'default' },
      { id:'cycling', materialOverrides:[
        { partId:'lamps', material:mat('MAT-09','AMBER-400',{emissiveState:'cycling'}) },
        { partId:'lens', material:mat('MAT-09','AMBER-400',{emissiveState:'cycling'}) },
        { partId:'edge', material:mat('MAT-09','AMBER-400',{emissiveState:'cycling'}) } ]},
      { id:'weathered', materialOverrides:[
        { partId:'frame', material:mat('MAT-02','SHELL-200',{condition:'weathered',wear:0.62,dirt:0.45}) },
        { partId:'leaf', material:mat('MAT-02','SHELL-200',{condition:'weathered',wear:0.55,dirt:0.4}) },
        { partId:'ram', material:mat('MAT-03','GRAPHITE-800',{condition:'weathered',wear:0.72,dirt:0.42}) } ]},
      { id:'service-off', hiddenParts:['lamps','lens','status','edge','vhaz'],
        materialOverrides:[{ partId:'frame', material:mat('MAT-02','SHELL-200',{condition:'damaged',wear:0.78,dirt:0.5}) }] },
    ],
    lods:[
      { level:0, maxDistanceM:10, targetTriangleRatio:1 },
      { level:1, maxDistanceM:32, targetTriangleRatio:0.5 },
      { level:2, maxDistanceM:90, targetTriangleRatio:0.25 },
    ],
  },
  evidence:{
    zones:[
      { id:'mass', coverage:'observed', confidence:0.95, identityCritical:true },
      { id:'leaf-face', coverage:'observed', confidence:0.93, identityCritical:true },
      { id:'service', coverage:'observed', confidence:0.82, identityCritical:true } ],
    approximations:[
      'Envelope height 1.75 m taken from the reference render; the brief states a 2.6 m boilerplate door envelope.',
      'Rear face and recess interior are unseen in the single reference view and use canonical material fallback.',
      'Hazard chevron graphics are carried by the projected surface rather than authored decals.' ],
  },
}
writeFileSync('assets/forge/specs/doors/airlock-door.asset.json', JSON.stringify(spec, null, 2) + '\n')
console.log('parts:', parts.length)
