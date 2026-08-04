import { KsefHttpClient, KsefApiError, createHttpClient } from "./http.js";
import {
    importRsaPublicKey,
    encryptKsefToken,
    generateAesKeyAndIv,
    encryptAesKeyForKsef,
    importAesKey,
    aesEncrypt,
    sha256,
    sha256Base64Url,
    uint8ToBase64,
} from "./crypto.js";
import { buildSimpleZip } from "./zip.js";
import type {
    AuthChallengeResponse,
    AuthInitResponse,
    AuthStatusResponse,
    AuthTokensResponse,
    AuthTokenRefreshResponse,
    PublicKeyCertificate,
    ContextIdentifierType,
    FormCode,
    SchemaVersion,
    OpenOnlineSessionResponse,
    QueryInvoicesMetadataResponse,
    InvoiceQueryFilters,
    InvoiceExportStatusResponse,
    KsefAuthResult,
    OpenBatchSessionResponse,
    BatchPartUploadRequest,
} from "./types.js";

export interface KsefSessionOptions {
    /** KSeF API base URL, e.g. `KSEF_TEST_URL` or `KSEF_PROD_URL`. */
    apiUrl: string;
    /** NIP (or other context identifier value) of the entity to authenticate as. */
    nip: string;
    /** Long-lived KSeF authentication token, generated from the KSeF web app. */
    ksefToken: string;
    contextType?: ContextIdentifierType;
    /** Max polling attempts while waiting for auth confirmation (default 10, 1s apart). */
    authPollAttempts?: number;
}

