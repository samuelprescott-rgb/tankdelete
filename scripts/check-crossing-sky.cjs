// R3's original mountain painting and ray-to-paint lookup. Check the source
// that is actually imported by the game, not a newly rendered approximation.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const ts=require('typescript');
const scene=path.join(__dirname,'../src/components/Scene');
const source=name=>fs.readFileSync(path.join(scene,name),'utf8');
function verify(){
  const asset=source('riverDawnAsset.ts').match(/['"]([^'"]*river-r3-reference\.png)(?:\?url)?['"]/);
  assert(asset,'Missing import of the archival R3 painting');
  const bytes=fs.readFileSync(path.resolve(scene,asset[1]));
  const sha=crypto.createHash('sha256').update(bytes).digest('hex');
  assert.equal(sha,'b850e26694e45d5407c00cb350bfc8c84ea72fa72f3f80b0275efdd2051f3583');
  assert.deepEqual([bytes.readUInt32BE(16),bytes.readUInt32BE(20)],[1792,352]);

  const compiled=ts.transpileModule(source('crossingSun.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  const api={};Function('exports',compiled)(api);
  const {gradeDawnGLSL:g,DAY_SUN_BEARING:b,DAY_SUN_ALTITUDE:e,DAY_SUN_RAY:ray}=api;
  assert(Math.abs(b-.93)<.001&&Math.abs(e-.273)<.001,'The directional sun moved away from the R3 disc');
  const dot=ray[0]*Math.cos(e)*Math.cos(b)+ray[1]*Math.sin(e)+ray[2]*Math.cos(e)*Math.sin(b);
  assert(Math.abs(dot-1)<1e-6);
  const body=g.match(/vec2\s+signalDawnUv\s*\([^)]+\)\s*\{([^}]*)\}/)[1];
  const project=Function('azimuth','elevation','clamp','vec2',body);
  const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
  for(const az of [0,.11,.429,.5,.648,.82,1])for(const el of [-1.4,-.08,.07,.273,.62,1.4]){
    const [u,v]=project(az,el,clamp,(a,b)=>[a,b]);
    assert(Math.abs(u-az)<1e-6&&Math.abs(v-clamp((el+.15)/1.28,.0015,.9985))<1e-6,'R3 contour no longer registers with its world compass');
  }
  assert(/vec3\s+signalGradeDawn\s*\(\s*vec3\s+(\w+)\s*,[^)]*\)\s*\{\s*return\s+\1\s*;\s*\}/.test(g),'Second pigment grade over the original mountain colors');
  const sky=source('VietnamSkybox.tsx');
  assert(/SKY_RADIUS\s*=\s*260\b/.test(sky)&&/\[SKY_RADIUS,\s*32,\s*16\]/.test(sky),'Wrong archival dome radius or mesh');
  assert(/dayPaint\.magFilter\s*=\s*THREE\.NearestFilter/.test(sky)&&/dayPaint\.minFilter\s*=\s*THREE\.LinearMipmapLinearFilter/.test(sky),'Wrong original paint sampling');
  assert(!/sky\s*=\s*crossingCloudPaint\(/.test(sky),'A newer weather overlay obscures the archival paint');
  for(const name of ['VietnamSkybox.tsx','VietnamEnvironment.tsx','TerrainSurface.tsx']){
    const s=source(name);assert(s.includes('riverDawnAsset')&&/useLoader\(THREE\.TextureLoader,\s*RIVER_SKY_TEXTURES\)/.test(s)
      &&!s.includes('ghost-river-olive-karst-v9'),name+' is not bound to the original R3 image');
  }
  for(const name of ['VietnamSkybox.tsx','TerrainSurface.tsx','wetlandGeometry.ts'])assert(source(name).includes('signalDawnUv('),name+' uses a different projection');
  assert(source('Lighting.tsx').includes('new THREE.Vector3(...DAY_SUN_RAY)'));
  console.log({source:'archived R3 dawn',sha256:sha,dimensions:[1792,352],bearing:b,elevation:e,domeRadius:260});
}
module.exports={verify};
if(require.main===module)verify();
