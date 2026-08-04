# jm-ksef

[![CI](https://github.com/JMatuszczakk/jm-ksef-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/JMatuszczakk/jm-ksef-sdk/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/jm-ksef.svg)](https://www.npmjs.com/package/jm-ksef)
[![license](https://img.shields.io/npm/l/jm-ksef.svg)](LICENSE)

Plug-and-play JS/TS client for the Polish **KSeF** (Krajowy System e-Faktur) API v2 — the
national e-invoicing system. Handles authentication, encrypted interactive/batch invoice
sessions, invoice querying, async export, and QR verification-link generation.

- **Zero runtime dependencies** — built entirely on WebCrypto and `fetch`.
- Runs unmodified on **Node.js 20+**, **browsers**, **Cloudflare Workers**, and **Deno**.
- Ships full TypeScript types for the KSeF API surface.
- Stateless-friendly: the client holds tokens in memory; persist/restore them however you like.

> This library only wraps the KSeF *protocol* (crypto, HTTP, session lifecycle). It does not
> generate invoice XML (FA(2)/FA(3) documents) for you — bring your own XML and pass it in.

## Install

```bash
npm install jm-ksef
```

## Quick start

```ts
import { KsefSession, KSEF_TEST_URL } from "jm-ksef";

const ksef = new KsefSession({
    apiUrl: KSEF_TEST_URL,       // or KSEF_PROD_URL
    nip: "1111111111",
    ksefToken: process.env.KSEF_TOKEN!, // generated in the KSeF web app
});

// 1. Authenticate (challenge → encrypt → submit → poll → redeem)
const auth = await ksef.connect();
console.log("Connected, access token valid until", auth.accessTokenValidUntil);

// 2. Send a single invoice interactively
const session = await ksef.openOnlineSession("FA(3)");
const { referenceNumber } = await session.sendInvoice(invoiceXml);
await session.close();

// 3. Query invoice metadata
const results = await ksef.queryInvoices({
    subjectType: "Subject2", // invoices received as a buyer
    dateRange: { from: "2026-01-01", dateType: "Issue" },
});

// 4. Fetch a specific invoice's XML by KSeF number
const xml = await ksef.getInvoiceXml(results.invoices[0].ksefNumber);

// 5. Disconnect when done
await ksef.disconnect();
```

## Batch sending

```ts
const batch = await ksef.openBatchSession("FA(3)", [
    { fileName: "invoice-1", xml: invoiceXml1 },
    { fileName: "invoice-2", xml: invoiceXml2 },
]);
console.log(`Uploaded ${batch.invoiceCount} invoices, ref ${batch.referenceNumber}`);
await batch.close();
```

## Async export

```ts
const ref = await ksef.startExport({
    subjectType: "Subject1",
    dateRange: { from: "2026-01-01", to: "2026-01-31", dateType: "Issue" },
});

// Poll until ready
let status = await ksef.getExportStatus(ref);
while (status.status.code === 100 /* processing */) {
    await new Promise((r) => setTimeout(r, 2000));
    status = await ksef.getExportStatus(ref);
}
console.log(status.package); // download URLs for the (encrypted) export parts
```

## Refreshing / persisting sessions

Tokens live in memory on the `KsefSession` instance. To survive a process restart,
persist `ksef.tokens` yourself (e.g. encrypted in a database) and restore with
`restoreTokens()`:

```ts
const saved = ksef.tokens; // { accessToken, refreshToken, refreshTokenValidUntil, ... }
// ... later, in a new process ...
ksef2.restoreTokens(saved);
await ksef2.refresh(); // get a fresh access token from the stored refresh token
```

## QR verification links (KOD I)

```ts
const qrUrl = await ksef.buildVerificationQrUrl(invoiceXml, "1111111111", "04-08-2026");
// → https://qr-test.ksef.mf.gov.pl/invoice/1111111111/04-08-2026/<hash>
```

## Error handling

All KSeF API errors are thrown as `KsefApiError` with `status`, `code`, `message`, and
optional `details`/`retryAfter` (for HTTP 429):

```ts
import { KsefApiError } from "jm-ksef";

try {
    await ksef.connect();
} catch (err) {
    if (err instanceof KsefApiError) {
        console.error(err.status, err.message, err.details);
    }
    throw err;
}
```

## Low-level building blocks

If you need finer control than `KsefSession` provides, the underlying pieces are exported
too: `KsefHttpClient` (thin fetch wrapper), the WebCrypto helpers in `crypto.ts`
(`importRsaPublicKey`, `encryptKsefToken`, AES helpers, `sha256`), and `buildSimpleZip`
for batch archives.

## API reference

### `new KsefSession(options)`

| Option | Type | Description |
|---|---|---|
| `apiUrl` | `string` | Base URL — `KSEF_TEST_URL` or `KSEF_PROD_URL` (or your own). |
| `nip` | `string` | NIP or other context identifier value to authenticate as. |
| `ksefToken` | `string` | Long-lived KSeF token generated via the KSeF web app. |
| `contextType` | `"Nip" \| "InternalId" \| "NipVatUe"` | Defaults to `"Nip"`. |
| `authPollAttempts` | `number` | Poll attempts (1s apart) while waiting on auth confirmation. Default `10`. |

### Methods

- `connect(): Promise<KsefAuthResult>`
- `refresh(): Promise<void>`
- `restoreTokens(tokens): void`
- `disconnect(): Promise<void>`
- `openOnlineSession(schemaVersion): Promise<OnlineSession>`
- `openBatchSession(schemaVersion, invoices): Promise<BatchSession>`
- `closeOnlineSession(ref)` / `closeBatchSession(ref)`
- `getSessionStatus(ref)`, `listSessions(opts)`, `listSessionInvoices(ref)`,
  `getFailedSessionInvoices(ref)`, `getSessionInvoiceStatus(ref, invoiceRef)`, `getUpo(ref, upoRef)`
- `queryInvoices(filters, opts)`
- `getInvoiceXml(ksefNumber)`
- `startExport(filters, onlyMetadata?)`, `getExportStatus(ref)`
- `buildVerificationQrUrl(xml, nip, issueDateDDMMYYYY)`

`OnlineSession` has `sendInvoice(xml)` and `close()`. `BatchSession` has `close()` and
exposes `invoiceCount` / `uploadResults`.

## Further reading

- [`docs/protocol-notes.md`](docs/protocol-notes.md) — why the auth/session/QR flows work
  the way they do, useful when debugging a `KsefApiError`.
- [`docs/testing-against-ksef.md`](docs/testing-against-ksef.md) — how to smoke-test
  changes against the live KSeF test environment.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — dev setup, workflow, release process.
- [`AGENTS.md`](AGENTS.md) — conventions and hard constraints for AI coding agents
  working in this repo.
- [`CHANGELOG.md`](CHANGELOG.md) — release history.

## License

MIT — see [LICENSE](LICENSE).
