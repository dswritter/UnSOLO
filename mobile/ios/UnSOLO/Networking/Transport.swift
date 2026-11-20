import Foundation

/// The single seam between the app and the network. `URLSessionTransport` talks to the server;
/// `DemoTransport` serves bundled fixtures. Tests inject their own.
protocol HTTPTransport: Sendable {
    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse)
}

final class URLSessionTransport: HTTPTransport {
    let session: URLSession

    init() {
        let config = URLSessionConfiguration.default
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        // URLCache honours Cache-Control / ETag: stale public GETs are revalidated with If-None-Match
        // and a 304 is served from cache transparently.
        config.urlCache = URLCache(memoryCapacity: 20 * 1024 * 1024, diskCapacity: 100 * 1024 * 1024,
                                   directory: caches.appendingPathComponent("urlcache", isDirectory: true))
        config.requestCachePolicy = .useProtocolCachePolicy
        config.timeoutIntervalForRequest = 20
        config.waitsForConnectivity = false
        config.httpAdditionalHeaders = ["X-UnSOLO-Client": AppInfo.clientHeader, "Accept": "application/json"]
        session = URLSession(configuration: config)
    }

    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else { throw APIError.transport("Not an HTTP response") }
            return (data, http)
        } catch let error as URLError {
            switch error.code {
            case .notConnectedToInternet, .networkConnectionLost, .cannotConnectToHost, .cannotFindHost,
                 .timedOut, .dataNotAllowed, .internationalRoamingOff:
                throw APIError.offline
            case .cancelled:
                throw CancellationError()
            default:
                throw APIError.transport(error.localizedDescription)
            }
        }
    }

    func clearCache() { session.configuration.urlCache?.removeAllCachedResponses() }
}

/// Switches between the network and demo fixtures at runtime (first launch with no server falls back to demo).
final class SwitchingTransport: HTTPTransport, @unchecked Sendable {
    private let lock = NSLock()
    private var _useDemo: Bool
    let live: URLSessionTransport
    let demo: DemoTransport

    init(useDemo: Bool, live: URLSessionTransport = URLSessionTransport(), demo: DemoTransport = DemoTransport()) {
        _useDemo = useDemo
        self.live = live
        self.demo = demo
    }

    var useDemo: Bool {
        get { lock.withLock { _useDemo } }
        set { lock.withLock { _useDemo = newValue } }
    }

    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        if useDemo { return try await demo.send(request) }
        return try await live.send(request)
    }
}
