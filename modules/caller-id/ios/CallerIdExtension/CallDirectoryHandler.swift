import Foundation
import CallKit

/// A single CRM contact entry decoded from the shared App Group storage.
private struct CallerIdEntry: Codable {
    let phone: String
    let label: String
}

/// The App Group suite name shared with the main app.
private let appGroupSuiteName = "group.com.realestate-crm.callerid"

/// The UserDefaults key where contacts JSON is stored.
private let contactsKey = "callerid_contacts"

class CallDirectoryHandler: CXCallDirectoryProvider {

    override func beginRequest(with context: CXCallDirectoryExtensionContext) {
        context.delegate = self

        let entries = loadEntries()
        let parsed = parseAndSort(entries)

        for item in parsed {
            context.addIdentificationEntry(
                withNextSequentialPhoneNumber: item.phoneNumber,
                label: item.label
            )
        }

        context.completeRequest()
    }

    // MARK: - Private Helpers

    /// Load CallerIdEntry items from App Group UserDefaults.
    /// Returns an empty array when data is missing or corrupt.
    private func loadEntries() -> [CallerIdEntry] {
        guard let defaults = UserDefaults(suiteName: appGroupSuiteName) else {
            return []
        }

        guard let jsonString = defaults.string(forKey: contactsKey) else {
            return []
        }

        guard let data = jsonString.data(using: .utf8) else {
            return []
        }

        do {
            return try JSONDecoder().decode([CallerIdEntry].self, from: data)
        } catch {
            return []
        }
    }

    /// Parse phone strings into Int64 values, filter out invalid entries,
    /// and return them sorted in ascending order (CallKit requirement).
    private func parseAndSort(_ entries: [CallerIdEntry]) -> [(phoneNumber: CXCallDirectoryPhoneNumber, label: String)] {
        var results: [(phoneNumber: CXCallDirectoryPhoneNumber, label: String)] = []

        for entry in entries {
            if let number = parsePhoneNumber(entry.phone) {
                results.append((phoneNumber: number, label: entry.label))
            }
        }

        // CallKit requires strictly ascending order.
        results.sort { $0.phoneNumber < $1.phoneNumber }

        // Remove duplicates — keep the first occurrence for each phone number.
        var seen = Set<CXCallDirectoryPhoneNumber>()
        results = results.filter { seen.insert($0.phoneNumber).inserted }

        return results
    }

    /// Convert a phone string to a CXCallDirectoryPhoneNumber (Int64).
    ///
    /// Strips all non-digit characters except a leading '+', then converts
    /// the remaining digits to Int64. Returns nil for empty or zero values.
    ///
    /// Examples:
    ///   "+61 412 345 678"  -> 61412345678
    ///   "0412-345-678"     -> 412345678
    ///   "+1 (555) 123-4567" -> 15551234567
    private func parsePhoneNumber(_ raw: String) -> CXCallDirectoryPhoneNumber? {
        let stripped = raw.filter { $0.isNumber }

        guard !stripped.isEmpty else {
            return nil
        }

        guard let number = CXCallDirectoryPhoneNumber(stripped) else {
            return nil
        }

        // A phone number of 0 is never valid.
        guard number > 0 else {
            return nil
        }

        return number
    }
}

// MARK: - CXCallDirectoryExtensionContextDelegate

extension CallDirectoryHandler: CXCallDirectoryExtensionContextDelegate {
    func requestFailed(for extensionContext: CXCallDirectoryExtensionContext, withError error: Error) {
        // Errors are logged by the system. Nothing else to do here since the
        // extension lifecycle is managed entirely by iOS.
    }
}
