import Foundation

/// Events from an uploader, delivered on the main actor.
protocol UploaderDelegate: AnyObject, Sendable {
    @MainActor func uploadProgress(clientId: String, index: Int, fraction: Double)
    @MainActor func uploadFinished(clientId: String, index: Int, result: Result<Media, APIError>)
}

protocol MediaUploading: AnyObject, Sendable {
    func upload(file: URL, clientId: String, index: Int, purpose: String, token: String?) async
    func activeTaskKeys() async -> Set<String>
    func setDelegate(_ delegate: UploaderDelegate)
}

/// POST /uploads (multipart: file, purpose) on a background URLSession, so photo uploads continue
/// when the app is suspended. Bodies are written to a file first (background sessions upload from files).
final class BackgroundUploader: NSObject, MediaUploading, URLSessionDataDelegate, @unchecked Sendable {
    static let identifier = "in.unsolo.app.uploads"
    static let shared = BackgroundUploader()

    private let lock = NSLock()
    private var buffers: [Int: Data] = [:]
    private weak var delegate: UploaderDelegate?
    /// Set by the app delegate when iOS relaunches the app to deliver background session events.
    var backgroundCompletionHandler: (@Sendable () -> Void)?
    private let bodiesDir: URL

    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.background(withIdentifier: Self.identifier)
        config.sessionSendsLaunchEvents = true
        config.isDiscretionary = false
        config.allowsCellularAccess = true
        config.httpAdditionalHeaders = ["X-UnSOLO-Client": AppInfo.clientHeader]
        return URLSession(configuration: config, delegate: self, delegateQueue: nil)
    }()

    override init() {
        bodiesDir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("upload-bodies", isDirectory: true)
        try? FileManager.default.createDirectory(at: bodiesDir, withIntermediateDirectories: true)
        super.init()
    }

    func setDelegate(_ delegate: UploaderDelegate) {
        lock.withLock { self.delegate = delegate }
        _ = session // reconnect to the background session so pending events are delivered
    }

    func upload(file: URL, clientId: String, index: Int, purpose: String, token: String?) async {
        let boundary = "unsolo-\(UUID().uuidString)"
        let bodyURL = bodiesDir.appendingPathComponent("\(clientId)-\(index).multipart")
        do {
            let fileData = try Data(contentsOf: file)
            var body = Data()
            func line(_ s: String) { body.append(Data(s.utf8)) }
            line("--\(boundary)\r\nContent-Disposition: form-data; name=\"purpose\"\r\n\r\n\(purpose)\r\n")
            line("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"photo-\(index).jpg\"\r\nContent-Type: image/jpeg\r\n\r\n")
            body.append(fileData)
            line("\r\n--\(boundary)--\r\n")
            try body.write(to: bodyURL, options: .atomic)
        } catch {
            await report(clientId: clientId, index: index, result: .failure(.transport("Couldn't prepare the photo")))
            return
        }
        var req = URLRequest(url: AppInfo.apiBaseURL.appendingPathComponent("uploads"))
        req.httpMethod = "POST"
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        req.setValue(AppInfo.clientHeader, forHTTPHeaderField: "X-UnSOLO-Client")
        if let token { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        let task = session.uploadTask(with: req, fromFile: bodyURL)
        task.taskDescription = "\(clientId)|\(index)"
        task.resume()
    }

    func activeTaskKeys() async -> Set<String> {
        let tasks = await session.allTasks
        return Set(tasks.compactMap(\.taskDescription))
    }

    private func report(clientId: String, index: Int, result: Result<Media, APIError>) async {
        let d = lock.withLock { delegate }
        await MainActor.run { d?.uploadFinished(clientId: clientId, index: index, result: result) }
    }

    // MARK: URLSession delegate

    func urlSession(_ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64, totalBytesSent: Int64, totalBytesExpectedToSend: Int64) {
        guard let (clientId, index) = Self.parse(task.taskDescription), totalBytesExpectedToSend > 0 else { return }
        let fraction = Double(totalBytesSent) / Double(totalBytesExpectedToSend)
        let d = lock.withLock { delegate }
        Task { @MainActor in d?.uploadProgress(clientId: clientId, index: index, fraction: fraction) }
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        lock.withLock { buffers[dataTask.taskIdentifier, default: Data()].append(data) }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        let data = lock.withLock { buffers.removeValue(forKey: task.taskIdentifier) } ?? Data()
        guard let (clientId, index) = Self.parse(task.taskDescription) else { return }
        try? FileManager.default.removeItem(at: bodiesDir.appendingPathComponent("\(clientId)-\(index).multipart"))
        let result: Result<Media, APIError>
        if let error {
            result = .failure((error as? URLError).map { _ in APIError.offline } ?? .transport(error.localizedDescription))
        } else if let http = task.response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
                  let up = try? JSON.decoder().decode(UploadResponse.self, from: data) {
            result = .success(up.media)
        } else {
            let status = (task.response as? HTTPURLResponse)?.statusCode ?? 0
            result = .failure(APIError.from(status: status, data: data, headers: (task.response as? HTTPURLResponse)?.allHeaderFields ?? [:]))
        }
        Task { await report(clientId: clientId, index: index, result: result) }
    }

    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        let handler = lock.withLock { () -> (@Sendable () -> Void)? in
            let h = backgroundCompletionHandler
            backgroundCompletionHandler = nil
            return h
        }
        DispatchQueue.main.async { handler?() }
    }

    static func parse(_ description: String?) -> (String, Int)? {
        guard let parts = description?.split(separator: "|"), parts.count == 2, let i = Int(parts[1]) else { return nil }
        return (String(parts[0]), i)
    }
}

/// Demo mode: simulates upload progress and returns the local file as the media URL.
final class DemoUploader: MediaUploading, @unchecked Sendable {
    private weak var delegate: UploaderDelegate?
    private let lock = NSLock()

    func setDelegate(_ delegate: UploaderDelegate) { lock.withLock { self.delegate = delegate } }
    func activeTaskKeys() async -> Set<String> { [] }

    func upload(file: URL, clientId: String, index: Int, purpose: String, token: String?) async {
        let d = lock.withLock { delegate }
        for step in 1...8 {
            try? await Task.sleep(for: .milliseconds(220))
            let f = Double(step) / 8
            await MainActor.run { d?.uploadProgress(clientId: clientId, index: index, fraction: f) }
        }
        let size = (try? FileManager.default.attributesOfItem(atPath: file.path)[.size] as? Int) ?? nil
        _ = size
        await MainActor.run {
            d?.uploadFinished(clientId: clientId, index: index,
                              result: .success(Media(url: file.absoluteString, thumbUrl: nil, lqip: nil, width: nil, height: nil)))
        }
    }
}
