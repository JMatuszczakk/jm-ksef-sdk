# KSeF protocol notes

Background on *why* the library does what it does — useful when debugging a
`KsefApiError` or extending `client.ts`. For usage examples, see the [README](../README.md).

## Authentication flow (`KsefSession.connect()`)

KSeF token-based auth is a 5-step challenge/response dance, all implemented in
`connect()`:

1. **`POST /auth/challenge`** with your context identifier (NIP by default) → returns a
   `challenge` string and a `timestamp`.
2. **`GET /security/public-key-certificates`** → find the certificate whose `usage`
   includes `KsefTokenEncryption`, and import its RSA public key (the certificate is a
   Base64 DER X.509 cert — `crypto.ts#importRsaPublicKey` extracts the SPKI by walking
   the DER structure for the `rsaEncryption` OID, since WebCrypto can't import a raw
   X.509 cert directly).
3. **Encrypt** the string `"{ksefToken}|{timestampMs}"` with RSA-OAEP/SHA-256 using that
   key (`encryptKsefToken`).
4. **`POST /auth/ksef-token`** with the challenge, context identifier, and encrypted
   token → returns a short-lived `authenticationToken` and a `referenceNumber`.
5. **Poll `GET /auth/{referenceNumber}`** (using the authentication token, not the
   access token) until `status.code === 200`, then **`POST /auth/token/redeem`** to
   exchange it for the real `accessToken`/`refreshToken` pair.

KSeF confirms authentication asynchronously (it's validating the token server-side),
which is why step 5 polls rather than getting a synchronous answer — typically resolves
within 1-3 seconds against the test environment. `authPollAttempts` (default 10, 1s
apart) bounds how long `connect()` will wait before throwing a timeout error.

## Session encryption (online + batch)

Every invoice session (online or batch) encrypts its payload with a **fresh AES-256-CBC
key per session**, and that AES key itself is RSA-OAEP-encrypted with the MF's
`SymmetricKeyEncryption` public key before being sent to KSeF in the "open session"
request. This is separate from the KSeF-token RSA key used during auth — always look up
the certificate by `usage`, don't assume the same key serves both purposes.

- **Online session**: one AES key/IV for the whole session; each `sendInvoice(xml)` call
  encrypts just that invoice's bytes and reports both the plaintext and ciphertext
  SHA-256 hash + size, which KSeF uses to verify integrity before decrypting server-side.
- **Batch session**: all invoices are bundled into a single ZIP (`zip.ts`), the *whole
  ZIP* is encrypted (optionally split into ≤100MB parts for very large batches), and
  each encrypted part is uploaded via a presigned URL returned by
  `POST /sessions/batch`. KSeF only requires a structurally valid ZIP — no compression
  needed, hence `buildSimpleZip`'s STORE-only implementation.

## QR verification links (KOD I)

The official KSeF verification QR encodes a URL of the form:

```
https://qr-{env}.ksef.mf.gov.pl/invoice/{nip}/{DD-MM-YYYY}/{sha256-of-xml, base64url, no padding}
```

`buildVerificationQrUrl()` derives the `qr-*` hostname from whatever `apiUrl` you
configured (`api-test.ksef.mf.gov.pl` → `qr-test.ksef.mf.gov.pl`, and the equivalent for
prod) rather than hardcoding both environments, so a custom/future KSeF host still works
as long as it follows the same `api-*` / `qr-*` naming convention.

## Rate limiting

KSeF returns `429` with a `Retry-After` header when you exceed its per-second/minute/hour
limits. `http.ts` surfaces this as `KsefApiError` with `status: 429` and `retryAfter` set
to the header's value in seconds — callers doing bulk operations (batch sessions, large
exports) should back off using that value rather than a fixed retry interval.
