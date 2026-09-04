/**
 * A `pm` object shaped like Postman's, so a script that came in with an
 * imported collection runs without being rewritten.
 *
 * This is a compatibility layer, not a reimplementation: it covers what
 * collection scripts actually use — reading and writing variables, reading the
 * response, adding a request header, and `pm.test` with a small `expect` — and
 * nothing else. Anything outside that throws with its own name in the message,
 * which is far easier to act on than `undefined is not a function`.
 */

export type PmHost = {
  get: (name: string) => string;
  set: (name: string, value: unknown) => void;
  header: (key: string, value: unknown) => void;
  request: { method: string; url: string; headers: Array<{ key: string; value: string }>; body: string };
  response?: { status: number; statusText: string; body: string; durationMs: number; headers: Array<{ key: string; value: string }> };
  /** Records a `pm.test` result. */
  test: (name: string, passed: boolean, error?: string) => void;
};

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const leftKeys = Object.keys(left as object);
  const rightKeys = Object.keys(right as object);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) =>
    deepEqual((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]),
  );
}

function show(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** Thrown by a failed expectation, so `pm.test` can tell it from a crash. */
export class ExpectationError extends Error {}

function fail(message: string): never {
  throw new ExpectationError(message);
}

export type Expectation = {
  /** Chai's chainable words, which read as English and assert nothing. */
  to: Expectation;
  be: Expectation;
  been: Expectation;
  is: Expectation;
  that: Expectation;
  and: Expectation;
  has: Expectation;
  have: Expectation;
  with: Expectation;
  deep: Expectation;
  a: (type: string) => void;
  an: (type: string) => void;
  equal: (expected: unknown) => void;
  equals: (expected: unknown) => void;
  eql: (expected: unknown) => void;
  eq: (expected: unknown) => void;
  above: (expected: number) => void;
  below: (expected: number) => void;
  include: (expected: unknown) => void;
  contain: (expected: unknown) => void;
  property: (name: string, ...rest: unknown[]) => void;
  lengthOf: (expected: number) => void;
  ok: void;
  true: void;
  false: void;
  null: void;
  undefined: void;
  empty: void;
};

/**
 * The subset of chai's `expect` that collection tests lean on.
 *
 * `not` inverts every assertion below it, which is why each one goes through
 * `check` rather than throwing directly.
 */
export function expect(actual: unknown, negated = false): Expectation & { not: Expectation } {
  const check = (passed: boolean, message: string, negatedMessage: string) => {
    if (negated ? passed : !passed) fail(negated ? negatedMessage : message);
  };

  const target = {} as Expectation & { not: Expectation };
  const self = () => target;

  for (const word of ['to', 'be', 'been', 'is', 'that', 'and', 'has', 'have', 'with', 'deep'] as const) {
    Object.defineProperty(target, word, { get: self, enumerable: true });
  }
  Object.defineProperty(target, 'not', {
    get: () => expect(actual, !negated),
    enumerable: true,
  });

  const typeOf = (value: unknown) => (Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value);

  Object.assign(target, {
    a: (type: string) =>
      check(typeOf(actual) === type, `expected ${show(actual)} to be a ${type}`, `expected ${show(actual)} not to be a ${type}`),
    equal: (expected: unknown) =>
      check(Object.is(actual, expected), `expected ${show(actual)} to equal ${show(expected)}`, `expected ${show(actual)} not to equal ${show(expected)}`),
    eql: (expected: unknown) =>
      check(deepEqual(actual, expected), `expected ${show(actual)} to deeply equal ${show(expected)}`, `expected ${show(actual)} not to deeply equal ${show(expected)}`),
    above: (expected: number) =>
      check(Number(actual) > expected, `expected ${show(actual)} to be above ${expected}`, `expected ${show(actual)} not to be above ${expected}`),
    below: (expected: number) =>
      check(Number(actual) < expected, `expected ${show(actual)} to be below ${expected}`, `expected ${show(actual)} not to be below ${expected}`),
    include: (expected: unknown) => {
      const has =
        typeof actual === 'string'
          ? actual.includes(String(expected))
          : Array.isArray(actual)
            ? actual.some((item) => deepEqual(item, expected))
            : false;
      check(has, `expected ${show(actual)} to include ${show(expected)}`, `expected ${show(actual)} not to include ${show(expected)}`);
    },
    property: (name: string, ...rest: unknown[]) => {
      const record = (actual ?? {}) as Record<string, unknown>;
      const present = typeof actual === 'object' && actual !== null && name in record;
      // `property(name)` only checks presence; `property(name, value)` checks
      // both, so the value is read from the rest rather than a default.
      if (rest.length > 0) {
        const value = rest[0];
        check(
          present && deepEqual(record[name], value),
          `expected property ${name} to equal ${show(value)}`,
          `expected property ${name} not to equal ${show(value)}`,
        );
        return;
      }
      check(present, `expected ${show(actual)} to have property ${name}`, `expected ${show(actual)} not to have property ${name}`);
    },
    lengthOf: (expected: number) => {
      const length = (actual as { length?: number } | null)?.length;
      check(length === expected, `expected length ${length} to be ${expected}`, `expected length not to be ${expected}`);
    },
  });

  target.an = target.a;
  target.equals = target.equal;
  target.eq = target.equal;
  target.contain = target.include;

  const truthy: Array<[keyof Expectation, () => boolean, string]> = [
    ['ok', () => Boolean(actual), 'be truthy'],
    ['true', () => actual === true, 'be true'],
    ['false', () => actual === false, 'be false'],
    ['null', () => actual === null, 'be null'],
    ['undefined', () => actual === undefined, 'be undefined'],
    ['empty', () => !actual || (actual as { length?: number }).length === 0, 'be empty'],
  ];
  for (const [word, predicate, phrase] of truthy) {
    Object.defineProperty(target, word, {
      get: () => check(predicate(), `expected ${show(actual)} to ${phrase}`, `expected ${show(actual)} not to ${phrase}`),
      enumerable: true,
    });
  }

  return target;
}

/** The `pm.response.to…` chain: `have.status`, `have.jsonBody`, and `not` of either. */
function responseChain(host: PmHost, negated: boolean) {
  const check = (passed: boolean, message: string, negatedMessage: string) => {
    if (negated ? passed : !passed) fail(negated ? negatedMessage : message);
  };

  const assertions = {
    status: (expected: number) =>
      check(
        host.response!.status === expected,
        `expected response code ${host.response!.status} to be ${expected}`,
        `expected response code not to be ${expected}`,
      ),
    jsonBody: () => {
      let parsed = true;
      try {
        JSON.parse(host.response!.body);
      } catch {
        parsed = false;
      }
      check(parsed, 'expected the response body to be JSON', 'expected the response body not to be JSON');
    },
    header: (name: string) =>
      check(
        host.response!.headers.some((header) => header.key.toLowerCase() === name.toLowerCase()),
        `expected the response to have a ${name} header`,
        `expected the response not to have a ${name} header`,
      ),
  };

  const node = { ...assertions } as Record<string, unknown>;
  for (const word of ['have', 'be', 'been', 'is', 'that', 'and', 'with']) {
    Object.defineProperty(node, word, { get: () => node, enumerable: false });
  }
  Object.defineProperty(node, 'not', { get: () => responseChain(host, !negated), enumerable: false });
  return node;
}

function variableStore(host: PmHost) {
  return {
    get: (name: string) => host.get(name),
    set: (name: string, value: unknown) => host.set(name, value),
    has: (name: string) => host.get(name) !== '',
    unset: (name: string) => host.set(name, ''),
    /** Postman's `toObject`, used to dump everything at once. */
    replaceIn: (text: string) => text.replace(/{{\s*([\w.-]+)\s*}}/g, (_match, name: string) => host.get(name)),
  };
}

/** Build the `pm` object a script sees. */
export function createPm(host: PmHost) {
  const variables = variableStore(host);

  const response = host.response
    ? {
        code: host.response.status,
        status: host.response.statusText,
        responseTime: host.response.durationMs,
        text: () => host.response!.body,
        json: () => JSON.parse(host.response!.body),
        headers: {
          get: (name: string) =>
            host.response!.headers.find((header) => header.key.toLowerCase() === name.toLowerCase())?.value,
        },
        // `pm.response.to.have.status(200)` reads off the response rather
        // than off a value, so it gets its own small chain instead of reusing
        // `expect`'s — whose chainable words are getters that assert when
        // touched, and so cannot be spread or copied.
        get to() {
          return responseChain(host, false);
        },
      }
    : undefined;

  return {
    environment: variables,
    globals: variables,
    collectionVariables: variables,
    variables,
    iterationData: { get: () => undefined },
    request: {
      method: host.request.method,
      url: { toString: () => host.request.url, getRaw: () => host.request.url },
      headers: {
        add: (header: { key: string; value: unknown }) => host.header(header.key, header.value),
        upsert: (header: { key: string; value: unknown }) => host.header(header.key, header.value),
        get: (name: string) =>
          host.request.headers.find((header) => header.key.toLowerCase() === name.toLowerCase())?.value,
      },
      body: host.request.body,
    },
    response,
    expect: (value: unknown) => expect(value),
    test: (name: string, body: () => void) => {
      try {
        body();
        host.test(name, true);
      } catch (error) {
        host.test(name, false, error instanceof Error ? error.message : String(error));
      }
    },
    /** Postman's `sendRequest` is deliberately absent; say so rather than crash. */
    sendRequest: () => {
      throw new Error('pm.sendRequest is not supported here. Make the call a request of its own.');
    },
  };
}
