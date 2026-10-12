// NOTE: All paths are relative to the package.json that will be loading this configuration file.
// Making them relative to the scripts folder will break the commands

// Environment variables for opt-in signing and notarization:
// - BB_SIGN_APP: Set to "true" to enable code signing (requires Apple Developer certificate)
// - BB_NOTARIZE_APP: Set to "true" to enable notarization (requires APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID)
// - BB_PUBLISH_REPO: Override the GitHub repo for publishing (default: bluebubbles-server)
// - BB_PUBLISH_OWNER: Override the GitHub owner for publishing (default: BlueBubblesApp)
// - BB_UPDATE_SERVER_URL: Custom update server URL (set to disable auto-update from official releases)

const signApp = process.env.BB_SIGN_APP === "true";
const notarizeApp = process.env.BB_NOTARIZE_APP === "true";
const publishRepo = process.env.BB_PUBLISH_REPO || "bluebubbles-server";
const publishOwner = process.env.BB_PUBLISH_OWNER || "BlueBubblesApp";
const updateServerUrl = process.env.BB_UPDATE_SERVER_URL;

const publishConfig = updateServerUrl
    ? [{ "provider": "generic", "url": updateServerUrl }]
    : [
        {
            "provider": "github",
            "repo": publishRepo,
            "owner": publishOwner,
            "private": false,
            "channel": "latest",
            "releaseType": "draft",
            "vPrefixedTagName": true
        }
    ];

module.exports = {
    "productName": "BlueBubbles",
    "appId": "com.BlueBubbles.BlueBubbles-Server",
    "npmRebuild": true,
    "directories": {
        "output": "releases",
        "buildResources": "appResources"
    },
    "asar": true,
    "extraResources": [
        "appResources"
    ],
    "mac": {
        "category": "public.app-category.social-networking",
        "publish": publishConfig,
        "target": [
            {
                "target": "dmg",
                "arch": [
                    "x64",
                    "arm64"
                ],
            }
        ],
        "type": "distribution",
        "icon": "../../icons/macos/dock-icon.png",
        "darkModeSupport": true,
        "hardenedRuntime": true,
        "notarize": notarizeApp,
        "entitlements": "./scripts/entitlements.mac.plist",
        "entitlementsInherit": "./scripts/entitlements.mac.plist",
        "extendInfo": {
            "NSContactsUsageDescription": "BlueBubbles needs access to your Contacts",
            "NSAppleEventsUsageDescription": "BlueBubbles needs access to run AppleScripts",
            "NSSystemAdministrationUsageDescription": "BlueBubbles needs access to manage your system",
        },
        "gatekeeperAssess": false,
        "minimumSystemVersion": "10.11.0",
        "signIgnore": [
            "ngrok$",
            "zrok$",
            "cloudflared$"
        ],
        // Only sign if BB_SIGN_APP is true and we have signing identity
        ...(signApp ? {} : { "identity": null })
    },
    "dmg": {
        "sign": signApp,
        "writeUpdateInfo": false
    },
    ...(notarizeApp ? { "afterSign": "./scripts/notarize.js" } : {})
};
