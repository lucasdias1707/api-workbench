import { describe, expect, it } from 'vitest';
import { row } from '@/lib/factories';
import { applyScriptHeaders, applyVariableWrites, runScripts, type ScriptContext } from '@/lib/scripts';
import type { ResponseRecord } from '@/types';

const request = {
  method: 'GET' as const,
  url: 'https://api.test/x',
  headers: [{ key: 'Accept', value: 'application/json' }],
  body: '',
};

const response = (overrides: Partial<ResponseRecord> = {}): ResponseRecord => ({
  id: 'res',
  requestId: 'req',
  url: 'https://api.test/x',
  method: 'GET',
  status: 200,
  statusText: 'OK',
  headers: [{ id: 'h', key: 'Content-Type', value: 'application/json', enabled: true }],
  body: '{"token":"abc","items":[1,2]}',
  truncated: false,
  size: 10,
  durationMs: 12,
  sentAt: '2026-01-01T00:00:00.000Z',
  via: 'browser',
  ...overrides,
});

const context = (overrides: Partial<ScriptContext> = {}): ScriptContext => ({
  request,
  variables: { baseUrl: 'https://api.test' },
  ...overrides,
});

const one = (code: string, ctx = context()) => runScripts([{ source: 'request', code }], ctx);

describe('runScripts', () => {
  it('does nothing at all when there is nothing to run', () => {
    expect(runScripts([], context())).toEqual({ variables: [], headers: [], logs: [], tests: [] });
  });

  it('collects variable writes instead of applying them itself', () => {
    // The runner stays pure: what to do with a write is the caller's decision.
    expect(one("carom.set('token', 'abc')").variables).toEqual([{ key: 'token', value: 'abc' }]);
  });

  it('stringifies a value that is not already a string', () => {
    expect(one("carom.set('n', 42)").variables).toEqual([{ key: 'n', value: '42' }]);
    expect(one("carom.set('o', {a: 1})").variables).toEqual([{ key: 'o', value: '{"a":1}' }]);
  });

  it('reads a variable it wrote earlier in the same chain', () => {
    const outcome = runScripts(
      [
        { source: 'folder', code: "carom.set('id', 'from-folder')" },
        { source: 'request', code: "carom.set('copy', carom.get('id'))" },
      ],
      context(),
    );
    expect(outcome.variables).toContainEqual({ key: 'copy', value: 'from-folder' });
  });

  it('falls back to the resolved variables for anything it did not write', () => {
    expect(one("carom.set('echo', carom.get('baseUrl'))").variables).toEqual([
      { key: 'echo', value: 'https://api.test' },
    ]);
  });

  it('collects headers a script adds', () => {
    expect(one("carom.header('X-Trace', 'abc')").headers).toEqual([{ key: 'X-Trace', value: 'abc' }]);
  });

  it('captures console output with the script it came from', () => {
    const outcome = one("console.log('hello', 1)");
    expect(outcome.logs).toEqual([{ source: 'request', level: 'log', text: 'hello 1' }]);
  });

  it('stops the chain at the first throw, and says where', () => {
    const outcome = runScripts(
      [
        { source: 'folder “Outer”', code: "throw new Error('nope')" },
        { source: 'request', code: "carom.set('never', '1')" },
      ],
      context(),
    );
    expect(outcome.error).toEqual({ source: 'folder “Outer”', message: 'nope' });
    expect(outcome.variables).toEqual([]);
  });

  it('parses the response body, and returns null when it is not JSON', () => {
    expect(one("carom.set('t', carom.json().token)", context({ response: response() })).variables).toEqual([
      { key: 't', value: 'abc' },
    ]);
    expect(
      one("carom.set('t', String(carom.json()))", context({ response: response({ body: 'not json' }) })).variables,
    ).toEqual([{ key: 't', value: 'null' }]);
  });
});

