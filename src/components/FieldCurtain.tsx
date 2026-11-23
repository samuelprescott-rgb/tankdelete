import './FieldCurtain.css';

export type CurtainStage = 'covering' | 'covered' | 'revealing';

export function FieldCurtain({stage, onCovered, onRevealed, onCancel}:{
  stage:CurtainStage; onCovered:()=>void; onRevealed:()=>void; onCancel?:()=>void;
}) {
  return <div className="field-curtain" data-stage={stage} data-game-ui
    onAnimationEnd={event => {
      if (event.target !== event.currentTarget) return;
      if (stage === 'covering') onCovered();
      if (stage === 'revealing') onRevealed();
    }}>
    <div className="field-curtain__status">
      <span role="status">{onCancel ? 'Preparing the field…' : 'Entering embassy defense…'}</span>
      <span aria-hidden="true" className="field-curtain__activity" />
      {onCancel && <button type="button" disabled={stage === 'revealing'} className="btn-secondary" onClick={onCancel}>Back to menu</button>}
    </div>
  </div>;
}
