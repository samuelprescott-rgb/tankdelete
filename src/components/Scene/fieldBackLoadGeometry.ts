import * as THREE from 'three';

type Point = [number, number, number];
export type FieldLoad = 'patrol' | 'heavy' | 'scout' | 'dispatch';

/** The regular field kit tucks over the trouser belt; every upper tab begins
 * on the loaded suspender. All construction and pigment are baked at spawn. */
export function createFieldBackLoadGeometry(faction: 'us' | 'vc', offset: number, variant=0, issue: FieldLoad='patrol'): THREE.BufferGeometry {
  const xyz: number[] = [], rgb: number[] = [], indices: number[] = [], panels:number[]=[];
  let garmentPanel=2;
  const paint = new THREE.Color();
  function vertex([x,y,z]: Point, dye: string, value = 1) {
    const i = xyz.length / 3;
    xyz.push(x,y-offset,z);
    panels.push(garmentPanel);
    paint.set(dye).multiplyScalar(value);
    rgb.push(paint.r,paint.g,paint.b);
    return i;
  }
  function join(a: number[], b: number[]) {
    for (let i=0;i<a.length;i++) {
      const j=(i+1)%a.length;
      indices.push(a[i],a[j],b[i],a[j],b[j],b[i]);
    }
  }
  function cap(loop: number[], point: Point, dye: string, last: boolean) {
    const middle=vertex(point,dye);
    for(let i=0;i<loop.length;i++) {
      const j=(i+1)%loop.length;
      indices.push(middle, last?loop[i]:loop[j], last?loop[j]:loop[i]);
    }
  }
  // An open woven tape laid on top of the cloth, wound +Z toward the camera.
  function tape(x: number, width: number, path: [number,number][], dye: string, value: number[]) {
    let old: number[]=[];
    for (const [i,[y,z]] of path.entries()) {
      const row=[vertex([x-width,y,z],dye,value[i]*.94),vertex([x+width,y,z],dye,value[i])];
      if(i) indices.push(old[0],row[0],old[1],old[1],row[0],row[1]);
      old=row;
    }
  }
  if (faction==='us') {
    // A hanging pack, not a belt pouch: the load pulls down from the
    // shoulder blades. The two pinched gussets collapse beneath a broad lid;
    // the rolled shelter half projects past one elbow in the chase silhouette.
    const scout=issue==='scout', heavy=issue==='heavy', dispatch=issue==='dispatch';
    const skew=(variant%3-1)*.010+(scout?.026:dispatch?-.033:0);
    const size=heavy?1.09:scout?.90:dispatch?.89:1;
    const lidDye=heavy?'#828263':dispatch?'#947d58':variant%3===1?'#92845e':'#7f805e';
    const outline: [number,number][]=[[0,1],[.43,.98],[.75,.94],[1,.65],[.98,-.60],[.70,-1],
      [-.74,-1],[-.99,-.60],[-1,.62],[-.75,.94],[-.44,.98]];
    const courses: [number,number,number,number,string][]=[
      [.948,.121,.059,.175,'#4f513b'],[.979,.163,.081,.185,'#86835f'],
      [1.060,.167,.091,.180,'#7c7956'],[1.139,.136,.070,.168,'#4d5341'],
      [1.163,.146,.098,.176,'#434936'],[1.172,.146,.101,.178,lidDye],
      [1.231,.145,.092,.167,lidDye],[1.292,.104,.056,.142,'#99926b'],
    ];
    let last: number[]=[];
    for (const [row,[cy,rx,rz,cz,dye]] of courses.entries()) {
      const loop=outline.map(([u,v])=>{
        const exposed=Math.max(0,v), bind=Math.exp(-(((Math.abs(u)-.75)/.17)**2));
        const weight=(1-u*u)*(.015+.015*(1-u));
        // The payload pulls the middle of the skirt down. At the mouth,
        // both fastenings pull the flap INTO the bag; the unstrained middle
        // pushes forward. The narrow underturned lip follows that curve.
        const pinch=bind * exposed * [0,.004,.014,.009,.012,.013,.020,.008][row];
        const loft=(1-Math.abs(u)) * exposed * [0,.014,.022,.013,.009,.010,.017,.004][row];
        const edge=Math.abs(u)>.95 && row>1 && row<5;
        // The canteen loads one gusset; the opposite corner tucks up. The
        // cover pulls diagonally in two directions, with a collapsed skirt
        // under its free edge, instead of one horizontal rectangular flap.
        const hood=row===3||row===4||row===5;
        const gathered=Math.exp(-(((u+.38)/.40)**2))*(hood?.040:row===6?.027:.013);
        const fallen=(.019*u-gathered)*exposed;
        const shunt=(row-3)*.0042+skew*(1-(cy-.948)*1.3);
        return vertex([u*rx*size+shunt,cy+(.015+skew*.53)*u-exposed*weight-pinch*.61+fallen,
          cz+rz*v*size-.006*u*u+loft-pinch+exposed*(.014*(-u)-gathered*.22)],dye,
          (.88+.14*v)*(1-bind*.24)*(edge?.69:1)*(u<-.3&&row===3?.72:1));
      });
      if(row) join(last,loop); else cap(loop,[0,cy-.004,cz],dye,false);
      if(row===courses.length-1) cap(loop,[.002,cy+.005,cz],dye,true);
      last=loop;
    }
    const shellCount=indices.length, ray=new THREE.Ray(new THREE.Vector3(),new THREE.Vector3(0,0,-1));
    const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),hit=new THREE.Vector3();
    const lidAt=(x:number,y:number)=>{
      ray.origin.set(x,y-offset,.34);
      let z=.167;
      for(let i=0;i<shellCount;i+=3) {
        a.fromArray(xyz,indices[i]*3); b.fromArray(xyz,indices[i+1]*3); c.fromArray(xyz,indices[i+2]*3);
        if(ray.intersectTriangle(a,b,c,false,hit)) z=Math.max(z,hit.z);
      }
      return z+.0026;
    };
    garmentPanel=3;
    for (const side of [-1,1]) {
      const strapX=(y:number)=>side*(.103-.12*(y-1.04))+(y-1.04)*.030-.009*Math.sin((y-1.04)*15);
      const hem=side<0?1.095:1.138;
      const wrapped=(ys:number[],width:number,keeper=false)=>{
        let previous:number[]=[];
        for(const [i,y] of ys.entries()){
          const points=[-1,1].map(s=>{
            const x=strapX(y)+s*width;
            const z=lidAt(x,y)+(keeper?.0034:0);
            return vertex([x,y,z],keeper?'#918268':side<0?'#6a6547':'#71694e',
              (keeper&&i===1?1.29:1)*(s<0?.83:1));
          });
          if(i)indices.push(previous[0],points[0],previous[1],previous[1],points[0],points[1]);
          previous=points;
        }
      };
      wrapped([1.272,1.255,1.229,hem+.030,hem+.009,hem-.001,hem-.012,hem-.022,1.061,1.040,1.010,.990],
        side<0?.014:.0125);
      wrapped([hem-.019,hem-.025,hem-.034],.017,true);
    }
    garmentPanel=2;
    // Packed shelter half for the patrol/heavy. Bias the open rolled end
    // toward one shoulder; the twill steps IN under each binding, and both
    // bindings are part of the roll surface. No detached strap rectangles.
    if (!scout && !dispatch) {
      // Explicit over-the-top webbing replaces the former two rings used
      // to suggest strapping in the blanket surface. Reinvest those faces
      // in the visible tiedowns within the existing 8,500-body budget.
      const spans=[[-.201,.81],[-.122,.83],[-.098,.82],[-.087,1.02],
        [.079,1.05],[.090,.82],[.112,.80],[.185,.90]];
      const angles=[0,.79,1.09,1.27,2.03,3.18,4.26,5.42];
      const axisY=1.274,axisZ=.164;
      let prev:number[]=[];
      for(const [i,[x,r]] of spans.entries()) {
        const cx=x*size+skew*.4,cy=axisY-.125*x-.71*x*x,cz=axisZ+.087*x+.020*Math.cos(12*x+.63);
        const wrap=i===1||i===2||i===5||i===6;
        garmentPanel=wrap?3:2;
        const color=wrap?'#655d45':variant%3===2?'#586549':'#646d50';
        const loop=angles.map((theta,k)=>{
          const a=theta+.51*Math.sin(x*8+.3), lip=(k===2?.015:k===3?-.010:0);
          const lobe=1+.19*Math.sin(x*19-a*2)-.15*Math.cos(x*13+a);
          const y0=Math.cos(a), z0=Math.sin(a);
          return vertex([cx+.012*Math.sin(2*a+x*16)*(.4+Math.abs(x)*3),
            cy+y0*.050*r*lobe-.009*Math.max(0,z0),cz+z0*(.062*r*lobe+lip)],color,
            (.79+.19*y0+.11*z0)*(wrap?.73:k===2?1.33:k===3?.55:1));
        });
        if(i)join(prev,loop);else cap(loop,[cx,cy,cz],color,false);
        if(i===spans.length-1) {
          // A deep central return in the exposed end, not a solid round cap.
          const inner=angles.map(a=>vertex([cx+.001,cy+.030*Math.cos(a),cz+.035*Math.sin(a)],'#ad9c71',.84));
          join(loop,inner);cap(inner,[cx-.009,cy-.003,cz-.002],'#423f31',true);
        }
        prev=loop;
      }
      // Two cinches physically pass from the inside shoulder yoke over the
      // compressed roll to the flap. Previously the only ties were thin
      // segments painted into the roll, and long rectangular webbing crossed
      // empty air above the bag. Each visible end now continues down onto
      // the hood, retained by its own dark keeper and a short folded tail.
      garmentPanel=3;
      for(const sx of [-.109,.100]){
        const x=sx*size+skew*.4,cy=axisY-.125*sx-.71*sx*sx,cz=axisZ+.087*sx+.020*Math.cos(12*sx+.63);
        const route:[number,number][]=[[1.237,.105],[cy+.025,cz-.044],[cy+.045,cz-.026],
          [cy+.050,cz+.002],[cy+.041,cz+.030],[cy+.022,cz+.053],
          [cy-.005,cz+.059],[cy-.026,cz+.051],[1.225,lidAt(x,1.225)+.003],[1.187,lidAt(x,1.187)+.003]];
        tape(x,.011,route,sx<0?'#5b5941':'#615f46',[.78,.87,.96,1.03,1,.95,.86,.86,.93,.81]);
        tape(x,.014,[[1.221,lidAt(x,1.221)+.008],[1.216,lidAt(x,1.216)+.009],
          [1.211,lidAt(x,1.211)+.007]],'#5a5844',[1.13,.83,.62]);
      }
    }
    garmentPanel=2;
    // A side canteen in a dark canvas cup. Its sloping shoulders, narrow
    // neck and visible cap interrupt the profile on just one hip.
    {
      const s=variant%2===0?1:-1;
      const cx=s*(dispatch?.132:.157)*size+skew,cz=.185;
      const contour=[[0,1],[.88,.62],[.96,-.45],[0,-1],[-.94,-.45],[-.88,.62]];
      const courses=[[.947,.043,.044],[.961,.053,.052],[1.026,.052,.052],[1.053,.042,.043],[1.070,.021,.021],[1.083,.022,.020]];
      let prev:number[]=[];
      for(const [i,[y,w,d]] of courses.entries()){
        const dye=['#444a38','#747455','#858165','#5b6048','#454b3b','#777154'][i];
        const loop=contour.map(([x,z])=>vertex([cx+w*x, y+.006*s*x, cz+d*z],dye,.89+.11*z));
        if(i)join(prev,loop);else cap(loop,[cx,y,cz],dye,false);
        if(i===courses.length-1)cap(loop,[cx,y+.002,cz],dye,true);
        prev=loop;
      }
      // A squat compass/utility pouch on the opposite gusset. It has a low,
      // biased lid, dark underturn, and its own gusset facing out of the bag.
      const px=-s*.147*size+skew, pz=.210;
      prev=[];
      const pouch=[[.974,.032,.032],[1.003,.051,.048],[1.076,.052,.049],
        [1.084,.061,.057],[1.110,.057,.052]];
      for(const [i,[y,w,d]] of pouch.entries()){
        const dye=['#51513d','#827958','#68694c','#4f513b','#999170'][i];
        const loop=contour.map(([a,b])=>vertex([px+w*a,y+.011*s*a-.009*b,pz+d*b],dye,.88+.14*b));
        if(i)join(prev,loop);else cap(loop,[px,y,pz],dye,false);
        if(i===pouch.length-1)cap(loop,[px,y+.004,pz],dye,true);
        prev=loop;
      }
    }
    if(scout || dispatch){
      // A soft scout musette and an officer's shallow dispatch valise each
      // retain a waist under the load; neither gets a rifleman's blanket.
      for(let i=0;i<xyz.length;i+=3){
        const y=xyz[i+1]+offset;
        xyz[i]+= (1.35-y)*(dispatch?-.12:.13);
        xyz[i+1]=1.035-offset+(y-.948)*(dispatch?.70:.85);
        xyz[i+2]=.104+(xyz[i+2]-.104)*(dispatch?.72:.83);
      }
    }
  } else {
    // A pinched cloth roll. The narrow wraps are actual bands between
    // compressed rings, not dark lines laid across a generic cylinder.
    const spans: [number,number][]=[[-.168,.90],[-.114,1.06],[-.105,.83],[-.087,.84],[-.071,1.03],
      [.072,1.05],[.089,.84],[.106,.83],[.118,1.04],[.169,.87]];
    const profile=[.06,.83,1.54,1.69,2.31,3.07,4.68], sides=profile.length, z0=.155, y0=1.065;
    function cross(x: number,r: number,a: number): Point {
      const pressure=Math.abs(x)>.084 && Math.abs(x)<.108;
      const skew=a + (pressure?.025:.098)*Math.sin(x*21+.22);
      // The outer cloth overlaps itself under the cords. This single
      // returned edge runs across the length, not around it like a hose.
      const lap=a===profile[2]? .007 : a===profile[3]? -.006 : 0;
      const sag=(1-Math.min(1,Math.abs(x/.12))**2)*.008;
      return [x,y0+.067*r*Math.cos(skew)+x*.058-sag,
        z0+.065*r*Math.sin(skew)+.003*Math.cos(skew*2+x*14)+(pressure?0:lap)];
    }
    let last: number[]=[];
    for(const [i,[x,r]] of spans.entries()) {
      const bound=(i===3 || i===7), dye=bound?'#9a8869':'#81745b';
      // Duplicate vertices only across dye boundaries so tight bindings
      // stay crisp without adding triangles. Rolled edges are slightly skew.
      const pigment=(k:number)=>.91+.13*Math.cos(profile[k]-.3)+(bound?0:k===2?.21:k===3?-.30:0);
      const loop=Array.from({length:sides},(_,k)=>vertex(cross(x,r,profile[k]),dye,pigment(k)));
      if(i) {
        let from=last;
        if(bound || i===4 || i===8) {
          const [oldX,oldR]=spans[i-1];
          from=Array.from({length:sides},(_,k)=>vertex(cross(oldX,oldR,profile[k]),dye,pigment(k)));
        }
        join(from,loop);
      } else cap(loop,[x-.001,y0+x*.058,z0],'#6f614a',false);
      if(i===spans.length-1) cap(loop,[x+.001,y0+x*.058,z0],'#726349',true);
      last=loop;
    }
    // Return of the cloth is visible on each exposed end.
    for(const side of [-1,1]) {
      let prev: number[]=[];
      for(let k=0;k<=5;k++) {
        const a=.38+k*1.0, r=.010+k*.0044;
        const row=[r,r+.004].map(rr=>vertex([side*.171,y0+side*.169*.058+Math.cos(a)*rr,z0+Math.sin(a)*rr],
          '#b09b73',k%2?.85:.96));
        if(k) {
          if(side>0) indices.push(prev[0],prev[1],row[0],prev[1],row[1],row[0]);
          else indices.push(prev[0],row[0],prev[1],prev[1],row[0],row[1]);
        }
        prev=row;
      }
      tape(side*.099,.009,[[1.152,.108],[1.130,.129],[1.121,.162]],'#948265',[.84,1,.93]);
    }
  }
  const indexed=new THREE.BufferGeometry();
  indexed.setAttribute('position',new THREE.Float32BufferAttribute(xyz,3));
  indexed.setAttribute('color',new THREE.Float32BufferAttribute(rgb,3));
  indexed.setAttribute('garmentPanel',new THREE.Uint8BufferAttribute(panels,1));
  indexed.setIndex(indices);
  indexed.computeVertexNormals();
  const result=indexed.toNonIndexed();
  indexed.dispose();
  result.userData.infantrySurface=4;
  result.userData.gearPanel=2;
  result.userData.issuedClothing=true;
  return result;
}
