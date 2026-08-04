import { test } from "node:test";
import assert from "node:assert/strict";
import { generateInvoiceXml, escapeInvoiceXml } from "../dist/index.js";

const baseInvoice = {
    invoiceType: "VAT",
    invoiceNumber: "FV/2026/08/001",
    issueDate: "2026-08-04",
    seller: {
        nip: "1111111111",
        name: "Acme Sp. z o.o.",
        street: "Testowa",
        buildingNumber: "1",
        postalCode: "00-001",
        city: "Warszawa",
        country: "PL",
    },
    buyer: {
        nip: "2222222222",
        name: "Buyer Sp. z o.o.",
        street: "Kupiecka",
        buildingNumber: "2",
        postalCode: "00-002",
        city: "Kraków",
        country: "PL",
    },
    lineItems: [
        { description: "Usługa konsultingowa", quantity: 1, unitOfMeasure: "szt.", unitPrice: 1000, vatRate: 23 },
    ],
};

test("generateInvoiceXml produces a well-formed FA(3) document with correct namespace", () => {
    const xml = generateInvoiceXml(baseInvoice);
    assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.ok(xml.includes('xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/"'));
    assert.ok(xml.includes('<KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza>'));
    assert.ok(xml.includes("<P_2>FV/2026/08/001</P_2>"));
    assert.ok(xml.includes("<P_1>2026-08-04</P_1>"));
});

test("computes net/VAT/gross correctly for a 23% line item", () => {
    const xml = generateInvoiceXml(baseInvoice);
    assert.ok(xml.includes("<P_11>1000.00</P_11>")); // net
    assert.ok(xml.includes("<P_13_1>1000.00</P_13_1>")); // rate-1 net summary
    assert.ok(xml.includes("<P_14_1>230.00</P_14_1>")); // rate-1 vat summary
    assert.ok(xml.includes("<P_15>1230.00</P_15>")); // gross total
});

test("groups multiple VAT rates into separate P_13/P_14 buckets", () => {
    const invoice = {
        ...baseInvoice,
        lineItems: [
            { description: "A", quantity: 1, unitOfMeasure: "szt.", unitPrice: 100, vatRate: 23 },
            { description: "B", quantity: 1, unitOfMeasure: "szt.", unitPrice: 100, vatRate: 8 },
            { description: "C", quantity: 1, unitOfMeasure: "szt.", unitPrice: 100, vatRate: 5 },
            { description: "D", quantity: 1, unitOfMeasure: "szt.", unitPrice: 100, vatRate: 0 },
            { description: "E", quantity: 1, unitOfMeasure: "szt.", unitPrice: 100, vatRate: "zw" },
        ],
    };
    const xml = generateInvoiceXml(invoice);
    assert.ok(xml.includes("<P_13_1>100.00</P_13_1>"));
    assert.ok(xml.includes("<P_13_2>100.00</P_13_2>"));
    assert.ok(xml.includes("<P_13_3>100.00</P_13_3>"));
    assert.ok(xml.includes("<P_13_4>100.00</P_13_4>"));
    assert.ok(xml.includes("<P_13_7>100.00</P_13_7>"));
    // exempt line contributes no VAT amount anywhere
    assert.ok(!xml.includes("<P_14_7>"));
    assert.ok(xml.includes("<P_12>zw</P_12>"));
    // domestic 0% must render as the schema's "0 KR" code, not bare "0"
    assert.ok(xml.includes("<P_12>0 KR</P_12>"));
});

test("defaults to non-applicable annotations (P_19N, P_22N, P_PMarzyN, all P_16-18A/23 = 2)", () => {
    const xml = generateInvoiceXml(baseInvoice);
    assert.ok(xml.includes("<P_16>2</P_16>"));
    assert.ok(xml.includes("<P_17>2</P_17>"));
    assert.ok(xml.includes("<P_18>2</P_18>"));
    assert.ok(xml.includes("<P_18A>2</P_18A>"));
    assert.ok(xml.includes("<P_23>2</P_23>"));
    assert.ok(xml.includes("<P_19N>1</P_19N>"));
    assert.ok(xml.includes("<P_22N>1</P_22N>"));
    assert.ok(xml.includes("<P_PMarzyN>1</P_PMarzyN>"));
});

