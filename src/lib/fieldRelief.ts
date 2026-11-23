import {DAY_CREW,DAY_DOOR,DAY_PAD,DAY_STEP} from './campaignFlights';
import {safeVillageLeg,type VillageObstacle} from './villageCover';
import type {RiverStation} from '../components/Scene/riverLayout';
import {US_FIGHTING_POSITIONS,type FriendlyCombatant} from './combat';
import {fieldBagFootprints,fieldSupplyFootprints} from './fieldSupplyFootprint';
import {footLaneClear} from './infantryPatrol';

type Point=[number,number,number];
export type ReliefTicket={id:string;body:number;coverId:string;runSpeed:number;door:Point;step:Point;post:Point};
export type ReliefLanding={x:number;z:number;height:number;tickets:ReliefTicket[]};

export function chooseReliefLanding(batch:number,previous:ReliefLanding|null,tank:{x:number;z:number},
  obstacles:readonly VillageObstacle[],river:RiverStation[],ground:(x:number,z:number)=>number,random=Math.random,
  occupied:readonly {x:number;z:number}[]=[]){
  // The tank starts at (0,-12), facing +Z. Work opposite halves of the rear clearing.
  const firstSide = previous ? -Math.sign(previous.x) : (random() < .5 ? -1 : 1);
  const sides = previous ? [firstSide] : [firstSide, -firstSide];
  const pads = [[8, -25], [10, -24], [7, -27], [9, -22]];
  const footprints=[...fieldBagFootprints(0),...fieldSupplyFootprints(0)];
  for (const side of sides) {
    for (const [offset, z] of pads) {
      const x = side * offset;
      if (Math.hypot(x - tank.x, z - tank.z) < 6) continue;
      const height = ground(x, z);
      const clear = (ax:number, az:number, bx:number, bz:number) =>
        safeVillageLeg(ax, az, bx, bz, obstacles, river) && Math.abs(ground(bx, bz) - height) < .18;
      if (![-2, 0, 2].every(dx => clear(x + dx, z - 3, x + dx, z + 3))) continue;

      // Match the half-turn of the relief airframe, including the door sill.
      const place = ([px, py, pz]:readonly number[]):Point =>
        [x - (px - DAY_PAD[0]), height + py, z - (pz - DAY_PAD[2])];
      const door = place(DAY_DOOR), step = place(DAY_STEP);
      if (!clear(door[0], door[2], step[0], step[2])) continue;
      const cover = US_FIGHTING_POSITIONS.find(p => p.id === (side < 0 ? 'left' : 'right'))!;
      const [cx, cy, cz] = cover.position;
      const cos = Math.cos(cover.rotation), sin = Math.sin(cover.rotation);
      const posts:Point[] = [];
      // Enter through the open rear. The second rank accommodates a surviving defender.
      for (const depth of [-.73, -1.68]) {
        for (const across of [-.88, 0, .88]) {
          const px = cx + cos * across + sin * depth;
          const pz = cz - sin * across + cos * depth;
          if (occupied.some(p => Math.hypot(px - p.x, pz - p.z) < .80)) continue;
          if (!safeVillageLeg(step[0], step[2], px, pz, obstacles, river) ||
              !footLaneClear(step[0], step[2], px, pz, footprints)) continue;
          posts.push([px, cy + .005, pz]);
        }
      }
      if (posts.length < DAY_CREW.length) continue;
      const tickets:ReliefTicket[] = DAY_CREW.map((member, slot) => ({
        id: `relief-${batch}-${slot}`, body: member.body, coverId: cover.id,
        door, step, runSpeed: 3.75, post: posts[slot],
      }));
      return {x, z, height, tickets};
    }
  }
  return null;
}

export function reliefPassenger(ticket:ReliefTicket):FriendlyCombatant{
  return {id:ticket.id,position:ticket.door,relief:ticket,kneeling:ticket.body!==3,alive:true,health:70,maxHealth:70};
}
