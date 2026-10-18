const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * RFC 4648 base64url, hand-rolled rather than reached for `btoa`/`atob`
 * (browser-only) or `Buffer` (Node-only) - plain arithmetic over a
 * `Uint8Array` is the one thing every host this package targets shares. No
 * padding is emitted, matching base64url convention.
 */
export function toBase64Url(bytes: Uint8Array): string {
  let output = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const chunk = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    output += BASE64_ALPHABET.charAt((chunk >> 18) & 0x3f);
    output += BASE64_ALPHABET.charAt((chunk >> 12) & 0x3f);
    if (i + 1 < bytes.length) output += BASE64_ALPHABET.charAt((chunk >> 6) & 0x3f);
    if (i + 2 < bytes.length) output += BASE64_ALPHABET.charAt(chunk & 0x3f);
  }
  return output.replace(/\+/g, "-").replace(/\//g, "_");
}

export function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const bytes: number[] = [];
  for (let i = 0; i < base64.length; i += 4) {
    const c0 = BASE64_ALPHABET.indexOf(base64.charAt(i));
    const c1 = BASE64_ALPHABET.indexOf(base64.charAt(i + 1));
    const char2 = base64.charAt(i + 2);
    const char3 = base64.charAt(i + 3);
    const c2 = char2 === "" ? -1 : BASE64_ALPHABET.indexOf(char2);
    const c3 = char3 === "" ? -1 : BASE64_ALPHABET.indexOf(char3);
    bytes.push(((c0 << 2) | (c1 >> 4)) & 0xff);
    if (c2 !== -1) bytes.push(((c1 << 4) | (c2 >> 2)) & 0xff);
    if (c3 !== -1) bytes.push(((c2 << 6) | c3) & 0xff);
  }
  return new Uint8Array(bytes);
}
