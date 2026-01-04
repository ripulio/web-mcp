export interface AddSourceFormProps {
  newSourceUrl: string;
  onNewSourceUrlChange: (url: string) => void;
  addingSource: boolean;
  addSourceError: string | null;
  onAddSource: () => void;
  onClearError: () => void;
}

export function AddSourceForm({
  newSourceUrl,
  onNewSourceUrlChange,
  addingSource,
  addSourceError,
  onAddSource,
  onClearError
}: AddSourceFormProps) {
  return (
    <>
      <div class="add-source">
        <input
          type="text"
          class="source-input"
          placeholder="https://example.com/"
          value={newSourceUrl}
          onInput={(e) => {
            onNewSourceUrlChange((e.target as HTMLInputElement).value);
            onClearError();
          }}
          onKeyDown={(e) => e.key === 'Enter' && !addingSource && onAddSource()}
        />
        <button class="add-btn" onClick={onAddSource} disabled={addingSource}>
          {addingSource ? '...' : 'Add'}
        </button>
      </div>
      {addSourceError && <div class="add-source-error">{addSourceError}</div>}
    </>
  );
}
