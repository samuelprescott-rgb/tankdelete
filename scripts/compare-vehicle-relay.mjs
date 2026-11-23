// Presentation only: every scene pixel is from the two normal-camera recordings.
// Pass two capture-vehicle-relay outputs and a new output stem (no extension).
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const [a,b,stem]=process.argv.slice(2);assert(a&&b&&stem);
const sharp=createRequire(import.meta.url)('sharp');
const panel=960,gap=4,bar=50,whole=540,detail=232,total=panel*2+gap;
const heading=(w,h,words,size=24)=>Buffer.from('<svg width="'+w+'" height="'+h+'"><rect width="100%" height="100%" fill="#18221e"/><text x="18" y="'+(h*.68)+'" fill="#f1eee1" font-family="Helvetica, sans-serif" font-size="'+size+'" font-weight="bold">'+words+'</text></svg>');
const layers=[];for(const [i,dir] of [a,b].entries()){
 const receipt=JSON.parse(await readFile(join(dir,'relay.json'),'utf8')),f=receipt.frames.find(x=>x.id==='contact'),fall=receipt.frames.find(x=>x.id==='descent');
 const x=i*(panel+gap);layers.push({input:heading(panel,bar,(i?'AFTER':'BEFORE')+'   /   Hull at impact: '+Math.round(f.bodyWidthPx)+' px at 1080p'),left:x,top:0});
 layers.push({input:await sharp(join(dir,fall.file)).resize(panel,whole).jpeg({quality:96}).toBuffer(),left:x,top:bar});
 layers.push({input:heading(panel,38,'Same frame, same crop   /   2.35 s into the fall',19),left:x,top:bar+whole});
 // Show the same native-size rectangle, not different zoom levels or markers.
 layers.push({input:await sharp(join(dir,fall.file)).extract({left:765,top:17,width:panel,height:detail}).jpeg({quality:96}).toBuffer(),left:x,top:bar+whole+38});
}
await sharp({create:{width:total,height:bar+whole+38+detail,channels:3,background:'#9ca489'}}).composite(layers).jpeg({quality:91}).toFile(stem+'.jpg');
const banner=stem+'-heading.png';await sharp({create:{width:1600,height:38,channels:3,background:'#18221e'}}).composite([
 {input:heading(800,38,'BEFORE   /   Campaign driver camera',19),left:0,top:0},
 {input:heading(800,38,'AFTER   /   Campaign driver camera',19),left:800,top:0}]).png().toFile(banner);
// Short paired clip uses actual display timestamps; neither camera is moved.
execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-n','-i',join(a,'relay.mp4'),'-i',join(b,'relay.mp4'),'-loop','1','-framerate','24','-i',banner,'-filter_complex',
 '[0:v]fps=24,scale=800:450,setsar=1[l];[1:v]fps=24,scale=800:450,setsar=1[r];[l][r]hstack=shortest=1[views];[2:v][views]vstack=shortest=1[out]',
 '-map','[out]','-an','-c:v','libx264','-threads','2','-crf','19','-preset','veryfast','-pix_fmt','yuv420p','-movflags','+faststart',stem+'.mp4'],{timeout:60000});
