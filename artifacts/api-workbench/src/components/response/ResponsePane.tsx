import { useMemo, useState } from 'react';
import { Copy, Download, History, Search, Trash2, Waypoints } from 'lucide-react';
import { JsonTree } from '@/components/response/JsonTree';
import { useToast } from '@/components/common/Toaster';
import { byteLength, contentTypeLabel, formatBytes, formatDuration, formatRelative, statusFamily, tryPrettyJson } from '@/lib/format';
import { useWorkspace } from '@/state/workspace-store';
import type { ScriptLogEntry, ScriptTest } from '@/lib/scripts';
import type { ResponseRecord } from '@/types';

type ResponseTab = 'pretty' | 'raw' | 'preview' | 'headers' | 'cookies' | 'console' | 'history';

type ResponsePaneProps = {
  requestId: string;
  sending: boolean;
  /** What the last run's scripts printed and asserted. */
  scriptLogs?: ScriptLogEntry[];
  scriptTests?: ScriptTest[];
};

function headerValue(response: ResponseRecord, name: string): string | undefined {
  return response.headers.find((header) => header.key.toLowerCase() === name)?.value;
}

/** Split a `set-cookie` header into its name, value and attributes. */
function parseCookie(raw: string): { name: string; value: string; attributes: string } {
  const [pair, ...rest] = raw.split(';');
  const separator = pair.indexOf('=');
  return {
    name: separator === -1 ? pair.trim() : pair.slice(0, separator).trim(),
    value: separator === -1 ? '' : pair.slice(separator + 1).trim(),
    attributes: rest.map((part) => part.trim()).join('; '),
  };
}

