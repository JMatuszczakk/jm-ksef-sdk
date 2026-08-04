/**
 * Crypto utilities for KSeF integration.
 * Built entirely on WebCrypto (`globalThis.crypto.subtle`) — works unmodified
 * in Node.js 20+, browsers, and Cloudflare Workers/Deno.
 */

// ── RSA-OAEP SHA-256 encryption ──

/**
 * Extract the SubjectPublicKeyInfo (SPKI) from a DER-encoded X.509 certificate.
 * Locates the rsaEncryption OID (1.2.840.113549.1.1.1) and walks back to the
 * enclosing SPKI SEQUENCE.
 */
function extractSpkiFromCertDer(certDer: Uint8Array): Uint8Array {
    const rsaOidValue = new Uint8Array([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01]);
    for (let i = 0; i < certDer.length - rsaOidValue.length - 2; i++) {
        if (certDer[i] !== 0x06 || certDer[i + 1] !== 0x09) continue;
        let match = true;
        for (let j = 0; j < rsaOidValue.length; j++) {
            if (certDer[i + 2 + j] !== rsaOidValue[j]) { match = false; break; }
        }
        if (!match) continue;

        const algIdStart = i - 2;
        if (certDer[algIdStart] !== 0x30) continue;

        let spkiStart = -1;
        for (const headerLen of [4, 3, 2]) {
            const pos = algIdStart - headerLen;
            if (pos < 0 || certDer[pos] !== 0x30) continue;
            spkiStart = pos;
            break;
        }
        if (spkiStart < 0) continue;

        const lenByte = certDer[spkiStart + 1];
        let spkiContentLen: number;
        let spkiHeaderLen: number;
        if (lenByte < 0x80) {
            spkiContentLen = lenByte;
            spkiHeaderLen = 2;
        } else {
            const numBytes = lenByte & 0x7f;
            spkiContentLen = 0;
            for (let b = 0; b < numBytes; b++) {
                spkiContentLen = (spkiContentLen << 8) | certDer[spkiStart + 2 + b];
            }
            spkiHeaderLen = 2 + numBytes;
        }

        return certDer.slice(spkiStart, spkiStart + spkiHeaderLen + spkiContentLen);
    }
    throw new Error("RSA SPKI not found in X.509 certificate");
}

/**
 * Import an RSA public key from a Base64-encoded X.509 DER certificate,
 * as returned by KSeF's `/security/public-key-certificates` endpoint.
 */
export async function importRsaPublicKey(base64Cert: string): Promise<CryptoKey> {
    const certDer = base64ToUint8(base64Cert.replace(/\s+/g, ""));
    const spki = extractSpkiFromCertDer(certDer);
    return crypto.subtle.importKey(
        "spki",
        spki.buffer as ArrayBuffer,
        { name: "RSA-OAEP", hash: "SHA-256" },
        false,
        ["encrypt"]
    );
}

/** Encrypt data with RSA-OAEP SHA-256. Returns Base64-encoded ciphertext. */
export async function rsaEncrypt(publicKey: CryptoKey, data: Uint8Array): Promise<string> {
    const encrypted = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, data as BufferSource);
    return uint8ToBase64(new Uint8Array(encrypted));
}

/**
 * Encrypt a KSeF token for authentication.
 * Format: `{ksefToken}|{timestampMs}` → RSA-OAEP encrypt → Base64
 */
export async function encryptKsefToken(
    ksefToken: string,
    timestamp: string,
    publicKey: CryptoKey
): Promise<string> {
    const timestampMs = new Date(timestamp).getTime();
    const plaintext = `${ksefToken}|${timestampMs}`;
    const data = new TextEncoder().encode(plaintext);
    return rsaEncrypt(publicKey, data);
}

// ── AES-256-CBC encryption/decryption (invoice/session payloads) ──

/** Generate a random AES-256 key and IV, as used to encrypt session payloads. */
export function generateAesKeyAndIv(): { key: Uint8Array; iv: Uint8Array } {
    const key = new Uint8Array(32); // 256-bit
    const iv = new Uint8Array(16); // 128-bit
    crypto.getRandomValues(key);
    crypto.getRandomValues(iv);
    return { key, iv };
}

export async function importAesKey(rawKey: Uint8Array): Promise<CryptoKey> {
    return crypto.subtle.importKey("raw", rawKey as BufferSource, { name: "AES-CBC" }, false, [
        "encrypt",
        "decrypt",
    ]);
}

export async function aesEncrypt(key: CryptoKey, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
    const encrypted = await crypto.subtle.encrypt({ name: "AES-CBC", iv: iv as BufferSource }, key, data as BufferSource);
    return new Uint8Array(encrypted);
}

export async function aesDecrypt(key: CryptoKey, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
    const decrypted = await crypto.subtle.decrypt({ name: "AES-CBC", iv: iv as BufferSource }, key, data as BufferSource);
    return new Uint8Array(decrypted);
}

/** Encrypt a raw AES symmetric key with the MF's RSA public key, for session opening. */
export async function encryptAesKeyForKsef(aesKey: Uint8Array, rsaPublicKey: CryptoKey): Promise<string> {
    return rsaEncrypt(rsaPublicKey, aesKey);
}

// ── SHA-256 hashing ──

export async function sha256(data: Uint8Array): Promise<string> {
    const hash = await crypto.subtle.digest("SHA-256", data as BufferSource);
    return uint8ToBase64(new Uint8Array(hash));
}

/** SHA-256 hash, Base64URL-encoded (no padding) — the format used in KSeF QR verification URLs. */
export async function sha256Base64Url(data: Uint8Array): Promise<string> {
    const hash = await crypto.subtle.digest("SHA-256", data as BufferSource);
    return uint8ToBase64(new Uint8Array(hash))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
}

// ── Helpers ──

export function uint8ToBase64(bytes: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

export function base64ToUint8(b64: string): Uint8Array {
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
