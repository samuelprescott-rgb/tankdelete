import type { FileEntry } from '../lib/types';
import { formatBytes } from '../lib/format';

interface Props { entries:FileEntry[]; marked:Set<string>; removing:Set<string>; trashed:number;
  objectives:readonly string[]; close:()=>void; undo:()=>void }

export function VirtualDrivePanel({entries,marked,removing,trashed,objectives,close,undo}:Props) {
  const rows=entries.filter(e=>!e.is_dir).sort((a,b)=>a.name.localeCompare(b.name));
  return <section className="virtual-drive" data-game-ui aria-label="Field file manifest">
    <header><div><small>SIMULATED FILESYSTEM</small><h3>Field files</h3></div>
      <button type="button" onClick={close} aria-label="Close field files">×</button></header>
    <p>These simulated files are the huts in the clearing. Mark a hut, then hit it again to confirm. Viewing the list never moves your tank.</p>
    <ul>{rows.map(e=><li key={e.path}><span>{e.name}</span>
      <small>{removing.has(e.path)?'Moving to Trash':marked.has(e.path)?'Armed':objectives.includes(e.path)?'Duplicate':formatBytes(e.size)}</small>
    </li>)}</ul>
    <footer><span>Virtual Trash · {trashed}</span><button type="button" disabled={!trashed} onClick={undo}>Undo last</button></footer>
  </section>;
}
