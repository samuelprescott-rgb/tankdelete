import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import * as T from 'three';
const sharp=createRequire(import.meta.url)('sharp');
export async function sampleHatchWood(path,snap){
  const ca=new T.PerspectiveCamera(60,16/9,.1,340),at=snap.before,bt=snap.after;
  ca.position.fromArray(at.camera).lerp(new T.Vector3().fromArray(bt.camera),.5);
  ca.quaternion.fromArray(at.quaternion).slerp(new T.Quaternion().fromArray(bt.quaternion),.5);ca.updateMatrixWorld();
  const rgb=await sharp(path).removeAlpha().raw().toBuffer(),sample=[];
  for(let j=2;j<13;j++)for(const z of [.48,.78,1.09,1.38]){
    const pos=new T.Vector3(-1.03+j*.148,-.015,z).applyAxisAngle(new T.Vector3(1,0,0),-at.angle);
    pos.add(new T.Vector3(0,.13,-.89)).add(new T.Vector3().fromArray(at.site)).project(ca);
    const px=Math.round((1+pos.x)*960),py=Math.round((1-pos.y)*540),q=(py*1920+px)*3;
    assert(px>=0&&px<1920&&py>=0&&py<1080);
    sample.push([rgb[q],rgb[q+1],rgb[q+2]]);
  }
  const median=v=>v.sort((i,j)=>i-j)[Math.floor(v.length/2)];
  return {site:at.site,method:'44 projected points on open woven bed; display-space RGB, any real occlusion retained',
    medianRGB:[0,1,2].map(k=>median(sample.map(c=>c[k]))),medianLuma:median(sample.map(([r,g,b])=>Math.round(.2126*r+.7152*g+.0722*b)))};
}
