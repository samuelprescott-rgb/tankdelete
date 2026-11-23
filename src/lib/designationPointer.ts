import type {Vector2,Vector3} from 'three';

/** A strike is selected by the press, not by the last hover. Use Fiber's
 * measured CSS rectangle, not the drawing buffer (Retina) or a layout read. */
export function readDesignationPress(out:Vector2, event:{clientX:number;clientY:number},
  size:{left:number;top:number;width:number;height:number}){
  const {width,height}=size,x=event.clientX-size.left,y=event.clientY-size.top;
  if(!(width>0&&height>0&&Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&y>=0&&x<width&&y<height))return false;
  out.set(2*x/width-1,1-2*y/height);return true;
}

/** A map-designated effect faces the actual mark, even on first touch with
 * no hover/traverse history. The fallback heading applies directly under
 * the vehicle, where a ground point does not define a horizontal bearing. */
export function faceDesignation(origin: Pick<Vector3,'x'|'z'>, mark: Pick<Vector3,'x'|'z'>, fallback:Vector3) {
  const dx=mark.x-origin.x,dz=mark.z-origin.z;
  if(dx*dx+dz*dz>0.0025)fallback.set(dx,0,dz).normalize();
  return fallback;
}
