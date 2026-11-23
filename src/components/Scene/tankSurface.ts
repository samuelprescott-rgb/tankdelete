import type { MeshStandardMaterial, Texture } from 'three';

type TankSurface = 'casting' | 'turret' | 'track';

export const TANK_CAST_ENAMEL_PATH='/images/textures/ghost-cast-enamel-v1.png';
// A tile spans 1.56 scene units. Develop the top plane down the curved wall
// in its radial direction; the shoulder has area instead of stretching the
// last row of top texels. Object space follows the turret, not the camera.
// Hull-length scale is included; no six-face seams or triplanar fetches.
export const castEnamelSource=/* glsl */`
  uniform sampler2D uTankCastCoat;
  vec3 readCastEnamel(vec3 p,float crown,float zScale) {
    vec2 plan=p.xz*vec2(1.,zScale);
    vec2 radial=plan*inversesqrt(max(dot(plan,plan),.045));
    vec2 fold=plan+radial*(crown-p.y)*.83;
    vec2 uv=mat2(.94,.342,-.342,.94)*fold*.64+vec2(.181,.417);
    return texture2D(uTankCastCoat,uv).rgb;
  }
  vec3 castEnamelGround(vec3 under,vec3 swatch,float wash) {
    // Preserve the baked upper and lower *shape* values, but let actual
    // brushed olives, exposed gray primer and ochre come from the albedo.
    float facing=clamp(.55+2.55*dot(under,vec3(.24,.60,.16)),.60,1.34);
    // Baked swatch: linear luminance P01=.055, P50=.098, P99=.153.
    // A gentle pigment curve separates worn metal from sun-faded olive at
    // that actual exposure. It has no dependence on screen or scene light.
    float value=dot(swatch,vec3(.24,.60,.16));
    vec3 enamel=swatch*facing*(.88+.34*smoothstep(.055,.153,value));
    return mix(under,enamel,.80)*mix(vec3(.94,.985,1.015),vec3(1.04,1.015,.965),wash);
  }
`;

// This is an existing painted steel study, used as a physical pigment sample
// rather than a full-color photo pasted onto the tank. One continuous object
// projection has no tangent or UV seam across rounded sheet/casting edges.
const plateStudy = /* glsl */ `
  uniform sampler2D uTankPlateStudy;
  vec3 readSteelStudy(vec3 p) {
    vec2 uv = vec2(p.x + .72 * p.z, p.y + .57 * p.z - .18 * p.x);
    return texture2D(uTankPlateStudy, uv * .84 + vec2(.347,.216)).rgb;
  }
  vec3 oldEnamel(vec3 base, vec3 study, float broad) {
    float value = dot(study,vec3(.25,.57,.18)) - .37;
    // Color variation in the underlying coat is broader than the small nicks.
    return base * clamp(1.0 + value * .48,.91,1.10)
      * mix(vec3(.70,.86,1.00),vec3(1.11,1.06,.92),broad);
  }
`;

const paintFlake = /* glsl */ `
  // An angular chip with an asymmetric dark primer edge, not a highlight
  // painted across the whole casting. Inner steel stays inside the chip.
  vec2 armorFlake(vec2 point, vec2 extent, float aa) {
    vec2 s = point / extent;
    s.y += .24 * max(0.0,-s.x);
    float shape = max(abs(s.x) * .79 + .17 * s.y,max(s.y + .17 * s.x,-s.y + .35 * s.x));
    float blur = clamp(aa / min(extent.x,extent.y),.027,.19);
    float primer = 1.0 - smoothstep(.66,.72 + blur,shape);
    float steel = primer * (1.0 - smoothstep(.43,.50 + blur,shape + .14 * s.y))
      * (1.0 - smoothstep(.21,.54,-s.x + .31 * s.y));
    return vec2(primer,steel);
  }
`;

// Four non-repeating paint charts. UVs are independent of the camera and
// remain continuous over the roll of the sheet or cheek. Keep a two-texel
// gutter at the join when sampling mip levels at normal play distance.
const fieldChart = /* glsl */ `
  uniform sampler2D uTankFieldWear;
  vec4 readFieldWear(vec2 localUV, float column, float handed) {
    vec2 cell = vec2(column,step(0.0,handed));
    return texture2D(uTankFieldWear,(cell+clamp(localUV,vec2(.004),vec2(.996)))*.5);
  }
`;

/**
 * Object-space weathering over the painted value groups in tankGeometry.
 * The wear stays with the casting and fades at chase distance; no overlay
 * meshes, screen-space projection, or damage state are needed. The optional
 * bow livery is paint under the dirt, not a separate draw or emissive decal.
 */
