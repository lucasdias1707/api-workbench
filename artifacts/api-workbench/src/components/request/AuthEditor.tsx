import { resolveAuth } from '@/lib/inherit';
import type { Auth, AuthType, Folder } from '@/types';

const AUTH_LABELS: Record<AuthType, string> = {
  inherit: 'Inherit from parent',
  none: 'No auth',
  bearer: 'Bearer token',
  basic: 'Basic auth',
  apikey: 'API key',
};

type AuthEditorProps = {
  auth: Auth;
  onChange: (auth: Auth) => void;
  /**
   * The folders to inherit through, nearest first. Empty means there is
   * nothing above this record, so "Inherit" is not offered.
   */
  chain?: Folder[];
  /** What the thing being edited is, for the copy. */
  subject: 'request' | 'folder';
};

export function AuthEditor({ auth, onChange, chain = [], subject }: AuthEditorProps) {
  const setAuth = (patch: Partial<Auth>) => onChange({ ...auth, ...patch });
  const inherited = resolveAuth({ ...auth, type: 'inherit' }, chain);
  const canInherit = chain.length > 0;

  const types = (Object.keys(AUTH_LABELS) as AuthType[]).filter((type) => type !== 'inherit' || canInherit);

  /**
   * Stop inheriting, keeping what was being inherited as a starting point.
   * Copying rather than clearing is the point of the button: someone detaching
   * usually wants to change one field of what the folder already sends.
   */
  const detach = () => onChange({ ...inherited.auth });

  return (
    <div className="pane-pad stack">
      <div className="section-label">
        Authentication
        <span className="spacer" />
        <select
          className="select"
          value={auth.type}
          onChange={(event) => setAuth({ type: event.target.value as AuthType })}
          aria-label="Auth type"
          data-testid="select-auth-type"
        >
          {types.map((type) => (
            <option key={type} value={type}>
              {AUTH_LABELS[type]}
            </option>
          ))}
        </select>
      </div>

      {auth.type === 'inherit' ? (
        <div className="inherit-note" data-testid="auth-inherited">
          {inherited.from === 'folder' ? (
            <>
              <p>
                Using <strong>{AUTH_LABELS[inherited.auth.type]}</strong> from the folder{' '}
                <strong>{inherited.folder.name}</strong>. Editing it there changes every{' '}
                {subject === 'folder' ? 'folder and request' : 'request'} beneath that still inherits.
              </p>
              <button className="btn btn-sm" onClick={detach} data-testid="button-auth-detach">
                Give this {subject} its own
              </button>
            </>
          ) : (
            <p>
              No folder above this {subject} sets any authentication, so nothing is attached. Pick a type here, or set
              one on a folder to cover everything inside it at once.
            </p>
          )}
        </div>
      ) : null}

      {auth.type === 'none' ? (
        <p className="hint">
          No credentials are attached. Any <code>Authorization</code> header you add on the Headers tab is still sent.
          {canInherit ? ' This overrides the folder, which is what makes it different from inheriting.' : ''}
        </p>
      ) : null}

      {auth.type === 'bearer' ? (
        <label className="stack" style={{ gap: 6 }}>
          <span className="section-label" style={{ margin: 0 }}>
            Token
          </span>
          <input
            className="field mono"
            value={auth.token}
            spellCheck={false}
            placeholder="{{token}}"
            onChange={(event) => setAuth({ token: event.target.value })}
            data-testid="input-auth-token"
          />
        </label>
      ) : null}

      {auth.type === 'basic' ? (
        <div className="stack" style={{ gap: 10 }}>
          <label className="stack" style={{ gap: 6 }}>
            <span className="section-label" style={{ margin: 0 }}>
              Username
            </span>
            <input
              className="field mono"
              value={auth.username}
              spellCheck={false}
              onChange={(event) => setAuth({ username: event.target.value })}
              data-testid="input-auth-username"
            />
          </label>
          <label className="stack" style={{ gap: 6 }}>
            <span className="section-label" style={{ margin: 0 }}>
              Password
            </span>
            <input
              className="field mono"
              type="password"
              value={auth.password}
              onChange={(event) => setAuth({ password: event.target.value })}
              data-testid="input-auth-password"
            />
          </label>
        </div>
      ) : null}

      {auth.type === 'apikey' ? (
        <div className="stack" style={{ gap: 10 }}>
          <label className="stack" style={{ gap: 6 }}>
            <span className="section-label" style={{ margin: 0 }}>
              Key name
            </span>
            <input
              className="field mono"
              value={auth.apiKeyName}
              spellCheck={false}
              placeholder="X-Api-Key"
              onChange={(event) => setAuth({ apiKeyName: event.target.value })}
              data-testid="input-auth-key-name"
            />
          </label>
          <label className="stack" style={{ gap: 6 }}>
            <span className="section-label" style={{ margin: 0 }}>
              Key value
            </span>
            <input
              className="field mono"
              value={auth.apiKeyValue}
              spellCheck={false}
              onChange={(event) => setAuth({ apiKeyValue: event.target.value })}
              data-testid="input-auth-key-value"
            />
          </label>
          <label className="stack" style={{ gap: 6 }}>
            <span className="section-label" style={{ margin: 0 }}>
              Send in
            </span>
            <select
              className="select"
              value={auth.apiKeyIn}
              onChange={(event) => setAuth({ apiKeyIn: event.target.value as 'header' | 'query' })}
              data-testid="select-auth-key-in"
            >
              <option value="header">Header</option>
              <option value="query">Query parameter</option>
            </select>
          </label>
        </div>
      ) : null}

      {auth.type !== 'inherit' ? (
        <p className="hint">
          Credentials support <code>{'{{variables}}'}</code>, so tokens can live in an environment instead of the{' '}
          {subject}.
        </p>
      ) : null}
    </div>
  );
}
