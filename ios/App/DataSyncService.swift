import Foundation
import Observation

@MainActor
@Observable
public final class DataSyncService {
    public private(set) var isSyncing = false
    public private(set) var usingCachedOTA = false
    public private(set) var lastSyncMessage = "Données embarquées (offline)"

    private let baseDataURL = URL(string: "https://parisian3dsubway.netlify.app/data")!

    private var cacheDirectory: URL? {
        guard let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
            return nil
        }
        return appSupport.appendingPathComponent("ParisSubway3D/DataCache", isDirectory: true)
    }

    public init() {
        refreshCacheFlag()
    }

    public func cachedScheduleURL() -> URL? {
        cachedFileURL(named: "schedule.json")
    }

    public func cachedRerScheduleURL() -> URL? {
        cachedFileURL(named: "rer_schedule.json")
    }

    private func cachedFileURL(named name: String) -> URL? {
        guard let dir = cacheDirectory else { return nil }
        let url = dir.appendingPathComponent(name)
        guard FileManager.default.fileExists(atPath: url.path),
              let attrs = try? FileManager.default.attributesOfItem(atPath: url.path),
              let size = attrs[.size] as? NSNumber,
              size.intValue > 10_000 else {
            return nil
        }
        return url
    }

    private func refreshCacheFlag() {
        let hasMain = cachedScheduleURL() != nil
        let hasRer = cachedRerScheduleURL() != nil
        usingCachedOTA = hasMain || hasRer
        if usingCachedOTA {
            lastSyncMessage = "Horaires OTA en cache local"
        } else {
            lastSyncMessage = "Bundle embarqué (offline)"
        }
    }

    public func syncInBackground() async {
        guard !isSyncing, let dir = cacheDirectory else { return }
        isSyncing = true
        defer {
            isSyncing = false
            refreshCacheFlag()
        }

        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)

        var updatedCount = 0
        for fileName in ["schedule.json", "rer_schedule.json"] {
            let remoteURL = baseDataURL.appendingPathComponent(fileName)
            let localURL = dir.appendingPathComponent(fileName)
            let etagKey = "ota_etag_\(fileName)"

            var headReq = URLRequest(url: remoteURL)
            headReq.httpMethod = "HEAD"
            headReq.timeoutInterval = 8

            guard let (_, response) = try? await URLSession.shared.data(for: headReq),
                  let httpResp = response as? HTTPURLResponse,
                  httpResp.statusCode == 200 else {
                continue
            }

            let remoteETag = httpResp.value(forHTTPHeaderField: "ETag") ?? httpResp.value(forHTTPHeaderField: "Last-Modified") ?? ""
            let savedETag = UserDefaults.standard.string(forKey: etagKey) ?? ""
            if !remoteETag.isEmpty && remoteETag == savedETag && FileManager.default.fileExists(atPath: localURL.path) {
                continue
            }

            var getReq = URLRequest(url: remoteURL)
            getReq.timeoutInterval = 30
            guard let (data, getResp) = try? await URLSession.shared.data(for: getReq),
                  let getHttp = getResp as? HTTPURLResponse,
                  getHttp.statusCode == 200,
                  data.count > 10_000 else {
                continue
            }

            try? data.write(to: localURL, options: .atomic)
            if !remoteETag.isEmpty {
                UserDefaults.standard.set(remoteETag, forKey: etagKey)
            }
            updatedCount += 1
        }

        if updatedCount > 0 {
            lastSyncMessage = "Horaires mis à jour (OTA)"
        }
    }
}
