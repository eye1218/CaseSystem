let fallbackCounter = 0;

export function createClientId(prefix = "id") {
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  fallbackCounter += 1;
  const timePart = Date.now().toString(36);
  const counterPart = fallbackCounter.toString(36);
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${timePart}${counterPart}${randomPart}`;
}
