/**
 * FA(3) invoice XML generator.
 *
 * Builds a `<Faktura>` document conforming to the KSeF FA(3) schema
 * (`http://crd.gov.pl/wzor/2025/06/25/13775/`, `schemat_FA(3)_v1-0E.xsd`) from
 * a plain data object — the XML that `KsefSession`'s `OnlineSession.sendInvoice()`
 * / `openBatchSession()` expect.
 *
 * Only FA(3) is supported. FA(2) generation is not implemented — FA(2) is being
 * phased out by KSeF in favor of FA(3), and supporting both would double the
 * surface area of a hand-rolled XML builder for a shrinking use case.
 *
 * Deliberately unsupported (throws or silently requires you to build the XML
 * yourself if you need these — see field-level docs below): new-means-of-transport
 * WDT invoices, VAT-group subordinate-unit routing (Podmiot3/JST/GV), OSS/margin
 * sub-schemes beyond a single flag, and the P_13_5..P_13_11 special-procedure
 * sales categories (VAT-EU triangulation, export, reverse charge, margin scheme
 * sales summaries). Everything needed for a standard domestic B2B/B2C VAT
 * invoice — including the common 23/8/5/0/exempt rate breakdown — is covered.
 */

/** VAT rate for a line item. Use `"zw"` for exempt sales (no VAT amount). */
export type VatRate = 23 | 22 | 8 | 7 | 5 | 0 | "zw";

export type InvoiceType = "VAT" | "KOR" | "ZAL" | "ROZ" | "KOR_ZAL" | "KOR_ROZ" | "UPR";

export interface CorrectionData {
    /** Original invoice number (NrFaKorygowanej). */
    originalInvoiceNumber: string;
    /** Original invoice issue date (DataWystFaKorygowanej) — YYYY-MM-DD. */
    originalInvoiceDate: string;
    /** KSeF number of the original invoice — omit when it was issued outside KSeF. */
    originalKsefNumber?: string;
    /** True when the original invoice was issued outside KSeF (emits NrKSeFN). */
    outsideKsef?: boolean;
    /** Reason for the correction (PrzyczynaKorekty). */
    reason?: string;
    /** Effect of the correction in the VAT register: 1=decrease, 2=increase, 3=collective (TypKorekty). */
    correctionType?: "1" | "2" | "3";
}

export interface Party {
    /** Polish NIP. Required for the seller; buyers may use `vatEuNumber` instead. */
    nip?: string;
    /** EU VAT number for a buyer identified by NipVatUe rather than a Polish NIP. */
    vatEuNumber?: string;
    name: string;
    street: string;
    buildingNumber: string;
    apartmentNumber?: string;
    postalCode: string;
    city: string;
    /** ISO 3166-1 alpha-2 country code, e.g. "PL". */
    country: string;
}

export interface InvoiceLineItem {
    description: string;
    quantity: number;
    /** Unit of measure code/label, e.g. "szt.", "godz.", "kg". */
    unitOfMeasure: string;
    /** Net unit price. */
    unitPrice: number;
    vatRate: VatRate;
}

export type PaymentMethod = "transfer" | "cash" | "card" | "other";

/**
 * Optional statutory annotations (Adnotacje). Every field defaults to "not
 * applicable" when omitted, matching the common case of a plain domestic
 * VAT invoice. Set the ones that apply to your invoice — don't set flags you
 * aren't sure apply; each corresponds to a specific statutory condition (see
 * the field comments, sourced from the FA(3) XSD's own annotations).
 */