export function ResponsePane({ requestId, sending, scriptLogs = [], scriptTests = [] }: ResponsePaneProps) {
  const { responsesFor, dispatch } = useWorkspace();
  const { toast } = useToast();
  const [tab, setTab] = useState<ResponseTab>('pretty');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [wrap, setWrap] = useState(true);

  const responses = responsesFor(requestId);
  const response = responses.find((item) => item.id === selectedId) ?? responses[0] ?? null;

  const contentType = response ? headerValue(response, 'content-type') : undefined;
  const parsed = useMemo(() => {
    if (!response || response.error) return null;
    try {
      return JSON.parse(response.body) as unknown;
    } catch {
      return null;
    }
  }, [response]);

  const cookies = useMemo(
    () => (response?.headers ?? []).filter((header) => header.key.toLowerCase() === 'set-cookie').map((header) => parseCookie(header.value)),
    [response],
  );

  if (!response) {
    return (
      <section className="pane" aria-label="Response">
        <div className="empty" data-testid="empty-response">
          <div>
            <div className="empty-icon">
              <Waypoints size={19} />
            </div>
            <h3>{sending ? 'Sending…' : 'No response yet'}</h3>
            <p>Send the request and the status, timing, headers and payload will land here.</p>
          </div>
        </div>
      </section>
    );
  }

  const family = statusFamily(response.status);
  const prettyText = parsed !== null ? tryPrettyJson(response.body).text : response.body;
  const filteredHeaders = response.headers.filter((header) =>
    `${header.key} ${header.value}`.toLowerCase().includes(filter.toLowerCase()),
  );

  const download = () => {
    const blob = new Blob([response.body], { type: contentType ?? 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `response-${response.status}.${parsed !== null ? 'json' : 'txt'}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const tabs: Array<{ id: ResponseTab; label: string; count?: number }> = [
    { id: 'pretty', label: 'Pretty' },
    { id: 'raw', label: 'Raw' },
    { id: 'preview', label: 'Preview' },
    { id: 'headers', label: 'Headers', count: response.headers.length },
    { id: 'cookies', label: 'Cookies', count: cookies.length },
    { id: 'console', label: 'Console', count: scriptLogs.length + scriptTests.length },
    { id: 'history', label: 'History', count: responses.length },
  ];

  return (
    <section className="pane" aria-label="Response">
      <div className="status-line">
        <span className={`status-code ${response.error ? 'none' : family}`} data-testid="status-response">
          {response.error ? 'FAILED' : `${response.status} ${response.statusText}`}
        </span>
        <span className="status-meta" data-testid="text-response-duration">
          {formatDuration(response.durationMs)}
        </span>
        <span className="status-meta" data-testid="text-response-size">
          {formatBytes(response.size)}
        </span>
        <span className="chip" title={contentType ?? 'No content type'}>
          {contentTypeLabel(contentType)}
        </span>
        <span className="chip" title={`Sent through the ${response.via}`}>
          {response.via}
        </span>
        <span className="spacer" />
        <button className="icon-btn" onClick={() => setWrap((current) => !current)} title="Toggle line wrapping" aria-label="Toggle line wrapping">
          <Waypoints size={14} />
        </button>
        <button
          className="icon-btn"
          onClick={() => {
            navigator.clipboard?.writeText(response.body);
            toast({ title: 'Response copied', kind: 'success' });
          }}
          title="Copy body"
          aria-label="Copy response body"
          data-testid="button-copy-response"
        >
          <Copy size={14} />
        </button>
        <button className="icon-btn" onClick={download} title="Download body" aria-label="Download response body">
          <Download size={14} />
        </button>
        <button
          className="icon-btn"
          onClick={() => {
            dispatch({ type: 'response/clear', requestId });
            setSelectedId(null);
          }}
          title="Clear responses"
          aria-label="Clear responses"
          data-testid="button-clear-response"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {response.error ? (
        <div className="error-box" data-testid="status-network-error">
          <strong>Could not reach this endpoint</strong>
          {response.error}
        </div>
      ) : null}

      <div className="pane-tabs">
        {tabs.map((item) => (
          <button
            key={item.id}
            className={`pane-tab ${tab === item.id ? 'active' : ''}`}
            onClick={() => setTab(item.id)}
            data-testid={`tab-response-${item.id}`}
          >
            {item.label}
            {item.count ? <span className="badge">{item.count}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'pretty' || tab === 'headers' ? (
        <div className="pane-toolbar">
          <Search size={13} style={{ color: 'var(--text-faint)' }} />
          <input
            className="field"
            style={{ height: 24 }}
            value={filter}
            placeholder={tab === 'headers' ? 'Filter headers' : 'Highlight in body'}
            onChange={(event) => setFilter(event.target.value)}
            aria-label="Filter response"
            data-testid="input-response-filter"
          />
        </div>
      ) : null}

      <div className="pane-body">
        {tab === 'pretty' ? (
          parsed !== null ? (
            <JsonTree data={parsed} term={filter} />
          ) : (
            <pre className={`code ${wrap ? 'wrap' : ''}`} data-testid="display-response-body">
              {prettyText || '(empty response body)'}
            </pre>
          )
        ) : null}

        {tab === 'console' ? (
          <div className="pane-pad stack" data-testid="script-console">
            {scriptTests.length === 0 && scriptLogs.length === 0 ? (
              <p className="hint">
                Nothing was printed. <code>console.log</code> and <code>pm.test</code> from this request&rsquo;s scripts,
                and from the folders around it, show up here after a send.
              </p>
            ) : null}
            {scriptTests.map((test, index) => (
              <div key={`test-${index}`} className="script-line" data-testid="script-test">
                <span className={`status-code ${test.passed ? 'success' : 'client'}`}>
                  {test.passed ? 'PASS' : 'FAIL'}
                </span>
                <span className="truncate">{test.name}</span>
                {test.error ? <span className="status-meta">{test.error}</span> : null}
                <span className="status-meta">{test.source}</span>
              </div>
            ))}
            {scriptLogs.map((entry, index) => (
              <div key={`log-${index}`} className="script-line" data-testid="script-log">
                <span className={`chip ${entry.level === 'error' ? 'danger' : ''}`}>{entry.source}</span>
                <pre className="code wrap" style={{ padding: 0, background: 'none', border: 'none' }}>
                  {entry.text}
                </pre>
              </div>
            ))}
          </div>
        ) : null}

        {tab === 'raw' ? (
          <pre className={`code ${wrap ? 'wrap' : ''}`} data-testid="display-response-raw">
            {response.body || '(empty response body)'}
          </pre>
        ) : null}

        {tab === 'preview' ? <Preview body={response.body} contentType={contentType} /> : null}

        {tab === 'headers' ? (
          <table className="headers-table" data-testid="table-response-headers">
            <thead>
              <tr>
                <th>Header</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {filteredHeaders.map((header) => (
                <tr key={header.id}>
                  <td>{header.key}</td>
                  <td>{header.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        {tab === 'cookies' ? (
          cookies.length === 0 ? (
            <div className="empty">
              <div>
                <p>This response did not set any cookies.</p>
              </div>
            </div>
          ) : (
            <table className="headers-table" data-testid="table-response-cookies">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Value</th>
                  <th>Attributes</th>
                </tr>
              </thead>
              <tbody>
                {cookies.map((cookie) => (
                  <tr key={`${cookie.name}-${cookie.value}`}>
                    <td>{cookie.name}</td>
                    <td>{cookie.value}</td>
                    <td>{cookie.attributes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : null}

        {tab === 'history' ? (
          <div data-testid="list-response-history">
            {responses.map((item) => (
              <button
                key={item.id}
                className={`history-row ${item.id === response.id ? 'active' : ''}`}
                onClick={() => setSelectedId(item.id)}
              >
                <span className={`status-code ${item.error ? 'none' : statusFamily(item.status)}`} style={{ width: 34 }}>
                  {item.error ? 'ERR' : item.status}
                </span>
                <span className="mono truncate" style={{ flex: 1, fontSize: 11 }}>
                  {item.url}
                </span>
                <span className="status-meta">{formatDuration(item.durationMs)}</span>
                <span className="status-meta">{formatBytes(item.size)}</span>
                <span className="status-meta" style={{ width: 66, textAlign: 'right' }}>
                  {formatRelative(item.sentAt)}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {response.truncated ? (
          <p className="hint" style={{ padding: '8px 12px' }}>
            <History size={11} /> This body was truncated to {formatBytes(byteLength(response.body))} when it was saved.
          </p>
        ) : null}
      </div>
    </section>
  );
}

/** Render HTML and images inline; everything else falls back to plain text. */
function Preview({ body, contentType }: { body: string; contentType: string | undefined }) {
  if (contentType && /html/i.test(contentType)) {
    return (
      <iframe
        title="Response preview"
        sandbox=""
        srcDoc={body}
        style={{ width: '100%', height: '100%', border: 0, background: 'white' }}
        data-testid="frame-response-preview"
      />
    );
  }
  if (contentType && /^image\//i.test(contentType)) {
    return (
      <div className="empty">
        <p>Binary image responses are not rendered yet.</p>
      </div>
    );
  }
  return (
    <pre className="code wrap" data-testid="display-response-preview">
      {body || '(empty response body)'}
    </pre>
  );
}