export function applyTankSurface(material: MeshStandardMaterial, surface: TankSurface, bowPaint?: Texture, pigment?: Texture, unitStamp?: Texture, fieldWear?: Texture, pixelBow?:Texture) {
  const isTrack = surface === 'track';
  const hasLivery = surface === 'casting' && !!bowPaint;
  const hasUnit = surface === 'turret' && !!unitStamp;
  const hasField = surface === 'turret' && !!fieldWear;
  material.onBeforeCompile = shader => {
    if (hasLivery) shader.uniforms.uTankBowPaint = { value: bowPaint };
    if (hasLivery && pixelBow) shader.uniforms.uGhostBow = { value:pixelBow };
    if (pigment && !isTrack) shader.uniforms.uTankCastCoat = { value: pigment };
    if (hasUnit) shader.uniforms.uTankUnitStamp = { value: unitStamp };
    if (hasField) shader.uniforms.uTankFieldWear = { value: fieldWear };
    const varyings = 'varying vec3 vTankSurfacePoint;\nvarying vec3 vTankSurfaceNormal;\n';
    shader.vertexShader = varyings + shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vTankSurfacePoint = position;
      vTankSurfaceNormal = normal;
    `);
    shader.fragmentShader = varyings + `
      ${hasLivery ? 'uniform sampler2D uTankBowPaint;' : ''}
      ${hasLivery && pixelBow ? 'uniform sampler2D uGhostBow;' : ''}
      ${hasUnit ? 'uniform sampler2D uTankUnitStamp;' : ''}
      ${hasField ? fieldChart : ''}
      ${pigment && !isTrack ? castEnamelSource : ''}
      float tankPigment(vec2 a) {
        vec3 f = fract(vec3(a.xyx) * vec3(.1031, .0973, .11369));
        f += dot(f, f.yzx + 37.19);
        return fract((f.x + f.y) * f.z);
      }
      float tankWash(vec2 uv) {
        vec2 cell = floor(uv), r = fract(uv);
        r = r * r * (3.0 - 2.0 * r);
        return mix(mix(tankPigment(cell), tankPigment(cell + vec2(1,0)), r.x),
                   mix(tankPigment(cell + vec2(0,1)), tankPigment(cell + vec2(1,1)), r.x), r.y);
      }
      ${isTrack ? '' : `
      ${paintFlake}
      // In each pair, x gives the gouge depth and y the exposed ridge. The
      // chipped lips are intentionally broken and narrower than the scrapes.
      vec2 armorScrape(vec2 p, vec2 axis, float reach, float width, float aa) {
        float along = dot(p, axis) / reach;
        float across = dot(p, vec2(-axis.y, axis.x));
        float ends = 1.0 - smoothstep(.58, 1.0, abs(along));
        float w = width * (.58 + .42 * ends);
        float cut = (1.0 - smoothstep(w * .43, w + aa, abs(across))) * ends;
        float bare = (1.0 - smoothstep(w * .17, w * .65 + aa, abs(across + w * .59)))
          * ends * smoothstep(-.38,.28,along);
        return vec2(cut,bare);
      }
      vec2 armorDing(vec2 p, vec2 extent, float aa) {
        vec2 dent = vec2(p.x + .34 * p.y,p.y - .27 * p.x) / extent;
        float taper = .92 + .37 * clamp(dent.x,-.9,.9);
        float d = abs(dent.x) * .65 + abs(dent.y + .23 * max(-dent.x,0.0)) * taper;
        float feather = clamp(aa / min(extent.x,extent.y), .019,.22);
        float bed = 1.0 - smoothstep(.12,.87 + feather,d);
        // A narrow break on one slanted wall, not a round black fill.
        float lip = smoothstep(.32,.68,d) * (1.0 - smoothstep(.69,.85 + feather,d));
        lip *= smoothstep(.06,.54,dent.y) * (1.0 - smoothstep(.14,.65,dent.x));
        return vec2(bed,lip);
      }
      `}
    ` + shader.fragmentShader.replace('#include <alphamap_fragment>', isTrack ? `
      vec3 tankP = vTankSurfacePoint;
      vec3 tankN = normalize(vTankSurfaceNormal);
      float shoeTop = smoothstep(.30, .95, tankN.y);
      float packedMud = tankWash(vec2(tankP.x * 26.0,tankP.z * 31.0) + 3.4);
      // Rubber, cleat, hinge and the separate metal shoulder are now real,
      // vertex-painted parts. Only embed earth in their low interior flats.
      float trapped = (1.0 - smoothstep(.005,.022,tankP.y)) * (1.0 - smoothstep(.064,.127,abs(tankP.x)));
      diffuseColor.rgb *= .89 + .18 * packedMud;
      diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.123,.083,.046),trapped * shoeTop * (.16 + .24 * packedMud));
      #include <alphamap_fragment>
    ` : `
      vec3 tankP = vTankSurfacePoint;
      vec3 tankN = normalize(vTankSurfaceNormal);
      vec2 washUV = vec2(tankP.x + tankP.z * .81,tankP.y + tankP.z * .23);
      float planeWash = tankWash(washUV * vec2(4.4, 6.2) + 12.4);
      float upper = smoothstep(.15,.85,tankN.y);
      float flank = 1.0 - smoothstep(.21,.81,abs(tankN.y));
      // Reuse the former grain sample for elongated rain/silt streaks.
      float run = tankWash(vec2((tankP.x + tankP.z * .96 - tankP.y * .22) * 14.5, tankP.y * 2.6 + 6.17));
      float pixel = length(fwidth(tankP));
      float aa = max(.0008,pixel * .56);
      float narrowWear = 1.0 - smoothstep(.006,.025,pixel);
      float dentWear = 1.0 - smoothstep(.012,.04,pixel);
      ${pigment ? `
        vec3 study = readCastEnamel(tankP,${surface==='turret'?'.32,1.':'.20,1.35'});
        diffuseColor.rgb = castEnamelGround(diffuseColor.rgb,study,planeWash);
        float castingGrain = .72*(sqrt(dot(study,vec3(.27,.58,.15))) - .38);
      ` : 'float castingGrain = 0.0;'}
      float filmOil = 0.0;
      float wornContact = 0.0;
      ${hasLivery ? `
        // Local XY keeps both faces continuous across the nose crease.
        // Only the forward end plate can pass; deck shares this material.
        if (tankN.z < -.50 && tankP.z < -.80) {
          vec2 bowUV = vec2(tankP.x / 1.30 + .5, (tankP.y + .18) / .409);
          // Convert the original nose-art drawing to a fixed 96-column enamel chart.
          // The relief and teeth stay on the forward casting as the turret rotates.
          vec2 inkGrid=vec2(96.,34.);
          vec2 cell=(floor(bowUV*inkGrid)+.5)/inkGrid;
          // Keep continuous derivatives for the mip lookup at long distance.
          vec4 enamel = textureGrad(uTankBowPaint,cell,dFdx(bowUV),dFdy(bowUV));
          ${pixelBow?`
            // Keep the old enamel's thin rubbed/oxidized value variation only.
            // The new ink alone defines coverage: do not leave a second row
            // of ghost teeth above the opaque pixel jaw.
            float patina=.94+.06*dot(enamel.rgb,vec3(.32,.50,.18));
            enamel=texture2D(uGhostBow,bowUV);
            enamel.rgb*=patina;
          `:''}
          // Red field paint chalks at the cast break, but preserve the shark
          // silhouette, eyes and tooth contrast. Short rubbed-through gouges
          // and oxide color shifts are authored in the livery itself.
          float red = smoothstep(.075,.23,enamel.r-max(enamel.g,enamel.b));
          enamel.rgb=mix(enamel.rgb,vec3(.48,.037,.029)+enamel.rgb*vec3(.31,.12,.10),red*.77);
          float coverage = .99 - red*(.035+.04*planeWash);
          diffuseColor.rgb = mix(diffuseColor.rgb,enamel.rgb * (.89 + .11 * planeWash),enamel.a * coverage);
        }
      ` : ''}
      float exposedLip = 0.0;
      float seamDirt = 0.0;
      float settledDust = 0.0;
      vec2 scrapes = vec2(0.0);
      vec2 dents = vec2(0.0);
      vec2 chips = vec2(0.0);
      ${surface === 'turret' ? `
        // The broad lower cheek turns cooler at the casting break. Keep the
        // darker return below it and taper the paint toward nose and heel.
        // Mass follows where the cast wall actually rolls under/away. Height
        // alone would paint a straight stripe through the cheek and number.
        float zBias = tankP.z + .055 * sign(tankP.x);
        float highHaunch = 1.0-smoothstep(.015,.32,abs(zBias+.24));
        float lowHaunch  = 1.0-smoothstep(.03,.26,abs(zBias-.13));
        float turn = tankN.y + .15*tankN.z + .045*tankN.x
          - .25*highHaunch + .16*lowHaunch + .14*(planeWash-.5);
        float underside = (1.0-smoothstep(-.43,.37,turn)) * smoothstep(.16,.48,abs(tankP.x));
        diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.051,.076,.072),underside*.67);
        float sunCheek = smoothstep(.30,.85,turn) * (.40+.60*planeWash);
        diffuseColor.rgb *= mix(vec3(1.0),vec3(1.10,1.11,1.02),sunCheek);
        ${hasField ? `
          // Artist's local YZ chart: two grab feet, diagonal shoulder rub
          // and a short, broken metal crescent where the mantlet edge turns.
          vec2 fieldUV = vec2((.18-tankP.z)/.78,(tankP.y+.085)/.34);
          if (abs(tankN.x)>.24 && all(greaterThan(fieldUV,vec2(.0))) && all(lessThan(fieldUV,vec2(1.0)))) {
            vec4 stroke = readFieldWear(fieldUV,0.0,tankP.x);
            diffuseColor.rgb = mix(diffuseColor.rgb,stroke.rgb*(.94+.08*planeWash),
              stroke.a*(.78+.17*smoothstep(-.07,.055,castingGrain)));
            exposedLip = stroke.a*smoothstep(.205,.36,stroke.b)*.62;
          }
        ` : ''}
        ${hasUnit ? `
          // Both cheeks read left-to-right in an exterior view. The negative
          // space below the brow keeps the number out of the shark's eye
          // and forward of the grab rail. Both rotate with the turret.
          vec2 unitUV = vec2(.5-(tankP.z+.411)*sign(tankP.x)/.175,(tankP.y+.045)/.092);
          if (all(greaterThan(unitUV,vec2(.0))) && all(lessThan(unitUV,vec2(1.0))) && abs(tankN.x)>.37) {
            vec4 fieldInk = texture2D(uTankUnitStamp,unitUV);
            float rubOut = smoothstep(-.05,.042,castingGrain+.038*(run-.5));
            diffuseColor.rgb = mix(diffuseColor.rgb,fieldInk.rgb*(.90+.10*planeWash),
              fieldInk.a*(.38+.43*rubOut));
          }
        ` : ''}
        // The casting break gathers broken earth pigment around handholds.
        // Leave the crown and the broad raised side planes largely intact.
        float castingSide = smoothstep(.31,.49,abs(tankP.x))
          * (1.0 - smoothstep(.27,.56, abs(tankP.z + .08)));
        float joint = tankP.y - (.044 + .028*highHaunch - .061*lowHaunch
          + tankP.z*.082 - .11*tankP.z*tankP.z + .025*(planeWash-.50));
        float jointInk = 1.0 - smoothstep(.003,.010 + aa,abs(joint));
        float rubbedLip = 1.0 - smoothstep(.002,.010 + aa,abs(joint - .016));
        float grabScar = 1.0 - smoothstep(.036,.13,min(abs(tankP.z + .16),abs(tankP.z - .10)));
        float rainFinger = smoothstep(.53,.81,run) * (1.0 - smoothstep(-.055,.04,joint));
        float offsetZ = tankP.z + .061 * sign(tankP.x);
        float forwardPocket = 1.0 - smoothstep(.038,.188,abs(offsetZ + .272));
        float aftPocket = 1.0 - smoothstep(.035,.163,abs(offsetZ - .128));
        float jointPocket = max(forwardPocket, aftPocket * .73) * (.65 + .35 * run);
        // Four feet hold the two grab bars. Dark rain pulls down from a
        // particular foot; it never becomes a repeating stripe on the crown.
        float feet = min(min(abs(tankP.z+.224),abs(tankP.z+.096)),
                         min(abs(tankP.z-.036),abs(tankP.z-.164)));
        float belowFoot = 1.0 - smoothstep(-.025,.014,tankP.y);
        float wetTrail = 1.0 - smoothstep(.004,.014+.021*run,feet);
        filmOil = castingSide * belowFoot * smoothstep(-.138,-.083,tankP.y)
          * wetTrail * (.48+.34*run);
        float rub = (1.0 - smoothstep(.026,.098,feet)) * (1.0-smoothstep(.019,.058,abs(tankP.y)));
        wornContact = castingSide * rub * smoothstep(.30,.72,run) * .47;
        // Dust survives as two separate thumb-shaped deposits beneath grab
        // feet; there is no 'joint stripe' going around an entire casting.
        vec2 d1 = vec2((zBias+.225)/.095,(tankP.y-.022-.22*(zBias+.225))/.065);
        vec2 d2 = vec2((zBias-.120)/.062,(tankP.y+.027+.25*(zBias-.12))/.083);
        float deposits = max(1.0-smoothstep(.23,1.04,length(d1)+.30*(run-.5)),
                         .78*(1.0-smoothstep(.18,1.0,length(d2)+.23*(planeWash-.5))));
        seamDirt = castingSide * jointPocket * (jointInk*.15+.24*rainFinger);
        settledDust = castingSide * deposits * (.29+.23*run);
        float dustCuff = 1.0 - smoothstep(.011,.072,abs(length(vec2(tankP.x + .17,tankP.z - .17)) - .29));
        settledDust += dustCuff * upper * (.04 + .14 * planeWash);
        exposedLip = max(exposedLip,castingSide * rubbedLip * grabScar * (.09 + run * .16) * narrowWear);

        vec2 cheekMark = vec2(tankP.z + .036 * sign(tankP.x),tankP.y);
        float sidePanel = smoothstep(.32,.52,abs(tankP.x)) * (1.0 - smoothstep(.20,.28,tankP.y));
        // Break one long oblique rub into two lengths with a narrower partner.
        // Pin the shallow depression at the termination rather than floating
        // an identical mark separately on each clean panel.
        scrapes = max(armorScrape(cheekMark - vec2(-.205,.157),vec2(.944,.330),.119,.0091,aa),
                      armorScrape(cheekMark - vec2(-.262,.123),vec2(.966,.259),.079,.0070,aa)) * sidePanel;
        dents = armorDing(cheekMark - vec2(-.091,.197),vec2(.039,.019),aa) * sidePanel;
        // Handholds attach to the rounded cheek. The two chips bite the lip
        // only at the drum-side join, not across the broad casting.
        vec2 grabPaint = vec2(offsetZ,joint);
        chips = max(armorFlake(grabPaint - vec2(.047,.054),vec2(.035,.020),aa),
                    armorFlake(grabPaint - vec2(.099,.067),vec2(.016,.011),aa)) * castingSide;
      ` : `
        // Deck grime collects on the rounded lips; the heavier hull splash is
        // placed low along the nose and rear, away from the centre stencil.
        float deckFace = upper * smoothstep(.066,.115,tankP.y)
          * (1.0 - smoothstep(.133,.161,tankP.y)) * (1.0 - smoothstep(.68,.79,abs(tankP.z)));
        float endPlate = smoothstep(.72,.86,abs(tankP.z)) * smoothstep(.47,.77,abs(tankN.z));
        float rail = smoothstep(.35,.58,abs(tankP.x));
        float deckLip = max(rail,smoothstep(.39,.63,abs(tankP.z)));
        float siltBank = 1.0 - smoothstep(-.112,.117,tankP.y + (1.0 - run) * .064);
        float offsetZ = tankP.z + .11 * sign(tankP.x);
        float frontPocket = 1.0 - smoothstep(.06,.28,abs(offsetZ + .47));
        float rearPocket = 1.0 - smoothstep(.045,.25,abs(offsetZ - .43));
        float deckPocket = max(frontPocket,rearPocket * .77);
        settledDust = deckFace * deckLip * (.035 + .28 * deckPocket * (.58 + .42 * planeWash))
          + (.23 * flank + .25 * endPlate) * siltBank * (.32 + .68 * run);
        seamDirt = (deckFace * .20 * rail + .22 * endPlate * siltBank) * smoothstep(.43,.78,run);
        // A broad smear and two narrow oil tails below each lamp bracket.
        // Positions are offset from the centre of the shark's face. The
        // deck's entire forward third is a sloping/rolled separate casting.
        float boltX = abs(tankP.x)-.43;
        float headOil = 1.0-smoothstep(.009,.045 + .018 * run,abs(abs(boltX)-.108));
        float bowSide = smoothstep(.24,.46,abs(tankP.x));
        filmOil = endPlate * headOil * smoothstep(.03,.17,tankP.y) * bowSide * (.41+.40*run);
        float deckFront = (1.0-smoothstep(-.62,-.42,tankP.z)) * (1.0-smoothstep(.67,.79,abs(tankP.z)));
        float deckSide = smoothstep(.44,.54,abs(tankP.x)) * (1.0-smoothstep(.61,.69,abs(tankP.z)));
        float localDeck = max(deckFront,deckSide);
        // A deep return under the pale upper plate, with dust clinging at
        // the fold instead of one uniform strip across the vertical face.
        float returnEdge = (1.0-smoothstep(-.098,.076,tankP.y)) * (1.0-upper);
        diffuseColor.rgb *= mix(vec3(1.0),vec3(.44,.51,.56),localDeck*returnEdge);
        float deckRoll = 1.0-smoothstep(.010,.049,abs(tankP.y-.068));
        settledDust += localDeck * deckRoll * (.09+.23*planeWash) * smoothstep(.23,.77,run);
        float deckFoot = 1.0-smoothstep(.012,.060,abs(abs(tankP.x+.028)-.37));
        filmOil = max(filmOil,deckFront*deckFoot*(1.0-smoothstep(.067,.109,tankP.y))*(.36+.41*run));
        // Fasteners follow the deck's actual slight rake. Each head throws a
        // different-length rust/oil tail onto the broad vertical cheek.
        float boltLocalY = .051 + .10*tankP.z;
        float belowBolt = boltLocalY-tankP.y;
        float pitch = (fract((tankP.z+.66)/.21+.50)-.50)*.21;
        float bead = 1.0-smoothstep(.002,.012+.014*planeWash,abs(pitch-.05*belowBolt));
        float weep = smoothstep(-.006,.014,belowBolt)*(1.0-smoothstep(.048,.151,belowBolt));
        filmOil = max(filmOil,deckSide*flank*bead*weep*(.23+.49*run));
        float brownBed = (1.0-smoothstep(.014,.054,abs(pitch)))*smoothstep(.012,.065,belowBolt);
        settledDust += deckSide*flank*brownBed*(.09+.31*planeWash);
        wornContact = deckSide * smoothstep(.69,.90,run) * upper * (.15+.42*deckPocket);
        // The two face coordinates unfold the rounded edge across its top
        // and vertical return, so the chipped paint crosses the real ridge.
        vec2 shoulderMark = vec2(offsetZ,abs(tankP.x) + .65 * (tankP.y - .104));
        float shoulder = smoothstep(.480,.532,abs(tankP.x))
          * smoothstep(.045,.083,tankP.y) * (1.0 - smoothstep(.132,.164,tankP.y));
        chips = max(armorFlake(shoulderMark - vec2(-.337,.552),vec2(.055,.027),aa),
                    armorFlake(shoulderMark - vec2(-.440,.554),vec2(.028,.018),aa)) * shoulder;

        vec2 plateMark = vec2(tankP.x + .23 * step(.0,tankP.z),tankP.y);
        vec2 lipMark = vec2(tankP.x,tankP.z);
        // Gouges stay asymmetric, with bare rim at the end of each drag.
        vec2 plateCut = armorScrape(plateMark - vec2(.291,.149),vec2(.963,-.269),.123,.0085,aa);
        vec2 deckCut = max(armorScrape(lipMark - vec2(.453,-.350),vec2(.255,.967),.132,.0097,aa),
                          armorScrape(lipMark - vec2(.474,-.323),vec2(.312,.950),.074,.0072,aa));
        scrapes = max(plateCut * endPlate, deckCut * deckFace);
        dents = armorDing(plateMark - vec2(.405,.119),vec2(.033,.016),aa) * endPlate;
      `}
      diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.241,.148,.074),clamp(settledDust,0.0,.72));
      diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.103,.068,.043),clamp(seamDirt,0.0,.47));
      diffuseColor.rgb *= mix(vec3(1.0),vec3(.32,.38,.43),filmOil);
      diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.218,.209,.163),wornContact);
      float cutDepth = max(scrapes.x * narrowWear * .56,dents.x * dentWear * .13);
      diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.069,.061,.044),cutDepth);
      exposedLip = max(exposedLip,max(scrapes.y * narrowWear * .68,dents.y * dentWear * .43));
      diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.335,.311,.245),exposedLip);
      diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.049,.039,.028),chips.x * narrowWear * .70);
      diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.181,.174,.146),chips.y * narrowWear * (.36+.33*run));
      exposedLip = max(exposedLip,chips.y * narrowWear);
      float armorRelief = (-.0058 * dents.x + .0021 * dents.y
        + castingGrain * (.00027+.00063*exposedLip)) * dentWear;
      #include <alphamap_fragment>
    `);
    if (!isTrack) shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
      #include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor + settledDust * .08 - exposedLip * .28 - wornContact * .21 - filmOil * .26, .54, 1.0);
    `).replace('#include <normal_fragment_maps>', `
      #include <normal_fragment_maps>
      // Surface-gradient bump without a texture; apply only to the sparse
      // shallow notches. Derivatives are evaluated before the local branch.
      vec2 paintGradient = vec2(dFdx(armorRelief),dFdy(armorRelief));
      vec3 paintDx = dFdx(-vViewPosition);
      vec3 paintDy = dFdy(-vViewPosition);
      if (dot(paintGradient,paintGradient) > 1e-11) {
        vec3 dualX = cross(paintDy,normal);
        vec3 dualY = cross(normal,paintDx);
        float paintDet = dot(paintDx,dualX);
        if (abs(paintDet) > 1e-8) {
          normal = normalize(normal - (paintGradient.x * dualX + paintGradient.y * dualY) / paintDet);
        }
      }
    `);
  };
  material.customProgramCacheKey = () => `tank-painted-metal-v8:${surface}${hasLivery ? ':shark-bow-v1' : ''}${pigment ? ':cast-enamel-v1' : ''}${hasUnit ? ':unit23' : ''}${hasField ? ':field' : ''}${hasLivery&&pixelBow?':pixel-jaw':''}`;
  return material;
}

