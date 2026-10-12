import { Context, Next } from "koa";
import { Server } from "@server";
import { safeTrim } from "@server/helpers/utils";
import { ServerError, Unauthorized, TooManyRequests } from "../responses/errors";
import {
    secureCompare,
    checkRateLimit,
    recordFailedAttempt,
    clearRateLimit,
    extractCredential
} from "../../../security";

export const AuthMiddleware = async (ctx: Context, next: Next) => {
    const clientIp = ctx.request.ip || "unknown";

    const windowMs = (Server().repo.getConfig("auth_rate_limit_window_ms") as number) || 60000;
    const maxAttempts = (Server().repo.getConfig("auth_rate_limit_max_attempts") as number) || 10;
    const lockoutDurationMs = (Server().repo.getConfig("auth_lockout_duration_ms") as number) || 300000;

    const rateLimitCheck = checkRateLimit(clientIp, { windowMs, maxAttempts, lockoutDurationMs });
    if (!rateLimitCheck.allowed) {
        Server().log(`Client (IP: [redacted]) is rate-limited.`, "debug");
        throw new TooManyRequests({
            error: "Too many authentication attempts. Please try again later.",
            retryAfter: Math.ceil((rateLimitCheck.retryAfter || lockoutDurationMs) / 1000)
        });
    }

    const allowQueryParam = Boolean(Server().repo.getConfig("allow_query_param_auth"));
    const authHeader = ctx.request.headers.authorization;
    const queryParams = ctx.request.query as { guid?: string; password?: string; token?: string };

    const { credential, source } = extractCredential(authHeader, queryParams, allowQueryParam);

    if (!credential) {
        Server().log(`Client attempted to access the API without credentials.`, "debug");
        const result = recordFailedAttempt(clientIp, { windowMs, maxAttempts, lockoutDurationMs });
        if (result.locked) {
            throw new TooManyRequests({
                error: "Too many authentication attempts. Account locked.",
                retryAfter: Math.ceil(lockoutDurationMs / 1000)
            });
        }
        throw new Unauthorized({ error: "Missing server password!" });
    }

    const password = String(Server().repo.getConfig("password") as string);
    if (!password) {
        throw new ServerError({ error: "Failed to retrieve password from the database" });
    }

    if (!secureCompare(safeTrim(password), safeTrim(credential))) {
        Server().log(`Client authentication failed (source: ${source}).`, "debug");
        const result = recordFailedAttempt(clientIp, { windowMs, maxAttempts, lockoutDurationMs });
        if (result.locked) {
            throw new TooManyRequests({
                error: "Too many authentication attempts. Account locked.",
                retryAfter: Math.ceil(lockoutDurationMs / 1000)
            });
        }
        throw new Unauthorized();
    }

    clearRateLimit(clientIp);
    await next();
};
