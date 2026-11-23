// Offline only. This runs the same sector paging, objective placement, village
// layout and file sizing as a fresh Boot Camp; it never inspects the live game.
import {createElement} from 'react';
import {renderToString} from 'react-dom/server';
import {useFileBlocks, type BlockData} from '../../src/hooks/useFileBlocks';
import {createTrainingEntries, TRAINING_DIRECTORY} from '../../src/lib/training';
import {createFileObjective} from '../../src/lib/mission';
import {createSectorPage, createSectorReservations} from '../../src/lib/sectorPaging';
import {createVietCongCombatants, hashCombatSession, fitVietCongToVillage} from '../../src/lib/combat';
import {createVillageObstacle} from '../../src/lib/villageCover';

export function bootStrikeLayout() {
  const entries=createTrainingEntries(), objective=createFileObjective(entries,TRAINING_DIRECTORY+':1');
  const page=createSectorPage(entries,0,objective?.targets[0]?.path,createSectorReservations());
  let blocks:BlockData[]=[];
  function Probe() {
    blocks=useFileBlocks(page.entries,objective,page.layoutEntries,objective).allBlocks;
    return null;
  }
  renderToString(createElement(Probe));
  const seed=(hashCombatSession(1)^1968)>>>0;
  const enemies=fitVietCongToVillage(createVietCongCombatants(seed,12),blocks.map(createVillageObstacle),seed);
  return {blocks,enemies,objective};
}
export {isPointInsideNapalmStrike,NAPALM_STRIKE_WIDTH,NAPALM_STRIKE_LENGTH} from '../../src/lib/weapons';
export {createUSInfantryCombatants} from '../../src/lib/combat';
export {createVillageObstacle} from '../../src/lib/villageCover';
export {CameraRig} from '../../src/components/Scene/CameraRig';
export {VietCongCombatants} from '../../src/components/Scene/VietCongCombatants';
export {USInfantrySquad} from '../../src/components/Scene/USInfantrySquad';