/** Component-space finishes. The same opaque mesh supplies shape, pigment,
 * gloss and occlusion; the oil/edge highlights never add a decal draw. */
export function applyTankComponentPaint(material: MeshStandardMaterial, pigment: Texture,
  part: 'fender' | 'cover' | 'fittings' | 'auxiliary' | 'drum', fieldWear?: Texture) {
  const point = 'varying vec3 vFormPoint;\nvarying vec3 vFormNormal;\n';
  const fender = part === 'fender';
  const hasField = fender && !!fieldWear;
  const hand = fender ? 'varying float vTankHand;\n' : '';
  material.onBeforeCompile = shader => {
    shader.uniforms.uTankPlateStudy = { value: pigment };
    if (hasField) shader.uniforms.uTankFieldWear = { value: fieldWear };
    shader.vertexShader = (fender ? 'attribute float tankHand;\n' : '') + hand + point + shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vFormPoint = position;
      vFormNormal = normal;
      ${fender ? 'vTankHand = tankHand;' : ''}
    `);
    shader.fragmentShader = hand + point + plateStudy + (hasField ? fieldChart : '') + shader.fragmentShader.replace('#include <alphamap_fragment>', `
      vec3 p = vFormPoint;
      vec3 formN = normalize(vFormNormal);
      float topCoat = smoothstep(.05,.88,formN.y);
      float aaForm = max(.001,length(fwidth(p))*.44);
      vec3 oldPaint = readSteelStudy(p ${fender ? '+ vec3(vTankHand*.32,0.,.0)' : ''});
      float grit = dot(oldPaint,vec3(.25,.57,.18));
      float chip = 0.0, oil = 0.0, earth = 0.0;
      diffuseColor.rgb = oldEnamel(diffuseColor.rgb, oldPaint,
        clamp(.26+.42*topCoat + (grit-.37)*.22,.0,1.0));
      ${fender ? `
        // Signed coordinate from the inboard seam to the outside rolled lip.
        // Right and left use different pigment samples and contact patches;
        // the material stays fixed on the vehicle while driving/turning.
        float across = p.x*vTankHand;
        float zz = p.z;
        float sidePhase = .5+.5*vTankHand;
        float broken = clamp((grit-.28)*4.5,0.0,1.0);
        float first = -.64+.026*sidePhase, last = .71-.074*sidePhase;
        float overlap = min(abs(zz-first),min(abs(zz-.015),abs(zz-last)));
        float joint = 1.0-smoothstep(.004,.011+aaForm,overlap);
        float plate = smoothstep(first-.008,first+.008,zz) - smoothstep(.008,.022,zz);
        diffuseColor.rgb *= mix(vec3(.81,.84,.81),vec3(1.16,1.09,.93),plate);
        float access = (1.0-smoothstep(.045,.20,abs(zz+.32-.10*sidePhase))) * smoothstep(-.047,.118,across);
        earth = (1.0-smoothstep(-.138,-.060,across))*(.26+.43*broken) // silt against hull
              + access*broken*.49;
        oil = (1.0-smoothstep(.015,.084,overlap))*(.22+.38*broken)
            + joint*(.54+.19*topCoat);
        // Exposed lip is interrupted by long islands of surviving enamel;
        // a thinner bronze primer sits under the actual cold steel break.
        float edge = smoothstep(.125,.148,across);
        float highSpot = clamp(1.0-abs(zz+.84-.12*sidePhase)*5.0,.0,1.0)
                       + clamp(1.0-abs(zz-.51-.08*sidePhase)*3.7,.0,1.0);
        float torn = smoothstep(.34,.48,grit+highSpot*.056);
        chip = edge*torn*(.24+.55*clamp(highSpot,0.0,1.0))*(.50+.50*topCoat);
        float lipBank = 1.0-smoothstep(.010,.035+aaForm,abs(across-.122));
        diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.114,.074,.046),lipBank*torn*(.10+.43*clamp(highSpot,.0,1.0)));
        float abradedJoint = 1.0-smoothstep(.002,.009+aaForm,abs(overlap-.015));
        chip = max(chip,abradedJoint * (.13+.34*broken) * (.25+.75*topCoat));
      ` : part === 'cover' ? `
        float rim = max(smoothstep(.500,.553,abs(p.x)), smoothstep(.190,.244,abs(p.z)));
        // Split, inset service lids around the actual louvers. Soot settles
        // at their aft end and follows the vertical lip. Rear star untouched.
        float frame = min(abs(abs(p.x)-.46),abs(abs(p.z)-.182));
        float seatLine = (1.0-smoothstep(.002,.009+aaForm,frame))*topCoat;
        float darkPanel = smoothstep(.005,.026,p.x)*(1.0-rim)*topCoat;
        diffuseColor.rgb *= mix(vec3(1.0),vec3(.69,.78,.80),darkPanel);
        float soot = (1.0-smoothstep(.28,.47,abs(p.x))) * smoothstep(.005,.23,p.z);
        oil = seatLine*.67 + soot*(.36+.36*smoothstep(.28,.44,grit));
        earth = rim * topCoat * (.20+.47*smoothstep(.29,.47,grit));
        chip = rim*smoothstep(.36,.48,grit)*(.12+.24*topCoat);
      ` : part === 'drum' ? `
        // Fuel drums/short mantlet use local axial Y. A dark compression
        // edge under the two retaining hoops anchors the old coat of paint.
        float fromHoop = abs(abs(p.y)-.161);
        float band = 1.0-smoothstep(.012,.017+aaForm,fromHoop);
        float cap = smoothstep(.65,.91,abs(formN.y));
        float endR = length(p.xz);
        float stamp = (1.0-smoothstep(.003,.009+aaForm,abs(endR-.107)))*cap;
        oil = (1.0-smoothstep(.018,.028,fromHoop))*.51 + stamp*.52;
        diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.121,.121,.096),band*.78);
        chip = band*smoothstep(.31,.45,grit)*.36;
        earth = cap*smoothstep(.03,.141,endR)*(.12+.28*smoothstep(.36,.48,grit));
      ` : `
        // Existing colored casting and fitting planes stay authoritative.
        // Recesses remain cool and polished upward bevels stay intermittent.
        float turn = smoothstep(-.64,.68,formN.y-.19*formN.z);
        diffuseColor.rgb *= mix(vec3(.74,.81,.85),vec3(1.02,1.00,.95),turn);
        float curvedBevel = smoothstep(.13,.62,abs(formN.y))*(1.0-smoothstep(.80,.97,abs(formN.y)));
        chip = smoothstep(.35,.48,grit)*curvedBevel*${part === 'fittings' ? '.24' : '.16'};
        earth = (1.0-turn)*.034;
      `}
      diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.200,.142,.082),clamp(earth,.0,.65));
      diffuseColor.rgb *= mix(vec3(1.0),vec3(.25,.30,.31),clamp(oil,.0,.90));
      diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.218,.215,.187),clamp(chip,.0,.72));
      ${hasField ? `
        // Chart wraps down the bent nose, instead of cutting off at the flat
        // top. The dark rear ends of the same sheets retain their own paint.
        vec2 sheetUV = vec2((p.x*vTankHand+.15)/.30,(p.z+1.14)/.63);
        if (p.z<-.51 && formN.y>-.10 && all(greaterThanEqual(sheetUV,vec2(.0))) && all(lessThanEqual(sheetUV,vec2(1.0)))) {
          vec4 stroke = readFieldWear(sheetUV,1.0,vTankHand);
          diffuseColor.rgb = mix(diffuseColor.rgb,stroke.rgb,stroke.a*(.79+.19*smoothstep(.30,.43,grit)));
          chip = max(chip,stroke.a*smoothstep(.21,.37,stroke.b)*.73);
        }
      ` : ''}
      #include <alphamap_fragment>
    `).replace('#include <roughnessmap_fragment>', `
      #include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor + earth*.10 - oil*.27 - chip*.33,.53,1.0);
    `);
  };
  material.customProgramCacheKey = () => `tank-component-enamel-v1:${part}${hasField ? ':field' : ''}`;
  return material;
}

/** Dyed canvas: a rolled edge, a folded envelope and actual tie positions,
 * not the granular armor study. Keep body cloth matte between its seams. */
export function applyTankCanvasFinish(material: MeshStandardMaterial, study:Texture,
  pack:{scale:readonly number[];offset:readonly number[]}) {
  const uniformVec=(v:readonly number[])=>'vec3('+v.map(n=>n.toFixed(6)).join(',')+')';
  const vary = 'varying vec3 vBagPoint;\nvarying vec3 vBagNormal;\n';
  material.onBeforeCompile = shader => {
    shader.uniforms.uTankThreadStudy={value:study};
    shader.vertexShader = vary + shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vBagPoint = position;
      vBagNormal = normal;
    `);
    shader.fragmentShader = vary + 'uniform sampler2D uTankThreadStudy;\n' + shader.fragmentShader.replace('#include <alphamap_fragment>', `
      vec3 bagP = vBagPoint;
      // Work in the cloth pattern's cutting coordinates even after tying
      // the roll to the offset rail. Do not move the two side pouches' seams.
      if(bagP.z>.65)bagP=(bagP-${uniformVec(pack.offset)})/${uniformVec(pack.scale)};
      vec3 clothN = normalize(vBagNormal);
      float face = smoothstep(.25,.83,abs(clothN.x));
      float threadAA = max(.001,length(fwidth(bagP))*.42);
      vec2 clothUV=vec2(bagP.z,bagP.y);
      if (bagP.z < .65) {
        // The pouch flap casts a soft shadow down over the bag. Bent side
        // tucks taper to nothing rather than reading as a stripe around it.
        float zc = bagP.z-.475;
        float foldY = .164-.017*(1.0-smoothstep(.0,.11,abs(zc)));
        float under = 1.0-smoothstep(.005,.036,abs(bagP.y-foldY+.014));
        float flap = smoothstep(foldY+.003,foldY+.025,bagP.y);
        float dart = min(abs(zc+.071+.31*(bagP.y-.088)),abs(zc-.065-.18*(bagP.y-.062)));
        float tuck = (1.0-smoothstep(.005,.022,dart))*(1.0-smoothstep(.066,.144,bagP.y));
        diffuseColor.rgb *= mix(vec3(.78,.67,.60),vec3(.94,.89,.74),flap);
        diffuseColor.rgb *= 1.0-face*(.37*under+.28*tuck);
        float corner = abs(abs(zc)-.093);
        float seam = min(corner,abs(bagP.y-.036));
        float stitch = 1.0-smoothstep(.0015,.003+threadAA,seam);
        float beat = fract((corner<abs(bagP.y-.036)?bagP.y:bagP.z)*58.);
        diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.29,.227,.146),
          stitch*face*(1.0-flap)*smoothstep(.16,.58,beat)*.58);
      } else {
        // The bedroll is an olive canvas piece, with a dark roll-end spiral
        // and sun-faded bulges divided by its actual restraining straps.
        // The turned end is visible outside its basket in the reference.
        // Large warm cloth panels, interrupted by two dark compression ties.
        vec2 end = vec2((bagP.y-.300)/.88,bagP.z-.863);
        float phi = atan(end.y,end.x);
        float cuff = abs(abs(bagP.x)-.30);
        float pinch = 1.0-smoothstep(.012,.053,cuff);
        // Actual geometry now carries the two rolled cloth ends. Avoid
        // painting cartoon black rings over their recessed and exposed lips.
        clothUV=mix(vec2(bagP.x,phi*.153),end,face);
        float panel=smoothstep(.16,.53,clothN.y)+smoothstep(.62,.86,clothN.y);
        diffuseColor.rgb *= vec3(.78,.82,.70)*(.88+.11*panel)*(1.0-.32*pinch);
      }
      // Woven high threads catch light on the crown; keep the compressed
      // underside quiet. Texture mips integrate any subpixel thread crossings.
      float yarn=texture2D(uTankThreadStudy,clothUV*4.7).r-.48;
      float upperCloth=smoothstep(-.43,.70,clothN.y+.33*clothN.z);
      diffuseColor.rgb*=1.0+yarn*(.32+.69*upperCloth);
      #include <alphamap_fragment>
    `);
  };
  material.customProgramCacheKey = () => 'tank-stowed-woven-canvas-v4:'+pack.scale+':'+pack.offset;
  return material;
}

