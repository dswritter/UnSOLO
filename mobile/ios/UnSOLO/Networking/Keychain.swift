import Foundation
import Security

/// Token storage. Items use kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly so background refresh works
/// after the first unlock and tokens never migrate to another device or a backup.
protocol SecretStore: Sendable {
    func data(for key: String) -> Data?
    @discardableResult func set(_ data: Data, for key: String) -> Bool
    func remove(_ key: String)
}

struct KeychainStore: SecretStore {
    var service = "in.unsolo.app.auth"

    func data(for key: String) -> Data? {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: key,
            kSecReturnData: true,
            kSecMatchLimit: kSecMatchLimitOne,
        ]
        var out: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &out)
        guard status == errSecSuccess else { return nil }
        return out as? Data
    }

    @discardableResult
    func set(_ data: Data, for key: String) -> Bool {
        let base: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: key,
        ]
        let attrs: [CFString: Any] = [
            kSecValueData: data,
            kSecAttrAccessible: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        var status = SecItemUpdate(base as CFDictionary, attrs as CFDictionary)
        if status == errSecItemNotFound {
            var add = base
            add.merge(attrs) { $1 }
            status = SecItemAdd(add as CFDictionary, nil)
        }
        return status == errSecSuccess
    }

    func remove(_ key: String) {
        let query: [CFString: Any] = [kSecClass: kSecClassGenericPassword, kSecAttrService: service, kSecAttrAccount: key]
        SecItemDelete(query as CFDictionary)
    }
}

/// Keychain first; if the Keychain is unavailable (unsigned simulator builds can return
/// errSecMissingEntitlement) tokens are kept in memory only for this launch. Never written to disk in plain text.
final class ResilientSecretStore: SecretStore, @unchecked Sendable {
    private let keychain = KeychainStore()
    private let lock = NSLock()
    private var memory: [String: Data] = [:]

    func data(for key: String) -> Data? {
        if let d = keychain.data(for: key) { return d }
        return lock.withLock { memory[key] }
    }

    @discardableResult
    func set(_ data: Data, for key: String) -> Bool {
        if keychain.set(data, for: key) {
            lock.withLock { memory[key] = nil }
            return true
        }
        lock.withLock { memory[key] = data }
        return false
    }

    func remove(_ key: String) {
        keychain.remove(key)
        lock.withLock { memory[key] = nil }
    }
}

final class InMemorySecretStore: SecretStore, @unchecked Sendable {
    private let lock = NSLock()
    private var values: [String: Data] = [:]
    func data(for key: String) -> Data? { lock.withLock { values[key] } }
    @discardableResult func set(_ data: Data, for key: String) -> Bool { lock.withLock { values[key] = data }; return true }
    func remove(_ key: String) { lock.withLock { values[key] = nil } }
}
