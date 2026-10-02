import assert from "node:assert/strict";
import { test } from "node:test";

import { parseEncryptedPagesEnvelope } from "./chapterCrypto.ts";

void test("parseEncryptedPagesEnvelope - valid envelope", () => {
  const encoded =
    "enc:v1:874d13643c282db4:IlLJI995w35EuJBH:vllch0FxAR9c1OCEfrVAxg:ufwAoOnXfKPVeH33O5uviVpfYU_oB8Wb08mkZu-7IOyny8GeRFATv0CLmFHmCg";
  const result = parseEncryptedPagesEnvelope(encoded);
  assert.deepEqual(result, {
    keyId: "874d13643c282db4",
    iv: "IlLJI995w35EuJBH",
    authTag: "vllch0FxAR9c1OCEfrVAxg",
    ciphertext: "ufwAoOnXfKPVeH33O5uviVpfYU_oB8Wb08mkZu-7IOyny8GeRFATv0CLmFHmCg",
  });
});

void test("parseEncryptedPagesEnvelope - rejects non-enc input", () => {
  assert.equal(parseEncryptedPagesEnvelope('{"p":"x","i":["a.jpg"]}'), null);
  assert.equal(parseEncryptedPagesEnvelope(""), null);
});

void test("parseEncryptedPagesEnvelope - rejects wrong version", () => {
  assert.equal(parseEncryptedPagesEnvelope("enc:v2:a:b:c:d"), null);
});

void test("parseEncryptedPagesEnvelope - rejects wrong segment count", () => {
  assert.equal(parseEncryptedPagesEnvelope("enc:v1:a:b:c"), null);
  assert.equal(parseEncryptedPagesEnvelope("enc:v1:a:b:c:d:e"), null);
});

void test("parseEncryptedPagesEnvelope - rejects empty segments", () => {
  assert.equal(parseEncryptedPagesEnvelope("enc:v1::b:c:d"), null);
  assert.equal(parseEncryptedPagesEnvelope("enc:v1:a::c:d"), null);
  assert.equal(parseEncryptedPagesEnvelope("enc:v1:a:b::d"), null);
  assert.equal(parseEncryptedPagesEnvelope("enc:v1:a:b:c:"), null);
});
