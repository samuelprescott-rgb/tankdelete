// Surveyed OFFLINE from the immutable Boot Camp manifest. Never choose a
// target using runtime actor positions, receipts, or timings.
export const bootStrikeRoutes = {
  'boot-east-three-r7': {
    landmark:[25.5,0,12.4], files:3, mib:286, sparks:1237,
    names:['mixdown-final.wav','screenshot-copy.png','unused-installer.dmg'],
  },
  'boot-east-four-stress-r7': {
    landmark:[20.7,0,16.4], files:4, mib:290, sparks:1569,
    names:['mixdown-final.wav','scratch-code.ts','screenshot-copy.png','unused-installer.dmg'],
  },
};

/** Do not allow an infantry casualty to substitute for an armed or deleted
 * virtual file. Both cues, the bytes, score and sector delta must agree. */
export function verifySurveyedRoute(spec,cues,events,targetCount) {
  const {files:n,mib}=spec, first=cues?.[0]?.impact?.t, second=cues?.[1]?.impact?.t;
  const hud=events.filter(e=>e.type==='file-hud'), firstCount=parseInt(hud[0]?.sector??'',10);
  const bytes=mib.toFixed(2)+' MB';
  const during=(e,t)=>Number.isFinite(t)&&e.t>=t-120&&e.t<=t+3000;
  return {
    exactFileWorkloadCues:cues?.length===2&&cues.every(({inbound,impact})=>
      inbound.text==='Phantom inbound · '+n+' targets in strike zone'&&targetCount(impact.text)===n),
    exactFirstArmedFiles:hud.some(e=>during(e,first)&&parseInt(e.sector,10)===firstCount
      &&/^0 trashed\b/.test(e.run??'')&&e.armed===n+' files armed · '+bytes),
    exactRepeatDeletion:hud.some(e=>during(e,second)&&parseInt(e.sector,10)===firstCount-n
      &&e.run===n+' trashed · '+bytes+' freed'&&!e.armed)
      &&events.some(e=>during(e,second)&&e.type==='deletion-toast'&&e.text==='Deleted '+n+' files (+'+mib+' pts)'),
  };
}
