# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-08-04

### Added

- `generateInvoiceXml()` — builds a KSeF FA(3) invoice XML document from plain
  data (seller/buyer, line items, corrective-invoice fields, payment info, and
  statutory annotations). Computes net/VAT/gross amounts and VAT-rate summary
  buckets for you. Validated against the official `schemat_FA(3)_v1-0E.xsd`
  via `xmllint` as part of the test suite, for plain, corrective, and
  fully-annotated sample invoices.
- New types: `Invoice`, `InvoiceLineItem`, `InvoiceType`, `InvoiceAnnotations`,
  `CorrectionData`, `Party`, `PaymentMethod`, `VatRate`. New export:
  `escapeInvoiceXml`.
- `docs/invoice-xml.md` — coverage and limitations of the generator (FA(2) is
  not supported; several rare special-procedure fields are intentionally
  out of scope — see the doc for the full list).

## [0.1.3] - 2026-08-04

### Fixed

- Retry release to verify the OIDC trusted-publish exchange after correcting
  the Trusted Publisher configuration on npm. No code change.

## [0.1.2] - 2026-08-04

### Fixed

- `publish.yml` no longer sets `registry-url` on the `setup-node` step — that
  input auto-injects `NODE_AUTH_TOKEN` (defaulting to the ambient
  `GITHUB_TOKEN`), which npm then tries as a bearer token instead of
  attempting the OIDC trusted-publish exchange, causing publish to fail as
  unauthorized. No functional change to the library itself.

## [0.1.1] - 2026-08-04

### Fixed

- Raised the minimum supported Node version to 20 — `globalThis.crypto`
  (WebCrypto) isn't reliably available on Node 18, which broke CI/consumers
  running on that version. Documentation and CI matrix updated to match.

## [0.1.0] - 2026-08-04

### Added

- Initial release: `KsefSession` high-level client covering authentication
  (challenge → encrypt → submit → poll → redeem), interactive (online) and
  batch invoice sessions, invoice metadata querying, async export, and
  KSeF QR (KOD I) verification-link generation.
- Zero-dependency WebCrypto-based crypto helpers (`RSA-OAEP`, `AES-256-CBC`,
  `SHA-256`) and a minimal ZIP builder for batch uploads.
- Full TypeScript types for the KSeF API v2 surface used by this library.
- Test suite covering crypto helpers, ZIP building, and session state guards.

[Unreleased]: https://github.com/JMatuszczakk/jm-ksef-sdk/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/JMatuszczakk/jm-ksef-sdk/compare/v0.1.3...v0.2.0
[0.1.3]: https://github.com/JMatuszczakk/jm-ksef-sdk/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/JMatuszczakk/jm-ksef-sdk/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/JMatuszczakk/jm-ksef-sdk/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/JMatuszczakk/jm-ksef-sdk/releases/tag/v0.1.0
