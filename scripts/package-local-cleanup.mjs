// Offline, local ad-hoc playtest; no install, cert, credential, storefront or
// notarization. Set TANKDELETE_QA_TOOLCHAIN to the private cached QA root.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,readdirSync,cpSync,writeFileSync,realpathSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const project=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,'');
const qa=realpathSync(process.env.TANKDELETE_QA_TOOLCHAIN||path.join(project,'tmp/qa-native-safe.EfcqLmKY'));
const dist=realpathSync(process.argv[2]);
const workshop=process.argv[3]==='--allow-local-webkit-startup';
assert(process.argv.length===(workshop?4:3),'unexpected packaging option');
const retainedField = path.dirname(dist)===path.join(project,'tmp/production-qa') && /^(?:ghost-field|campaign-relief)-release-[A-Za-z0-9]{8}$/.test(path.basename(dist));
assert(process.platform==='darwin'&&(dist.startsWith('/private/tmp/')||dist.startsWith(path.join(project,'tmp/production-qa/ghost-signal-'))||retainedField)&&existsSync(path.join(dist,'index.html')));
const out=mkdtempSync(path.join(project,'tmp/production-qa/local-mac-')),name='TankDelete Workshop '+path.basename(out).slice(-6);
const bundle=name+'.app',id='local.tankdelete.workshop.'+path.basename(out).slice(-6).toLowerCase();
const entitlements=workshop?'Entitlements.local-workshop.plist':'Entitlements.plist';
const cfg={productName:name,identifier:id,build:{beforeBuildCommand:'',frontendDist:dist},bundle:{macOS:{entitlements}}};
if(workshop){
 const base=JSON.parse(readFileSync(path.join(project,'src-tauri/tauri.conf.json')));
 assert.equal(base.app.windows.length,1);
 // Mac IPC is an in-process custom URL scheme, not a network listener. The
 // production workshop has no HTTP, WS, localhost dev server or remote origin.
 cfg.app={windows:[{...base.app.windows[0],label:'main',create:false}],
   security:{csp:base.app.security.csp.replace('ipc: http://ipc.localhost','ipc://localhost')}};
 assert(!/https?:|wss?:/.test(cfg.app.security.csp));
}
const env={PATH:[path.join(qa,'toolchain/bin'),path.dirname(process.execPath),'/usr/bin','/bin','/usr/sbin','/sbin'].join(':'),
 CARGO_HOME:path.join(qa,'cargo-cache'),CARGO_TARGET_DIR:path.join(qa,'target'),CARGO_BUILD_JOBS:'2',CARGO_NET_OFFLINE:'true',
 TMPDIR:path.join(qa,'temp'),CLANG_MODULE_CACHE_PATH:path.join(qa,'clang-cache'),XDG_CACHE_HOME:path.join(qa,'cache'),
 GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1',CI:'1',LANG:'en_US.UTF-8'};
const run=(cmd,args,opts={})=>{const v=spawnSync(cmd,args,{cwd:project,env,encoding:'utf8',...opts});assert.equal(v.status,0,v.stderr||v.error?.message);return v.stdout;};
console.log('Package evidence:',out);
run(process.execPath,[path.join(project,'node_modules/@tauri-apps/cli/tauri.js'),'build','--ci','--no-sign','--skip-stapling','--bundles','app',...(workshop?['--features','local-workshop']:[]),'--config',JSON.stringify(cfg),'--','--locked','--offline'],{stdio:'inherit'});
const app=path.join(out,bundle);
cpSync(path.join(qa,'target/release/bundle/macos',bundle),app,{recursive:true,force:false,errorOnExist:true});
run('/usr/bin/codesign',['--force','--sign','-','--timestamp=none','--entitlements',path.join(project,'src-tauri',entitlements),app]);
run('/usr/bin/codesign',['--verify','--deep','--strict',app]);
const signed=run('/usr/bin/codesign',['-d','--entitlements','-','--xml',app]);
const allowed=['com.apple.security.app-sandbox','com.apple.security.files.user-selected.read-write',...(workshop?['com.apple.security.network.client']:[])];
assert.deepEqual([...signed.matchAll(/<key>([^<]+)<\/key>/g)].map(m=>m[1]).sort(),allowed);
assert.equal((signed.match(/<true\/>/g)||[]).length,allowed.length);
const binary=path.join(app,'Contents/MacOS/tauri-app'),hash=buf=>createHash('sha256').update(buf).digest('hex');
const assets=readdirSync(path.join(dist,'assets')).filter(f=>/^(?:index|GameSession)-.*\.js$/.test(f));
const actual=readFileSync(binary);assert(assets.length>=2&&assets.every(file=>actual.includes(Buffer.from(file))),'Expected chunk names absent from the native embedded asset index');
const proof={app,binary,id,assets,dist,binarySha256:hash(actual),htmlSha256:hash(readFileSync(path.join(dist,'index.html'))),entitlements:signed,signed:'local ad-hoc only',nativeTrashTest:'inert commit only',
 ...(workshop?{webkitStartup:'user-approved for the local workshop only',offlineWebview:{csp:cfg.app.security.csp,navigation:'tauri://localhost only',newWindows:false,downloads:false,resourceFilter:'WKContentRuleList compiled and attached before first navigation; blocks HTTP(S), WS(S), FTP and file'}}:{})};
writeFileSync(path.join(out,'package.json'),JSON.stringify(proof,null,2),{flag:'wx'});console.log(JSON.stringify({app,binary,assets}));
