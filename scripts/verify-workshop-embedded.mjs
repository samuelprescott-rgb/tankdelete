// Read-only comparison of frozen frontend bytes against the signed local game.
// Tauri serializes HTML for its CSP pass; compare this small static index by
// exact elements/attributes/text, ignoring only insignificant serialization.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,realpathSync,existsSync,statSync,writeFileSync} from 'node:fs';
import {brotliDecompressSync} from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const project=realpathSync(fileURLToPath(new URL('..',import.meta.url)));
const out=realpathSync(process.argv[2]),p=JSON.parse(readFileSync(path.join(out,'package.json')));
assert(out.startsWith(path.join(project,'tmp/production-qa/local-mac-')) && realpathSync(p.binary).startsWith(out+'/'));
const dist=realpathSync(p.dist), binary=readFileSync(p.binary);
const hash=b=>createHash('sha256').update(b).digest('hex');
assert.equal(hash(binary),p.binarySha256);
const files=(d)=>readdirSync(d,{withFileTypes:true}).flatMap(x=>x.isDirectory()?files(path.join(d,x.name)):x.isFile()?[path.join(d,x.name)]:[]);
const bins=new Map(),found=new Map();
let html=null;
for(const filename of files(dist)) {
  const rel=path.relative(dist,filename), data=readFileSync(filename);
  if(rel==='index.html'){ html=data; continue; }
  const sha=hash(data);bins.set(sha,[...(bins.get(sha)||[]),rel]);
}
const canonical=s=>Array.from(s.toString('utf8').matchAll(/<[^>]+>|[^<]+/g),m=>{
  const t=m[0].trim();if(!t)return '';
  if(!/^<[a-z]/i.test(t))return t.toLowerCase()==='<!doctype html>'?'<!doctype html>':t;
  const tag=/^<([a-z0-9:-]+)/i.exec(t);const attrs=t.slice(tag[0].length).replace(/\s*\/?>$/,'');
  // This index is built by Vite and contains only simple quoted attributes.
  const grammar=/\s+([a-zA-Z0-9:-]+)(?:="([^"]*)")?/gy;const all=[];let pos=0;
  while(pos<attrs.trimEnd().length){grammar.lastIndex=pos;const hit=grammar.exec(attrs);assert(hit,'unexpected HTML attribute form');all.push([hit[1],hit[2]??'']);pos=grammar.lastIndex;}
  return [tag[1],all.sort(([a],[b])=>a.localeCompare(b))];
}).filter(x=>x!=='');
const canonicalHTML=JSON.stringify(canonical(html));
const build=path.join(realpathSync(process.env.TANKDELETE_QA_TOOLCHAIN||path.join(project,'tmp/qa-native-safe.EfcqLmKY')),'target/release/build');
const seen=new Set();let htmlProof=null;
const caches=readdirSync(build).filter(x=>x.startsWith('tauri-app-')).map(x=>path.join(build,x,'out/tauri-codegen-assets')).filter(existsSync).sort((a,b)=>statSync(b).mtimeMs-statSync(a).mtimeMs);
for(const cache of caches) {
 for(const name of readdirSync(cache)){
  if(seen.has(name))continue;seen.add(name);
  const encoded=readFileSync(path.join(cache,name)), data=brotliDecompressSync(encoded);
  if(name.endsWith('.html')){
    if(p.assets.filter(v=>v.startsWith('index-')).every(v=>data.includes(v)) &&
       JSON.stringify(canonical(data))===canonicalHTML && binary.includes(encoded))
      htmlProof={sourceSha256:hash(html),embeddedHtmlSha256:hash(data),sameElementsAttributesAndText:true};
    continue;
  }
  const sha=hash(data);
  if(bins.has(sha)&&!found.has(sha)&&binary.includes(encoded))found.set(sha,bins.get(sha));
 }
 if(found.size===bins.size && htmlProof)break;
}
const missing=[...bins].filter(([k])=>!found.has(k)).flatMap(([,v])=>v);
const result={app:p.app,binarySha256:p.binarySha256,dist,matchedPaths:[...found.values()].flat().sort(),html:htmlProof,missing,
 method:'Every non-HTML frozen file, including the Vite manifest, is SHA-256 matched to a Brotli-decoded codegen payload whose entire encoded stream occurs inside the signed executable. The HTML index is matched after Tauri HTML serialization.',
 pass:!missing.length&&!!htmlProof};
writeFileSync(path.join(out,'embedded-content.json'),JSON.stringify(result,null,2),{flag:'wx'});
console.log(JSON.stringify({pass:result.pass,files:result.matchedPaths.length,html:!!result.html,missing}));
assert(result.pass);
