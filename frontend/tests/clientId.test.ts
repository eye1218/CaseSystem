import assert from "node:assert/strict";

import { createClientId } from "../src/utils/clientId.ts";

const originalCrypto = globalThis.crypto;

try {
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: {},
  });

  const first = createClientId("filter");
  const second = createClientId("filter");

  assert.match(first, /^filter_[a-z0-9]+$/);
  assert.match(second, /^filter_[a-z0-9]+$/);
  assert.notStrictEqual(first, second);
} finally {
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: originalCrypto,
  });
}
