/**
 * Low-level KSeF API HTTP client.
 * Wraps fetch with base URL, auth headers, and structured error handling.
 */
export class KsefHttpClient {
    constructor(
        private baseUrl: string,
        private accessToken?: string
    ) {}

    setAccessToken(token: string | undefined) {
        this.accessToken = token;
    }

    private headers(extra?: Record<string, string>): Record<string, string> {
        const h: Record<string, string> = {
            "Content-Type": "application/json",
            Accept: "application/json",
            ...extra,
        };
        if (this.accessToken) {
            h["Authorization"] = `Bearer ${this.accessToken}`;
        }
        return h;
    }

    async get<T>(path: string, headers?: Record<string, string>): Promise<T> {
        const res = await fetch(`${this.baseUrl}${path}`, {
            method: "GET",
            headers: this.headers(headers),
        });
        return this.handleResponse<T>(res);
    }

    async post<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
        const res = await fetch(`${this.baseUrl}${path}`, {
            method: "POST",
            headers: this.headers(headers),
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        return this.handleResponse<T>(res);
    }

    async delete<T>(path: string, headers?: Record<string, string>): Promise<T> {
        const res = await fetch(`${this.baseUrl}${path}`, {
            method: "DELETE",
            headers: this.headers(headers),
        });
        return this.handleResponse<T>(res);
    }

    /** For endpoints that return raw XML/text (invoice bodies, UPO). */
    async getRaw(path: string, headers?: Record<string, string>): Promise<Response> {
        return fetch(`${this.baseUrl}${path}`, {
            method: "GET",
            headers: this.headers(headers),
        });
    }

    private async handleResponse<T>(res: Response): Promise<T> {
        if (res.status === 429) {
            const retryAfter = res.headers.get("Retry-After");
            throw new KsefApiError(
                429,
                "RATE_LIMITED",
                `Rate limited. Retry after ${retryAfter ?? "unknown"} seconds.`,
                retryAfter ? parseInt(retryAfter, 10) : undefined
            );
        }

        if (!res.ok) {
            let errorBody: unknown;
            try {
                errorBody = await res.json();
            } catch {
                errorBody = await res.text();
            }

            let message = `KSeF API error: ${res.status} ${res.statusText}`;
            if (errorBody && typeof errorBody === "object") {
                const body = errorBody as any;
                if (body.detail) {
                    message = body.detail;
                    if (body.errors?.length) {
                        message += ": " + body.errors.map((e: any) => e.description || e.message || JSON.stringify(e)).join("; ");
                    }
                } else if (body.exception?.exceptionDetailList?.length) {
                    message = body.exception.exceptionDetailList
                        .map((e: any) => `${e.exceptionCode}: ${e.exceptionDescription}`)
                        .join("; ");
                }
            }

            throw new KsefApiError(res.status, "KSEF_API_ERROR", message, undefined, errorBody);
        }

        if (res.status === 204) {
            return undefined as T;
        }

        return res.json() as Promise<T>;
    }
}

export class KsefApiError extends Error {
    constructor(
        public status: number,
        public code: string,
        message: string,
        public retryAfter?: number,
        public details?: unknown
    ) {
        super(message);
        this.name = "KsefApiError";
    }
}

export function createHttpClient(baseUrl: string, accessToken?: string): KsefHttpClient {
    return new KsefHttpClient(baseUrl, accessToken);
}
