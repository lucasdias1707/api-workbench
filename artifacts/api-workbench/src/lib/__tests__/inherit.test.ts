import { describe, expect, it } from 'vitest';
import { createFolder, createRequest, emptyAuth } from '@/lib/factories';
import { prepareRequest } from '@/lib/http';
import { resolveAuth, scriptChain } from '@/lib/inherit';
import type { Auth, Folder } from '@/types';

const bearer = (token: string): Auth => ({ ...emptyAuth(), type: 'bearer', token });
const folder = (name: string, overrides: Partial<Folder> = {}): Folder => ({
  ...createFolder('ws', name, null, 0),
  ...overrides,
});

describe('resolveAuth', () => {
  it('keeps a request that chose its own, whatever the folder says', () => {
    const chain = [folder('Outer', { auth: bearer('folder') })];
    const resolved = resolveAuth(bearer('mine'), chain);
    expect(resolved.from).toBe('request');
    expect(resolved.auth.token).toBe('mine');
  });

  it('treats an explicit "none" as a choice, not as inheriting', () => {
    const chain = [folder('Outer', { auth: bearer('folder') })];
    expect(resolveAuth({ ...emptyAuth(), type: 'none' }, chain).from).toBe('request');
  });

  it('takes the nearest folder that made a choice', () => {
    const chain = [
      folder('Inner', { auth: { ...emptyAuth(), type: 'inherit' } }),
      folder('Middle', { auth: bearer('middle') }),
      folder('Outer', { auth: bearer('outer') }),
    ];
    const resolved = resolveAuth({ ...emptyAuth(), type: 'inherit' }, chain);
    expect(resolved.auth.token).toBe('middle');
    expect(resolved.from === 'folder' && resolved.folder.name).toBe('Middle');
  });

  it('sends nothing when no folder above set anything', () => {
    const resolved = resolveAuth({ ...emptyAuth(), type: 'inherit' }, [folder('Outer')]);
    expect(resolved.from).toBe('none');
    expect(resolved.auth.type).toBe('none');
  });

  it('sends nothing for a request that sits in no folder at all', () => {
    expect(resolveAuth({ ...emptyAuth(), type: 'inherit' }, []).from).toBe('none');
  });
});

describe('sending an inherited auth', () => {
  const send = (auth: Auth, chain: Folder[]) =>
    prepareRequest(createRequest({ workspaceId: 'ws', url: 'https://api.test/x', auth }), {}, { folders: chain })
      .headers;

  it('attaches the folder credentials to a request that inherits', () => {
    expect(send({ ...emptyAuth(), type: 'inherit' }, [folder('Outer', { auth: bearer('abc') })])).toContainEqual({
      key: 'Authorization',
      value: 'Bearer abc',
    });
  });

  it('attaches nothing once the request picks "none"', () => {
    expect(send({ ...emptyAuth(), type: 'none' }, [folder('Outer', { auth: bearer('abc') })])).toEqual([]);
  });

  it('resolves variables in an inherited token, like any other', () => {
    const chain = [folder('Outer', { auth: bearer('{{token}}') })];
    const request = createRequest({ workspaceId: 'ws', url: 'https://api.test/x', auth: { ...emptyAuth(), type: 'inherit' } });
    expect(prepareRequest(request, { token: 'secret' }, { folders: chain }).headers).toContainEqual({
      key: 'Authorization',
      value: 'Bearer secret',
    });
  });
});

describe('scriptChain', () => {
  const request = createRequest({
    workspaceId: 'ws',
    preScript: 'request-pre',
    postScript: 'request-post',
  });
  const chain = [
    folder('Inner', { preScript: 'inner-pre', postScript: 'inner-post' }),
    folder('Outer', { preScript: 'outer-pre', postScript: 'outer-post' }),
  ];

  it('runs pre-request scripts from the outside in', () => {
    // The outer folder sets up what the inner one and the request depend on.
    expect(scriptChain(request, chain, 'pre').map((step) => step.code)).toEqual([
      'outer-pre',
      'inner-pre',
      'request-pre',
    ]);
  });

  it('runs post-response scripts from the inside out', () => {
    expect(scriptChain(request, chain, 'post').map((step) => step.code)).toEqual([
      'request-post',
      'inner-post',
      'outer-post',
    ]);
  });

  it('skips empty scripts rather than compiling blank programs', () => {
    const bare = createRequest({ workspaceId: 'ws', preScript: '   ' });
    expect(scriptChain(bare, [folder('Outer')], 'pre')).toEqual([]);
  });

  it('names each step so a failure says which script broke', () => {
    expect(scriptChain(request, chain, 'pre')[0].source).toContain('Outer');
    expect(scriptChain(request, chain, 'pre').at(-1)?.source).toBe('request');
  });
});
