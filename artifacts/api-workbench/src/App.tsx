import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ChevronDown, ChevronRight, Code2, Copy, Database, Folder, History, Menu, Minus, MoreHorizontal, Plus, RefreshCw, Search, Send, Settings2, SlidersHorizontal, Trash2, X, Zap } from 'lucide-react';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type ViewMode = 'request' | 'response';
type ResponseTab = 'body' | 'headers';
type KeyValue = { key: string; value: string; enabled?: boolean };

type RequestRecord = {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  collection: string;
  folder: string;
  headers: KeyValue[];
  params: KeyValue[];
  body: string;
  bodyType: string;
  updatedAt: string;
};
type Collection = { id: string; name: string; color: string; requests: string[] };
type Environment = { id: string; name: string; variables: Record<string, string>; active: boolean };
type HistoryEntry = { id: string; requestId: string; status: number | null; duration: number; timestamp: string; error?: string };
type ResponseState = { status: number; statusText: string; duration: number; size: number; headers: KeyValue[]; body: string; error?: string } | null;

const starterCollections: Collection[] = [
  { id: 'col-platform', name: 'Platform API', color: '#ee7437', requests: ['req-me', 'req-projects', 'req-project'] },
  { id: 'col-billing', name: 'Billing service', color: '#16a9a1', requests: ['req-invoice', 'req-refund'] },
];
const starterRequests: RequestRecord[] = [
  {
    id: 'req-me', name: 'Get current user', method: 'GET', url: '{{baseUrl}}/api/me', collection: 'col-platform', folder: 'Identity',
    headers: [{ key: 'Accept', value: 'application/json' }], params: [], body: '', bodyType: 'none', updatedAt: '2024-06-18T11:42:00.000Z',
  },
  {
    id: 'req-projects', name: 'List projects', method: 'GET', url: '{{baseUrl}}/api/projects', collection: 'col-platform', folder: 'Projects',
    headers: [{ key: 'Accept', value: 'application/json' }, { key: 'X-Workspace', value: 'northstar' }], params: [{ key: 'limit', value: '20' }, { key: 'archived', value: 'false' }], body: '', bodyType: 'none', updatedAt: '2024-06-18T10:09:00.000Z',
  },
  {
    id: 'req-project', name: 'Create project', method: 'POST', url: '{{baseUrl}}/api/projects', collection: 'col-platform', folder: 'Projects',
    headers: [{ key: 'Content-Type', value: 'application/json' }], params: [], body: '{\n  "name": "Signal atlas",\n  "slug": "signal-atlas"\n}', bodyType: 'json', updatedAt: '2024-06-17T16:25:00.000Z',
  },
  {
    id: 'req-invoice', name: 'Find invoice', method: 'GET', url: '{{baseUrl}}/v1/invoices/inv_9028', collection: 'col-billing', folder: 'Invoices',
    headers: [{ key: 'Accept', value: 'application/json' }], params: [], body: '', bodyType: 'none', updatedAt: '2024-06-16T13:18:00.000Z',
  },
  {
    id: 'req-refund', name: 'Issue refund', method: 'POST', url: '{{baseUrl}}/v1/refunds', collection: 'col-billing', folder: 'Payments',
    headers: [{ key: 'Content-Type', value: 'application/json' }, { key: 'Idempotency-Key', value: 'refund-preview-01' }], params: [], body: '{\n  "invoice_id": "inv_9028",\n  "amount": 4800\n}', bodyType: 'json', updatedAt: '2024-06-14T09:04:00.000Z',
  },
];
const starterEnvironments: Environment[] = [
  { id: 'env-local', name: 'Local development', variables: { baseUrl: 'http://localhost:4000', token: 'dev_token_••••' }, active: true },
  { id: 'env-staging', name: 'Staging', variables: { baseUrl: 'https://staging.northstar.dev', token: 'stg_token_••••' }, active: false },
  { id: 'env-production', name: 'Production', variables: { baseUrl: 'https://api.northstar.dev', token: 'prod_token_••••' }, active: false },
];
const starterHistory: HistoryEntry[] = [
  { id: 'hist-1', requestId: 'req-projects', status: 200, duration: 184, timestamp: '2024-06-18T10:09:23.000Z' },
  { id: 'hist-2', requestId: 'req-me', status: 200, duration: 92, timestamp: '2024-06-18T09:51:08.000Z' },
  { id: 'hist-3', requestId: 'req-invoice', status: 404, duration: 241, timestamp: '2024-06-17T15:44:51.000Z' },
];