test("annotations flip to '1' and emit correct sub-elements when set", () => {
    const invoice = {
        ...baseInvoice,
        annotations: {
            cashMethod: true,
            reverseCharge: true,
            taxExemption: { basis: "domestic", reference: "art. 43 ust. 1 pkt 1" },
            marginScheme: "used-goods",
        },
    };
    const xml = generateInvoiceXml(invoice);
    assert.ok(xml.includes("<P_16>1</P_16>"));
    assert.ok(xml.includes("<P_18>1</P_18>"));
    assert.ok(xml.includes("<P_19>1</P_19>"));
    assert.ok(xml.includes("<P_19A>art. 43 ust. 1 pkt 1</P_19A>"));
    assert.ok(!xml.includes("<P_19N>"));
    assert.ok(xml.includes("<P_PMarzy>1</P_PMarzy>"));
    assert.ok(xml.includes("<P_PMarzy_3_1>1</P_PMarzy_3_1>"));
    assert.ok(!xml.includes("<P_PMarzyN>"));
});

test("emits corrective-invoice elements for KOR", () => {
    const invoice = {
        ...baseInvoice,
        invoiceType: "KOR",
        correction: {
            originalInvoiceNumber: "FV/2026/07/001",
            originalInvoiceDate: "2026-07-01",
            originalKsefNumber: "1111111111-20260701-ABC123-EF",
            correctionType: "2",
            reason: "Błędna cena jednostkowa",
        },
    };
    const xml = generateInvoiceXml(invoice);
    assert.ok(xml.includes("<RodzajFaktury>KOR</RodzajFaktury>"));
    assert.ok(xml.includes("<PrzyczynaKorekty>Błędna cena jednostkowa</PrzyczynaKorekty>"));
    assert.ok(xml.includes("<TypKorekty>2</TypKorekty>"));
    assert.ok(xml.includes("<NrFaKorygowanej>FV/2026/07/001</NrFaKorygowanej>"));
    assert.ok(xml.includes("<NrKSeFFaKorygowanej>1111111111-20260701-ABC123-EF</NrKSeFFaKorygowanej>"));
});

test("emits payment block only when payment info is provided", () => {
    const withoutPayment = generateInvoiceXml(baseInvoice);
    assert.ok(!withoutPayment.includes("<Platnosc>"));

    const withPayment = generateInvoiceXml({
        ...baseInvoice,
        paymentMethod: "transfer",
        paymentDeadline: "2026-08-18",
        bankAccount: "PL61109010140000071219812874",
    });
    assert.ok(withPayment.includes("<Platnosc>"));
    assert.ok(withPayment.includes("<FormaPlatnosci>6</FormaPlatnosci>"));
    assert.ok(withPayment.includes("<Termin>2026-08-18</Termin>"));
    assert.ok(withPayment.includes("<NrRB>PL61109010140000071219812874</NrRB>"));
});

test("buyer identified by EU VAT number uses KodUE/NrVatUE instead of NIP", () => {
    const invoice = {
        ...baseInvoice,
        buyer: {
            vatEuNumber: "DE123456789",
            name: "German GmbH",
            street: "Hauptstrasse",
            buildingNumber: "1",
            postalCode: "10115",
            city: "Berlin",
            country: "DE",
        },
    };
    const xml = generateInvoiceXml(invoice);
    assert.ok(xml.includes("<KodUE>DE</KodUE>"));
    assert.ok(xml.includes("<NrVatUE>DE123456789</NrVatUE>"));
});

test("throws when a party has neither nip nor vatEuNumber", () => {
    const invoice = { ...baseInvoice, buyer: { ...baseInvoice.buyer, nip: undefined } };
    assert.throws(() => generateInvoiceXml(invoice), /nip or vatEuNumber/);
});

test("escapeInvoiceXml escapes all five XML special characters", () => {
    assert.equal(escapeInvoiceXml(`<a & "b" 'c'>`), "&lt;a &amp; &quot;b&quot; &apos;c&apos;&gt;");
});

test("XML-escapes untrusted text fields (names, descriptions, correction reason)", () => {
    const invoice = {
        ...baseInvoice,
        seller: { ...baseInvoice.seller, name: `Acme & <Sons> "Ltd"` },
        lineItems: [{ description: "A & B", quantity: 1, unitOfMeasure: "szt.", unitPrice: 10, vatRate: 23 }],
    };
    const xml = generateInvoiceXml(invoice);
    assert.ok(xml.includes("Acme &amp; &lt;Sons&gt; &quot;Ltd&quot;"));
    assert.ok(xml.includes("A &amp; B"));
    assert.ok(!xml.includes("<Sons>"));
});
