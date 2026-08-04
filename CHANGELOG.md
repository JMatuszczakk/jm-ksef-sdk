# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/JMatuszczakk/jm-ksef-sdk/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/JMatuszczakk/jm-ksef-sdk/releases/tag/v0.1.0
