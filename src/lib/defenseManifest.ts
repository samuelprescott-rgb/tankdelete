import type {GameLaunch} from './gameSession';

// Only fictional display names and the earned replay are remembered. These
// strings are never used as paths, URLs, or inputs to the filesystem.
const KEY = 'tankdelete.virtual-defense.v1';
function sanitize(value:unknown):string[] {
  return Array.isArray(value) ? [...new Set(value.filter((n):n is string =>
    typeof n === 'string' && /^[\w .()\-]{1,64}$/.test(n) && !n.includes('..')))].slice(0,3) : [];
}
export function loadDefenseManifest():string[] {
  try{return sanitize(JSON.parse(localStorage.getItem(KEY)??'null'));}catch{return [];}
}
export function awardDefenseReplay(active:GameLaunch|null, awarder:GameLaunch|null, files:string[]):string[] | null {
  // Keep an existing replay intact if practice, an old session callback,
  // or an empty roster tries to award one.
  if (active?.mode !== 'directory' || active !== awarder) return null;
  const names = sanitize(files);
  if (!names.length) return null;
  try{localStorage.setItem(KEY,JSON.stringify(names));}catch{ /* in-memory unlock still works */ }
  return names;
}