describe('the pm shim', () => {
  it('writes an environment variable the Postman way', () => {
    expect(one("pm.environment.set('token', 'abc')").variables).toEqual([{ key: 'token', value: 'abc' }]);
  });

  it('treats globals and collection variables as the same store', () => {
    const outcome = one("pm.globals.set('a', '1'); pm.collectionVariables.set('b', pm.variables.get('a'))");
    expect(outcome.variables).toEqual([
      { key: 'a', value: '1' },
      { key: 'b', value: '1' },
    ]);
  });

  it('adds a request header', () => {
    expect(one("pm.request.headers.add({ key: 'X-Api', value: 'v' })").headers).toEqual([
      { key: 'X-Api', value: 'v' },
    ]);
  });

  it('reads the response the Postman way', () => {
    const outcome = one(
      "pm.environment.set('code', pm.response.code); pm.environment.set('tok', pm.response.json().token)",
      context({ response: response() }),
    );
    expect(outcome.variables).toEqual([
      { key: 'code', value: '200' },
      { key: 'tok', value: 'abc' },
    ]);
  });

  it('records a passing test', () => {
    const outcome = one(
      "pm.test('status is 200', function () { pm.response.to.have.status(200); })",
      context({ response: response() }),
    );
    expect(outcome.tests).toEqual([{ source: 'request', name: 'status is 200', passed: true, error: undefined }]);
  });

  it('records a failing test without stopping the chain', () => {
    const outcome = runScripts(
      [
        { source: 'request', code: "pm.test('wrong', function () { pm.response.to.have.status(404); })" },
        { source: 'folder', code: "carom.set('after', 'ran')" },
      ],
      context({ response: response() }),
    );
    expect(outcome.tests[0].passed).toBe(false);
    expect(outcome.tests[0].error).toContain('404');
    // A failed assertion is a result, not a crash: the rest still runs.
    expect(outcome.variables).toEqual([{ key: 'after', value: 'ran' }]);
  });

  it('supports the expect forms collection tests actually use', () => {
    const outcome = one(
      `pm.test('shapes', function () {
         pm.expect(1).to.equal(1);
         pm.expect([1, 2]).to.eql([1, 2]);
         pm.expect('abc').to.include('b');
         pm.expect({ a: 1 }).to.have.property('a', 1);
         pm.expect(true).to.be.ok;
         pm.expect(2).to.be.above(1);
         pm.expect([1]).to.have.lengthOf(1);
         pm.expect(1).to.not.equal(2);
       })`,
    );
    expect(outcome.tests[0]).toMatchObject({ passed: true });
  });

  it('fails an expectation that does not hold, with both values in the message', () => {
    const outcome = one("pm.test('t', function () { pm.expect(1).to.equal(2); })");
    expect(outcome.tests[0].passed).toBe(false);
    expect(outcome.tests[0].error).toBe('expected 1 to equal 2');
  });

  it('says plainly that pm.sendRequest is not available', () => {
    expect(one('pm.sendRequest()').error?.message).toContain('pm.sendRequest is not supported');
  });
});

describe('applyScriptHeaders', () => {
  it('appends a header the request did not have', () => {
    expect(applyScriptHeaders([{ key: 'Accept', value: 'x' }], [{ key: 'X', value: 'y' }])).toEqual([
      { key: 'Accept', value: 'x' },
      { key: 'X', value: 'y' },
    ]);
  });

  it('lets the script win a clash, whatever the casing', () => {
    expect(
      applyScriptHeaders([{ key: 'Authorization', value: 'old' }], [{ key: 'authorization', value: 'new' }]),
    ).toEqual([{ key: 'authorization', value: 'new' }]);
  });

  it('returns the rows untouched when nothing was added', () => {
    const rows = [{ key: 'Accept', value: 'x' }];
    expect(applyScriptHeaders(rows, [])).toBe(rows);
  });
});

describe('applyVariableWrites', () => {
  it('adds a variable that did not exist', () => {
    const next = applyVariableWrites([], [{ key: 'a', value: '1' }], (key, value) => row(key, value));
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ key: 'a', value: '1', enabled: true });
  });

  it('updates one that did, and re-enables it', () => {
    const existing = [{ ...row('a', 'old'), enabled: false }];
    const next = applyVariableWrites(existing, [{ key: 'a', value: 'new' }], (key, value) => row(key, value));
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ id: existing[0].id, value: 'new', enabled: true });
  });
});