/** Paint a few scooped deposits into the dished faces and isolated rim
 * contacts. Vertex-space only, and fixed to each physical rotating wheel. */
export function applyWheelFieldPaint(material: MeshStandardMaterial) {
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <color_vertex>', `
      #include <color_vertex>
      #if defined(USE_COLOR) && defined(USE_INSTANCING)
        float wheelSeed = fract(float(gl_InstanceID)*.618034+.21);
        float corner = wheelSeed*6.283185;
        vec2 outDir = normalize(position.yz+vec2(.00001));
        float r = length(position.yz);
        vec2 toward = vec2(cos(corner),sin(corner));
        float dish = smoothstep(.046,.082,r)*(1.0-smoothstep(.098,.126,r));
        float pocket = smoothstep(.11,.91,dot(outDir,toward)) * dish;
        float rider = smoothstep(.42,.94,dot(outDir,vec2(-toward.y,toward.x)));
        float brow = 1.0-smoothstep(.003,.009,abs(r-.116));
        vColor.rgb = mix(vColor.rgb,vec3(.20,.112,.053),pocket*(.32+.36*wheelSeed));
        vColor.rgb = mix(vColor.rgb,vec3(.29,.273,.216),brow*rider*.42);
      #endif
    `);
  };
  material.customProgramCacheKey = () => 'tank-wheel-field-pigment-v1';
  return material;
}
