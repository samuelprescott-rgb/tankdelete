import { createContext, useContext, useRef } from 'react';
import { sceneReviewDriveInput } from '../../lib/sceneReviewDrive';

export const SceneReviewControls = createContext<{run:number;stop:()=>void}|null>(null);

/** Never dispatch synthetic events, change speed, teleport, or bypass collisions. */
export function useSceneReviewDrive() {
  const controls=useContext(SceneReviewControls);
  const state=useRef({run:0,startedAt:0});
  return (clock:number)=>{
    if(!import.meta.env.DEV || !controls?.run) return null;
    if(state.current.run!==controls.run) state.current={run:controls.run,startedAt:clock};
    const input=sceneReviewDriveInput(clock-state.current.startedAt);
    if(!input) controls.stop();
    return input;
  };
}
