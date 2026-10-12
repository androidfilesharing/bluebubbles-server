import {
    secureCompare,
    checkRateLimit,
    recordFailedAttempt,
    clearRateLimit,
    extractCredential,
    resetAllRateLimits,
    getRateLimitStats
} from "./index";

describe("Security Module", () => {
    beforeEach(() => {
        resetAllRateLimits();
    });

    describe("secureCompare", () => {
        it("should return true for identical strings", () => {
            expect(secureCompare("password123", "password123")).toBe(true);
            expect(secureCompare("", "")).toBe(true);
            expect(secureCompare("a", "a")).toBe(true);
        });

        it("should return false for different strings", () => {
            expect(secureCompare("password123", "password124")).toBe(false);
            expect(secureCompare("password123", "Password123")).toBe(false);
            expect(secureCompare("abc", "abcd")).toBe(false);
            expect(secureCompare("abc", "ab")).toBe(false);
        });

        it("should return false for non-string inputs", () => {
            expect(secureCompare(null as any, "test")).toBe(false);
            expect(secureCompare("test", null as any)).toBe(false);
            expect(secureCompare(undefined as any, "test")).toBe(false);
            expect(secureCompare(123 as any, "123")).toBe(false);
        });

        it("should handle unicode strings", () => {
            expect(secureCompare("пароль", "пароль")).toBe(true);
            expect(secureCompare("密码", "密码")).toBe(true);
            expect(secureCompare("пароль", "密码")).toBe(false);
        });

        it("should handle empty vs non-empty strings", () => {
            expect(secureCompare("", "a")).toBe(false);
            expect(secureCompare("a", "")).toBe(false);
        });
    });

    describe("Rate Limiting", () => {
        const defaultOptions = {
            windowMs: 60000,
            maxAttempts: 3,
            lockoutDurationMs: 300000
        };

        describe("checkRateLimit", () => {
            it("should allow requests for new IPs", () => {
                const result = checkRateLimit("192.168.1.1", defaultOptions);
                expect(result.allowed).toBe(true);
            });

            it("should allow requests after rate limit entry expires", () => {
                const options = { ...defaultOptions, windowMs: 1 };
                recordFailedAttempt("192.168.1.2", options);
                
                return new Promise<void>(resolve => {
                    setTimeout(() => {
                        const result = checkRateLimit("192.168.1.2", options);
                        expect(result.allowed).toBe(true);
                        resolve();
                    }, 10);
                });
            });
        });

        describe("recordFailedAttempt", () => {
            it("should track failed attempts", () => {
                const ip = "192.168.1.3";
                
                const result1 = recordFailedAttempt(ip, defaultOptions);
                expect(result1.locked).toBe(false);
                
                const stats = getRateLimitStats(ip);
                expect(stats?.attempts).toBe(1);
            });

            it("should lock after max attempts", () => {
                const ip = "192.168.1.4";
                
                recordFailedAttempt(ip, defaultOptions);
                recordFailedAttempt(ip, defaultOptions);
                const result = recordFailedAttempt(ip, defaultOptions);
                
                expect(result.locked).toBe(true);
                expect(result.lockoutDurationMs).toBe(300000);
            });

            it("should block requests when locked", () => {
                const ip = "192.168.1.5";
                
                for (let i = 0; i < defaultOptions.maxAttempts; i++) {
                    recordFailedAttempt(ip, defaultOptions);
                }
                
                const result = checkRateLimit(ip, defaultOptions);
                expect(result.allowed).toBe(false);
                expect(result.retryAfter).toBeDefined();
                expect(result.retryAfter).toBeGreaterThan(0);
            });
        });

        describe("clearRateLimit", () => {
            it("should clear rate limit tracking for an IP", () => {
                const ip = "192.168.1.6";
                
                recordFailedAttempt(ip, defaultOptions);
                recordFailedAttempt(ip, defaultOptions);
                
                clearRateLimit(ip);
                
                const stats = getRateLimitStats(ip);
                expect(stats).toBeUndefined();
            });

            it("should allow requests after clearing", () => {
                const ip = "192.168.1.7";
                
                for (let i = 0; i < defaultOptions.maxAttempts; i++) {
                    recordFailedAttempt(ip, defaultOptions);
                }
                
                clearRateLimit(ip);
                
                const result = checkRateLimit(ip, defaultOptions);
                expect(result.allowed).toBe(true);
            });
        });

        describe("resetAllRateLimits", () => {
            it("should clear all rate limit entries", () => {
                recordFailedAttempt("192.168.1.8", defaultOptions);
                recordFailedAttempt("192.168.1.9", defaultOptions);
                
                resetAllRateLimits();
                
                expect(getRateLimitStats("192.168.1.8")).toBeUndefined();
                expect(getRateLimitStats("192.168.1.9")).toBeUndefined();
            });
        });
    });

    describe("extractCredential", () => {
        describe("Authorization header", () => {
            it("should extract Bearer token", () => {
                const result = extractCredential(
                    "Bearer mytoken123",
                    {},
                    true
                );
                expect(result.credential).toBe("mytoken123");
                expect(result.source).toBe("header");
            });

            it("should extract Basic auth password", () => {
                const encoded = Buffer.from("user:password123").toString("base64");
                const result = extractCredential(
                    `Basic ${encoded}`,
                    {},
                    true
                );
                expect(result.credential).toBe("password123");
                expect(result.source).toBe("header");
            });

            it("should handle Basic auth with colons in password", () => {
                const encoded = Buffer.from("user:pass:word:123").toString("base64");
                const result = extractCredential(
                    `Basic ${encoded}`,
                    {},
                    true
                );
                expect(result.credential).toBe("pass:word:123");
                expect(result.source).toBe("header");
            });

            it("should handle invalid Basic auth encoding", () => {
                const result = extractCredential(
                    "Basic !!!invalid!!!",
                    { password: "fallback" },
                    true
                );
                expect(result.credential).toBe("fallback");
                expect(result.source).toBe("query");
            });
        });

        describe("Query parameters", () => {
            it("should extract guid parameter", () => {
                const result = extractCredential(
                    undefined,
                    { guid: "my-guid-token" },
                    true
                );
                expect(result.credential).toBe("my-guid-token");
                expect(result.source).toBe("query");
            });

            it("should extract password parameter", () => {
                const result = extractCredential(
                    undefined,
                    { password: "my-password" },
                    true
                );
                expect(result.credential).toBe("my-password");
                expect(result.source).toBe("query");
            });

            it("should extract token parameter", () => {
                const result = extractCredential(
                    undefined,
                    { token: "my-token" },
                    true
                );
                expect(result.credential).toBe("my-token");
                expect(result.source).toBe("query");
            });

            it("should prefer guid over password over token", () => {
                const result = extractCredential(
                    undefined,
                    { guid: "guid-val", password: "pass-val", token: "token-val" },
                    true
                );
                expect(result.credential).toBe("guid-val");
            });

            it("should not extract query params when disabled", () => {
                const result = extractCredential(
                    undefined,
                    { password: "my-password" },
                    false
                );
                expect(result.credential).toBeNull();
                expect(result.source).toBeNull();
            });
        });

        describe("Priority", () => {
            it("should prefer header over query params", () => {
                const result = extractCredential(
                    "Bearer header-token",
                    { password: "query-password" },
                    true
                );
                expect(result.credential).toBe("header-token");
                expect(result.source).toBe("header");
            });
        });

        describe("Edge cases", () => {
            it("should return null when no credentials provided", () => {
                const result = extractCredential(undefined, {}, true);
                expect(result.credential).toBeNull();
                expect(result.source).toBeNull();
            });

            it("should return null for empty auth header", () => {
                const result = extractCredential("", {}, true);
                expect(result.credential).toBeNull();
                expect(result.source).toBeNull();
            });

            it("should handle unsupported auth schemes", () => {
                const result = extractCredential(
                    "Digest username=test",
                    { password: "fallback" },
                    true
                );
                expect(result.credential).toBe("fallback");
                expect(result.source).toBe("query");
            });
        });
    });
});
