import { test } from "node:test";
import assert from "node:assert/strict";
import {
    generateAesKeyAndIv,
    importAesKey,
    aesEncrypt,
    aesDecrypt,
    sha256,
    sha256Base64Url,
    uint8ToBase64,
    base64ToUint8,
} from "../dist/index.js";

test("uint8ToBase64 / base64ToUint8 round-trip", () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255, 42]);
    const b64 = uint8ToBase64(bytes);
    assert.deepEqual(Array.from(base64ToUint8(b64)), Array.from(bytes));
});

test("sha256 is deterministic and produces 32 bytes (44-char base64)", async () => {
    const data = new TextEncoder().encode("hello ksef");
    const hash1 = await sha256(data);
    const hash2 = await sha256(data);
    assert.equal(hash1, hash2);
    assert.equal(base64ToUint8(hash1).length, 32);
});

test("sha256Base64Url has no +, /, or = characters", async () => {
    const data = new TextEncoder().encode("some invoice xml content łódź");
    const hash = await sha256Base64Url(data);
    assert.ok(!/[+/=]/.test(hash));
});

test("AES-CBC encrypt/decrypt round-trip", async () => {
    const { key, iv } = generateAesKeyAndIv();
    assert.equal(key.length, 32);
    assert.equal(iv.length, 16);

    const cryptoKey = await importAesKey(key);
    const plaintext = new TextEncoder().encode("<Faktura>test invoice body</Faktura>");
    const encrypted = await aesEncrypt(cryptoKey, iv, plaintext);
    assert.notDeepEqual(Array.from(encrypted), Array.from(plaintext));

    const decrypted = await aesDecrypt(cryptoKey, iv, encrypted);
    assert.equal(new TextDecoder().decode(decrypted), "<Faktura>test invoice body</Faktura>");
});
