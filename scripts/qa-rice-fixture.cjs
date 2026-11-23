// CPU tests only. Append a factory to an in-memory copy of this TS module,
// executing its actual seeded placement memo, height memo, and instance writes.
const ts=require('typescript');
function instrumentRiceFixture(source,file){
  const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const body=ast.statements.find(s=>s.name?.text==='RicePaddies').body.statements;
  const vars=body.flatMap(s=>s.declarationList?.declarations??[]);
  const memo=name=>vars.find(d=>d.name.getText(ast)===name).initializer.arguments[0].getText(ast);
  const layout=body.map(s=>s.expression).find(x=>x?.expression?.getText(ast)==='useLayoutEffect'&&x.arguments[0].getText(ast).includes('const rice = riceRef.current'));
  const statements=layout.arguments[0].body.statements.map(s=>s.getText(ast));
  const end=statements.indexOf('finalizeInstanceMatrices(rice);');if(end<=0)throw Error('Actual rice instance writes not found');
  return source+'\nexport function __rice(seed:number, fightingPositionOffsetZ=0, campaignClearing=false){const details=('+memo('details')+')(), dummy=new THREE.Object3D(), riceCoverHeight=('+memo('riceCoverHeight')+')(), mesh=new THREE.InstancedMesh(createFieldRiceGeometry(),createRiceShootMaterial({value:0}),details.seedlings.length),riceRef={current:mesh};(()=>{'+statements.slice(0,end+1).join('\n')+'})();return mesh;}';
}
module.exports={instrumentRiceFixture};
