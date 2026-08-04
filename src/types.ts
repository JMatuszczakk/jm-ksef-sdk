// ── KSeF API types (derived from KSeF API v2 OpenAPI spec) ──

export const KSEF_TEST_URL = "https://api-test.ksef.mf.gov.pl/v2";
export const KSEF_PROD_URL = "https://api.ksef.mf.gov.pl/v2";

export type ContextIdentifierType = "Nip" | "InternalId" | "NipVatUe";

export interface ContextIdentifier {
    type: ContextIdentifierType;
    value: string;
}

export type SubjectIdentifierType = "certificateSubject" | "certificateFingerprint";

// ── Auth ──

export interface AuthChallengeResponse {
    timestamp: string;
    challenge: string;
}

export interface TokenInfo {
    token: string;
    validUntil: string;
}

export interface AuthInitResponse {
    referenceNumber: string;
    authenticationToken: TokenInfo;
}

export interface AuthStatusResponse {
    startDate: string;
    status: {
        code: number;
        description: string;
        details?: string[];
    };
    isTokenRedeemed?: boolean;
    lastTokenRefreshDate?: string;
    refreshTokenValidUntil?: string;
}

export interface AuthTokensResponse {
    accessToken: TokenInfo;
    refreshToken: TokenInfo;
}

export interface AuthTokenRefreshResponse {
    accessToken: TokenInfo;
}

/** Result of a successful `connect()` — hold on to this to make further calls. */
export interface KsefAuthResult {
    accessToken: string;
    accessTokenValidUntil: string;
    refreshToken: string;
    refreshTokenValidUntil: string;
    referenceNumber: string;
}

// ── Sessions ──

export type SessionType = "online" | "batch";

export interface Encryption {
    encryptedSymmetricKey: string; // Base64
    initializationVector: string; // Base64
}

export interface FormCode {
    systemCode: string; // e.g. "FA (3)"
    schemaVersion: string; // e.g. "1-0E"
    value: string; // e.g. "FA"
}

export type SchemaVersion = "FA(2)" | "FA(3)";

export interface OpenOnlineSessionResponse {
    referenceNumber: string;
    validUntil: string;
}

export interface SendInvoiceResponse {
    referenceNumber: string;
}

/** Encryption material for a session — keep it in memory only for the session's lifetime. */
export interface SessionKeyMaterial {
    aesKey: Uint8Array;
    iv: Uint8Array;
}

// ── Invoice metadata ──

export type SubjectType = "Subject1" | "Subject2" | "Subject3" | "SubjectAuthorized";
export type DateType = "Issue" | "Invoicing" | "PermanentStorage";

export interface InvoiceQueryFilters {
    subjectType: SubjectType;
    dateRange: {
        from: string;
        to?: string;
        dateType: DateType;
    };
    restrictToPermanentStorageHwmDate?: boolean;
    formCode?: FormCode;
    invoiceTypes?: string[];
    hasAttachment?: boolean;
}

export interface InvoiceMetadata {
    ksefNumber: string;
    invoiceNumber: string;
    issueDate: string;
    invoicingDate: string;
    acquisitionDate: string;
    permanentStorageDate: string;
    seller: { nip: string; name: string };
    buyer: {
        identifier: { type: string; value: string };
        name: string;
    };
    netAmount: number;
    grossAmount: number;
    vatAmount: number;
    currency: string;
    invoicingMode: "Online" | "Offline";
    invoiceType: string;
    formCode: FormCode;
    isSelfInvoicing: boolean;
    hasAttachment: boolean;
    invoiceHash: string;
}

export interface QueryInvoicesMetadataResponse {
    invoices: InvoiceMetadata[];
    pageOffset: number;
    pageSize: number;
    totalCount: number;
}

// ── Invoice export ──

export interface InvoiceExportPart {
    ordinalNumber: number;
    partName: string;
    method: string;
    url: string;
    partSize: number;
    partHash: string;
    encryptedPartSize: number;
    encryptedPartHash: string;
    expirationDate: string;
}

export interface InvoiceExportStatusResponse {
    status: { code: number; description: string };
    completedDate?: string;
    package?: {
        invoiceCount: number;
        size: number;
        parts: InvoiceExportPart[];
        isTruncated: boolean;
        lastPermanentStorageDate: string;
        permanentStorageHwmDate: string;
    };
}

// ── Session status ──

export interface SessionStatusResponse {
    status: { code: number; description: string };
    sessionType: SessionType;
    referenceNumber: string;
    invoiceCount?: number;
    upo?: {
        pages: Array<{ referenceNumber: string; downloadUrl: string }>;
    };
}

export interface SessionInvoiceStatus {
    referenceNumber: string;
    ksefNumber?: string;
    invoiceNumber?: string;
    status: { code: number; description: string };
}

// ── Permissions ──

export type PermissionType =
    | "InvoiceWrite"
    | "InvoiceRead"
    | "CredentialsManage"
    | "CredentialsRead"
    | "Introspection"
    | "SubunitManage"
    | "EnforcementOperations"
    | "VatEuManage";

export type AuthorizationPermissionType =
    | "SelfInvoicing"
    | "TaxRepresentative"
    | "RRInvoicing"
    | "PefInvoicing";

// ── Public key certificates ──

export type PublicKeyUsage = "KsefTokenEncryption" | "SymmetricKeyEncryption";

export interface PublicKeyCertificate {
    usage: PublicKeyUsage | PublicKeyUsage[];
    certificate: string; // Base64 DER X.509
    publicKey?: string;
    validFrom: string;
    validTo: string;
}

// ── Batch sessions ──

export interface BatchFilePart {
    ordinalNumber: number;
    fileSize: number;
    fileHash: string;
}

export interface BatchPartUploadRequest {
    ordinalNumber: number;
    url: string;
    method: string;
    headers: Record<string, string>;
}

export interface OpenBatchSessionResponse {
    referenceNumber: string;
    partUploadRequests: BatchPartUploadRequest[];
}
