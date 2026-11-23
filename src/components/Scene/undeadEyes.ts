import * as THREE from 'three';

// Near the player this is a corneal reflection, not a screen-facing streak:
// the planes follow the roll, tilt and depth of the actual eyelids. Only their
// filtered footprint grows at mid-range. One two-triangle instance per socket.
export function undeadEyeMaterial(){
  return new THREE.ShaderMaterial({
    transparent:true,depthTest:true,depthWrite:false,blending:THREE.NormalBlending,toneMapped:false,
    vertexShader:`
      varying vec2 vEye;
      varying float vFacing;
      varying float vNear;
      varying float vDistant;
      void main(){
        mat4 eye=modelViewMatrix*instanceMatrix;
        if(length(eye[0].xyz)<.0001){
          vNear=0.; vDistant=0.; vFacing=0.; vEye=vec2(0.); gl_Position=vec4(2.,2.,2.,1.); return;
        }
        vec4 center=eye*vec4(0.,0.,0.,1.);
        float depth=max(-center.z,0.);
        float facing=dot(normalize(-center.xyz),-normalize(eye[2].xyz));
        vFacing=smoothstep(.065,.48,facing)*(1.-smoothstep(95.,132.,depth));
        vDistant=smoothstep(26.,52.,depth);
        vNear=1.-smoothstep(7.,17.,depth);
        vEye=uv*2.-1.;
        float scale=length(eye[0].xyz);
        // Protect the vertical aperture independently of the horizontal
        // interocular gap. At tank range FXAA otherwise resolves a 1px
        // bright core only in alternate phases of the walking animation.
        vec2 radius=max(vec2(.026,.021)*scale,
          min(vec2(.216,.191)*scale,depth*vec2(.00348,.00380)));
        // At the treeline give the scattered light a wider footprint around
        // the socket. The approaching face resolves back into individual eyes.
        radius*=mix(1.,1.72,vDistant);
        // Put the far glow just outside the wet lid. The head still turns
        // it away and opaque trunks and cover still stop it in depth.
        center.xyz-=normalize(eye[2].xyz)*(scale*.0230*(1.-vNear));
        // Local -X is camera-right on a front-facing skull (forward = -Z).
        // Preserve the real depth across the eye so the nose, visor, and
        // nearer eye can actually occlude the opposite socket in profile.
        center.xyz+=-normalize(eye[0].xyz)*(vEye.x*radius.x)
                    +normalize(eye[1].xyz)*(vEye.y*radius.y);
        gl_Position=projectionMatrix*center;
      }`,
    fragmentShader:`
      varying vec2 vEye;
      varying float vFacing;
      varying float vNear;
      varying float vDistant;
      void main(){
        float r=length(vEye);
        float aura=(1.-smoothstep(.22,1.,r))*mix(.79,.29,vNear)*(1.+.48*vDistant);
        float iris=1.-smoothstep(mix(.43,.36,vNear),mix(.73,.71,vNear),r);
        // A darker pupil, a tucked upper lid and a tiny reflected point read
        // at portrait distance. Do not turn both eyes into one bright visor.
        float lid=1.-vNear*smoothstep(.46,.86,abs(vEye.y+.09*vEye.x)+.27*vEye.x*vEye.x);
        float pupil=vNear*(1.-smoothstep(.06,.25,r));
        float point=vNear*(1.-smoothstep(.024,.16,length(vEye-vec2(-.20,.15))));
        // Replace the corneal color inside the pupil. Adding red to the
        // underlying beige skin produced a peach visor even with a red shader.
        // Limit the core exposure to preserve crimson through the filmic grade. The outer
        // red falloff survives subpixel motion when the two sockets recede.
        vec3 red=(vec3(1.16,.001,.052)*aura+vec3(2.75,.002,.105)*iris*(1.-.46*pupil)
          +vec3(.55,.034,.061)*point)*lid;
        gl_FragColor=vec4(red,vFacing*lid*min(1.,iris+aura));
        #include <colorspace_fragment>
      }`,
  });
}
