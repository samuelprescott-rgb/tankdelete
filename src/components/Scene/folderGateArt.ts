import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// One physical village checkpoint and one small in-world signal. Folder
// identity is carried by the tab and local brackets, not a screen of gold.
export function buildFolderGate() {
  const body:THREE.BufferGeometry[]=[],ink:THREE.BufferGeometry[]=[];
  function box(x:number,y:number,z:number,w:number,h:number,d:number,col:string,r=0,signal=false) {
    const g=new THREE.BoxGeometry(w,h,d),color=new THREE.Color(col),colors:number[]=[];
    g.rotateZ(r);g.translate(x,y,z);
    const normals=g.getAttribute('normal');
    for(let i=0;i<normals.count;i++){const a=signal?1:normals.getY(i)>.6?1.13:normals.getY(i)<-.6?.59:.88;colors.push(color.r*a,color.g*a,color.b*a);}
    g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));(signal?ink:body).push(g);
  }
  for(const side of [-1,1]){
    const x=side*1.08;
    box(x,.91,0,.105,1.82,.145,'#66563c',side*.019);
    box(x,.16,0,.15,.32,.19,'#414339');
    box(x,1.67,0,.135,.07,.176,'#43463c');
    box(x-side*.17,1.54,.028,.073,.52,.12,'#715e40',-side*.70);
    // A low split rail outlines the passage, leaving the opening untarnished.
    box(x,.38,1.19,.055,.09,2.52,'#736447');
    box(x,.37,2.36,.092,.74,.12,'#675c40',-.04*side);
    box(x,.79,-.079,.095,.12,.018,'#a5874b');
    box(x,1.20,-.085,.065,.11,.018,'#dfaa63',0,true);
    box(x,.66,-.082,.052,.028,.018,'#dfa061',0,true);
  }
  box(0,1.82,0,2.55,.13,.19,'#705e43',.01);
  box(.18,1.868,-.1,1.63,.024,.02,'#a19565',.01);
  box(0,1.98,-.038,1.20,.32,.095,'#2d3934');
  box(0,1.975,-.094,1.08,.22,.02,'#534b34');
  // A folder-tab silhouette, with no texture fetch, visible on both faces.
  for(const face of [-1,1]){
    const z=face<0?-.113:.02;
    box(-.085,1.935,z,.42,.025,.018,'#efbc78',0,true);
    box(-.287,1.994,z,.025,.13,.018,'#f0bd76',0,true);
    box(.118,1.98,z,.025,.105,.018,'#e1a65d',0,true);
    box(-.215,2.054,z,.15,.024,.018,'#f3cb83',0,true);
    box(-.140,2.033,z,.028,.048,.018,'#f3cb83',0,true);
    box(-.008,2.016,z,.26,.024,.018,'#efbc78',0,true);
    for(let i=0;i<3;i++)box(.24+i*.035,1.985+(i===1?.023:0),z,.024,.031,.012,'#bc9257',0,true);
  }
  const merge=(items:THREE.BufferGeometry[])=>{const result=mergeGeometries(items)!;items.forEach(g=>g.dispose());result.computeBoundingSphere();return result;};
  return {body:merge(body),ink:merge(ink)};
}
