// Original generated albedo, not an image of the final scene. Keep existing UVs,
// damage cutouts and gutters. Preserve the unmodified v1 source for comparison.
const sharp=require('sharp'),path=require('node:path');
const root=path.join(__dirname,'..'),dir=path.join(root,'public/images/textures');
(async()=>{
 const atlas=path.join(root,'art-source/ghost-signal/field-finishes-v2.png');
 const meta=await sharp(atlas).metadata(),q=Math.floor(Math.min(meta.width,meta.height)/2);
 const swatch=(x,y,n)=>sharp(atlas).extract({left:x*q+4,top:y*q+4,width:q-8,height:q-8}).resize(n,n,{kernel:'lanczos3'});
 const edge={top:8,left:8,bottom:8,right:8,extendWith:'copy'};
 const tile=(x)=>swatch(x,0,240).extend(edge).modulate({saturation:.69,brightness:1.12}).png().toBuffer();
 await sharp(path.join(dir,'ghost-hut-materials-v1.png')).composite([
   {input:await tile(1),left:0,top:0},{input:await tile(0),left:256,top:0}
 ]).png({palette:true,colours:244}).toFile(path.join(dir,'ghost-hut-materials-v2.png'));
 // Reflected repeat (ABBA in each axis) closes opposite edges without a solid-colored
 // border. World projected materials cross every broken box and slab without UV stretch.
 for(const [name,x] of [['compound-plaster',0],['compound-aggregate',1]]){
   const s=await swatch(x,1,256).png().toBuffer();
   await sharp({create:{width:512,height:512,channels:3,background:'#383838'}}).composite([
     {input:s,left:0,top:0},{input:await sharp(s).flop().png().toBuffer(),left:256,top:0},
     {input:await sharp(s).flip().png().toBuffer(),left:0,top:256},{input:await sharp(s).rotate(180).png().toBuffer(),left:256,top:256}
   ]).png({palette:true,colours:224}).toFile(path.join(dir,name+'-v2.png'));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
