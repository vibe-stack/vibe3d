import { CatmullRomCurve3, Color, DirectionalLight, Group, HemisphereLight, Mesh, MeshPhysicalMaterial, PerspectiveCamera, PlaneGeometry, Scene, TubeGeometry, Vector3 } from 'three/webgpu'
import { MaterialLibrary, WEAR_ATTRIBUTES, bakeOcclusion, bakeSurfaceAttributes, createWearMaterial, cylinder, mergeStaticByMaterial, prism, tuneMaterial, type Vec3, type WearProfile } from '../../../src/asset-forge/generator/index.ts'
const FRONT:Vec3=[Math.PI/2,0,0];const X:Vec3=[0,0,Math.PI/2]
interface M{shell:MeshPhysicalMaterial;shade:MeshPhysicalMaterial;graphite:MeshPhysicalMaterial;ink:MeshPhysicalMaterial;steel:MeshPhysicalMaterial;amber:MeshPhysicalMaterial;cyan:MeshPhysicalMaterial;rubber:MeshPhysicalMaterial;grime:MeshPhysicalMaterial}
interface Controller{root:Group;update:(d:number)=>void;toggleTransformer:(v?:boolean)=>boolean;dispose:()=>void}interface Preview extends Controller{scene:Scene;camera:PerspectiveCamera}
let exportedEnabled=false;const listeners=new Set<(v:boolean)=>void>();export function toggleTransformer(v=!exportedEnabled){exportedEnabled=v;for(const l of listeners)l(v);return v}
function mats(){const l=new MaterialLibrary();const a=l.acquire({recipeId:'MAT-04',palette:'SHELL-200',condition:'worked',seed:26601});const b=l.acquire({recipeId:'MAT-04',palette:'SHELL-500',condition:'worked',seed:26602});const c=l.acquire({recipeId:'MAT-03',palette:'GRAPHITE-800',condition:'worked',seed:26603});const d=l.acquire({recipeId:'MAT-03',palette:'INK-950',condition:'maintained',seed:26604});const e=l.acquire({recipeId:'MAT-02',palette:'STEEL',condition:'worked',seed:26605});const f=l.acquire({recipeId:'MAT-09',palette:'AMBER-400',condition:'active',seed:26606});const g=l.acquire({recipeId:'MAT-09',palette:'CYAN-400',condition:'active',seed:26607});const h=l.acquire({recipeId:'MAT-05',palette:'GRAPHITE-800',condition:'worked',seed:26608});return{handles:[a,b,c,d,e,f,g,h],m:{shell:tuneMaterial(a,0xcbd0cf,.46,.28,{clearcoat:.12}),shade:tuneMaterial(b,0x8d9799,.56,.42),graphite:tuneMaterial(c,0x232a31,.56,.62),ink:tuneMaterial(d,0x07090b,.86,.08),steel:tuneMaterial(e,0x98a1a4,.3,.84),amber:tuneMaterial(f,0xe87908,.24,.04,{emissive:.52}),cyan:tuneMaterial(g,0x35cbd8,.22,.04,{emissive:.82}),rubber:tuneMaterial(h,0x111418,.92,.02),grime:new MeshPhysicalMaterial({name:'industrial-transformer / contact grime',color:0x1d1a17,roughness:.94,metalness:.03})} as M}}
function box(p:Group,m:MeshPhysicalMaterial,s:Vec3,at:Vec3,c=.08,b=.025,r:Vec3=[0,0,0]){const q=prism(m,s,at,{chamfer:c,fillet:Math.min(.05,Math.max(.008,c*.28)),bevel:b,rotation:r});p.add(q);return q}function bolt(p:Group,m:MeshPhysicalMaterial,x:number,y:number,z:number){p.add(cylinder(m,.055,.11,[x,y,z],FRONT,8))}function pipe(m:MeshPhysicalMaterial,pts:Vec3[],radius=.08,segments=28){return new Mesh(new TubeGeometry(new CatmullRomCurve3(pts.map(p=>new Vector3(...p)),false,'centripetal'),segments,radius,8,false),m)}
function base(f:Group,m:M){box(f,m.graphite,[5.65,.58,3.55],[0,.36,0],.26,.064);box(f,m.ink,[4.85,.2,2.9],[0,.12,0],.14,.035);for(const x of [-2.95,2.95])for(const z of [-1.55,1.55]){box(f,m.graphite,[1.35,.28,1.0],[x,.14,z],.2,.05);box(f,m.steel,[.56,.06,.4],[x,.03,z],.08,.02);f.add(cylinder(m.steel,.085,.11,[x,.3,z],FRONT,8))}box(f,m.graphite,[5.65,.5,3.5],[0,.84,0],.22,.055)}
function body(f:Group,m:M){
  box(f,m.shade,[6.0,5.0,1.85],[0,3.3,-.88],.5,.115)
  for(const x of [-2.35,2.35]){box(f,m.shell,[1.3,4.5,2.6],[x,3.27,-.2],.42,.1);box(f,m.graphite,[.3,2.9,1.82],[x,3.02,.78],.15,.036);box(f,m.shade,[.72,1.08,.3],[x,4.72,1.18],.14,.035)}
  box(f,m.shell,[3.7,1.18,2.58],[0,5.22,-.2],.36,.088);box(f,m.shell,[3.7,.86,2.58],[0,1.28,-.2],.34,.082)
  box(f,m.graphite,[5.75,.38,2.4],[0,1.08,-.4],.2,.05);box(f,m.shade,[4.75,.34,1.96],[0,5.78,-.62],.18,.045)
  for(const x of [-2.72,2.72]){box(f,m.shade,[.62,1.36,1.72],[x,1.72,-.2],.22,.055);box(f,m.steel,[.26,.46,.2],[x,1.18,.78],.08,.02)}
}
function chamber(f:Group,cores:Group,m:M){
  box(f,m.ink,[3.2,2.58,.3],[0,3.03,.24],.28,.068)
  box(f,m.ink,[3.15,.2,1.34],[0,4.22,.72],.08,.02);box(f,m.ink,[3.15,.2,1.34],[0,1.84,.72],.08,.02)
  for(const x of [-1.48,1.48])box(f,m.ink,[.2,2.55,1.34],[x,3.03,.72],.08,.02)
  box(f,m.graphite,[3.82,.5,.66],[0,4.5,1.18],.2,.05);box(f,m.graphite,[3.82,.5,.66],[0,1.56,1.18],.2,.05)
  for(const x of [-1.7,1.7])box(f,m.graphite,[.5,2.58,.66],[x,3.03,1.18],.2,.05)
  box(f,m.ink,[3.46,.28,.78],[0,4.3,1.45],.12,.03);box(f,m.ink,[3.46,.28,.78],[0,1.76,1.45],.12,.03)
  for(const x of [-1.58,1.58])box(f,m.ink,[.28,2.3,.78],[x,3.03,1.45],.12,.03)
  box(f,m.steel,[3.08,.14,.16],[0,4.18,1.54],.05,.014);box(f,m.steel,[3.08,.14,.16],[0,1.88,1.54],.05,.014)
  for(const x of [-1.46,1.46])box(f,m.steel,[.14,2.16,.16],[x,3.03,1.54],.05,.014)
  for(const x of [-.94,0,.94]){
    cores.add(cylinder(m.graphite,.49,.28,[x,1.98,.94],[0,0,0],16));cores.add(cylinder(m.graphite,.49,.28,[x,4.08,.94],[0,0,0],16))
    cores.add(cylinder(m.ink,.28,1.92,[x,3.03,.9],[0,0,0],14));cores.add(cylinder(m.steel,.16,2.12,[x,3.03,.9],[0,0,0],14))
    cores.add(cylinder(m.shade,.34,.18,[x,2.12,.96],[0,0,0],16));cores.add(cylinder(m.shade,.34,.18,[x,3.94,.96],[0,0,0],16))
    cores.add(cylinder(m.steel,.22,.16,[x,2.23,1.02],[0,0,0],14));cores.add(cylinder(m.steel,.22,.16,[x,3.83,1.02],[0,0,0],14))
    for(let i=-8;i<=8;i++)cores.add(cylinder(m.amber,.34,.045,[x,3.03+i*.09,1.08],[0,0,0],16))
  }
  for(const x of [-1.55,1.55])for(const y of [1.72,4.34])bolt(f,m.steel,x,y,1.57)
  for(const y of [1.28,4.76]){box(f,m.graphite,[1.8,.3,.24],[0,y,1.48],.1,.025);box(f,m.amber,[1.16,.1,.08],[0,y,1.65],.035,.01)}
}
function service(f:Group,m:M){
  box(f,m.graphite,[1.35,2.72,.94],[3.0,3.0,.42],.22,.055);box(f,m.ink,[1.02,2.22,.24],[3.0,3.0,1.02],.15,.038)
  box(f,m.shade,[1.0,1.8,.3],[3.0,2.82,1.22],.16,.04);box(f,m.graphite,[.74,1.36,.16],[3.0,2.82,1.42],.12,.03)
  box(f,m.shade,[.9,.74,.36],[3.0,3.78,1.2],.13,.032);box(f,m.cyan,[.24,.24,.08],[3.0,3.78,1.42],.05,.014)
  for(const y of [2.15,2.52,2.89]){box(f,m.graphite,[.54,.14,.12],[3.0,y,1.21],.04,.012);bolt(f,m.steel,3.3,y,1.35)}
  box(f,m.graphite,[.8,2.72,.58],[-3.0,2.98,-.08],.17,.042);for(let i=-4;i<=4;i++)box(f,m.ink,[.5,.13,.26],[-3.18,2.45+i*.2,.0],.04,.01)
  box(f,m.graphite,[4.55,.48,1.94],[0,5.72,-.2],.2,.05);for(let i=-7;i<=7;i++)box(f,m.ink,[.16,.24,1.54],[i*.27,6.02,-.2],.04,.01)
  for(const x of [-1.72,1.72]){f.add(cylinder(m.graphite,.34,.42,[x,5.42,-.58],X,14));f.add(cylinder(m.steel,.18,.52,[x,5.42,-.58],X,12));box(f,m.amber,[.3,.5,.34],[x,5.5,-.12],.09,.022)}
  for(const y of [2.08,2.55,3.02,3.49]){f.add(cylinder(m.graphite,.14,.2,[3.44,y,1.38],[0,0,0],12));f.add(cylinder(m.steel,.07,.3,[3.44,y,1.38],[0,0,0],10))}
  const cables:Array<[Vec3[],number]>=[[[[2.1,4.15,.04],[2.72,4.25,.02],[2.76,3.35,.2],[2.55,2.6,.35]],.1],[[[1.62,5.2,-.55],[2.25,5.25,-.55],[2.62,4.6,-.36],[2.52,3.7,-.02]],.085],[[[1.46,5.18,-.62],[2.05,5.06,-.72],[2.45,4.25,-.55],[2.46,3.5,-.22]],.075],[[[-1.65,5.18,-.55],[-2.3,5.15,-.55],[-2.58,4.2,-.3],[-2.42,3.4,.0]],.09]]
  for(const [pts,r] of cables)f.add(pipe(m.rubber,pts,r,32))
  f.add(pipe(m.rubber,[[3.44,4.46,1.38],[3.68,4.05,1.42],[3.68,3.32,1.4],[3.44,3.02,1.38]],.08,28));f.add(pipe(m.rubber,[[3.44,2.56,1.38],[3.68,2.2,1.4],[3.6,1.46,1.2],[3.15,1.12,.84]],.08,28))
  for(const p of [[3.44,4.46,1.38],[3.44,3.02,1.38],[3.44,2.56,1.38],[3.15,1.12,.84]] as Vec3[])f.add(cylinder(m.steel,.12,.18,p,[0,0,0],12))
  for(const x of [-1.82,1.82])box(f,m.cyan,[.1,.5,.08],[x,1.26,1.48],.03,.008);box(f,m.grime,[3.1,.06,.12],[0,1.1,1.18],.03,.008)
}
function build(){const{m,handles}=mats();const root=new Group();root.name='industrial transformer';const fixed=new Group();const cores=new Group();cores.name='bounded energized transformer cores';root.add(fixed,cores);base(fixed,m);body(fixed,m);chamber(fixed,cores,m);service(fixed,m);const profiles=new Map<MeshPhysicalMaterial,WearProfile>([[m.shell,{rub:.08,grime:.035,scratch:.012}],[m.shade,{rub:.1,grime:.045,scratch:.014}],[m.graphite,{rub:.055,grime:.045,scratch:.01}],[m.steel,{rub:.16,grime:.04,scratch:.022}]]);bakeOcclusion(root,{reach:.17});bakeSurfaceAttributes(root,profiles);const wear=createWearMaterial({name:'industrial-transformer / localized wear',clearcoat:.08,clearcoatRoughness:.55});root.traverse(o=>{if(o instanceof Mesh&&!Array.isArray(o.material)&&profiles.has(o.material))o.material=wear});const opts={retainedAttributes:(mat:unknown):readonly string[]=>mat===wear?WEAR_ATTRIBUTES:[],meshName:(mat:{name?:string})=>mat.name??'transformer batch'};const geometries=[...mergeStaticByMaterial(fixed,opts),...mergeStaticByMaterial(cores,opts)];return{root,cores,m,handles,wear,geometries}}
export function createModel():Controller{const r=build();let enabled=false,t=0;const l=(v:boolean)=>{enabled=v};listeners.add(l);return{root:r.root,update:(d:number)=>{if(!enabled)return;t+=Math.min(Math.max(d,0),.05);r.m.amber.emissiveIntensity=.56+Math.sin(t*3.1)*.22;r.cores.scale.y=1+Math.sin(t*2.2)*.006},toggleTransformer:(v=!enabled)=>{enabled=v;return v},dispose:()=>{listeners.delete(l);for(const g of r.geometries)g.dispose();r.wear.dispose();for(const h of r.handles)h.release();r.m.grime.dispose()}}}
function preview(o:{aspect?:number;mode?:'beauty'|'side'|'rear'|'low';active?:boolean}={}):Preview{const model=createModel();if(o.active){model.toggleTransformer(true);for(let i=0;i<30;i++)model.update(.05)}const scene=new Scene();scene.background=new Color(0x030506);scene.add(model.root,new HemisphereLight(0xcbd2d4,0x07090c,.82));const k=new DirectionalLight(0xffead6,2.8);k.position.set(-9,12,12);scene.add(k);const f=new DirectionalLight(0x789bc5,1.1);f.position.set(10,7,10);scene.add(f);const rim=new DirectionalLight(0x8bb3bc,.9);rim.position.set(8,10,-11);scene.add(rim);const fm=new MeshPhysicalMaterial({color:0x090d10,roughness:.92,metalness:.04});const fg=new PlaneGeometry(18,18);const floor=new Mesh(fg,fm);floor.rotation.x=-Math.PI/2;floor.position.y=-.004;floor.userData.excludeFromExport=true;scene.add(floor);const camera=new PerspectiveCamera(35,o.aspect??1,.16,100);if(o.mode==='side')camera.position.set(-10,3.8,0);else if(o.mode==='rear')camera.position.set(-8,4.5,-10);else if(o.mode==='low')camera.position.set(8,.9,9);else camera.position.set(9,4.9,10.5);camera.lookAt(0,o.mode==='low'?2.25:3.0,0);scene.add(camera);return{...model,scene,camera,dispose:()=>{fg.dispose();fm.dispose();model.dispose()}}}
export const createPreview=(o:{aspect?:number}={})=>preview({...o,mode:'beauty'});export const createSidePreview=(o:{aspect?:number}={})=>preview({...o,mode:'side'});export const createRearPreview=(o:{aspect?:number}={})=>preview({...o,mode:'rear'});export const createLowPreview=(o:{aspect?:number}={})=>preview({...o,mode:'low'});export const createToggledPreview=(o:{aspect?:number}={})=>preview({...o,mode:'beauty',active:true})
