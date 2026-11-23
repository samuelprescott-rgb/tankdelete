import { memo, useEffect, useRef } from 'react';
import { animateScore } from '../../lib/scoreTicker';
import './ScoreCounter.css';

const numerals=new Intl.NumberFormat();
export const ScoreCounter=memo(function ScoreCounter({targetScore}:{targetScore:number}){
  const element=useRef<HTMLDivElement>(null),displayed=useRef(0);
  useEffect(()=>animateScore(displayed.current,targetScore,n=>{
    displayed.current=n;
    const node=element.current?.firstChild;
    if(node)node.nodeValue=numerals.format(n);
  },()=>performance.now(),fn=>requestAnimationFrame(fn),id=>cancelAnimationFrame(id)),[targetScore]);
  return <div className="score-counter" data-game-ui>
    <div className="score-label">SCORE</div>
    <div ref={element} className="score-value">0</div>
  </div>;
});
