interface DirectoryPickerProps {
  onStartCampaign: () => void;
  onSecretHorde?: () => void;
  onOpenCleanup?: () => void;
  onStartTraining?: () => void;
  onStartHordeMode?: () => void;
  error?: string | null;
}

export function DirectoryPicker({
  onStartCampaign,
  onSecretHorde,
  onOpenCleanup,
  onStartTraining,
  onStartHordeMode,
  error,
}: DirectoryPickerProps) {
  return (
    <div className="directory-picker">
      <span className="era-stamp">AO CLEAN SWEEP // 1968</span>
      <h1>TankDelete</h1>
      <p className="subtitle">One battlefield. A bridge, a village, and a radio beyond it.</p>
      <p className="virtual-guarantee">Campaign and Boot Camp use fictional files. To work with files you choose yourself, open the separate Cleanup Desk.</p>

      <div className="safety-brief" aria-label="How TankDelete works">
        <div>
          <strong>01 · Cross the bridge</strong>
          <span>Drive with WASD. The bridge is open from the start. Drive over a green cross to repair or an amber shield for spare armor.</span>
        </div>
        <div>
          <strong>02 · Clear the field</strong>
          <span>Aim with the mouse and click to fire. Watch for reinforcements and the tank guarding the rear hut.</span>
        </div>
        <div>
          <strong>03 · Demolish the outpost</strong>
          <span>Bring down the file huts, the riverside shelter and the rear mast hut. On a file hut, the first hit marks it; a second confirms.</span>
        </div>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <div className="button-group">
        <button type="button" onClick={onStartCampaign} className="btn-primary">
          Start Campaign
        </button>
        {onStartHordeMode && (
          <button type="button" onClick={onStartHordeMode} className="btn-secondary"
            aria-label="Launch Horde Mode" title="Replay the earned embassy defense">
            Horde Mode
          </button>
        )}
        {onStartTraining && (
          <button type="button" onClick={onStartTraining} className="btn-secondary" title="Practice only · does not unlock Horde">
            Boot Camp
          </button>
        )}
        {onOpenCleanup && <button type="button" className="btn-secondary" onClick={onOpenCleanup}>Cleanup Desk</button>}
      </div>
      {!onStartHordeMode && <small className="horde-locked">Unknown frequency · no transmission</small>}
      {onSecretHorde && <button type="button" className="secret-horde-switch" onClick={onSecretHorde}
        aria-label="Tune hidden Horde channel" title="Ghost frequency · enter Horde"><span aria-hidden="true">∿</span></button>}
    </div>
  );
}
