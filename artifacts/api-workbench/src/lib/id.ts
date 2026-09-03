const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Short, collision-resistant enough id for locally created records. */
export function createId(prefix: string): string {
  let random = '';
  const bytes = new Uint8Array(10);
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    crypto.getRandomValues(bytes);
    for (const byte of bytes) random += alphabet[byte % alphabet.length];
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      random += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
  }
  return `${prefix}_${random}`;
}
