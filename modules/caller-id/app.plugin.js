const {
  withEntitlementsPlist,
  withXcodeProject,
  withAndroidManifest,
  withDangerousMod,
  AndroidConfig,
} = require("@expo/config-plugins");
const path = require("path");
const fs = require("fs");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXTENSION_NAME = "CallerIdExtension";
const EXTENSION_BUNDLE_ID_SUFFIX = ".CallerIdExtension";
const APP_GROUP_SUFFIX = ".callerid";
const CALLER_ID_RECEIVER_CLASS = "expo.modules.callerid.CallerIdReceiver";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Add a PBXFileReference entry to the project and then add it as a child of
 * the given PBXGroup. Unlike addPbxGroup, this does NOT add the file to
 * PBXBuildFileSection, so it is suitable for non-source files like Info.plist
 * and .entitlements.
 *
 * @param {XcodeProject} project
 * @param {string} groupUuid  UUID of the target PBXGroup
 * @param {object} opts       File descriptor with basename, path, lastKnownFileType, etc.
 * @returns {string} fileRef UUID
 */
function addFileReferenceToGroup(project, groupUuid, opts) {
  const fileRefUuid = project.generateUuid();
  const commentKey = `${fileRefUuid}_comment`;

  // Add to PBXFileReference section.
  const fileRefSection = project.pbxFileReferenceSection();
  fileRefSection[fileRefUuid] = {
    isa: "PBXFileReference",
    name: `"${opts.basename}"`,
    path: `"${opts.path}"`,
    sourceTree: opts.sourceTree || '"<group>"',
    lastKnownFileType: opts.lastKnownFileType,
    fileEncoding: opts.fileEncoding,
    includeInIndex: 0,
  };
  fileRefSection[commentKey] = opts.basename;

  // Add as child of the PBXGroup.
  const group = project.getPBXGroupByKey(groupUuid);
  if (group) {
    group.children.push({ value: fileRefUuid, comment: opts.basename });
  }

  return fileRefUuid;
}

// ---------------------------------------------------------------------------
// iOS: Add App Group entitlement to main app
// ---------------------------------------------------------------------------

/**
 * Adds the App Group entitlement (group.<bundleId>.callerid) to the main
 * application target's entitlements plist.
 */
function withCallerIdEntitlements(config) {
  return withEntitlementsPlist(config, (config) => {
    const bundleId = config.ios?.bundleIdentifier ?? config.modRequest.projectName;
    const appGroup = `group.${bundleId}${APP_GROUP_SUFFIX}`;

    const existing = config.modResults["com.apple.security.application-groups"] || [];
    if (!existing.includes(appGroup)) {
      existing.push(appGroup);
    }
    config.modResults["com.apple.security.application-groups"] = existing;

    return config;
  });
}

// ---------------------------------------------------------------------------
// iOS: Copy extension source files into the Xcode project directory
// ---------------------------------------------------------------------------

/**
 * Uses withDangerousMod to copy the CallDirectoryHandler.swift and Info.plist
 * from the module source into the iOS project's CallerIdExtension directory.
 * Also writes the extension entitlements file.
 */
