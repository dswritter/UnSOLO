import Foundation

struct ErrorEnvelope: Codable, Sendable {
    struct Body: Codable, Sendable {
        var code: String
        var message: String?
        var field: String?
    }
    var error: Body
}

enum APIError: Error, Equatable, Sendable, LocalizedError {
    case offline
    case unauthorized
    case phoneRequired
    case forbidden(String?)
    case notFound
    case conflict(String?)
    case badRequest(String?, field: String?)
    case rateLimited(retryAfter: TimeInterval?)
    case upgradeRequired
    case server(Int, String?)
    case transport(String)
    case decoding(String)

    static func from(status: Int, data: Data, headers: [AnyHashable: Any]) -> APIError {
        let env = try? JSONDecoder().decode(ErrorEnvelope.self, from: data)
        let message = env?.error.message
        switch (status, env?.error.code) {
        case (_, "unavailable"): return .server(status, message ?? Self.unavailableMessage)
        case (401, _): return .unauthorized
        case (403, "phone_required"): return .phoneRequired
        case (403, _): return .forbidden(message)
        case (404, _): return .notFound
        case (409, _): return .conflict(message)
        case (426, _): return .upgradeRequired
        case (429, _):
            let retry = (headers["Retry-After"] as? String).flatMap(TimeInterval.init)
            return .rateLimited(retryAfter: retry)
        case (400..<500, _): return .badRequest(message, field: env?.error.field)
        default: return .server(status, message)
        }
    }

    /// The server couldn't check your sign-in (Auth slow or down): a 503, not a 401.
    static let unavailableMessage = "UnSOLO is having trouble right now. Try again in a minute."

    /// Network-level and transient server failures are retried by the outbox; client errors are not.
    var isRetryable: Bool {
        switch self {
        case .offline, .transport, .rateLimited: true
        case .server(let code, _): code >= 500
        default: false
        }
    }

    var errorDescription: String? {
        switch self {
        case .offline: "You're offline. We'll send this when you're back."
        case .unauthorized: "Please sign in again."
        case .phoneRequired: "Verify your phone number to continue."
        case .forbidden(let m): m ?? "You can't do that."
        case .notFound: "This isn't available any more."
        case .conflict(let m): m ?? "That changed while you were looking. Pull to refresh."
        case .badRequest(let m, _): m ?? "Something in that wasn't right."
        case .rateLimited: "Slow down a little and try again shortly."
        case .upgradeRequired: "Please update UnSOLO to continue."
        case .server(_, let m): m ?? "Something went wrong on our side."
        case .transport(let m): m
        case .decoding: "We couldn't read the server's reply."
        }
    }
}
