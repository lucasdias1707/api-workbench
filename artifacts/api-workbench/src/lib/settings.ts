import type { Settings } from '@/types';

export function defaultSettings(): Settings {
  return {
    theme: 'dark',
    layout: 'horizontal',
    sendMode: 'auto',
    followRedirects: true,
    timeoutMs: 30_000,
    persistResponses: true,
  };
}
