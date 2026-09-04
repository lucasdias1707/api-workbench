import { CodeEditor } from '@/components/request/CodeEditor';

type ScriptEditorProps = {
  preScript: string;
  postScript: string;
  onChange: (patch: { preScript?: string; postScript?: string }) => void;
  /** What the scripts hang off, which decides what the copy says about scope. */
  subject: 'request' | 'folder';
  testPrefix: string;
};

const PRE_PLACEHOLDER = `// carom.set('nonce', Date.now());
// carom.header('X-Nonce', carom.get('nonce'));`;

const POST_PLACEHOLDER = `// const body = carom.json();
// carom.set('token', body.access_token);`;

/**
 * The two script slots, shown the same way on a request and on a folder.
 *
 * Scripts are JavaScript run in the app's own context — see `lib/scripts.ts`.
 * The warning below is the one place a person sees that before writing one, so
 * it stays visible rather than being tucked into a tooltip.
 */
export function ScriptEditor({ preScript, postScript, onChange, subject, testPrefix }: ScriptEditorProps) {
  const scope =
    subject === 'folder'
      ? 'These run around every request in this folder, outside any script the request itself has.'
      : 'These run only for this request, inside any script its folders have.';

  return (
    <div className="pane-pad stack">
      <div className="section-label">Pre-request script</div>
      <CodeEditor
        value={preScript}
        onChange={(value) => onChange({ preScript: value })}
        language="plain"
        placeholder={PRE_PLACEHOLDER}
        ariaLabel="Pre-request script"
        testId={`${testPrefix}-pre-script`}
        style={{ minHeight: 130 }}
      />

      <div className="section-label">Post-response script</div>
      <CodeEditor
        value={postScript}
        onChange={(value) => onChange({ postScript: value })}
        language="plain"
        placeholder={POST_PLACEHOLDER}
        ariaLabel="Post-response script"
        testId={`${testPrefix}-post-script`}
        style={{ minHeight: 130 }}
      />

      <p className="hint">
        {scope} Read and write variables with <code>carom.get</code> and <code>carom.set</code>, add a header with{' '}
        <code>carom.header</code>, and read the response with <code>carom.json()</code>. Postman&rsquo;s{' '}
        <code>pm.*</code> works too, so imported scripts run unchanged.
      </p>
      <p className="hint" data-testid="script-warning">
        <strong>Scripts are not sandboxed.</strong> They run with everything this app can reach, including the network.
        Treat a script that came in with an imported collection as code from whoever wrote it.
      </p>
    </div>
  );
}
