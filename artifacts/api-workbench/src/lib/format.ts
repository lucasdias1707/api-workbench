export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)} s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

export function formatRelative(iso: string): string {
  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) return '—';
  const diff = Date.now() - timestamp;
  const minutes = Math.max(0, Math.floor(diff / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  if (minutes < 1440 * 30) return `${Math.floor(minutes / 1440)}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Byte length of a string as it would go over the wire. */
export function byteLength(value: string): number {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).length;
  return value.length;
}

export function statusFamily(status: number): 'info' | 'success' | 'redirect' | 'client' | 'server' | 'none' {
  if (status <= 0) return 'none';
  if (status < 200) return 'info';
  if (status < 300) return 'success';
  if (status < 400) return 'redirect';
  if (status < 500) return 'client';
  return 'server';
}

const CONTENT_TYPE_LABELS: Array<[RegExp, string]> = [
  [/json/i, 'JSON'],
  [/html/i, 'HTML'],
  [/xml/i, 'XML'],
  [/javascript/i, 'JS'],
  [/css/i, 'CSS'],
  [/csv/i, 'CSV'],
  [/^image\//i, 'Image'],
  [/^text\//i, 'Text'],
];

export function contentTypeLabel(contentType: string | undefined): string {
  if (!contentType) return 'Unknown';
  for (const [pattern, label] of CONTENT_TYPE_LABELS) {
    if (pattern.test(contentType)) return label;
  }
  return contentType.split(';')[0]?.trim() || 'Unknown';
}

/** Pretty-print JSON, returning the original text when it is not valid JSON. */
export function tryPrettyJson(text: string): { text: string; ok: boolean } {
  const trimmed = text.trim();
  if (!trimmed) return { text, ok: false };
  try {
    return { text: JSON.stringify(JSON.parse(trimmed), null, 2), ok: true };
  } catch {
    return { text, ok: false };
  }
}
