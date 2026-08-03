interface DirectoryPickerProps {
  onPick: () => void;
  lastDirectory?: string | null;
  onReopenLast?: () => void;
  onStartTraining?: () => void;
  onStartHordeMode?: () => void;
  error?: string | null;
}

export function DirectoryPicker({
  onPick,
  lastDirectory,
  onReopenLast,
  onStartTraining,
  onStartHordeMode,
  error,
}: DirectoryPickerProps) {
  return (
    <div className="directory-picker">
      <span className="era-stamp">AO CLEAN SWEEP // 1968</span>
      <h1>TankDelete</h1>
      <p className="subtitle">Turn a directory into a tactical cleanup sector.</p>

      <div className="safety-brief" aria-label="How TankDelete works">
        <div>
          <strong>01 · Mark</strong>
          <span>Your first shot only arms a file.</span>
        </div>
        <div>
          <strong>02 · Confirm</strong>
          <span>A second shot moves that file to the OS Trash.</span>
        </div>
        <div>
          <strong>03 · Recover</strong>
          <span>Press ⌘/Ctrl Z to undo the last trash action.</span>
        </div>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {lastDirectory && onReopenLast ? (
        <div className="last-directory">
          <p>Reopen last directory?</p>
          <p className="directory-path">{lastDirectory}</p>
          <div className="button-group">
            <button onClick={onReopenLast} className="btn-primary">
              Yes
            </button>
            <button onClick={onPick} className="btn-secondary">
              Pick New
            </button>
          </div>
        </div>
      ) : (
        <div className="button-group">
          <button onClick={onPick} className="btn-primary">
            Select Directory
          </button>
          {onStartTraining && (
            <button onClick={onStartTraining} className="btn-secondary">
              Boot Camp
            </button>
          )}
        </div>
      )}

      {lastDirectory && onReopenLast && onStartTraining && (
        <button onClick={onStartTraining} className="btn-training-link">
          Or enter the training arena
        </button>
      )}

      {onStartHordeMode && (
        <button
          type="button"
          onClick={onStartHordeMode}
          className="btn-horde-shortcut"
          aria-label="Launch Horde Mode"
          title="Horde Mode"
        >
          horde mode
        </button>
      )}
    </div>
  );
}
