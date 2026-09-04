import { useMemo } from 'react';
import { Wand2 } from 'lucide-react';
import { CodeEditor } from '@/components/request/CodeEditor';
import { useWorkspace } from '@/state/workspace-store';
import { KeyValueTable } from '@/components/request/KeyValueTable';
import { tryPrettyJson } from '@/lib/format';
import type { BodyType, KeyValue, RequestRecord } from '@/types';
import { BODY_TYPES } from '@/types';

const BODY_LABELS: Record<BodyType, string> = {
  none: 'No body',
  json: 'JSON',
  text: 'Plain text',
  xml: 'XML',
  form: 'Form URL encoded',
  multipart: 'Multipart form',
  graphql: 'GraphQL',
};

type BodyEditorProps = {
  request: RequestRecord;
  onChange: (patch: Partial<RequestRecord>) => void;
};

export function BodyEditor({ request, onChange }: BodyEditorProps) {
  const { variableTable } = useWorkspace();
  const jsonError = useMemo(() => {
    if (request.bodyType !== 'json' || !request.body.trim()) return null;
    try {
      JSON.parse(request.body);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Invalid JSON';
    }
  }, [request.body, request.bodyType]);

  const setRows = (field: 'form' | 'multipart') => (items: KeyValue[]) => onChange({ [field]: items });

  return (
    <div className="pane-pad stack">
      <div className="section-label">
        Body
        <span className="spacer" />
        <select
          className="select"
          value={request.bodyType}
          onChange={(event) => onChange({ bodyType: event.target.value as BodyType })}
          aria-label="Body type"
          data-testid="select-body-type"
        >
          {BODY_TYPES.map((type) => (
            <option key={type} value={type}>
              {BODY_LABELS[type]}
            </option>
          ))}
        </select>
        {request.bodyType === 'json' ? (
          <button
            className="btn btn-sm"
            onClick={() => onChange({ body: tryPrettyJson(request.body).text })}
            disabled={!request.body.trim()}
            data-testid="button-format-json"
          >
            <Wand2 size={12} /> Format
          </button>
        ) : null}
      </div>

      {request.bodyType === 'none' ? (
        <p className="hint">
          This request is sent without a body. Pick a body type above to send JSON, a form, or a GraphQL query.
        </p>
      ) : null}

      {request.bodyType === 'form' ? (
        <KeyValueTable items={request.form} onChange={setRows('form')} testPrefix="form" keyPlaceholder="Field" />
      ) : null}

      {request.bodyType === 'multipart' ? (
        <>
          <KeyValueTable items={request.multipart} onChange={setRows('multipart')} testPrefix="multipart" keyPlaceholder="Field" />
          <p className="hint">Multipart fields are sent as text values. File uploads are not supported yet.</p>
        </>
      ) : null}

      {request.bodyType === 'graphql' ? (
        <>
          <div>
            <div className="section-label">Query</div>
            <CodeEditor
              variables={variableTable}
              value={request.graphql.query}
              onChange={(query) => onChange({ graphql: { ...request.graphql, query } })}
              ariaLabel="GraphQL query"
              testId="textarea-graphql-query"
            />
          </div>
          <div>
            <div className="section-label">Variables (JSON)</div>
            <CodeEditor
              variables={variableTable}
              value={request.graphql.variables}
              onChange={(variables) => onChange({ graphql: { ...request.graphql, variables } })}
              language="json"
              style={{ minHeight: 110 }}
              ariaLabel="GraphQL variables"
              testId="textarea-graphql-variables"
            />
          </div>
        </>
      ) : null}

      {(['json', 'text', 'xml'] as BodyType[]).includes(request.bodyType) ? (
        <div>
          <CodeEditor
            variables={variableTable}
            value={request.body}
            onChange={(body) => onChange({ body })}
            language={request.bodyType === 'json' ? 'json' : 'plain'}
            invalid={Boolean(jsonError)}
            placeholder={request.bodyType === 'json' ? '{\n  "key": "value"\n}' : 'Request payload'}
            ariaLabel="Request body"
            testId="textarea-request-body"
          />
          {jsonError ? (
            <div className="hint" style={{ color: 'var(--red)', marginTop: 6 }} data-testid="text-json-error">
              {jsonError}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
