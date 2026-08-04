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

Publishing uses npm's **Trusted Publishing** (OIDC) — the `publish.yml` workflow
authenticates directly to npm via its GitHub Actions identity, no long-lived
`NPM_TOKEN` secret involved.

One-time setup (only needed once per package, already done for `jm-ksef` if you're
reading this after the initial release):

1. The package must exist on npm already — trusted publishing is configured from the
   package's existing settings page, not at package-creation time. The very first
   publish has to happen normally (`npm publish` from a maintainer's authenticated
   machine, OTP and all).
2. On [npmjs.com](https://www.npmjs.com) → the package → **Settings** → **Trusted
   Publisher**, add a GitHub Actions publisher pointing at:
   - Repository: `JMatuszczakk/jm-ksef-sdk`
   - Workflow file: `.github/workflows/publish.yml`
   - Environment: (leave blank unless you add one)

After that, every release:

1. Move the `[Unreleased]` changelog entries under a new `## [x.y.z] - YYYY-MM-DD` heading.
2. Bump `version` in `package.json` to match.
3. Commit, tag `vX.Y.Z`, push, and cut a GitHub Release — the `publish.yml` workflow
   publishes to npm automatically, authenticating via OIDC (requires npm CLI ≥ 11.5.0,
   which the workflow installs explicitly).

## Reporting issues

Please include: the KSeF environment you're targeting (test/demo/prod), the method
called, and the `KsefApiError` (`status`/`code`/`message`/`details`) if one was thrown.
Never paste a real KSeF token or NIP-linked access/refresh token into an issue.
