import ExpoModulesCore
import CallKit

private let appGroupSuiteName = "group.com.realestate-crm.callerid"
private let contactsKey = "callerid_contacts"

public class CallerIdModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CallerId")

    AsyncFunction("syncContacts") { (contacts: [[String: String]]) in
      try self.persistContacts(contacts)
      try await self.reloadExtension()
    }

    AsyncFunction("isCallerIdEnabled") { () -> Bool in
      return try await self.checkExtensionEnabled()
    }

    AsyncFunction("enableCallerId") { () -> Bool in
      do {
        try await self.reloadExtension()
        return true
      } catch {
        return false
      }
    }

    AsyncFunction("getRecentCalls") { (_: Double) -> [[String: Any]] in
      // iOS does not expose the call log to third-party apps.
      return []
    }
  }

  // MARK: - Private Helpers

  /// Serialize contacts to JSON and write to App Group UserDefaults.
  private func persistContacts(_ contacts: [[String: String]]) throws {
    guard let defaults = UserDefaults(suiteName: appGroupSuiteName) else {
      throw ContactsPersistenceException()
    }

    let data = try JSONSerialization.data(withJSONObject: contacts, options: [])
    guard let jsonString = String(data: data, encoding: .utf8) else {
      throw ContactsSerializationException()
    }

    defaults.set(jsonString, forKey: contactsKey)
    defaults.synchronize()
  }

  /// Reload the Call Directory extension so it picks up updated contacts.
  private func reloadExtension() async throws {
    let extensionIdentifier = Bundle.main.bundleIdentifier
      .map { "\($0).CallerIdExtension" } ?? ""

    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      CXCallDirectoryManager.sharedInstance.reloadExtension(
        withIdentifier: extensionIdentifier
      ) { error in
        if let error = error {
          continuation.resume(throwing: error)
        } else {
          continuation.resume()
        }
      }
    }
  }

  /// Check whether the Call Directory extension is enabled.
  private func checkExtensionEnabled() async throws -> Bool {
    let extensionIdentifier = Bundle.main.bundleIdentifier
      .map { "\($0).CallerIdExtension" } ?? ""

    return try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Bool, Error>) in
      CXCallDirectoryManager.sharedInstance.getEnabledStatusForExtension(
        withIdentifier: extensionIdentifier
      ) { status, error in
        if let error = error {
          continuation.resume(throwing: error)
        } else {
          continuation.resume(returning: status == .enabled)
        }
      }
    }
  }
}

// MARK: - Exceptions

private class ContactsPersistenceException: Exception {
  override var reason: String {
    "Failed to access App Group UserDefaults with suite name '\(appGroupSuiteName)'. Ensure the App Group is configured in your entitlements."
  }
}

private class ContactsSerializationException: Exception {
  override var reason: String {
    "Failed to serialize contacts data to JSON string."
  }
}
