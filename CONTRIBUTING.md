# Contributing

Thanks for considering a contribution to `jm-ksef`.

## Setup

```bash
git clone https://github.com/JMatuszczakk/jm-ksef-sdk.git
cd jm-ksef
npm install
```

## Workflow

```bash
npm run typecheck   # tsc --noEmit
npm run build       # compile src/ → dist/
npm test            # build + run node:test suite against dist/
```

- Source lives in `src/`; never edit `dist/` directly (it's generated and gitignored).
- Keep the library dependency-free. It must run unmodified on Node 18+, browsers, and
  Cloudflare Workers — anything that isn't available via `fetch` and WebCrypto
  (`globalThis.crypto.subtle`) doesn't belong here.
- Prefer adding a focused test in `test/*.test.js` (plain Node `node:test`, importing
  from `../dist/index.js`) over expanding an unrelated one.
- Match the existing code style: no semicolons omitted, 4-space indentation, explicit
  return types on exported functions/methods.

## Making a change

1. Branch from `main`.
2. Make your change with a test where practical (protocol-level KSeF calls that require
   a live sandbox connection are best covered by manual verification — see
   [`docs/testing-against-ksef.md`](docs/testing-against-ksef.md)).
3. Run `npm run typecheck && npm test` before opening a PR.
4. Add an entry under `## [Unreleased]` in `CHANGELOG.md`.
5. Open a PR describing the change and why.

## Releasing (maintainers)

1. Move the `[Unreleased]` changelog entries under a new `## [x.y.z] - YYYY-MM-DD` heading.
2. Bump `version` in `package.json` to match.
3. Commit, tag `vX.Y.Z`, push, and cut a GitHub Release — the `publish.yml` workflow
   publishes to npm automatically on release.

## Reporting issues

Please include: the KSeF environment you're targeting (test/demo/prod), the method
called, and the `KsefApiError` (`status`/`code`/`message`/`details`) if one was thrown.
Never paste a real KSeF token or NIP-linked access/refresh token into an issue.
