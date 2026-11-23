import {terrainReliefHeight} from '../../lib/terrain';

const site=(x:number,z:number):[number,number,number]=>[x,Math.max(0,terrainReliefHeight(x,z))+.23,z];
// Timbers and smoke share their ACTUAL terrain seat, including the second
// fire on the 1.81 m shoulder rather than buried at valley-floor elevation.
export const BATTLE_FIRE_SEATS={day:[site(38,53),site(-11,71)],night:[site(-36,-54),site(13,-56)]};
