import * as T from 'three';

// Four hand-pixelled poses for the left wing. Its mate shares the feather
// contours. The cream head, hooked beak and fanned tail stay on registration.
const wings=[
  {top:2,rows:['o','obo  o',' obhoob o','  obhhbobo','  ooblhbbboo','   oblhhbbhbo','    ooblhhbllbo','      obllhhhbbbo','        oobhhbbbbo','           oobbbbbo']},
  {top:6,rows:['oo    o','obhbooboo',' ooblhbhboo','  oblhhbhhbboo','   ooblhhblhlbbo','      oblhhhbbbbo','         oobbbbbbo']},
  {top:10,rows:['   ooooooo','oobhhlhbhhboooo',' obhhlbhhhhbbbbbo','  oobhlhhbbbbbbbo','    obbbboooooo','     ooo']},
  {top:12,rows:['          ooobbbo','       oobbhhlbbo','     obhhlhbbbbbo','   oblhhhbbbbo','  oblhbbbhbo',' obhbbbo bo','obbo oo','oo']},
];
const body=[
  '       oooooo',
  '     oswwwwwso',
  '   obbswwwkwyyyo',
  ' obbhbswwwsbyyyo',
  'obhlbbbswsbo  oy',
  'obhhbbbbboo',
  ' obhbbbbo',
  '  obbbbo',
  ' oswwso',
  'oswwwso',
  'owoswoo',
  'o   oo',
];
const colors:Record<string,number>={o:0x392e30,k:0x201b1c,b:0x69422d,h:0xa76e3e,
  l:0xd5a365,s:0xc7bba5,w:0xfff4d8,y:0xe6ac3d};
export function createEagleMarkerAtlas() {
  const width=38,height=26,data=new Uint8Array(width*4*height*4);
  function dot(frame:number,x:number,y:number,key:string){
    const color=colors[key],i=((height-1-y)*width*4+frame*width+x)*4;
    data[i]=color>>16;data[i+1]=color>>8;data[i+2]=color;data[i+3]=255;
  }
  wings.forEach(({top,rows},frame)=>{
    rows.forEach((line,y)=>[...line].forEach((key,x)=>{
      if(key===' ')return;
      dot(frame,1+x,top+y,key);
      dot(frame,width-2-x,top+y,key);
    }));
    body.forEach((line,y)=>[...line].forEach((key,x)=>{
      if(key!==' ')dot(frame,14+x,9+y,key);
    }));
  });
  const map=new T.DataTexture(data,width*4,height);
  map.colorSpace=T.SRGBColorSpace;map.minFilter=map.magFilter=T.NearestFilter;
  map.repeat.x=.25;map.needsUpdate=true;
  return map;
}
