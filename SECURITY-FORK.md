# Security Fork Documentation

This is a security-hardened fork of [BlueBubbles Server](https://github.com/BlueBubblesApp/bluebubbles-server). The patches are designed to be minimal, isolated, and rebasing-friendly so they can be easily synced with upstream and potentially contributed back.

## What This Fork Changes

### 1. Authentication Security

**Location:** `packages/server/src/server/api/http/security/index.ts`, `packages/server/src/server/api/http/api/v1/middleware/authMiddleware.ts`, `packages/server/src/server/api/http/index.ts`

Changes:
- **Constant-time password comparison**: Uses `crypto.timingSafeEqual()` instead of `!==` to prevent timing attacks
- **Rate limiting**: Per-IP rate limiting with configurable window, max attempts, and lockout duration
- **Authorization header support**: Accepts `Bearer <token>` or `Basic <base64>` in addition to query params
- **Configurable query param auth**: Can be disabled via `allow_query_param_auth` setting
- **Credential logging prevention**: Auth failures log only the fact of failure, never the credential value

New configuration settings:
| Setting | Default | Description |
|---------|---------|-------------|
| `allow_query_param_auth` | `1` (enabled) | Allow password in URL query params |
| `auth_rate_limit_window_ms` | `60000` | Rate limit time window (ms) |
| `auth_rate_limit_max_attempts` | `10` | Max failed attempts per window |
| `auth_lockout_duration_ms` | `300000` | Lockout duration after exceeding max attempts |

### 2. CORS Restrictions

**Location:** `packages/server/src/server/api/http/index.ts`

Changes:
- CORS is now configurable via the `cors_allowed_origins` setting
- Default (empty string) allows all origins for backwards compatibility
- Supports exact matches (`https://example.com`) and wildcard subdomains (`*.example.com`)

New configuration settings:
| Setting | Default | Description |
|---------|---------|-------------|
| `cors_allowed_origins` | `""` (all origins) | Comma-separated list of allowed origins |

Example: `https://bluebubbles.app,*.bluebubbles.app,http://localhost:3000`

### 3. Proxy Trust Configuration

**Location:** `packages/server/src/server/api/http/index.ts`

Changes:
- `koa.proxy` is now configurable instead of always `true`
- When disabled, `X-Forwarded-For` header is ignored for client IP detection
- Prevents IP spoofing attacks on rate limiting when the server is exposed directly

New configuration settings:
| Setting | Default | Description |
|---------|---------|-------------|
| `trust_proxy` | `0` (disabled) | Trust X-Forwarded-For header |

Only enable `trust_proxy` when running behind a known proxy (Cloudflare, nginx, Tailscale, etc.).

### 4. Dependency Updates

**Location:** `packages/server/package.json`

Non-breaking security updates applied:
- `axios`: ^1.7.2 → ^1.9.0 (multiple SSRF and prototype pollution fixes)
- `koa`: ^2.13.1 → ^2.16.4 (ReDoS, XSS, host header injection fixes)
- `socket.io`: ^4.7.5 → ^4.8.1 (attachment memory exhaustion fixes)
- `js-yaml`: ^4.1.0 → ^4.3.0 (prototype pollution mitigations)
- `typeorm`: ^0.3.20 → ^0.3.31 (SQL injection fixes)

Vulnerability count:
- Before: 90 total (3 low, 25 moderate, 54 high, 8 critical)
- After: 81 total (2 low, 24 moderate, 49 high, 6 critical)

### 5. Build Integrity

**Location:** `packages/server/scripts/electron-builder-config.js`, `.github/workflows/secure-build.yml`

Changes:
- Opt-in code signing via `BB_SIGN_APP=true` environment variable
- Opt-in notarization via `BB_NOTARIZE_APP=true` environment variable
- Configurable publish target via `BB_PUBLISH_REPO` and `BB_PUBLISH_OWNER`
- Custom auto-update server via `BB_UPDATE_SERVER_URL`
- GitHub Actions workflow that generates SHA-256 checksums for all build artifacts

## Electron Major Upgrade Assessment

The fork currently uses Electron 25.9.8. Upgrading to Electron 44.x would fix many CVEs but is a significant breaking change:

### Why It's Difficult

1. **Breaking API changes**: Electron has made significant API changes across major versions (context isolation defaults, remote module removal, security defaults)
2. **Native module rebuilds**: `better-sqlite3`, `node-mac-contacts`, `node-mac-permissions` need rebuilding and may require code changes
3. **Chromium updates**: The bundled Chromium jumps from 114 to 130+, potentially affecting web features used by the UI
4. **Node.js version**: Internal Node.js version changes from 18.x to 20.x+
5. **electron-builder compatibility**: May need updating electron-builder as well

### Migration Path

If attempting the upgrade:

1. Update `electron` to `^44.x` in both `packages/server/package.json` and `packages/ui/package.json`
2. Update `@electron/rebuild` to `^4.x`
3. Update `electron-builder` to `^26.x`
4. Test all native modules compile and load correctly
5. Review and update any deprecated Electron APIs
6. Test the full application functionality
7. Update the webpack configuration if needed

### Recommended Approach

Given the complexity, consider:
- Running the server in a more isolated environment (VM, container)
- Using network-level security (VPN, Tailscale) instead of relying solely on Electron security
- Monitoring upstream BlueBubbles for when they upgrade Electron

## Syncing with Upstream

This fork is designed to be rebased onto upstream master regularly.

### Adding the Upstream Remote

```bash
git remote add upstream https://github.com/BlueBubblesApp/bluebubbles-server.git
git fetch upstream
```

### Rebasing the Patch Set

```bash
# Ensure you're on the security fork branch
git checkout cursor/security-patch-set-165d

# Fetch latest upstream
git fetch upstream

# Rebase onto upstream master
git rebase upstream/master

# Resolve any conflicts, then force push
git push --force-with-lease origin cursor/security-patch-set-165d
```

### Conflict Resolution Tips

The patches are isolated to these files:
- `packages/server/src/server/databases/server/constants.ts` (new config defaults)
- `packages/server/src/server/api/http/security/index.ts` (new file)
- `packages/server/src/server/api/http/api/v1/middleware/authMiddleware.ts`
- `packages/server/src/server/api/http/api/v1/responses/errors.ts`
- `packages/server/src/server/api/http/api/v1/responses/types.ts`
- `packages/server/src/server/api/http/index.ts`
- `packages/server/package.json` (dependency versions)
- `packages/server/scripts/electron-builder-config.js`
- `.github/workflows/secure-build.yml` (new file)

Most conflicts will be in `index.ts` if upstream modifies the HTTP/socket setup. The auth middleware and security module are unlikely to conflict.

## Deployment Hardening Recommendations

### Network Security

1. **Use a VPN or Tailscale** instead of public tunnels (ngrok, Cloudflare)
   - Tailscale provides zero-config mesh VPN
   - Eliminates exposure to the public internet
   - Native apps can connect via Tailscale MagicDNS

2. **If using public tunnels**, configure:
   - `cors_allowed_origins` to restrict to known client origins
   - `trust_proxy` to `1` only if the tunnel terminates TLS
   - Strong, long password (32+ characters recommended)

### Authentication

1. **Use a long, random password** (32+ characters)
   - Generate with: `openssl rand -base64 32`
   - Store securely (password manager, not in plaintext)

2. **Consider disabling query param auth**
   - Set `allow_query_param_auth` to `0`
   - Requires clients to use Authorization header
   - Prevents password from appearing in server logs/URLs

3. **Rate limiting is enabled by default**
   - 10 attempts per 60 seconds, then 5-minute lockout
   - Adjust `auth_rate_limit_*` settings if needed

### macOS Security

1. **Avoid disabling SIP** (System Integrity Protection)
   - Private API features require SIP disabled
   - Consider whether those features are worth the security tradeoff

2. **Avoid Private API mode if possible**
   - Standard API covers most messaging functionality
   - Private API requires more system access

3. **Keep macOS updated**
   - Security patches matter more when running a network service

### Build Verification

1. **Verify checksums** of downloaded releases
   - SHA-256 checksums are published with each release
   - Compare: `shasum -a 256 BlueBubbles-*.dmg`

2. **Build from source** for maximum assurance
   - Clone this repo
   - Run `npm install && npm run build`
   - Optionally sign with your own certificate

## Build Procedures

### Prerequisites

- **Node.js 20.11.x** (matches upstream requirements)
- **npm 10.x** or later
- **Python 3.10+** (for native module builds)
- **Xcode Command Line Tools** (macOS only)

### What Can Be Verified on Linux

The following can be run on any platform:

```bash
# Install dependencies (ignoring native scripts that require macOS)
npm install --ignore-scripts --legacy-peer-deps --force

# TypeScript type checking
cd packages/server && npx tsc --noEmit

# Lint security files (requires NODE_PATH for workspace resolution)
cd packages/server && NODE_PATH=./node_modules npx eslint --ext=ts \
  src/server/api/http/security/ \
  src/server/api/http/api/v1/middleware/authMiddleware.ts

# Run security tests
cd packages/server && npm run test:security
```

### What Requires macOS

The following must be run on macOS:

```bash
# Full npm install with native module compilation
npm install

# Native module rebuild (better-sqlite3, node-mac-contacts, node-mac-permissions)
cd packages/server && npm run rebuild

# Build the Electron app
npm run build

# Create DMG installer
cd packages/server && npm run dist

# Full release build with publishing
npm run release
```

**Known Issue: node-mac-contacts compile failure**

On macOS with Node.js 20.x, `npm install` may fail with a `napi_add_finalizer` signature mismatch when compiling `node-mac-contacts`. This is due to Node.js 20 N-API headers being incompatible with the native module's build.

**Workaround:**

```bash
# Install without running native build scripts
npm install --ignore-scripts

# Rebuild native modules using electron-rebuild (which uses Electron's Node headers)
cd packages/server && npm run rebuild
```

The `npm run rebuild` command runs `electron-rebuild`, which compiles native modules against Electron's Node.js headers instead of the system Node.js headers, avoiding the ABI incompatibility.

### Lockfile Management

The `package-lock.json` contains platform-specific optional dependencies:
- `node-mac-contacts` (darwin only)
- `node-mac-permissions` (darwin only)
- `fsevents` (darwin only)
- `dmg-license` (darwin only)
- `iconv-corefoundation` (darwin only)

**Important:** When updating dependencies on Linux:

1. Use npm overrides in root `package.json` for version pinning
2. Run `npm install --package-lock-only --force` to update versions
3. Do NOT use `--legacy-peer-deps` as it drops peer dependency trees (like react-scripts)
4. Verify package count: `grep -c '"node_modules/' package-lock.json` (should be ~2300+)
5. Verify darwin entries: `grep -c '"darwin"' package-lock.json` (should be ≥5)
6. Verify react-scripts: `grep -c react-scripts package-lock.json` (should be ≥5)

**Verification script:**

```bash
# Compare package keys with upstream
echo "Our packages: $(grep -c '"node_modules/' package-lock.json)"
echo "Darwin entries: $(grep -c '"darwin"' package-lock.json)"
echo "react-scripts refs: $(grep -c react-scripts package-lock.json)"
```

For a complete lockfile regeneration (recommended), do it on macOS.

### Signed Builds

To create a signed and notarized build:

```bash
# Set environment variables
export BB_SIGN_APP=true
export BB_NOTARIZE_APP=true
export APPLE_ID=your-apple-id@example.com
export APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
export APPLE_TEAM_ID=XXXXXXXXXX

# Build with signing
cd packages/server && npm run dist
```

### Custom Update Server

To point builds at a custom update server instead of the official BlueBubbles releases:

```bash
export BB_UPDATE_SERVER_URL=https://your-server.com/updates
cd packages/server && npm run dist
```

## Contributing Back Upstream

These patches are designed to be upstreamable. If contributing:

1. Split into focused PRs (one per security area)
2. Ensure backwards compatibility (all changes are opt-in)
3. Include documentation for new settings
4. Add tests where appropriate

The auth rate limiting and constant-time comparison are the most universally beneficial changes. CORS and proxy trust configuration provide defense-in-depth without breaking existing setups.

## Remaining Vulnerabilities

The following vulnerabilities remain due to requiring breaking major version upgrades:

| Package | Issue | Blocked By |
|---------|-------|------------|
| electron | Multiple CVEs | Major upgrade to 44.x |
| firebase-admin | Transitive dependencies | Would require googleapis upgrade |
| node-forge | ASN.1 and signature issues | No fix available in 1.x |
| protobufjs | Code injection, DoS | Transitive via firebase |
| electron-builder | Transitive issues | Would need major upgrade |
| react-router-dom | Open redirect | Would need major upgrade |

These are tracked by npm audit and should be reviewed periodically as fixes become available.