export interface InvoiceAnnotations {
    /** P_16 — cash-method VAT accounting ("metoda kasowa"). */
    cashMethod?: boolean;
    /** P_17 — buyer self-billing ("samofakturowanie"). */
    selfBilling?: boolean;
    /** P_18 — reverse charge, buyer accounts for the VAT ("odwrotne obciążenie"). */
    reverseCharge?: boolean;
    /** P_18A — split payment mechanism required (total > 15,000 PLN, Annex 15 goods/services). */
    splitPayment?: boolean;
    /**
     * P_19/P_19A|P_19B|P_19C — statutory VAT exemption. The schema allows exactly
     * one legal-basis field per invoice (it's an XSD choice, not three independent
     * fields) — pick the `basis` that matches your exemption. Omit entirely for a
     * taxable invoice (emits P_19N instead).
     */
    taxExemption?:
        | { basis: "domestic"; reference: string } // P_19A — Ustawa o VAT / implementing regulation
        | { basis: "eu-directive"; reference: string } // P_19B — Directive 2006/112/EC article
        | { basis: "other"; reference: string }; // P_19C — any other legal basis
    /** P_23 — simplified triangulation procedure (second-in-chain taxpayer, Art. 135–136). */
    simplifiedTriangulation?: boolean;
    /**
     * PMarzy — margin scheme (Art. 119/120). Pick the specific sub-procedure;
     * omit entirely for a normal invoice (emits P_PMarzyN instead).
     */
    marginScheme?: "travel-agent" | "used-goods" | "art" | "collectibles-antiques";
}

export interface Invoice {
    invoiceType: InvoiceType;
    /** Required when `invoiceType` is "KOR", "KOR_ZAL", or "KOR_ROZ". */
    correction?: CorrectionData;
    /** P_2 — invoice number. */
    invoiceNumber: string;
    /** P_1 — issue date, YYYY-MM-DD. */
    issueDate: string;
    /** ISO 4217 currency code. Defaults to "PLN". */
    currency?: string;
    seller: Party;
    buyer: Party;
    lineItems: InvoiceLineItem[];
    paymentMethod?: PaymentMethod;
    /** YYYY-MM-DD. */
    paymentDeadline?: string;
    /** IBAN. */
    bankAccount?: string;
    annotations?: InvoiceAnnotations;
}

interface ComputedLineItem extends InvoiceLineItem {
    net: number;
    vat: number;
    gross: number;
}

function round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

function computeLineItem(item: InvoiceLineItem): ComputedLineItem {
    const net = round2(item.quantity * item.unitPrice);
    const rate = item.vatRate === "zw" ? 0 : item.vatRate;
    const vat = item.vatRate === "zw" ? 0 : round2(net * (rate / 100));
    return { ...item, net, vat, gross: round2(net + vat) };
}

export /**
 * Map a `VatRate` to the exact P_12 code the schema's enumeration expects.
 * Domestic 0% is `"0 KR"`, not bare `"0"` — the schema also defines `"0 WDT"`
 * (intra-EU supply) and `"0 EX"` (export), which this library doesn't produce
 * since it only handles the domestic-sale case (see module doc comment).
 */
function vatRateCode(rate: VatRate): string {
    return rate === "zw" ? "zw" : rate === 0 ? "0 KR" : String(rate);
}

export function escapeXml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function partyIdentyfikacja(party: Party): string {
    if (party.nip) {
        return `<NIP>${escapeXml(party.nip)}</NIP>`;
    }
    if (party.vatEuNumber) {
        return `<KodUE>${escapeXml(party.country)}</KodUE><NrVatUE>${escapeXml(party.vatEuNumber)}</NrVatUE>`;
    }
    throw new Error("Party must have either nip or vatEuNumber set");
}

function partyXml(tag: "Podmiot1" | "Podmiot2", party: Party, extra = ""): string {
    return `  <${tag}>
    <DaneIdentyfikacyjne>
      ${partyIdentyfikacja(party)}
      <Nazwa>${escapeXml(party.name)}</Nazwa>
    </DaneIdentyfikacyjne>
    <Adres>
      <KodKraju>${escapeXml(party.country)}</KodKraju>
      <AdresL1>${escapeXml(party.street)} ${escapeXml(party.buildingNumber)}</AdresL1>
      <AdresL2>${escapeXml(party.postalCode)} ${escapeXml(party.city)}</AdresL2>
    </Adres>${extra}
  </${tag}>`;
}

