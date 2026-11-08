import "server-only";

function keyBytes(hex: string) {
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error("Invalid email encryption configuration.");
  return Uint8Array.from(hex.match(/../g)!, byte => parseInt(byte, 16));
}
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const decode = (text: string) => Uint8Array.from(atob(text), character => character.charCodeAt(0));
export async function sealLink(value: string, hex: string, identity: string) {
  const key = await crypto.subtle.importKey("raw", keyBytes(hex), "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(identity) }, key, new TextEncoder().encode(value));
  return `${encode(iv)}.${encode(new Uint8Array(encrypted))}`;
}
export async function openLink(sealed: string, hex: string, identity: string) {
  const [iv, payload, extra] = sealed.split(".");
  if (!iv || !payload || extra) throw new Error("Invalid encrypted invitation.");
  const key = await crypto.subtle.importKey("raw", keyBytes(hex), "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(iv), additionalData: new TextEncoder().encode(identity) }, key, decode(payload));
  return new TextDecoder().decode(plain);
}
