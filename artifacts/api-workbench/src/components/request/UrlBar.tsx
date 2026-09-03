import { useRef } from 'react';
import { Loader2, Send, Square } from 'lucide-react';
import { tokenize } from '@/lib/template';
import { HTTP_METHODS, type HttpMethod } from '@/types';

type UrlBarProps = {
  method: HttpMethod;
  url: string;
  variables: Record<string, string>;
  sending: boolean;
  onMethodChange: (method: HttpMethod) => void;
  onUrlChange: (url: string) => void;
  onSend: () => void;
  onCancel: () => void;
};

export function UrlBar({ method, url, variables, sending, onMethodChange, onUrlChange, onSend, onCancel }: UrlBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const tokens = tokenize(url, variables);

  // Keep the highlighted mirror aligned with the real input while scrolling.
  const syncScroll = () => {
    if (mirrorRef.current && inputRef.current) mirrorRef.current.scrollLeft = inputRef.current.scrollLeft;
  };

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

      <div className="url-field">
        <div className="url-mirror" ref={mirrorRef} aria-hidden="true">
          {tokens.map((token, index) =>
            token.kind === 'variable' ? (
              <span
                key={index}
                className={`url-var ${token.resolved === null ? 'missing' : ''}`}
                title={token.resolved === null ? `${token.name} is not defined` : `${token.name} = ${token.resolved}`}
              >
                {token.text}
              </span>
            ) : (
              <span key={index}>{token.text}</span>
            ),
          )}
        </div>
        <input
          ref={inputRef}
          value={url}
          spellCheck={false}
          autoComplete="off"
          placeholder="https://api.example.com/resource"
          onChange={(event) => onUrlChange(event.target.value)}
          onScroll={syncScroll}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onSend();
            }
          }}
          aria-label="Request URL"
          data-testid="input-request-url"
        />
      </div>

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