function vatGroupXml(items: ComputedLineItem[]): string {
    const groups: Record<"1" | "2" | "3" | "4" | "7", { net: number; vat: number }> = {
        "1": { net: 0, vat: 0 }, // 23/22%
        "2": { net: 0, vat: 0 }, // 8/7%
        "3": { net: 0, vat: 0 }, // 5%
        "4": { net: 0, vat: 0 }, // 0% domestic
        "7": { net: 0, vat: 0 }, // zw (exempt) — vat always 0
    };

    for (const item of items) {
        const key =
            item.vatRate === 23 || item.vatRate === 22 ? "1" :
            item.vatRate === 8 || item.vatRate === 7 ? "2" :
            item.vatRate === 5 ? "3" :
            item.vatRate === 0 ? "4" :
            "7";
        groups[key].net = round2(groups[key].net + item.net);
        groups[key].vat = round2(groups[key].vat + item.vat);
    }

    const lines: string[] = [];
    if (groups["1"].net > 0) lines.push(`    <P_13_1>${groups["1"].net.toFixed(2)}</P_13_1>`, `    <P_14_1>${groups["1"].vat.toFixed(2)}</P_14_1>`);
    if (groups["2"].net > 0) lines.push(`    <P_13_2>${groups["2"].net.toFixed(2)}</P_13_2>`, `    <P_14_2>${groups["2"].vat.toFixed(2)}</P_14_2>`);
    if (groups["3"].net > 0) lines.push(`    <P_13_3>${groups["3"].net.toFixed(2)}</P_13_3>`, `    <P_14_3>${groups["3"].vat.toFixed(2)}</P_14_3>`);
    if (groups["4"].net > 0) lines.push(`    <P_13_4>${groups["4"].net.toFixed(2)}</P_13_4>`, `    <P_14_4>${groups["4"].vat.toFixed(2)}</P_14_4>`);
    if (groups["7"].net > 0) lines.push(`    <P_13_7>${groups["7"].net.toFixed(2)}</P_13_7>`);
    return lines.join("\n");
}

function annotationsXml(a: InvoiceAnnotations | undefined): string {
    const bool2 = (v: boolean | undefined) => (v ? "1" : "2");

    const exemptionTag: Record<NonNullable<InvoiceAnnotations["taxExemption"]>["basis"], string> = {
        domestic: "P_19A",
        "eu-directive": "P_19B",
        other: "P_19C",
    };
    const zwolnienie = a?.taxExemption
        ? `      <Zwolnienie>
        <P_19>1</P_19>
        <${exemptionTag[a.taxExemption.basis]}>${escapeXml(a.taxExemption.reference)}</${exemptionTag[a.taxExemption.basis]}>
      </Zwolnienie>`
        : `      <Zwolnienie>
        <P_19N>1</P_19N>
      </Zwolnienie>`;

    const marginSubtag: Record<NonNullable<InvoiceAnnotations["marginScheme"]>, string> = {
        "travel-agent": "P_PMarzy_2",
        "used-goods": "P_PMarzy_3_1",
        art: "P_PMarzy_3_2",
        "collectibles-antiques": "P_PMarzy_3_3",
    };
    const pMarzy = a?.marginScheme
        ? `      <PMarzy>
        <P_PMarzy>1</P_PMarzy>
        <${marginSubtag[a.marginScheme]}>1</${marginSubtag[a.marginScheme]}>
      </PMarzy>`
        : `      <PMarzy>
        <P_PMarzyN>1</P_PMarzyN>
      </PMarzy>`;

    return `    <Adnotacje>
      <P_16>${bool2(a?.cashMethod)}</P_16>
      <P_17>${bool2(a?.selfBilling)}</P_17>
      <P_18>${bool2(a?.reverseCharge)}</P_18>
      <P_18A>${bool2(a?.splitPayment)}</P_18A>
${zwolnienie}
      <NoweSrodkiTransportu>
        <P_22N>1</P_22N>
      </NoweSrodkiTransportu>
      <P_23>${bool2(a?.simplifiedTriangulation)}</P_23>
${pMarzy}
    </Adnotacje>`;
}