function readStored<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch {
    return fallback;
  }
}
function cloneRequest(request: RequestRecord): RequestRecord {
  return { ...request, headers: request.headers.map((item) => ({ ...item })), params: request.params.map((item) => ({ ...item })) };
}
function formatRelative(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.max(0, Math.floor(diff / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}
function methodClass(method: string): string {
  return `method-${method.toLowerCase()}`;
}
function variablesIn(value: string, variables: Record<string, string>): string {
  return value.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => variables[key.trim()] ?? `{{${key}}}`);
}

type SidebarProps = {
  requests: RequestRecord[];
  collections: Collection[];
  selectedId: string;
  search: string;
  panel: 'workspace' | 'history';
  onSelect: (id: string) => void;
  onPanel: (panel: 'workspace' | 'history') => void;
  onNew: () => void;
  onSearch: (value: string) => void;
  open: boolean;
  onClose: () => void;
};
function Sidebar({ requests, collections, selectedId, search, panel, onSelect, onPanel, onNew, onSearch, open, onClose }: SidebarProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ 'col-platform': true, 'col-billing': true });
  const filtered = search.trim() ? requests.filter((request) => `${request.name} ${request.url} ${request.method}`.toLowerCase().includes(search.toLowerCase())) : requests;
  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="brand">
        <div className="brand-mark"><Code2 size={17} strokeWidth={2.6} /></div>
        <div><div className="brand-name">API Workbench</div><span className="brand-sub">local workspace</span></div>
        <button className="icon-button mobile-sidebar-toggle" onClick={onClose} data-testid="button-close-sidebar" aria-label="Close sidebar"><X size={17} /></button>
      </div>
      <div className="sidebar-scroll">
        <button className="button button-primary" style={{ width: '100%', marginBottom: 22 }} onClick={onNew} data-testid="button-new-request"><Plus size={15} /> New request</button>
        <div className="section-label">Workspace</div>
        <nav className="side-nav">
          <button className={`side-button ${panel === 'workspace' ? 'active' : ''}`} onClick={() => onPanel('workspace')} data-testid="button-workspace"><Zap size={15} /> Requests <span className="count">{requests.length}</span></button>
          <button className={`side-button ${panel === 'history' ? 'active' : ''}`} onClick={() => onPanel('history')} data-testid="button-history"><History size={15} /> History <span className="count">{Math.min(99, requests.length + 1)}</span></button>
        </nav>
        <div className="section-label">Collections</div>
        {collections.map((collection) => {
          const collectionRequests = filtered.filter((request) => request.collection === collection.id);
          const folders = Array.from(new Set(collectionRequests.map((request) => request.folder)));
          const isOpen = expanded[collection.id] ?? true;
          return (
            <div className="collection" key={collection.id}>
              <button className="collection-title" onClick={() => setExpanded((current) => ({ ...current, [collection.id]: !isOpen }))} data-testid={`button-collection-${collection.id}`}>
                {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}<span className="collection-dot" style={{ background: collection.color }} /><span>{collection.name}</span><span className="count">{collectionRequests.length}</span>
              </button>
              {isOpen && folders.map((folder) => (
                <div key={folder}>
                  <div className="folder-label"><Folder size={12} /> {folder}</div>
                  {collectionRequests.filter((request) => request.folder === folder).map((request) => (
                    <button key={request.id} className={`request-item ${selectedId === request.id && panel === 'workspace' ? 'active' : ''}`} onClick={() => onSelect(request.id)} data-testid={`button-request-${request.id}`}>
                      <span className={`method-mini ${methodClass(request.method)}`}>{request.method}</span><span className="req-name">{request.name}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          );
        })}
        {search && filtered.length === 0 && <div style={{ padding: '20px 10px', color: '#829ba0', fontSize: 11 }}>No requests match “{search}”.</div>}
      </div>
      <div className="sidebar-footer">
        <div className="avatar">AK</div><div className="footer-copy"><strong>Alex Kim</strong>Personal workspace</div><button className="icon-button" style={{ marginLeft: 'auto' }} onClick={() => onSearch('')} data-testid="button-sidebar-settings" aria-label="Clear search"><Settings2 size={15} /></button>
      </div>
    </aside>
  );
}

function KeyValueEditor({ label, items, onChange, testPrefix }: { label: string; items: KeyValue[]; onChange: (items: KeyValue[]) => void; testPrefix: string }) {
  const updateItem = (index: number, field: 'key' | 'value', value: string) => onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  return (
    <div className="form-block">
      <div className="field-label">{label} <span>{items.length ? `${items.length} ${items.length === 1 ? 'entry' : 'entries'}` : 'none'}</span></div>
      <div className="kv-list">
        {items.map((item, index) => (
          <div className="kv-row" key={`${testPrefix}-${index}`}>
            <input value={item.key} onChange={(event) => updateItem(index, 'key', event.target.value)} placeholder="Key" data-testid={`input-${testPrefix}-key-${index}`} aria-label={`${label} key ${index + 1}`} />
            <input value={item.value} onChange={(event) => updateItem(index, 'value', event.target.value)} placeholder="Value" data-testid={`input-${testPrefix}-value-${index}`} aria-label={`${label} value ${index + 1}`} />
            <button className="icon-button remove" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))} data-testid={`button-remove-${testPrefix}-${index}`} aria-label={`Remove ${label} row`}><Minus size={14} /></button>
          </div>
        ))}
      </div>
      <button className="add-row" onClick={() => onChange([...items, { key: '', value: '' }])} data-testid={`button-add-${testPrefix}`}><Plus size={12} /> Add {label.toLowerCase()}</button>
    </div>
  );
}

function RequestComposer({ draft, activeTab, onTab, onChange, onSend, sending }: { draft: RequestRecord; activeTab: string; onTab: (tab: string) => void; onChange: (next: RequestRecord) => void; onSend: () => void; sending: boolean }) {
  const setField = <K extends keyof RequestRecord>(field: K, value: RequestRecord[K]) => onChange({ ...draft, [field]: value, updatedAt: new Date().toISOString() });
  return (
    <section className="panel request-panel">
      <div className="tab-row">
        <button className={`tab ${activeTab === 'params' ? 'active' : ''}`} onClick={() => onTab('params')} data-testid="tab-request-params">Params</button>
        <button className={`tab ${activeTab === 'headers' ? 'active' : ''}`} onClick={() => onTab('headers')} data-testid="tab-request-headers">Headers <span style={{ font: '10px var(--font-mono)', color: 'var(--ink-faint)' }}>{draft.headers.filter((item) => item.key).length}</span></button>
        <button className={`tab ${activeTab === 'body' ? 'active' : ''}`} onClick={() => onTab('body')} data-testid="tab-request-body">Body</button>
        <button className="icon-button" style={{ marginLeft: 'auto', color: 'var(--ink-faint)' }} onClick={() => navigator.clipboard?.writeText(draft.url)} data-testid="button-copy-url" aria-label="Copy request URL"><Copy size={14} /></button>
        <button className="icon-button" style={{ color: 'var(--ink-faint)' }} onClick={() => setField('body', '')} data-testid="button-clear-body" aria-label="Clear body"><Trash2 size={14} /></button>
      </div>
      <div className="composer-scroll">
        <div className="request-meta">
          <select className="method-select" value={draft.method} onChange={(event) => setField('method', event.target.value as HttpMethod)} data-testid="select-request-method" aria-label="Request method">
            {(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as HttpMethod[]).map((method) => <option key={method}>{method}</option>)}
          </select>
          <div className="url-wrap"><input className="url-input" value={draft.url} onChange={(event) => setField('url', event.target.value)} data-testid="input-request-url" aria-label="Request URL" /><button className="button button-teal" onClick={onSend} disabled={sending} data-testid="button-send-request">{sending ? <RefreshCw size={14} className="spin" /> : <Send size={14} />} {sending ? 'Sending' : 'Send'}</button></div>
        </div>
        <div className="form-block">
          <label className="field-label" htmlFor="request-name">Request name <span>saved locally</span></label>
          <input id="request-name" className="modal-input" value={draft.name} onChange={(event) => setField('name', event.target.value)} data-testid="input-request-name" />
        </div>
        {activeTab === 'params' && <KeyValueEditor label="Query parameters" items={draft.params} onChange={(params) => setField('params', params)} testPrefix="params" />}
        {activeTab === 'headers' && <KeyValueEditor label="Request headers" items={draft.headers} onChange={(headers) => setField('headers', headers)} testPrefix="headers" />}
        {activeTab === 'body' && (
          <div className="form-block">
            <div className="body-toolbar"><div className="field-label" style={{ margin: 0 }}>Request body <span>{draft.body.length} chars</span></div><select className="body-select" value={draft.bodyType} onChange={(event) => setField('bodyType', event.target.value)} data-testid="select-body-type"><option value="none">No body</option><option value="json">JSON</option><option value="text">Text</option></select></div>
            <textarea className="body-editor" value={draft.body} onChange={(event) => setField('body', event.target.value)} placeholder={'{\n  "key": "value"\n}'} disabled={draft.bodyType === 'none'} data-testid="textarea-request-body" aria-label="Request body" />
          </div>
        )}
        <div style={{ padding: '2px 16px 22px', color: 'var(--ink-faint)', font: '10px var(--font-mono)' }}>Updated {formatRelative(draft.updatedAt)} · changes persist automatically</div>
      </div>
    </section>
  );
}

function ResponsePanel({ response, activeTab, onTab, onClear }: { response: ResponseState; activeTab: ResponseTab; onTab: (tab: ResponseTab) => void; onClear: () => void }) {
  const success = response && response.status >= 200 && response.status < 400;
  return (
    <section className="panel response-panel">
      <div className="panel-header"><div className="panel-title">Response <small>{response ? 'latest request result' : 'waiting for request'}</small></div><div style={{ display: 'flex', gap: 3 }}><button className="icon-button" onClick={onClear} disabled={!response} data-testid="button-clear-response" aria-label="Clear response"><Trash2 size={14} /></button><button className="icon-button" onClick={() => response && navigator.clipboard?.writeText(response.body)} disabled={!response} data-testid="button-copy-response" aria-label="Copy response"><Copy size={14} /></button></div></div>
      {!response ? <div className="response-empty"><div><div className="empty-mark"><Send size={21} /></div><h3>Response will land here</h3><p>Send the request when you are ready. Status, timing, headers, and the payload will stay in view.</p></div></div> : (
        <div className="response-scroll">
          <div className="response-summary">
            <div className={`status-pill ${success ? 'status-success' : 'status-error'}`} data-testid="status-response">{response.error ? 'NETWORK ERROR' : `${response.status} ${response.statusText}`}</div>
            <div className="metric" data-testid="text-response-duration"><strong>{response.duration} ms</strong>time</div>
            <div className="metric" data-testid="text-response-size"><strong>{response.size > 1024 ? `${(response.size / 1024).toFixed(1)} KB` : `${response.size} B`}</strong>size</div>
            <div className="metric" style={{ marginLeft: 'auto' }}><strong>{response.headers.length}</strong>headers</div>
          </div>
          {response.error && <div className="error-box" data-testid="status-network-error"><strong>Could not reach this endpoint.</strong><div style={{ fontSize: 11, marginTop: 6 }}>{response.error}</div></div>}
          <div className="response-tabs"><button className={`response-tab ${activeTab === 'body' ? 'active' : ''}`} onClick={() => onTab('body')} data-testid="tab-response-body">Body</button><button className={`response-tab ${activeTab === 'headers' ? 'active' : ''}`} onClick={() => onTab('headers')} data-testid="tab-response-headers">Headers ({response.headers.length})</button></div>
          <div className="response-content">
            {activeTab === 'body' ? <pre className="code-block" data-testid="display-response-body">{response.body || '(empty response body)'}</pre> : <table className="header-table" data-testid="table-response-headers"><thead><tr><th>Header</th><th>Value</th></tr></thead><tbody>{response.headers.map((header) => <tr key={header.key}><td>{header.key}</td><td>{header.value}</td></tr>)}</tbody></table>}
          </div>
        </div>
      )}
    </section>
  );
}

function HistoryPanel({ entries, requests, onSelect }: { entries: HistoryEntry[]; requests: RequestRecord[]; onSelect: (id: string) => void }) {
  return (
    <section className="panel" style={{ flex: 1, minHeight: 520 }}>
      <div className="panel-header"><div className="panel-title">Request history <small>Every send, kept on this device</small></div><button className="button button-plain" data-testid="button-history-filter"><SlidersHorizontal size={14} /> Filter</button></div>
      {entries.length === 0 ? <div className="response-empty"><div><div className="empty-mark"><History size={21} /></div><h3>No requests sent yet</h3><p>Requests you send from the workbench will appear here.</p></div></div> : <div className="history-list">{entries.map((entry) => { const request = requests.find((item) => item.id === entry.requestId); if (!request) return null; return <button className="history-row" key={entry.id} onClick={() => onSelect(request.id)} data-testid={`button-history-entry-${entry.id}`}><span className={`method-mini ${methodClass(request.method)}`}>{request.method}</span><span className="history-main"><span className="history-name">{request.name}</span><span className="history-url">{request.url}</span></span><span className={`status-pill ${entry.status && entry.status < 400 ? 'status-success' : 'status-error'}`} data-testid={`status-history-${entry.id}`}>{entry.error ? 'ERR' : entry.status}</span><span className="history-time">{entry.duration}ms</span><span className="history-date">{formatRelative(entry.timestamp)}</span></button>; })}</div>}
    </section>
  );
}

function NewRequestModal({ collections, onClose, onCreate }: { collections: Collection[]; onClose: () => void; onCreate: (name: string, method: HttpMethod, url: string, collection: string) => void }) {
  const [name, setName] = useState('Untitled request');
  const [method, setMethod] = useState<HttpMethod>('GET');
  const [url, setUrl] = useState('https://api.example.com/endpoint');
  const [collection, setCollection] = useState(collections[0]?.id ?? '');
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="new-request-title">
        <div className="modal-header"><div><div className="modal-title" id="new-request-title">New request</div><div className="modal-copy">Start with a clean request in your local workspace.</div></div><button className="icon-button" onClick={onClose} data-testid="button-close-new-request" aria-label="Close new request dialog"><X size={17} /></button></div>
        <div className="modal-body">
          <label className="field-label" htmlFor="new-name">Name</label><input id="new-name" className="modal-input" value={name} onChange={(event) => setName(event.target.value)} data-testid="input-new-request-name" />
          <label className="field-label" htmlFor="new-method">Method</label><select id="new-method" className="modal-input" value={method} onChange={(event) => setMethod(event.target.value as HttpMethod)} data-testid="select-new-request-method">{(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as HttpMethod[]).map((item) => <option key={item}>{item}</option>)}</select>
          <label className="field-label" htmlFor="new-url">URL</label><input id="new-url" className="modal-input" value={url} onChange={(event) => setUrl(event.target.value)} data-testid="input-new-request-url" />
          <label className="field-label" htmlFor="new-collection">Collection</label><select id="new-collection" className="modal-input" value={collection} onChange={(event) => setCollection(event.target.value)} data-testid="select-new-request-collection">{collections.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>
        </div>
        <div className="modal-footer"><button className="button" onClick={onClose} data-testid="button-cancel-new-request">Cancel</button><button className="button button-primary" onClick={() => onCreate(name.trim() || 'Untitled request', method, url.trim(), collection)} data-testid="button-create-request"><Plus size={14} /> Create request</button></div>
      </div>
    </div>
  );
}

function Home() {
  const [requests, setRequests] = useState<RequestRecord[]>(() => readStored('api-workbench-requests', starterRequests));
  const [history, setHistory] = useState<HistoryEntry[]>(() => readStored('api-workbench-history', starterHistory));
  const [environments, setEnvironments] = useState<Environment[]>(() => readStored('api-workbench-environments', starterEnvironments));
  const [selectedId, setSelectedId] = useState(() => readStored('api-workbench-selected', starterRequests[0].id));
  const [draft, setDraft] = useState<RequestRecord | null>(null);
  const [panel, setPanel] = useState<'workspace' | 'history'>('workspace');
  const [viewMode, setViewMode] = useState<ViewMode>('request');
  const [requestTab, setRequestTab] = useState('params');
  const [responseTab, setResponseTab] = useState<ResponseTab>('body');
  const [response, setResponse] = useState<ResponseState>(null);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [newRequestOpen, setNewRequestOpen] = useState(false);
  const [toast, setToast] = useState<{ title: string; text: string; kind: 'success' | 'error' } | null>(null);
  const selected = useMemo(() => requests.find((request) => request.id === selectedId) ?? requests[0], [requests, selectedId]);
  const activeEnvironment: Environment = environments.find((environment) => environment.active) ?? environments[0] ?? starterEnvironments[0];

  useEffect(() => { if (selected) setDraft((current) => current?.id === selected.id ? current : cloneRequest(selected)); }, [selected]);
  useEffect(() => { localStorage.setItem('api-workbench-requests', JSON.stringify(requests)); }, [requests]);
  useEffect(() => { localStorage.setItem('api-workbench-history', JSON.stringify(history)); }, [history]);
  useEffect(() => { localStorage.setItem('api-workbench-environments', JSON.stringify(environments)); }, [environments]);
  useEffect(() => { localStorage.setItem('api-workbench-selected', JSON.stringify(selectedId)); }, [selectedId]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(null), 3800); return () => window.clearTimeout(timer); }, [toast]);

  const updateDraft = (next: RequestRecord) => {
    setDraft(next);
    setRequests((current) => current.map((request) => request.id === next.id ? cloneRequest(next) : request));
  };
  const selectRequest = (id: string) => { setSelectedId(id); setPanel('workspace'); setSidebarOpen(false); setViewMode('request'); };
  const createRequest = (name: string, method: HttpMethod, url: string, collection: string) => {
    const next: RequestRecord = { id: `req-${Date.now()}`, name, method, url, collection, folder: 'New requests', headers: [], params: [], body: '', bodyType: 'none', updatedAt: new Date().toISOString() };
    setRequests((current) => [...current, next]); setSelectedId(next.id); setDraft(next); setNewRequestOpen(false); setPanel('workspace'); setToast({ title: 'Request created', text: `${name} is ready to compose.`, kind: 'success' });
  };
  const chooseEnvironment = (id: string) => setEnvironments((current) => current.map((environment) => ({ ...environment, active: environment.id === id })));
  const sendRequest = async () => {
    if (!draft) return;
    const start = performance.now();
    setSending(true); setViewMode('response'); setResponse(null);
    const urlWithVariables = variablesIn(draft.url, activeEnvironment.variables);
    let finalUrl = urlWithVariables;
    try {
      const parsed = new URL(finalUrl);
      draft.params.filter((param) => param.key.trim() && param.enabled !== false).forEach((param) => parsed.searchParams.set(param.key, variablesIn(param.value, activeEnvironment.variables)));
      finalUrl = parsed.toString();
    } catch {
      // Let fetch surface a clear invalid URL error below.
    }
    const headers = new Headers();
    draft.headers.filter((header) => header.key.trim() && header.enabled !== false).forEach((header) => headers.set(header.key, variablesIn(header.value, activeEnvironment.variables)));
    if (draft.bodyType === 'json' && draft.body.trim() && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    try {
      const result = await fetch(finalUrl, { method: draft.method, headers, body: draft.method === 'GET' || draft.method === 'DELETE' || draft.bodyType === 'none' ? undefined : variablesIn(draft.body, activeEnvironment.variables) });
      const body = await result.text();
      const responseHeaders: KeyValue[] = [];
      result.headers.forEach((value, key) => responseHeaders.push({ key, value }));
      const duration = Math.round(performance.now() - start);
      setResponse({ status: result.status, statusText: result.statusText || 'Response', duration, size: new Blob([body]).size, headers: responseHeaders, body: body || '' });
      setHistory((current) => [{ id: `hist-${Date.now()}`, requestId: draft.id, status: result.status, duration, timestamp: new Date().toISOString() }, ...current].slice(0, 30));
      setToast({ title: result.ok ? 'Request complete' : 'Request returned an error', text: `${result.status} ${result.statusText || 'Response'} in ${duration} ms`, kind: result.ok ? 'success' : 'error' });
    } catch (error) {
      const duration = Math.round(performance.now() - start);
      const message = error instanceof Error ? error.message : 'The browser could not reach this endpoint.';
      setResponse({ status: 0, statusText: 'Network error', duration, size: 0, headers: [], body: '', error: message });
      setHistory((current) => [{ id: `hist-${Date.now()}`, requestId: draft.id, status: null, duration, timestamp: new Date().toISOString(), error: message }, ...current].slice(0, 30));
      setToast({ title: 'Network error', text: message, kind: 'error' });
    } finally { setSending(false); }
  };

  return (
    <div className="app-shell">
      <Sidebar requests={requests} collections={starterCollections} selectedId={selectedId} search={search} panel={panel} onSelect={selectRequest} onPanel={(next) => { setPanel(next); setSidebarOpen(false); }} onNew={() => setNewRequestOpen(true)} onSearch={setSearch} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="main-shell">
        <header className="topbar">
          <button className="icon-button top-icon mobile-sidebar-toggle" onClick={() => setSidebarOpen(true)} data-testid="button-open-sidebar" aria-label="Open sidebar"><Menu size={17} /></button>
          <div className="breadcrumb"><span>Workspace</span><ChevronRight size={13} /><strong>{panel === 'history' ? 'History' : draft?.name ?? 'Request'}</strong></div>
          <div className="top-search"><Search size={15} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search requests, URLs..." data-testid="input-search-requests" /><span className="search-key">⌘ K</span></div>
          <div className="top-actions">
            <span className="env-indicator" aria-hidden="true" />
            <select className="env-select" value={activeEnvironment?.id} onChange={(event) => chooseEnvironment(event.target.value)} data-testid="select-environment" aria-label="Active environment">{environments.map((environment) => <option value={environment.id} key={environment.id}>{environment.name}</option>)}</select>
            <button className="icon-button top-icon" onClick={() => setToast({ title: 'Workspace synced', text: 'Everything is saved locally in this browser.', kind: 'success' })} data-testid="button-sync" aria-label="Sync workspace"><RefreshCw size={15} /></button>
            <button className="icon-button top-icon" onClick={() => setToast({ title: 'Keyboard shortcuts', text: 'Use the request tabs to move between params, headers, and body.', kind: 'success' })} data-testid="button-help" aria-label="Show help"><MoreHorizontal size={16} /></button>
          </div>
        </header>
        <div className="workspace">
          {panel === 'history' ? (
            <><div className="workspace-heading"><div><div className="eyebrow">Activity log</div><h1 className="page-title">History</h1><p className="subcopy">A quiet record of what left the workbench.</p></div><div className="heading-actions"><button className="button" onClick={() => setHistory([])} data-testid="button-clear-history"><Trash2 size={14} /> Clear history</button><button className="button button-primary" onClick={() => setNewRequestOpen(true)} data-testid="button-history-new-request"><Plus size={14} /> New request</button></div></div><HistoryPanel entries={history} requests={requests} onSelect={selectRequest} /></>
          ) : (
            <><div className="workspace-heading"><div><div className="eyebrow">Request workspace <span style={{ color: 'var(--ink-faint)' }}>· {activeEnvironment?.name}</span></div><h1 className="page-title" data-testid="text-workspace-title">{draft?.name ?? 'Request workspace'}</h1><p className="subcopy">Compose precisely. Read the wire clearly.</p></div><div className="heading-actions"><div className="tab-row" style={{ height: 35, padding: 0, border: 0 }}><button className={`tab ${viewMode === 'request' ? 'active' : ''}`} style={{ height: 35 }} onClick={() => setViewMode('request')} data-testid="button-view-request"><Code2 size={13} /> Request</button><button className={`tab ${viewMode === 'response' ? 'active' : ''}`} style={{ height: 35 }} onClick={() => setViewMode('response')} data-testid="button-view-response"><Database size={13} /> Response</button></div><button className="button button-primary" onClick={() => setNewRequestOpen(true)} data-testid="button-workspace-new-request"><Plus size={14} /> New</button></div></div>
              {draft ? <div className="composer-layout" data-view={viewMode}><RequestComposer draft={draft} activeTab={requestTab} onTab={setRequestTab} onChange={updateDraft} onSend={sendRequest} sending={sending} /><ResponsePanel response={response} activeTab={responseTab} onTab={setResponseTab} onClear={() => setResponse(null)} /></div> : <div className="panel" style={{ padding: 24 }}><div className="skeleton" style={{ width: '55%', height: 22 }} /><div className="skeleton" style={{ width: '100%', height: 280, marginTop: 18 }} /><span className="loading-copy">Loading workspace…</span></div>}
            </>
          )}
        </div>
      </main>
      {newRequestOpen && <NewRequestModal collections={starterCollections} onClose={() => setNewRequestOpen(false)} onCreate={createRequest} />}
      {toast && <div className={`toast ${toast.kind}`} role="status" data-testid="status-toast"><strong>{toast.title}</strong>{toast.text}</div>}
    </div>
  );
}

function Router() {
  return <RoutedErrorBoundary><Switch><Route path="/" component={Home} /><Route component={NotFound} /></Switch></RoutedErrorBoundary>;
}
function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}
function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}
export default App;