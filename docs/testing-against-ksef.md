# Testing against a live KSeF environment

The unit test suite (`npm test`) only covers pure logic (crypto round-trips, ZIP
structure, session state guards) — it never calls the real KSeF API, so it can't catch
protocol drift or auth-flow regressions on its own. When changing anything in
`client.ts` that talks to KSeF, verify it manually against the **test** environment
before opening a PR.

## Getting a test-environment token

1. Go to the KSeF test environment web app (`ksef-test.mf.gov.pl`) and authenticate with
   a test certificate or the provided test-data tooling (see the official KSeF docs'
   "dane testowe" / test-data section for generating a test NIP + certificate).
2. Generate a KSeF authentication token for that context — this is the `ksefToken` value
   `KsefSession` expects, *not* your access/refresh token.

## Minimal smoke test

```ts
import { KsefSession, KSEF_TEST_URL } from "jm-ksef";

const ksef = new KsefSession({
    apiUrl: KSEF_TEST_URL,
    nip: "<your test NIP>",
    ksefToken: "<your test KSeF token>",
});

await ksef.connect();
console.log("connected:", ksef.isConnected, ksef.tokens);

const session = await ksef.openOnlineSession("FA(3)");
console.log("session opened:", session.referenceNumber);
await session.close();

await ksef.disconnect();
```

Run with `node --experimental-strip-types smoke.ts` (Node 22.6+) or compile with `tsc`
first on older Node.

## What to check manually after a protocol-level change

- **Auth**: `connect()` resolves without throwing, `ksef.tokens` has both access and
  refresh tokens populated.
- **Refresh**: call `refresh()` and confirm `ksef.tokens.accessToken` changes.
- **Online session**: `openOnlineSession` → `sendInvoice(validXml)` returns a
  `referenceNumber` → `close()` succeeds.
- **Batch session**: `openBatchSession` with 2+ invoices uploads without a non-2xx from
  the presigned URLs, then `close()` succeeds.
- **Query/export**: `queryInvoices` returns the invoices you just sent (may take a few
  seconds to become visible in KSeF); `startExport` + polling `getExportStatus` reaches
  a terminal status.

## Never do this

- Never commit a real `ksefToken`, access token, or refresh token — even a test-
  environment one — to this repo, an issue, or a PR description.
- Never point a smoke test at the **production** KSeF URL (`KSEF_PROD_URL`) while
  developing — invoices sent there are real and cannot be un-sent.
