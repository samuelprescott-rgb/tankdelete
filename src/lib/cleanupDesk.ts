import type { FileEntry } from './types';

export interface CleanupChoice {id:string;name:string;path:string;size:number}
export type CleanupSource='sample'|'mac';
export interface CleanupSelection {source:CleanupSource;files:CleanupChoice[]}
export type CleanupReceipt='trashed'|'cancelled'|'changed'|'expired'|'failed'|'busy';
type NativeBridge={invoke:(cmd:string,args?:Record<string,string>)=>Promise<unknown>};
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
function bridge():NativeBridge|undefined {
  if(location.protocol!=='tauri:'||location.hostname!=='localhost'||!navigator.userAgent.includes('Mac')) return;
  return (window as typeof window & {__TAURI_INTERNALS__?:NativeBridge}).__TAURI_INTERNALS__;
}
export const canPickReal=()=>typeof bridge()?.invoke==='function';
export async function pickReal():Promise<CleanupSelection|null> {
  const api=bridge(); if(!api) throw Error('Open the packaged Mac app to select real files.');
  const receipt=JSON.parse(String(await api.invoke('cleanup_pick')));
  if(receipt.status==='cancelled') return null;
  if(receipt.status!=='picked' || !Array.isArray(receipt.files) || !receipt.files.length || receipt.files.length>12)
    throw Error('Nothing was imported. Choose up to 12 ordinary local files from Desktop, Documents or Downloads. Links, packages, executables, cloud-only and shared locations are excluded.');
  const ids=new Set<string>();
  for(const raw of receipt.files) {
    if(!raw || typeof raw.id!=='string' || !uuid.test(raw.id)||ids.has(raw.id)||typeof raw.name!=='string'||!raw.name.length
       || typeof raw.path!=='string'||!raw.path.startsWith('/')||!raw.path.endsWith('/'+raw.name)
       || !Number.isSafeInteger(raw.size)||raw.size<0) throw Error('Invalid picker receipt. Start a new selection.');
    ids.add(raw.id);
  }
  return {source:'mac',files:receipt.files};
}
export async function reviewReal(id:string):Promise<CleanupReceipt> {
  const api=bridge(); if(!api || !uuid.test(id)) return 'expired';
  const result=await api.invoke('cleanup_review',{token:id});
  return ['trashed','cancelled','changed','expired','busy'].includes(String(result))?result as CleanupReceipt:'failed';
}
export function forgetReal(){ void bridge()?.invoke('cleanup_forget').catch(()=>{}); }
export const sampleSelection=():CleanupSelection=>({source:'sample',files:[
  {id:'sample-a',name:'field-notes.txt',path:'Sample drive / Drafts / field-notes.txt',size:4096},
  {id:'sample-b',name:'field-notes.txt',path:'Sample drive / Archive / field-notes.txt',size:8192},
  {id:'sample-c',name:'radio-take.wav',path:'Sample drive / Recordings / radio-take.wav',size:1048576},
]});
export function cleanupFieldEntries(files:readonly CleanupChoice[]):FileEntry[] {
  // Never put the host path or file handle into the 3D scene, logs or progression.
  return files.map((f,i)=>({path:'pick:'+f.id,name:String(i+1).padStart(2,'0')+' · '+f.name,
    size:f.size,is_dir:false,extension:f.name.includes('.')?f.name.split('.').pop()!.toLowerCase():null}));
}
export function nominatedChoices(entries:readonly FileEntry[],marked:ReadonlySet<string>) {
  return entries.filter(f=>f.path.startsWith('pick:')&&marked.has(f.path)).map(f=>f.path.slice(5));
}
