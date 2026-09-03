import type { JsonTheme, Settings } from '@/types';

/** Named starting points for the response viewer's syntax colours. */
export const JSON_THEME_PRESETS: Record<string, JsonTheme> = {
  Workbench: {
    key: '#a97ad6',
    string: '#57b981',
    number: '#e0913f',
    boolean: '#5b9bd5',
    null: '#8a919e',
    punctuation: '#8a919e',
  },
  Monokai: {
    key: '#f92672',
    string: '#e6db74',
    number: '#ae81ff',
    boolean: '#66d9ef',
    null: '#75715e',
    punctuation: '#a1a196',
  },
  Nord: {
    key: '#88c0d0',
    string: '#a3be8c',
    number: '#b48ead',
    boolean: '#81a1c1',
    null: '#6d7688',
    punctuation: '#7b8494',
  },
  Solarized: {
    key: '#268bd2',
    string: '#2aa198',
    number: '#d33682',
    boolean: '#b58900',
    null: '#93a1a1',
    punctuation: '#93a1a1',
  },
};

export function defaultJsonTheme(): JsonTheme {
  return { ...JSON_THEME_PRESETS.Workbench };
}

export function defaultSettings(): Settings {
  return {
    theme: 'dark',
    layout: 'horizontal',
    sendMode: 'auto',
    followRedirects: true,
    timeoutMs: 30_000,
    persistResponses: true,
    jsonTheme: defaultJsonTheme(),
  };
}
