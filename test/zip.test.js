import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSimpleZip } from "../dist/index.js";

test("buildSimpleZip produces a valid ZIP local-file-header signature", () => {
    const zip = buildSimpleZip([
        { name: "invoice-1.xml", data: new TextEncoder().encode("<Faktura>1</Faktura>") },
        { name: "invoice-2.xml", data: new TextEncoder().encode("<Faktura>2</Faktura>") },
    ]);

    // PK\x03\x04 local file header signature
    assert.equal(zip[0], 0x50);
    assert.equal(zip[1], 0x4b);
    assert.equal(zip[2], 0x03);
    assert.equal(zip[3], 0x04);

    // End of central directory signature (PK\x05\x06) must appear somewhere near the end
    const eocdSig = [0x50, 0x4b, 0x05, 0x06];
    const tail = zip.slice(-22, -18);
    assert.deepEqual(Array.from(tail), eocdSig);
});

test("buildSimpleZip on empty input still produces a valid (empty) archive", () => {
    const zip = buildSimpleZip([]);
    assert.equal(zip.length, 22); // just the EOCD record
});
