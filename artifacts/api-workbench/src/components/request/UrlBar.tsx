import { Loader2, Send, Square } from 'lucide-react';
import { TemplateField } from '@/components/request/TemplateField';
import { HTTP_METHODS, type HttpMethod, type VariableTable } from '@/types';

type UrlBarProps = {
  method: HttpMethod;
  url: string;
  variables: VariableTable;
  sending: boolean;
  onMethodChange: (method: HttpMethod) => void;
  onUrlChange: (url: string) => void;
  /** Fired when the URL is done being edited, so its query can be extracted. */
  onUrlCommit: (url: string) => void;
  onSend: () => void;
  onCancel: () => void;
};

export function UrlBar({
  method,
  url,
  variables,
  sending,
  onMethodChange,
  onUrlChange,
  onUrlCommit,
  onSend,
  onCancel,
}: UrlBarProps) {
  return (
    <div className="urlbar">
      <select
        className={`method-select m-${method.toLowerCase()}`}
        value={method}
        onChange={(event) => onMethodChange(event.target.value as HttpMethod)}
        aria-label="HTTP method"
        data-testid="select-request-method"
      >
        {HTTP_METHODS.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>

      <TemplateField
        value={url}
        table={variables}
        onChange={onUrlChange}
        onCommit={onUrlCommit}
        onSubmit={onSend}
        placeholder="https://api.example.com/resource"
        ariaLabel="Request URL"
        testId="input-request-url"
        className="url-field"
      />

      {sending ? (
        <button className="btn" onClick={onCancel} data-testid="button-cancel-request">
          <Square size={12} /> Cancel
        </button>
      ) : (
        <button className="btn btn-primary" onClick={onSend} data-testid="button-send-request">
          <Send size={13} /> Send
        </button>
      )}
      {sending ? <Loader2 size={14} className="spin" aria-hidden="true" /> : null}
    </div>
  );
}
