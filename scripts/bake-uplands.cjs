// Match opposing ends of the 360-degree texture at its rear seam, while
// preserving the approved east-facing dawn and its irregular hill silhouettes.
const sharp=require('sharp'),path=require('node:path');
(async()=>{const root=path.join(__dirname,'..'),w=2048,h=704;
 const {data,info}=await sharp(path.join(root,'art-source/ghost-signal/daybreak-uplands.png'))
   .resize(w,h,{fit:'fill'}).removeAlpha().modulate({saturation:.75}).raw().toBuffer({resolveWithObject:true});
 const fade=46,c=info.channels;
 for(let y=0;y<h;y++)for(let x=0;x<fade;x++){const t=(1-x/fade)**2*.5;
   for(let k=0;k<c;k++){const a=(y*w+x)*c+k,b=(y*w+w-1-x)*c+k,pa=data[a],pb=data[b];
     data[a]=Math.round(pa+(pb-pa)*t); data[b]=Math.round(pb+(pa-pb)*t);}}
 await sharp(data,{raw:{width:w,height:h,channels:c}}).png({palette:true,colours:245})
   .toFile(path.join(root,'public/images/textures/ghost-dawn-uplands-v2.png'));
})().catch(e=>{console.error(e);process.exitCode=1});
