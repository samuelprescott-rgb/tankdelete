// Offline art tool (Node + sharp). Converts original paint to material
// modulation so GPU lights can tint the roofs without double-multiplying
// dark pigments. The 3x2 runtime atlas uses the existing hut UV conventions.
const sharp=require('sharp'), path=require('node:path');
async function bake(){
  const root=path.resolve(__dirname,'..'), tile=256,pad=8,cell=tile-2*pad;
  const {data}=await sharp(path.join(root,'art-source/ghost-signal/hut-sheet-v1.png'))
    .resize(2*cell,2*cell,{kernel:'nearest'}).removeAlpha().toColourspace('srgb').raw().toBuffer({resolveWithObject:true});
  const out=Buffer.alloc(tile*3*tile*2*3,185);
  const positions=[[0,0,0,0],[1,0,1,0],[0,1,0,1],[2,0,1,1]];
  for(const [tx,ty,qx,qy] of positions)for(let y=0;y<tile;y++)for(let x=0;x<tile;x++){
    const u=Math.max(0,Math.min(cell-1,x-pad)), v=Math.max(0,Math.min(cell-1,y-pad));
    const i=3*((qy*cell+v)*cell*2+qx*cell+u), j=3*((ty*tile+y)*tile*3+tx*tile+x);
    const lum=.26*data[i]+.58*data[i+1]+.16*data[i+2];
    const value=59+196*Math.pow(lum/255,.71);
    for(let c=0;c<3;c++)out[j+c]=Math.max(0,Math.min(255,value+.42*(data[i+c]-lum)));
  }
  await sharp(out,{raw:{width:3*tile,height:2*tile,channels:3}}).png({palette:true,colours:208})
    .toFile(path.join(root,'public/images/textures/ghost-hut-materials-v1.png'));
}
bake().catch(e=>{console.error(e);process.exitCode=1});
