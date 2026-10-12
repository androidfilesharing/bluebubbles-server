import { timingSafeEqual } from "crypto";

/**
 * Performs a constant-time string comparison to prevent timing attacks.
 * Returns true if both strings are equal, false otherwise.
 */
export const secureCompare = (a: string, b: string): boolean => {
    if (typeof a !== "string" || typeof b !== "string") {
        return false;
    }

    const aBuffer = Buffer.from(a, "utf8");
    const bBuffer = Buffer.from(b, "utf8");

    if (aBuffer.length !== bBuffer.length) {
        const dummyBuffer = Buffer.alloc(aBuffer.length);
        timingSafeEqual(aBuffer, dummyBuffer);
        return false;
    }

    return timingSafeEqual(aBuffer, bBuffer);
};

interface RateLimitEntry {
    attempts: number;
    firstAttempt: number;
    lockedUntil: number | null;
}

interface RateLimiterOptions {
    windowMs: number;
    maxAttempts: number;
    lockoutDurationMs: number;
}

const rateLimitStore: Map<string, RateLimitEntry> = new Map();

const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
        const windowExpired = now - entry.firstAttempt > 300000;
        const lockoutExpired = entry.lockedUntil && now > entry.lockedUntil;
        if (windowExpired && (!entry.lockedUntil || lockoutExpired)) {
            rateLimitStore.delete(key);
        }
    }
}, 60000);

if (typeof cleanupInterval.unref === "function") {
    cleanupInterval.unref();
}

/**
 * Checks if an IP is currently rate-limited or locked out.
 * Returns { allowed: true } if the request should proceed,
 * or { allowed: false, retryAfter: ms } if blocked.
 */
export const checkRateLimit = (
    ip: string,
    options: RateLimiterOptions
): { allowed: boolean; retryAfter?: number } => {
    const now = Date.now();
    const entry = rateLimitStore.get(ip);

    if (!entry) {
        return { allowed: true };
    }

    if (entry.lockedUntil && now < entry.lockedUntil) {
        return { allowed: false, retryAfter: entry.lockedUntil - now };
    }

    if (entry.lockedUntil && now >= entry.lockedUntil) {
        rateLimitStore.delete(ip);
        return { allowed: true };
    }

    if (now - entry.firstAttempt > options.windowMs) {
        rateLimitStore.delete(ip);
        return { allowed: true };
    }

    return { allowed: true };
};

/**
 * Records a failed authentication attempt for an IP.
 * Returns { locked: true, lockoutDurationMs } if the IP is now locked out.
 */
export const recordFailedAttempt = (
    ip: string,
    options: RateLimiterOptions
): { locked: boolean; lockoutDurationMs?: number } => {
    const now = Date.now();
    let entry = rateLimitStore.get(ip);

    if (!entry || now - entry.firstAttempt > options.windowMs) {
        entry = { attempts: 1, firstAttempt: now, lockedUntil: null };
        rateLimitStore.set(ip, entry);
        return { locked: false };
    }

    entry.attempts += 1;

    if (entry.attempts >= options.maxAttempts) {
        entry.lockedUntil = now + options.lockoutDurationMs;
        return { locked: true, lockoutDurationMs: options.lockoutDurationMs };
    }

    return { locked: false };
};

/**
 * Clears rate limit tracking for an IP (on successful auth).
 */
export const clearRateLimit = (ip: string): void => {
    rateLimitStore.delete(ip);
};

/**
 * Extracts the password/token from the request.
 * Checks Authorization header first, then query params if allowed.
 * Never logs the actual credential value.
 */
export const extractCredential = (
    authHeader: string | undefined,
    queryParams: { guid?: string; password?: string; token?: string },
    allowQueryParam: boolean
): { credential: string | null; source: "header" | "query" | null } => {
    if (authHeader) {
        if (authHeader.startsWith("Bearer ")) {
            return { credential: authHeader.substring(7), source: "header" };
        }
        if (authHeader.startsWith("Basic ")) {
            try {
                const decoded = Buffer.from(authHeader.substring(6), "base64").toString("utf8");
                const colonIndex = decoded.indexOf(":");
                if (colonIndex !== -1) {
                    return { credential: decoded.substring(colonIndex + 1), source: "header" };
                }
            } catch {
                // Invalid Base64
            }
        }
    }

    if (allowQueryParam) {
        const queryToken = queryParams?.guid ?? queryParams?.password ?? queryParams?.token;
        if (queryToken) {
            return { credential: queryToken as string, source: "query" };
        }
    }

    return { credential: null, source: null };
};

export const getRateLimitStats = (ip: string): RateLimitEntry | undefined => {
    return rateLimitStore.get(ip);
};

export const resetAllRateLimits = (): void => {
    rateLimitStore.clear();
};
