import AuthenticationServices
import CryptoKit
import Foundation
import UIKit

/// PKCE (RFC 7636) for Supabase OAuth ("Continue with Google").
enum PKCE {
    /// 32 random bytes, base64url without padding → 43 characters from the unreserved set.
    static func makeVerifier() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        precondition(status == errSecSuccess, "SecRandomCopyBytes failed")
        return base64url(Data(bytes))
    }

    /// S256 challenge: base64url(SHA256(verifier)).
    static func challenge(for verifier: String) -> String {
        base64url(Data(SHA256.hash(data: Data(verifier.utf8))))
    }

    static func base64url(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    static func isValidVerifier(_ v: String) -> Bool {
        (43...128).contains(v.count) && v.range(of: #"^[A-Za-z0-9\-._~]+$"#, options: .regularExpression) != nil
    }
}

enum OAuth {
    static let callbackScheme = "unsolo"
    static let callbackHost = "auth-callback"
    static var redirectURI: String { "\(callbackScheme)://\(callbackHost)" }

    /// `{supabase}/auth/v1/authorize?provider=google&redirect_to=unsolo://auth-callback&code_challenge=…&code_challenge_method=s256`
    static func authorizeURL(supabaseURL: String, provider: String = "google", challenge: String) -> URL? {
        let base = supabaseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard var comps = URLComponents(string: base + "/auth/v1/authorize") else { return nil }
        comps.queryItems = [
            URLQueryItem(name: "provider", value: provider),
            URLQueryItem(name: "redirect_to", value: redirectURI),
            URLQueryItem(name: "code_challenge", value: challenge),
            URLQueryItem(name: "code_challenge_method", value: "s256"),
        ]
        return comps.url
    }

    enum Callback: Equatable {
        case code(String)
        case error(String)
    }

    /// Parses `unsolo://auth-callback?code=…` (or `?error=…&error_description=…`, also accepted in the fragment).
    /// Anything that isn't exactly our scheme + host is rejected.
    static func parseCallback(_ url: URL) -> Callback? {
        guard url.scheme?.lowercased() == callbackScheme, url.host?.lowercased() == callbackHost else { return nil }
        var items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        if let fragment = url.fragment, let extra = URLComponents(string: "x:/?" + fragment)?.queryItems { items += extra }
        func value(_ name: String) -> String? { items.first { $0.name == name }?.value.flatMap { $0.isEmpty ? nil : $0 } }
        if let error = value("error_description") ?? value("error") { return .error(error) }
        guard let code = value("code"), code.count <= 512,
              code.range(of: #"^[A-Za-z0-9\-._~]+$"#, options: .regularExpression) != nil else { return nil }
        return .code(code)
    }
}

/// Runs ASWebAuthenticationSession and returns the callback URL.
@MainActor
final class WebAuthenticator: NSObject, ASWebAuthenticationPresentationContextProviding {
    private var session: ASWebAuthenticationSession?

    func authenticate(url: URL, callbackScheme: String) async throws -> URL {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<URL, Error>) in
            let s = ASWebAuthenticationSession(url: url, callbackURLScheme: callbackScheme) { url, error in
                if let url {
                    cont.resume(returning: url)
                } else if let e = error as? ASWebAuthenticationSessionError, e.code == .canceledLogin {
                    cont.resume(throwing: CancellationError())
                } else {
                    cont.resume(throwing: error ?? APIError.transport("Sign-in didn't complete"))
                }
            }
            s.presentationContextProvider = self
            s.prefersEphemeralWebBrowserSession = false
            session = s
            if !s.start() { cont.resume(throwing: APIError.transport("Couldn't open the sign-in page")) }
        }
    }

    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
                .flatMap(\.windows).first { $0.isKeyWindow } ?? ASPresentationAnchor()
        }
    }
}
