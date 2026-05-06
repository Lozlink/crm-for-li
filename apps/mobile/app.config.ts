export default {
  expo: {
    name: "Real Estate CRM",
    slug: "realestate-crm",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    scheme: "realestate-crm",
    updates: {
      url: "https://u.expo.dev/aed13454-1087-4558-a758-266f2bdddb63"
    },
    runtimeVersion: {
      policy: "appVersion"
    },
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#6200ee"
    },

    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.realestate-geo.crm",
      infoPlist: {
        NSContactsUsageDescription: "Allow $(PRODUCT_NAME) to access your contacts.",
        UIBackgroundModes: ["location"],
        // iOS 9+ requires apps to declare which URL schemes they intend to
        // query via Linking.canOpenURL. Without these, canOpenURL returns
        // false even when openURL would succeed — common false negative on
        // tel:/sms:/mailto: links. Listed here for any future code that uses
        // canOpenURL; the dialer itself bypasses canOpenURL via try/catch.
        LSApplicationQueriesSchemes: ["tel", "telprompt", "sms", "mailto"],
      },
      config: {
        googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
      }
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#6200ee"
      },
      edgeToEdgeEnabled: true,
      package: "com.realestate.crm",
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
        }
      },
      permissions: [
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.READ_CONTACTS",
        "android.permission.ACCESS_BACKGROUND_LOCATION",
        "android.permission.SEND_SMS",
        "android.permission.CALL_PHONE",
        "android.permission.FOREGROUND_SERVICE",
        "android.permission.FOREGROUND_SERVICE_LOCATION"
      ],
      // Android 11+ (API 30) restricts which apps a third-party app can see.
      // Without these <queries> declarations, Linking.canOpenURL returns false
      // for tel:/sms:/mailto: even though openURL would actually launch the
      // OS handler. The dialer bypasses canOpenURL, but listing the queries
      // here unblocks any future code that does use it correctly.
      queries: [
        { intent: { action: "android.intent.action.DIAL" } },
        { intent: { action: "android.intent.action.SENDTO", data: { scheme: "smsto" } } },
        { intent: { action: "android.intent.action.SENDTO", data: { scheme: "mailto" } } },
      ],
    },
    web: {
      favicon: "./assets/favicon.png",
      bundler: "metro"
    },
    plugins: [
      "expo-router",
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission: "Allow $(PRODUCT_NAME) to use your location."
        }
      ],
      [
        "expo-contacts",
        {
          contactsPermission: "Allow $(PRODUCT_NAME) to access your contacts."
        }
      ],
      "../../modules/caller-id/app.plugin.js"
    ],

    extra: {
      SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
      SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      GOOGLE_PLACES_API_KEY: process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY,
      GOOGLE_MAPS_API_KEY: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
      router: {},
      eas: {
        projectId: "aed13454-1087-4558-a758-266f2bdddb63",
        build: {
          experimental: {
            ios: {
              appExtensions: [
                {
                  targetName: "CallerIdExtension",
                  bundleIdentifier: "com.realestate-geo.crm.CallerIdExtension",
                  entitlements: {
                    "com.apple.security.application-groups": [
                      "group.com.realestate-geo.crm.callerid"
                    ]
                  }
                }
              ]
            }
          }
        }
      }
    }
  }
};