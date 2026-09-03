import type { Auth, AuthType, RequestRecord } from '@/types';

const AUTH_LABELS: Record<AuthType, string> = {
  none: 'No auth',
  bearer: 'Bearer token',
  basic: 'Basic auth',
  apikey: 'API key',
};

type AuthEditorProps = {
  request: RequestRecord;
  onChange: (patch: Partial<RequestRecord>) => void;
};

export function AuthEditor({ request, onChange }: AuthEditorProps) {
  const auth = request.auth;
  const setAuth = (patch: Partial<Auth>) => onChange({ auth: { ...auth, ...patch } });

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
          {(Object.keys(AUTH_LABELS) as AuthType[]).map((type) => (
            <option key={type} value={type}>
              {AUTH_LABELS[type]}
            </option>
          ))}
        </select>
      </div>

      {auth.type === 'none' ? (
        <p className="hint">
          No credentials are attached. Any <code>Authorization</code> header you add on the Headers tab is still sent.
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

      <p className="hint">
        Credentials support <code>{'{{variables}}'}</code>, so tokens can live in an environment instead of the request.
      </p>
    </div>
  );
}
