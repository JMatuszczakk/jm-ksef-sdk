# Security Policy

## Reporting a vulnerability

If you find a security issue in this library — e.g. a flaw in the crypto helpers
(`src/crypto.ts`), a way tokens could leak, or an SSRF-style risk in how requests are
constructed — please report it privately rather than opening a public issue.

Email **kubamatuszczak2@gmail.com** with:

- A description of the issue and its impact.
- Steps to reproduce, or a minimal proof-of-concept.
- The version of `jm-ksef` affected.

You should get an acknowledgment within a few days. Please don't include real KSeF
tokens, NIPs, or other production credentials in your report.

## Scope

This library only implements the *client* side of the KSeF protocol. Vulnerabilities in
the KSeF service itself (`*.ksef.mf.gov.pl`) are out of scope here — report those to the
Polish Ministry of Finance (Ministerstwo Finansów) through their official channels.