function formCodeFor(schemaVersion: SchemaVersion): FormCode {
    return schemaVersion === "FA(2)"
        ? { systemCode: "FA (2)", schemaVersion: "1-0E", value: "FA" }
        : { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" };
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getPublicKey(
    unauthClient: KsefHttpClient,
    usage: "KsefTokenEncryption" | "SymmetricKeyEncryption"
): Promise<CryptoKey> {
    const keys = await unauthClient.get<PublicKeyCertificate[]>("/security/public-key-certificates");
    const match = keys.find((k) => (Array.isArray(k.usage) ? k.usage.includes(usage) : k.usage === usage));
    if (!match) throw new Error(`KSeF public key for usage "${usage}" not found`);
    return importRsaPublicKey(match.certificate ?? match.publicKey!);
}

/**
 * Stateful, high-level KSeF client. Handles authentication, encrypted sessions,
 * invoice sending, querying, and export — all in memory, no external storage
 * required (bring your own persistence if you need to survive restarts).
 */
export class KsefSession {
    private http: KsefHttpClient;
    private opts: Required<Pick<KsefSessionOptions, "contextType" | "authPollAttempts">> & KsefSessionOptions;

    private accessToken?: string;
    private accessTokenValidUntil?: string;
    private refreshToken?: string;
    private refreshTokenValidUntil?: string;

    constructor(options: KsefSessionOptions) {
        this.opts = {
            contextType: "Nip",
            authPollAttempts: 10,
            ...options,
        };
        this.http = createHttpClient(this.opts.apiUrl);
    }

    get isConnected(): boolean {
        return !!this.accessToken;
    }

    get tokens(): KsefAuthResult | null {
        if (!this.accessToken || !this.refreshToken) return null;
        return {
            accessToken: this.accessToken,
            accessTokenValidUntil: this.accessTokenValidUntil ?? "",
            refreshToken: this.refreshToken,
            refreshTokenValidUntil: this.refreshTokenValidUntil ?? "",
            referenceNumber: "",
        };
    }

    /**
     * Full KSeF authentication flow: challenge → encrypt token → submit →
     * poll for confirmation → redeem access/refresh tokens.
     */
    async connect(): Promise<KsefAuthResult> {
        const contextIdentifier = { type: this.opts.contextType, value: this.opts.nip };
        const anonClient = createHttpClient(this.opts.apiUrl);

        const challengeResp = await anonClient.post<AuthChallengeResponse>("/auth/challenge", {
            contextIdentifier,
        });

        const rsaKey = await getPublicKey(anonClient, "KsefTokenEncryption");
        const encryptedToken = await encryptKsefToken(this.opts.ksefToken, challengeResp.timestamp, rsaKey);

        const authResp = await anonClient.post<AuthInitResponse>("/auth/ksef-token", {
            challenge: challengeResp.challenge,
            contextIdentifier,
            encryptedToken,
        });

        const authClient = createHttpClient(this.opts.apiUrl, authResp.authenticationToken.token);
        let authSucceeded = false;
        for (let attempt = 0; attempt < this.opts.authPollAttempts; attempt++) {
            await sleep(1000);
            const status = await authClient.get<AuthStatusResponse>(`/auth/${authResp.referenceNumber}`);
            const code = status.status?.code;
            if (code === 200) {
                authSucceeded = true;
                break;
            }
            if (code && code >= 400) {
                throw new Error(status.status?.description || "KSeF authentication failed");
            }
        }
        if (!authSucceeded) {
            throw new Error("KSeF authentication polling timed out — not confirmed in time");
        }

        const tokensResp = await authClient.post<AuthTokensResponse>("/auth/token/redeem");

        this.accessToken = tokensResp.accessToken.token;
        this.accessTokenValidUntil = tokensResp.accessToken.validUntil;
        this.refreshToken = tokensResp.refreshToken.token;
        this.refreshTokenValidUntil =
            tokensResp.refreshToken.validUntil || new Date(Date.now() + 7 * 86400 * 1000).toISOString();
        this.http.setAccessToken(this.accessToken);

        return {
            accessToken: this.accessToken,
            accessTokenValidUntil: this.accessTokenValidUntil,
            refreshToken: this.refreshToken,
            refreshTokenValidUntil: this.refreshTokenValidUntil,
            referenceNumber: authResp.referenceNumber,
        };
    }

    /** Refresh the access token using the stored refresh token. */
    async refresh(): Promise<void> {
        if (!this.refreshToken) throw new Error("Not connected — call connect() first");
        const client = createHttpClient(this.opts.apiUrl, this.refreshToken);
        const resp = await client.post<AuthTokenRefreshResponse>("/auth/token/refresh");
        this.accessToken = resp.accessToken.token;
        this.accessTokenValidUntil = resp.accessToken.validUntil;
        this.http.setAccessToken(this.accessToken);
    }

    /** Resume a previously-connected session (e.g. after restoring tokens from your own storage). */
    restoreTokens(tokens: Pick<KsefAuthResult, "accessToken" | "refreshToken" | "refreshTokenValidUntil"> & { accessTokenValidUntil?: string }): void {
        this.accessToken = tokens.accessToken;
        this.accessTokenValidUntil = tokens.accessTokenValidUntil;
        this.refreshToken = tokens.refreshToken;
        this.refreshTokenValidUntil = tokens.refreshTokenValidUntil;
        this.http.setAccessToken(this.accessToken);
    }

    /** Revoke the current session (best-effort) and clear local tokens. */
    async disconnect(): Promise<void> {
        if (this.accessToken) {
            try {
                await this.http.delete("/auth/sessions/current");
            } catch {
                // best effort — session may already be expired
            }
        }
        this.accessToken = undefined;
        this.refreshToken = undefined;
        this.http.setAccessToken(undefined);
    }

    private requireClient(): KsefHttpClient {
        if (!this.accessToken) throw new Error("Not connected — call connect() first");
        return this.http;
    }

    // ── Online (interactive) sessions ──

    async openOnlineSession(schemaVersion: SchemaVersion): Promise<OnlineSession> {
        const client = this.requireClient();
        const anonClient = createHttpClient(this.opts.apiUrl);
        const rsaKey = await getPublicKey(anonClient, "SymmetricKeyEncryption");

        const { key: aesKey, iv } = generateAesKeyAndIv();
        const encryptedSymmetricKey = await encryptAesKeyForKsef(aesKey, rsaKey);

        const resp = await client.post<OpenOnlineSessionResponse>("/sessions/online", {
            formCode: formCodeFor(schemaVersion),
            encryption: {
                encryptedSymmetricKey,
                initializationVector: uint8ToBase64(iv),
            },
        });

        return new OnlineSession(client, resp.referenceNumber, resp.validUntil, aesKey, iv);
    }

    /** Build a batch session from an array of invoice XML documents, upload, and leave it open for closing. */
    async openBatchSession(
        schemaVersion: SchemaVersion,
        invoices: { fileName: string; xml: string }[]
    ): Promise<BatchSession> {
        if (!invoices.length) throw new Error("At least one invoice XML is required");
        const client = this.requireClient();
        const anonClient = createHttpClient(this.opts.apiUrl);
        const rsaKey = await getPublicKey(anonClient, "SymmetricKeyEncryption");

        const { key: aesKey, iv } = generateAesKeyAndIv();
        const encryptedSymmetricKey = await encryptAesKeyForKsef(aesKey, rsaKey);

        const zipBytes = buildSimpleZip(
            invoices.map((inv) => ({
                name: inv.fileName.endsWith(".xml") ? inv.fileName : `${inv.fileName}.xml`,
                data: new TextEncoder().encode(inv.xml),
            }))
        );
        const zipHash = await sha256(zipBytes);

        const MAX_PART_SIZE = 100 * 1000 * 1000;
        const partCount = Math.max(1, Math.ceil(zipBytes.length / MAX_PART_SIZE));
        const partSize = Math.ceil(zipBytes.length / partCount);
        const rawParts: Uint8Array[] = [];
        for (let i = 0; i < partCount; i++) {
            const start = i * partSize;
            const end = Math.min(start + partSize, zipBytes.length);
            rawParts.push(zipBytes.slice(start, end));
        }

        const importedAesKey = await importAesKey(aesKey);
        const encryptedParts: { ordinalNumber: number; data: Uint8Array; hash: string; size: number }[] = [];
        for (let i = 0; i < rawParts.length; i++) {
            const encrypted = await aesEncrypt(importedAesKey, iv, rawParts[i]);
            const hash = await sha256(encrypted);
            encryptedParts.push({ ordinalNumber: i + 1, data: encrypted, hash, size: encrypted.length });
        }

        const resp = await client.post<OpenBatchSessionResponse>("/sessions/batch", {
            formCode: formCodeFor(schemaVersion),
            batchFile: {
                fileSize: zipBytes.length,
                fileHash: zipHash,
                fileParts: encryptedParts.map((p) => ({
                    ordinalNumber: p.ordinalNumber,
                    fileSize: p.size,
                    fileHash: p.hash,
                })),
            },
            encryption: {
                encryptedSymmetricKey,
                initializationVector: uint8ToBase64(iv),
            },
            offlineMode: false,
        });

        const uploadResults: { ordinalNumber: number; status: number }[] = [];
        for (const uploadReq of resp.partUploadRequests) {
            const part = encryptedParts.find((p) => p.ordinalNumber === uploadReq.ordinalNumber);
            if (!part) continue;
            const uploadRes = await fetch(uploadReq.url, {
                method: uploadReq.method,
                headers: uploadReq.headers,
                body: part.data as BodyInit,
            });
            uploadResults.push({ ordinalNumber: uploadReq.ordinalNumber, status: uploadRes.status });
            if (!uploadRes.ok && uploadRes.status !== 201) {
                throw new Error(`Batch part ${uploadReq.ordinalNumber} upload failed with status ${uploadRes.status}`);
            }
        }

        return new BatchSession(client, resp.referenceNumber, invoices.length, uploadResults);
    }

    async closeOnlineSession(referenceNumber: string): Promise<void> {
        await this.requireClient().post(`/sessions/online/${referenceNumber}/close`);
    }

    async closeBatchSession(referenceNumber: string): Promise<void> {
        await this.requireClient().post(`/sessions/batch/${referenceNumber}/close`);
    }

    async getSessionStatus(referenceNumber: string): Promise<unknown> {
        return this.requireClient().get(`/sessions/${referenceNumber}`);
    }

    async listSessions(opts?: { sessionType?: "Online" | "Batch"; pageSize?: number; continuationToken?: string }): Promise<unknown> {
        const client = this.requireClient();
        const pageSize = opts?.pageSize ?? 20;
        const sessionType = opts?.sessionType ?? "Online";
        const headers: Record<string, string> = {};
        if (opts?.continuationToken) headers["x-continuation-token"] = opts.continuationToken;
        return client.get(`/sessions?pageSize=${pageSize}&sessionType=${encodeURIComponent(sessionType)}`, headers);
    }

    async listSessionInvoices(referenceNumber: string, continuationToken?: string): Promise<unknown> {
        const headers: Record<string, string> = {};
        if (continuationToken) headers["x-continuation-token"] = continuationToken;
        return this.requireClient().get(`/sessions/${referenceNumber}/invoices`, headers);
    }

    async getFailedSessionInvoices(referenceNumber: string, continuationToken?: string): Promise<unknown> {
        const headers: Record<string, string> = {};
        if (continuationToken) headers["x-continuation-token"] = continuationToken;
        return this.requireClient().get(`/sessions/${referenceNumber}/invoices/failed`, headers);
    }

    async getSessionInvoiceStatus(referenceNumber: string, invoiceReferenceNumber: string): Promise<unknown> {
        return this.requireClient().get(`/sessions/${referenceNumber}/invoices/${invoiceReferenceNumber}`);
    }

    async getUpo(referenceNumber: string, upoReferenceNumber: string): Promise<string> {
        const res = await this.requireClient().getRaw(`/sessions/${referenceNumber}/upo/${upoReferenceNumber}`);
        return res.text();
    }

    // ── Invoice querying / export / verification ──

    async queryInvoices(
        filters: InvoiceQueryFilters,
        opts?: { pageOffset?: number; pageSize?: number }
    ): Promise<QueryInvoicesMetadataResponse> {
        const pageOffset = opts?.pageOffset ?? 0;
        const pageSize = opts?.pageSize ?? 10;
        return this.requireClient().post<QueryInvoicesMetadataResponse>(
            `/invoices/query/metadata?pageOffset=${pageOffset}&pageSize=${pageSize}`,
            filters
        );
    }

    /** Fetch the raw invoice XML by its KSeF number. */
    async getInvoiceXml(ksefNumber: string): Promise<string> {
        const res = await this.requireClient().getRaw(`/invoices/ksef/${encodeURIComponent(ksefNumber)}`);
        return res.text();
    }

    /** Start an asynchronous invoice export job. Returns the reference number to poll with `getExportStatus`. */
    async startExport(filters: InvoiceQueryFilters, onlyMetadata = false): Promise<string> {
        const client = this.requireClient();
        const anonClient = createHttpClient(this.opts.apiUrl);
        const rsaKey = await getPublicKey(anonClient, "SymmetricKeyEncryption");
        const { key: aesKey, iv } = generateAesKeyAndIv();
        const encryptedSymmetricKey = await encryptAesKeyForKsef(aesKey, rsaKey);

        const resp = await client.post<{ referenceNumber: string }>("/invoices/exports", {
            encryption: { encryptedSymmetricKey, initializationVector: uint8ToBase64(iv) },
            onlyMetadata,
            filters,
        });
        return resp.referenceNumber;
    }

    async getExportStatus(referenceNumber: string): Promise<InvoiceExportStatusResponse> {
        return this.requireClient().get<InvoiceExportStatusResponse>(`/invoices/exports/${referenceNumber}`);
    }

    /**
     * Build the official KSeF verification (KOD I) QR URL for an accepted invoice.
     * `apiUrl` is used to derive the `qr-*` host from the `api-*` host you're configured against.
     */
    async buildVerificationQrUrl(invoiceXml: string, nip: string, issueDateDDMMYYYY: string): Promise<string> {
        const encoded = new TextEncoder().encode(invoiceXml);
        const hash = await sha256Base64Url(encoded);
        const apiHostname = new URL(this.opts.apiUrl).hostname;
        const qrHostname = apiHostname.replace(/^api(-|\.)/, (_m, sep) => `qr${sep}`);
        return `https://${qrHostname}/invoice/${nip}/${issueDateDDMMYYYY}/${hash}`;
    }
}

/** Handle to an open interactive (online) session — encrypts and sends invoices one at a time. */
export class OnlineSession {
    constructor(
        private client: KsefHttpClient,
        public readonly referenceNumber: string,
        public readonly validUntil: string,
        private aesKey: Uint8Array,
        private iv: Uint8Array
    ) {}

    /** Encrypt and send a single invoice XML document. Returns KSeF's reference number for it. */
    async sendInvoice(xml: string): Promise<{ referenceNumber: string }> {
        const xmlBytes = new TextEncoder().encode(xml);
        const key = await importAesKey(this.aesKey);
        const encryptedBytes = await aesEncrypt(key, this.iv, xmlBytes);
        const originalHash = await sha256(xmlBytes);
        const encryptedHash = await sha256(encryptedBytes);

        return this.client.post<{ referenceNumber: string }>(`/sessions/online/${this.referenceNumber}/invoices`, {
            invoiceHash: originalHash,
            invoiceSize: xmlBytes.length,
            encryptedInvoiceHash: encryptedHash,
            encryptedInvoiceSize: encryptedBytes.length,
            encryptedInvoiceContent: uint8ToBase64(encryptedBytes),
        });
    }

    async close(): Promise<void> {
        await this.client.post(`/sessions/online/${this.referenceNumber}/close`);
    }
}

/** Handle to an opened (and already uploaded) batch session. */
export class BatchSession {
    constructor(
        private client: KsefHttpClient,
        public readonly referenceNumber: string,
        public readonly invoiceCount: number,
        public readonly uploadResults: { ordinalNumber: number; status: number }[]
    ) {}

    async close(): Promise<void> {
        await this.client.post(`/sessions/batch/${this.referenceNumber}/close`);
    }
}

export { KsefApiError };
