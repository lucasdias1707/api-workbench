import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { Dialog } from '@/components/common/Dialog';
import { useToast } from '@/components/common/Toaster';
import { parsePostman } from '@/lib/postman';
import { useWorkspace } from '@/state/workspace-store';

const SAMPLE = `{
  "info": { "name": "My API", "schema": ".../v2.1.0/collection.json" },
  "item": [ ... ]
}`;

/**
 * Import a Postman export.
 *
 * Both ways in are offered because both happen: the file Postman wrote is the
 * usual case, and pasting is what is left when the JSON arrived in a chat
 * message rather than as a download.
 */
export function ImportPostmanDialog({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useWorkspace();
  const { toast } = useToast();
  const [raw, setRaw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const run = (contents: string) => {
    try {
      const imported = parsePostman(contents, state.activeWorkspaceId, state.requests.length);
      dispatch({
        type: 'import/merge',
        folders: imported.folders,
        requests: imported.requests,
        environment: imported.environment,
      });
      toast({
        title: `Imported ${imported.name}`,
        description: imported.environment
          ? `${imported.environment.variables.length} variables.`
          : `${imported.folders.length} folders, ${imported.requests.length} requests.`,
        kind: 'success',
      });
      onClose();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Could not read that file.');
    }
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      run(await file.text());
    } catch {
      setError('That file could not be read.');
    }
  };

  return (
    <Dialog
      title="Import from Postman"
      description="A collection (v2.1) or an environment, exported from Postman."
      onClose={onClose}
      testId="dialog-import-postman"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => run(raw)}
            disabled={!raw.trim()}
            data-testid="button-confirm-import-postman"
          >
            Import
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 10 }}>
        <button className="btn" onClick={() => fileRef.current?.click()} data-testid="button-pick-postman-file">
          <Upload size={13} /> Choose a file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => void pickFile(event.target.files?.[0])}
          data-testid="input-postman-file"
        />

        <div className="section-label">Or paste the JSON</div>
        <textarea
          className="editor"
          style={{ minHeight: 150 }}
          value={raw}
          placeholder={SAMPLE}
          spellCheck={false}
          onChange={(event) => {
            setRaw(event.target.value);
            setError(null);
          }}
          aria-label="Postman export"
          data-testid="textarea-postman"
        />

        {error ? (
          <div className="hint" style={{ color: 'var(--red)' }} data-testid="text-postman-error">
            {error}
          </div>
        ) : null}

        <p className="hint">
          The collection becomes a folder, keeping its variables, its auth and its scripts, so everything inside it
          still inherits the way it did in Postman. Requests that set their own auth keep it.
        </p>
        <p className="hint">
          Scripts come across as written and run against a <code>pm</code> shim. They are <strong>not sandboxed</strong>
          {' '}— read them before sending anything from a collection you did not write.
        </p>
      </div>
    </Dialog>
  );
}