function correctionXml(invoice: Invoice): string {
    const isKor = invoice.invoiceType === "KOR" || invoice.invoiceType === "KOR_ZAL" || invoice.invoiceType === "KOR_ROZ";
    if (!isKor || !invoice.correction) return "";
    const c = invoice.correction;
    const ksefRef = c.outsideKsef
        ? `      <NrKSeFN>1</NrKSeFN>`
        : `      <NrKSeF>1</NrKSeF>\n      <NrKSeFFaKorygowanej>${escapeXml(c.originalKsefNumber ?? "")}</NrKSeFFaKorygowanej>`;
    return `    <PrzyczynaKorekty>${escapeXml(c.reason ?? "")}</PrzyczynaKorekty>
    <TypKorekty>${c.correctionType ?? "1"}</TypKorekty>
    <DaneFaKorygowanej>
      <DataWystFaKorygowanej>${c.originalInvoiceDate}</DataWystFaKorygowanej>
      <NrFaKorygowanej>${escapeXml(c.originalInvoiceNumber)}</NrFaKorygowanej>
${ksefRef}
    </DaneFaKorygowanej>`;
}

function paymentXml(invoice: Invoice): string {
    const methodMap: Record<PaymentMethod, string> = { transfer: "6", cash: "1", card: "3", other: "9" };
    const hasAny = invoice.paymentMethod || invoice.paymentDeadline || invoice.bankAccount;
    if (!hasAny) return "";
    const inner: string[] = [];
    if (invoice.paymentDeadline) {
        inner.push(`      <TerminPlatnosci>\n        <Termin>${invoice.paymentDeadline}</Termin>\n      </TerminPlatnosci>`);
    }
    if (invoice.paymentMethod) {
        inner.push(`      <FormaPlatnosci>${methodMap[invoice.paymentMethod]}</FormaPlatnosci>`);
    }
    if (invoice.bankAccount) {
        inner.push(`      <RachunekBankowy>\n        <NrRB>${escapeXml(invoice.bankAccount)}</NrRB>\n      </RachunekBankowy>`);
    }
    return `    <Platnosc>\n${inner.join("\n")}\n    </Platnosc>`;
}

/**
 * Generate a KSeF FA(3) invoice XML document from plain invoice data.
 *
 * Amounts (net/VAT/gross per line, and the VAT-rate-group summary) are
 * computed for you from `quantity` × `unitPrice` × `vatRate` — you don't need
 * to pre-round or pre-sum anything.
 */
export function generateInvoiceXml(invoice: Invoice): string {
    const items = invoice.lineItems.map(computeLineItem);
    const totalGross = round2(items.reduce((s, i) => s + i.gross, 0));
    const currency = invoice.currency ?? "PLN";

    const lineItemsXml = items
        .map(
            (item, idx) => `    <FaWiersz>
      <NrWierszaFa>${idx + 1}</NrWierszaFa>
      <P_7>${escapeXml(item.description)}</P_7>
      <P_8A>${escapeXml(item.unitOfMeasure)}</P_8A>
      <P_8B>${item.quantity}</P_8B>
      <P_9A>${item.unitPrice.toFixed(2)}</P_9A>
      <P_11>${item.net.toFixed(2)}</P_11>
      <P_12>${vatRateCode(item.vatRate)}</P_12>
    </FaWiersz>`
        )
        .join("\n");

    const kor = correctionXml(invoice);
    const platnosc = paymentXml(invoice);

    return `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/">
  <Naglowek>
    <KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza>
    <WariantFormularza>3</WariantFormularza>
    <DataWytworzeniaFa>${new Date().toISOString()}</DataWytworzeniaFa>
    <SystemInfo>jm-ksef</SystemInfo>
  </Naglowek>
${partyXml("Podmiot1", invoice.seller)}
${partyXml("Podmiot2", invoice.buyer, `\n    <JST>2</JST>\n    <GV>2</GV>`)}
  <Fa>
    <KodWaluty>${escapeXml(currency)}</KodWaluty>
    <P_1>${invoice.issueDate}</P_1>
    <P_2>${escapeXml(invoice.invoiceNumber)}</P_2>
${vatGroupXml(items)}
    <P_15>${totalGross.toFixed(2)}</P_15>
${annotationsXml(invoice.annotations)}
    <RodzajFaktury>${invoice.invoiceType}</RodzajFaktury>
${kor ? kor + "\n" : ""}${lineItemsXml}
${platnosc ? platnosc + "\n" : ""}  </Fa>
</Faktura>`;
}
