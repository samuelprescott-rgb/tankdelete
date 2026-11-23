import * as THREE from 'three';
// Original static lightfield, baked offline from three embers and the displaced
// concrete members in art-source/burnOcclusionBake.ts. Only RG visibility is
// stored (2 bits/channel). Run scripts/check-burn-shadow.mjs to prove equality.
const mask='b1cGFQHwFxMnK/8XC1cVIZAB8AkjFxv/GmcFMfAFAXAhEiMHG/8cZzHwBQFwIRIjB/8eC0cDAjHwDiECIwcL/x5HE0FABPAHIQIzC/8fNyMxMBTwByESIwv/IBdDMSAUkASwIRIT/yIXQ0EQCASQBMAhAgf/IhdjQRAEgBQIsCEO/yQHczGwJLAJHR7/JQdTAjGQFAiAPC0e/ydTQYAECAxABAhsLQ7/KUMxDWAECBwwBIwtDv8qBzMhDVAECCwgBJwt/y0HEwIBCQ0BQPwDHQ4vB/8oFyNBBAj8BQ0uIwv/JxczMSAE/AEdHhIjC/8nF0MxEAT8AB0OMjP/JxdDQQAE7A0OQkML/yYHY0EEzB1CYwf/JgdzMQi8HUKD/yYHgyEJTB1MDQ4ikwv/KBsHQyEJDRwdDl0uAoML/ysHEysXFQkdDA0uLU4CYwv/LAczCz9dHw4dXlML/y0LUwsvDh0uH34fIxv/LQtzPx0eT04/G/8vB4M/Ll8u/zcHgz8Obx7/OQeDvw7/OgdjB/9HCwdT/0kLBzP/AwP/NwsHEwf/AiP/Nyf/AkP/Nwv/AlMH/0eD/0aj/0SzC/9CswcL/0GzBwv/QbML/0MHkwv/RAeDC/9GB2MLXyP/PgtTC29z/zoHIwcLf4P/OgcDBwt/o/85K4+jC/9Eowv/RKP/RpP/RhdjC/9IGycTC/9NK/////////////////////8e';
const size=96;
let cached:Uint8Array<ArrayBuffer>|undefined;
export function burnOcclusionBytes(){
  if(cached)return cached;
  const code=atob(mask),out=new Uint8Array(size*size*2);let i=0;
  for(let j=0;j<code.length;){
    const token=code.charCodeAt(j++),v=token&15;let n=1+(token>>4);
    if(n===16){let add;do{add=code.charCodeAt(j++);n+=add;}while(add===255);}
    for(let k=0;k<n;k++){out[i++]=(v>>2)*85;out[i++]=(v&3)*85;}
  }
  cached=out;return out;
}
export function createBurnOcclusion(){
  const t=new THREE.DataTexture(burnOcclusionBytes(),size,size,THREE.RGFormat,THREE.UnsignedByteType);
  t.name='Fallen fins • ember contact visibility';t.magFilter=t.minFilter=THREE.LinearFilter;
  t.needsUpdate=true;return t;
}
