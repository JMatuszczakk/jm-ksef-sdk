# Invoice XML generation

`generateInvoiceXml()` builds a `<Faktura>` document conforming to the KSeF **FA(3)**
schema (`http://crd.gov.pl/wzor/2025/06/25/13775/`, `schemat_FA(3)_v1-0E.xsd`). Every
example in this file, and the test suite's fixtures, validate against the real official
XSD via `xmllint --schema` — not just structural assertions in the tests themselves.

## What's covered

- Header, seller (`Podmiot1`), buyer (`Podmiot2`) — buyer identified by either Polish NIP
  or an EU VAT number (`vatEuNumber` + `country`).
- Line items (`FaWiersz`) with net/VAT/gross computed for you from `quantity` ×
  `unitPrice` × `vatRate` — no manual rounding required.
- The standard domestic VAT-rate summary buckets: 23%/22% (`P_13_1`/`P_14_1`), 8%/7%
  (`P_13_2`/`P_14_2`), 5% (`P_13_3`/`P_14_3`), domestic 0% — `"0 KR"` per the schema's
  enumeration, not bare `"0"` (`P_13_4`/`P_14_4`), and exempt sales `"zw"` (`P_13_7`,
  no VAT amount).
- Corrective invoices (`RodzajFaktury: "KOR" | "KOR_ZAL" | "KOR_ROZ"`) with
  `PrzyczynaKorekty`, `TypKorekty`, and `DaneFaKorygowanej` (original invoice reference,
  either a KSeF number or an outside-KSeF marker).
- Payment info (`Platnosc`): method, deadline, bank account — each element only appears
  if you provide the corresponding field.
- Statutory annotations (`Adnotacje`), all defaulting to "not applicable" (matching a
  plain domestic VAT invoice) unless you set them:
  - `cashMethod` → P_16 (metoda kasowa)
  - `selfBilling` → P_17 (samofakturowanie)
  - `reverseCharge` → P_18 (odwrotne obciążenie)
  - `splitPayment` → P_18A (mechanizm podzielonej płatności)
  - `taxExemption` → P_19/P_19A|P_19B|P_19C vs. P_19N — **the schema allows exactly one
    legal-basis field**, which is why `taxExemption` takes a single `{ basis, reference }`
    pair rather than three independent optional strings (an earlier draft of this API got
    this wrong and would have produced schema-invalid XML — caught by `xmllint`, not by
    hand-written test assertions, which is why the test suite validates real output against
    the real XSD rather than only asserting on string fragments).
  - `simplifiedTriangulation` → P_23 (procedura uproszczona, VAT triangulation)
  - `marginScheme` → PMarzy — pick the specific sub-procedure (`travel-agent`,
    `used-goods`, `art`, `collectibles-antiques`); omitting it emits `P_PMarzyN`.

## What's not covered

These are real KSeF features the generator does not attempt — pass a hand-built or
externally-generated XML string to `sendInvoice()`/`openBatchSession()` instead, which
accept any valid XML regardless of how it was produced:

- **FA(2) generation.** Only FA(3). FA(2) is being phased out by KSeF.
- **New-means-of-transport WDT invoices** (`NoweSrodkiTransportu` / `P_22` and its nested
  vehicle-detail fields) — the generator always emits `P_22N` (not applicable).
- **VAT-group / local-government-subunit routing** (`Podmiot3`, and the `JST`/`GV`
  markers beyond their default "not applicable" value) — these require a `Podmiot3`
  section with role codes 8/10 that this generator doesn't build.
- **Special-procedure sales-summary fields** `P_13_5` through `P_13_11` (EU triangulation,
  VAT-EU OSS, export, domestic reverse charge, margin-scheme sales totals, taxi ryczałt).
  Only the four standard rate buckets plus exempt (`P_13_1`–`P_13_4`, `P_13_7`) are
  populated from your line items.
- **Foreign-currency VAT amounts** (`P_14_*W` fields, the PLN-converted VAT for non-PLN
  invoices) — not computed. NBP exchange-rate conversion is out of scope for this library
  entirely (it's not part of the KSeF protocol).

If you need any of the above, build the XML yourself (or extend this library — see
[`AGENTS.md`](../AGENTS.md) for the ground rule: any new field must be verified against
the actual FA(3) XSD, not inferred from memory).

## Verifying your own output

If you're extending the generator, or just want confidence in what you're sending,
validate against the real schema. You'll need the FA(3) XSD (`schemat_FA(3)_v1-0E.xsd`
and its `bazowe/` dependencies) and `xmllint` (part of `libxml2`, preinstalled on most
Linux/macOS systems):

```bash
xmllint --noout --schema path/to/schemat_FA\(3\)_v1-0E.xsd your-invoice.xml
```

A KSeF-test-environment `/sessions/online/{ref}/invoices` or `/sessions/batch` rejection
is authoritative over anything in this document or the library's tests — if KSeF itself
rejects XML this library produced, that's a bug here; please open an issue with the
rejection's error code/message (redact any real NIPs or amounts you don't want public).