function withCallerIdExtensionFiles(config) {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const platformProjectRoot = config.modRequest.platformProjectRoot;
      const extensionDir = path.join(platformProjectRoot, EXTENSION_NAME);

      // Create extension directory if it does not exist.
      fs.mkdirSync(extensionDir, { recursive: true });

      // Source directory where the extension files live in the module.
      const moduleSrcDir = path.resolve(
        __dirname,
        "ios",
        "CallerIdExtension"
      );

      // Copy CallDirectoryHandler.swift
      const swiftSrc = path.join(moduleSrcDir, "CallDirectoryHandler.swift");
      const swiftDst = path.join(extensionDir, "CallDirectoryHandler.swift");
      fs.copyFileSync(swiftSrc, swiftDst);

      // Copy Info.plist
      const plistSrc = path.join(moduleSrcDir, "Info.plist");
      const plistDst = path.join(extensionDir, "Info.plist");
      fs.copyFileSync(plistSrc, plistDst);

      // Write extension entitlements with the App Group.
      const bundleId = config.ios?.bundleIdentifier ?? config.modRequest.projectName;
      const appGroup = `group.${bundleId}${APP_GROUP_SUFFIX}`;
      const entitlementsContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.application-groups</key>
    <array>
        <string>${appGroup}</string>
    </array>
</dict>
</plist>
`;
      const entitlementsDst = path.join(
        extensionDir,
        `${EXTENSION_NAME}.entitlements`
      );
      fs.writeFileSync(entitlementsDst, entitlementsContent);

      return config;
    },
  ]);
}

// ---------------------------------------------------------------------------
// iOS: Add the Call Directory Extension target to the Xcode project
// ---------------------------------------------------------------------------

/**
 * Modifies the .xcodeproj to:
 * 1. Create a PBXGroup for CallerIdExtension with file references
 * 2. Create a new PBXNativeTarget for the app extension (which also
 *    embeds the .appex into the main app via a CopyFiles build phase)
 * 3. Add Sources, Resources, and Frameworks build phases to the target
 * 4. Link CallKit.framework to the extension
 * 5. Configure build settings (bundle ID, entitlements, Info.plist path,
 *    Swift version, deployment target, code signing, etc.)
 * 6. Add a target dependency from the main app to the extension
 */
function withCallerIdXcodeProject(config) {
  return withXcodeProject(config, (config) => {
    const xcodeProject = config.modResults;
    const bundleId = config.ios?.bundleIdentifier ?? config.modRequest.projectName;
    const extensionBundleId = `${bundleId}${EXTENSION_BUNDLE_ID_SUFFIX}`;

    // Avoid double-insertion if prebuild runs twice.
    const existingTarget = xcodeProject.pbxTargetByName(EXTENSION_NAME);
    if (existingTarget) {
      return config;
    }

    // Get the main project reference.
    const { firstProject } = xcodeProject.getFirstProject();

    // ------------------------------------------------------------------
    // 1. Create a PBXGroup for the extension files
    // ------------------------------------------------------------------
    // Only pass the Swift source to addPbxGroup so it gets added to the
    // PBXBuildFile section. Info.plist and the entitlements file are
    // referenced by build settings and must NOT be build files.
    const extGroup = xcodeProject.addPbxGroup(
      ["CallDirectoryHandler.swift"],
      EXTENSION_NAME,
      EXTENSION_NAME
    );

    // Manually add Info.plist and entitlements as file references only
    // (no PBXBuildFile entry). We create PBXFileReference entries and
    // add them as children of the extension group.
    addFileReferenceToGroup(xcodeProject, extGroup.uuid, {
      basename: "Info.plist",
      path: "Info.plist",
      lastKnownFileType: "text.plist.xml",
      fileEncoding: 4,
      sourceTree: '"<group>"',
    });
    addFileReferenceToGroup(
      xcodeProject,
      extGroup.uuid,
      {
        basename: `${EXTENSION_NAME}.entitlements`,
        path: `${EXTENSION_NAME}.entitlements`,
        lastKnownFileType: "text.plist.entitlements",
        fileEncoding: 4,
        sourceTree: '"<group>"',
      }
    );

    // Add the extension group as a child of the project's main group.
    const mainGroupKey = firstProject.mainGroup;
    xcodeProject.addToPbxGroup(extGroup.uuid, mainGroupKey);

    // ------------------------------------------------------------------
    // 2. Create the native target for the extension
    // ------------------------------------------------------------------
    // addTarget with type "app_extension" automatically:
    //   - Creates Debug/Release build configurations
    //   - Creates the .appex product reference
    //   - Adds a "Copy Files" embed phase to the first (main) target
    //   - Registers the target in PBXProject targets list
    const targetResult = xcodeProject.addTarget(
      EXTENSION_NAME,
      "app_extension",
      EXTENSION_NAME
    );
    const targetUuid = targetResult.uuid;

    // ------------------------------------------------------------------
    // 3. Add source build phase (Sources) for the Swift file
    // ------------------------------------------------------------------
    xcodeProject.addBuildPhase(
      ["CallDirectoryHandler.swift"],
      "PBXSourcesBuildPhase",
      "Sources",
      targetUuid
    );

    // ------------------------------------------------------------------
    // 4. Add resources build phase
    // ------------------------------------------------------------------
    xcodeProject.addBuildPhase(
      [],
      "PBXResourcesBuildPhase",
      "Resources",
      targetUuid
    );

    // ------------------------------------------------------------------
    // 5. Add frameworks build phase with CallKit.framework
    // ------------------------------------------------------------------
    xcodeProject.addBuildPhase(
      ["CallKit.framework"],
      "PBXFrameworksBuildPhase",
      "Frameworks",
      targetUuid
    );

    // ------------------------------------------------------------------
    // 6. Configure build settings for the extension target
    // ------------------------------------------------------------------

    // Get the target's configuration list to update build settings.
    const targetObj = xcodeProject.pbxNativeTargetSection()[targetUuid];
    const configListId = targetObj.buildConfigurationList;
    const configList =
      xcodeProject.pbxXCConfigurationList()[configListId];

    // Read the main app's deployment target and development team once.
    const appTarget = xcodeProject.getFirstTarget();
    let deploymentTarget = "16.0";
    let developmentTeam = undefined;

    if (appTarget && appTarget.firstTarget) {
      const appConfigListId = appTarget.firstTarget.buildConfigurationList;
      const appConfigList =
        xcodeProject.pbxXCConfigurationList()[appConfigListId];
      if (appConfigList && appConfigList.buildConfigurations) {
        const appBuildConfigUuid =
          appConfigList.buildConfigurations[0].value;
        const appBuildConfig =
          xcodeProject.pbxXCBuildConfigurationSection()[appBuildConfigUuid];
        if (appBuildConfig && appBuildConfig.buildSettings) {
          if (appBuildConfig.buildSettings.IPHONEOS_DEPLOYMENT_TARGET) {
            deploymentTarget =
              appBuildConfig.buildSettings.IPHONEOS_DEPLOYMENT_TARGET;
          }
          if (appBuildConfig.buildSettings.DEVELOPMENT_TEAM) {
            developmentTeam =
              appBuildConfig.buildSettings.DEVELOPMENT_TEAM;
          }
        }
      }
    }

    if (configList && configList.buildConfigurations) {
      for (const buildConfigRef of configList.buildConfigurations) {
        const buildConfigUuid = buildConfigRef.value;
        const buildConfig =
          xcodeProject.pbxXCBuildConfigurationSection()[buildConfigUuid];
        if (buildConfig && buildConfig.buildSettings) {
          buildConfig.buildSettings.PRODUCT_BUNDLE_IDENTIFIER =
            `"${extensionBundleId}"`;
          buildConfig.buildSettings.INFOPLIST_FILE =
            `"${EXTENSION_NAME}/Info.plist"`;
          buildConfig.buildSettings.CODE_SIGN_ENTITLEMENTS =
            `"${EXTENSION_NAME}/${EXTENSION_NAME}.entitlements"`;
          buildConfig.buildSettings.CODE_SIGN_STYLE = "Automatic";
          buildConfig.buildSettings.SWIFT_VERSION = "5.0";
          buildConfig.buildSettings.TARGETED_DEVICE_FAMILY =
            '"1,2"';
          buildConfig.buildSettings.IPHONEOS_DEPLOYMENT_TARGET =
            deploymentTarget;
          buildConfig.buildSettings.GENERATE_INFOPLIST_FILE = "NO";
          buildConfig.buildSettings.CURRENT_PROJECT_VERSION = "1";
          buildConfig.buildSettings.MARKETING_VERSION = "1.0";
          buildConfig.buildSettings.SKIP_INSTALL = "YES";

          if (developmentTeam) {
            buildConfig.buildSettings.DEVELOPMENT_TEAM = developmentTeam;
          }
        }
      }
    }

    // ------------------------------------------------------------------
    // 7. Add target dependency from main app to extension
    // ------------------------------------------------------------------
    // addTarget already embeds the .appex into the main app via a
    // CopyFiles build phase, but it does NOT add a target dependency.
    // Without the dependency, Xcode may not build the extension before
    // the main app tries to embed it.
    const mainTargetUuid = appTarget?.uuid;
    if (mainTargetUuid) {
      xcodeProject.addTargetDependency(mainTargetUuid, [targetUuid]);
    }

    return config;
  });
}

// ---------------------------------------------------------------------------
// Android: Add permissions and register the CallerIdReceiver
// ---------------------------------------------------------------------------

/**
 * Modifies AndroidManifest.xml to:
 * 1. Add READ_PHONE_STATE, READ_CALL_LOG, and POST_NOTIFICATIONS permissions
 * 2. Register CallerIdReceiver with intent filter for PHONE_STATE
 */
function withCallerIdAndroidManifest(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;

    // ------------------------------------------------------------------
    // 1. Add required permissions
    // ------------------------------------------------------------------
    const permissions = [
      "android.permission.READ_PHONE_STATE",
      "android.permission.READ_CALL_LOG",
      "android.permission.POST_NOTIFICATIONS",
    ];

    if (!manifest.manifest["uses-permission"]) {
      manifest.manifest["uses-permission"] = [];
    }

    const existingPermissions = manifest.manifest["uses-permission"].map(
      (p) => p.$["android:name"]
    );

    for (const perm of permissions) {
      if (!existingPermissions.includes(perm)) {
        manifest.manifest["uses-permission"].push({
          $: { "android:name": perm },
        });
      }
    }

    // ------------------------------------------------------------------
    // 2. Register CallerIdReceiver in the <application> block
    // ------------------------------------------------------------------
    const mainApp = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);

    if (!mainApp.receiver) {
      mainApp.receiver = [];
    }

    // Avoid duplicates.
    const alreadyRegistered = mainApp.receiver.some(
      (r) => r.$["android:name"] === CALLER_ID_RECEIVER_CLASS
    );

    if (!alreadyRegistered) {
      mainApp.receiver.push({
        $: {
          "android:name": CALLER_ID_RECEIVER_CLASS,
          "android:exported": "true",
        },
        "intent-filter": [
          {
            action: [
              {
                $: {
                  "android:name": "android.intent.action.PHONE_STATE",
                },
              },
            ],
          },
        ],
      });
    }

    return config;
  });
}

// ---------------------------------------------------------------------------
// Main plugin entry point
// ---------------------------------------------------------------------------

/**
 * Expo config plugin for the CallerID module.
 *
 * iOS:
 *  - Adds App Group entitlement to main app
 *  - Copies extension source files into the iOS project
 *  - Creates a Call Directory Extension target in the Xcode project
 *
 * Android:
 *  - Adds READ_PHONE_STATE, READ_CALL_LOG, POST_NOTIFICATIONS permissions
 *  - Registers CallerIdReceiver as a BroadcastReceiver for PHONE_STATE
 */
function withCallerId(config) {
  // iOS modifications
  config = withCallerIdEntitlements(config);
  config = withCallerIdExtensionFiles(config);
  config = withCallerIdXcodeProject(config);

  // Android modifications
  config = withCallerIdAndroidManifest(config);

  return config;
}

module.exports = withCallerId;
