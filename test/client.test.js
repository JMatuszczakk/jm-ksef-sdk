import { test } from "node:test";
import assert from "node:assert/strict";
import { KsefSession, KSEF_TEST_URL } from "../dist/index.js";

test("KsefSession starts disconnected and rejects calls before connect()", async () => {
    const ksef = new KsefSession({
        apiUrl: KSEF_TEST_URL,
        nip: "1111111111",
        ksefToken: "fake-token",
    });

    assert.equal(ksef.isConnected, false);
    assert.equal(ksef.tokens, null);

    await assert.rejects(() => ksef.openOnlineSession("FA(3)"), /Not connected/);
    await assert.rejects(() => ksef.getInvoiceXml("1234"), /Not connected/);
    await assert.rejects(() => ksef.refresh(), /Not connected/);
});

test("restoreTokens() makes the session report as connected", () => {
    const ksef = new KsefSession({
        apiUrl: KSEF_TEST_URL,
        nip: "1111111111",
        ksefToken: "fake-token",
    });

    ksef.restoreTokens({
        accessToken: "access-123",
        refreshToken: "refresh-456",
        refreshTokenValidUntil: "2099-01-01T00:00:00Z",
    });

    assert.equal(ksef.isConnected, true);
    assert.equal(ksef.tokens.accessToken, "access-123");
    assert.equal(ksef.tokens.refreshToken, "refresh-456");
});
