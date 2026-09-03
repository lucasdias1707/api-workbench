import { useState } from 'react';
import { Copy, Terminal } from 'lucide-react';
import { AuthEditor } from '@/components/request/AuthEditor';
import { BodyEditor } from '@/components/request/BodyEditor';
import { KeyValueTable } from '@/components/request/KeyValueTable';
import { UrlBar } from '@/components/request/UrlBar';
import { useToast } from '@/components/common/Toaster';
import { toCurl } from '@/lib/curl';
import { prepareRequest } from '@/lib/http';
import { folderPath } from '@/state/selectors';
import { useWorkspace } from '@/state/workspace-store';
import type { HttpMethod, KeyValue, RequestRecord } from '@/types';

type RequestTab = 'params' | 'body' | 'headers' | 'auth' | 'docs';

const TABS: Array<{ id: RequestTab; label: string }> = [
  { id: 'params', label: 'Params' },
  { id: 'body', label: 'Body' },
  { id: 'headers', label: 'Headers' },
  { id: 'auth', label: 'Auth' },
  { id: 'docs', label: 'Docs' },
];

type RequestPaneProps = {
  request: RequestRecord;
  sending: boolean;
  onSend: () => void;
  onCancel: () => void;
};

export function RequestPane({ request, sending, onSend, onCancel }: RequestPaneProps) {
  const { state, dispatch, variables } = useWorkspace();
  const { toast } = useToast();
  const [tab, setTab] = useState<RequestTab>('params');

  const patch = (changes: Partial<RequestRecord>) => dispatch({ type: 'request/update', id: request.id, patch: changes });
  const setRows = (field: 'params' | 'headers') => (items: KeyValue[]) => patch({ [field]: items });

  const activeCount = (items: KeyValue[]) => items.filter((item) => item.enabled && item.key.trim()).length;
  const badges: Partial<Record<RequestTab, number>> = {
    params: activeCount(request.params),
    headers: activeCount(request.headers),
  };

  const copyAsCurl = async () => {
    try {
      await navigator.clipboard.writeText(toCurl(prepareRequest(request, variables)));
      toast({ title: 'Copied as curl', kind: 'success' });
    } catch (error) {
      toast({
        title: 'Could not copy',
        description: error instanceof Error ? error.message : undefined,
        kind: 'error',
      });
    }
  };

  const path = folderPath(state, request.folderId);

  return (
    <section className="pane" aria-label="Request">
      <UrlBar
        method={request.method}
        url={request.url}
        variables={variables}
        sending={sending}
        onMethodChange={(method: HttpMethod) => patch({ method })}
        onUrlChange={(url) => patch({ url })}
        onSend={onSend}
        onCancel={onCancel}
      />

      <div className="pane-tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            className={`pane-tab ${tab === item.id ? 'active' : ''}`}
            onClick={() => setTab(item.id)}
            data-testid={`tab-request-${item.id}`}
          >
            {item.label}
            {badges[item.id] ? <span className="badge">{badges[item.id]}</span> : null}
            {item.id === 'body' && request.bodyType !== 'none' ? <span className="badge">{request.bodyType}</span> : null}
            {item.id === 'auth' && request.auth.type !== 'none' ? <span className="badge">{request.auth.type}</span> : null}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button className="icon-btn" onClick={copyAsCurl} title="Copy as curl" aria-label="Copy as curl" data-testid="button-copy-curl">
          <Terminal size={14} />
        </button>
        <button
          className="icon-btn"
          onClick={() => {
            navigator.clipboard?.writeText(prepareRequest(request, variables).url);
            toast({ title: 'URL copied', kind: 'success' });
          }}
          title="Copy resolved URL"
          aria-label="Copy resolved URL"
          data-testid="button-copy-url"
        >
          <Copy size={14} />
        </button>
      </div>

      <div className="pane-body">
        {tab === 'params' ? (
          <div className="pane-pad stack">
            <div className="section-label">Query parameters</div>
            <KeyValueTable items={request.params} onChange={setRows('params')} testPrefix="params" />
            <p className="hint">Parameters are appended to the URL when the request is sent, after variables resolve.</p>
          </div>
        ) : null}

        {tab === 'headers' ? (
          <div className="pane-pad stack">
            <div className="section-label">Request headers</div>
            <KeyValueTable items={request.headers} onChange={setRows('headers')} testPrefix="headers" keyPlaceholder="Header" />
            <p className="hint">
              A <code>Content-Type</code> matching the body type is added automatically unless you set one here.
            </p>
          </div>
        ) : null}

        {tab === 'body' ? <BodyEditor request={request} onChange={patch} /> : null}
        {tab === 'auth' ? <AuthEditor request={request} onChange={patch} /> : null}

        {tab === 'docs' ? (
          <div className="pane-pad stack">
            <div className="section-label">Name</div>
            <input
              className="field"
              value={request.name}
              onChange={(event) => patch({ name: event.target.value })}
              aria-label="Request name"
              data-testid="input-request-name"
            />
            <div className="section-label">Description</div>
            <textarea
              className="editor"
              style={{ minHeight: 150, fontFamily: 'var(--font-sans)' }}
              value={request.description}
              placeholder="What is this request for? Who owns the endpoint?"
              onChange={(event) => patch({ description: event.target.value })}
              aria-label="Request description"
              data-testid="textarea-request-description"
            />
            <p className="hint">
              {path.length > 0 ? `In ${path.join(' / ')} · ` : ''}Saved locally in this browser.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
