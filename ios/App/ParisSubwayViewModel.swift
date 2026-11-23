import Foundation
import CoreLocation
import Observation
import ParisSubwayCore

@MainActor
@Observable
public final class ParisSubwayViewModel {
    public private(set) var isLoaded = false
    public private(set) var loadError: String?
    public private(set) var lines: [LineMetadata] = []
    public private(set) var linesById: [String: LineMetadata] = [:]
    public private(set) var stations: [StationMetadata] = []
    public private(set) var tracks: [TrackSegment] = []
    public private(set) var trains: [TrainMarker] = []
    public private(set) var departures: [StationDeparture] = []
    public private(set) var departureGroups: [DepartureGroup] = []
    public private(set) var rollingStockByLine: [String: LineRollingStockSpec] = [:]
    public private(set) var rollingStockModels: [LineRollingStockSpec] = []

    public var selectedLine: LineMetadata? {
        didSet {
            lineDirection = 0
            selectedGhostStation = nil
            refreshSelectedLine()
        }
    }
    public var lineDirection: Int = 0
    public var selectedStation: StationMetadata? {
        didSet {
            selectedGhostStation = nil
            refreshDepartures()
        }
    }
    public var selectedGhostStation: GhostStationSpec?
    public var followedTrainId: String?

    public var followedTrain: TrainMarker? {
        guard let id = followedTrainId else { return nil }
        return trains.first { $0.id == id }
    }

    public var activeRoute: PlannedRoute?
    public var routeOriginQuery = ""
    public var routeDestQuery = ""

    public var passionneMode = false {
        didSet {
            if !passionneMode {
                showGhostStations = false
                virtualServiceSeconds = nil
                timeSpeed = 1
            }
        }
    }
    public var showGhostStations = false
    public var show3DBuildings = true
    public var virtualServiceSeconds: Double?
    public var timeSpeed: Double = 1
    public var timePaused = false
    public var themeChoice = "systeme"
    public var favoriteStations: Set<String> = []
    public var homeStationName: String? = UserDefaults.standard.string(forKey: "paris_home_station") {
        didSet { UserDefaults.standard.set(homeStationName, forKey: "paris_home_station") }
    }
    public var workStationName: String? = UserDefaults.standard.string(forKey: "paris_work_station") {
        didSet { UserDefaults.standard.set(workStationName, forKey: "paris_work_station") }
    }
    public var searchQuery = ""
    public var showingRide3D = false
    public var rideInitialMode: Ride3DView.CameraMode = .quai
    public let dataSync = DataSyncService()

    private let engine = SubwayEngine()
    private var tickTask: Task<Void, Never>?

    public init() {}

    public var displayedServiceClock: String {
        let sec = virtualServiceSeconds ?? ParisClock.secondsSinceMidnight()
        return ParisClock.formatClock(sec)
    }

    public var filteredStations: [StationMetadata] {
        filterStations(query: searchQuery)
    }

    public func filterStations(query: String) -> [StationMetadata] {
        let q = normalizeStopName(query)
        guard !q.isEmpty else { return Array(stations.prefix(30)) }
        return stations.filter { normalizeStopName($0.name).contains(q) }
    }

    public func bootstrap() async {
        guard !isLoaded else { return }
        guard let dataURL = Bundle.main.url(forResource: "lines", withExtension: "json")?.deletingLastPathComponent() else {
            loadError = "Données RATP introuvables dans le bundle."
            return
        }
        do {
            try await engine.load(
                from: dataURL,
                scheduleOverrideURL: dataSync.cachedScheduleURL(),
                rerScheduleOverrideURL: dataSync.cachedRerScheduleURL()
            )
            self.lines = engine.lines.sorted {
                $0.shortName.localizedStandardCompare($1.shortName) == .orderedAscending
            }
            self.linesById = engine.linesById
            self.stations = engine.stations.sorted { $0.name < $1.name }
            self.tracks = engine.tracks
            self.rollingStockByLine = engine.rollingStockByLine
            self.rollingStockModels = engine.rollingStockModels
            self.isLoaded = true
            refreshSimulation()
            startTicker()
            Task { [dataSync] in
                await dataSync.syncInBackground()
            }
        } catch {
            self.loadError = error.localizedDescription
        }
    }

    private func startTicker() {
        tickTask?.cancel()
        tickTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(500))
                guard let self else { break }
                if !self.timePaused && self.timeSpeed > 1 {
                    let base = self.virtualServiceSeconds ?? ParisClock.secondsSinceMidnight()
                    var next = base + self.timeSpeed * 0.5
                    if next > 25 * 3600 + 15 * 60 { next = 5 * 3600 }
                    self.virtualServiceSeconds = next
                } else if self.timePaused, self.virtualServiceSeconds == nil {
                    self.virtualServiceSeconds = ParisClock.secondsSinceMidnight()
                }
                self.refreshSimulation()
            }
        }
    }

    public func refreshSimulation() {
        let all = engine.activeTrains(virtualServiceSeconds: virtualServiceSeconds)
        if let line = selectedLine {
            self.trains = all.filter { $0.lineId == line.id }
        } else {
            self.trains = all
        }
        if let followedId = followedTrainId, !self.trains.contains(where: { $0.id == followedId }) {
            // Keep followedTrainId if we're filtering another line? No, clear if train finished its trip
            if selectedLine == nil {
                followedTrainId = nil
            }
        }
        refreshDepartures()
    }

    private func refreshSelectedLine() {
        refreshSimulation()
    }

    public func refreshDepartures() {
        guard let station = selectedStation else {
            departures = []
            departureGroups = []
            return
        }
        departures = engine.departures(
            forStation: station.name,
            virtualServiceSeconds: virtualServiceSeconds
        )
        departureGroups = engine.groupedDepartures(
            forStation: station.name,
            virtualServiceSeconds: virtualServiceSeconds
        )
    }

    public func orderedStations(for line: LineMetadata, direction: Int) -> [StationMetadata] {
        let stopNames = engine.orderedStops(forLine: line.id, direction: direction)
        var seen = Set<String>()
        var result: [StationMetadata] = []
        for name in stopNames {
            if let st = engine.station(named: name), seen.insert(st.name).inserted {
                result.append(st)
            }
        }
        return result
    }

    public func station(named name: String) -> StationMetadata? {
        engine.station(named: name)
    }

    public func nearbyStations(from coordinate: CLLocationCoordinate2D, limit: Int = 8) -> [(station: StationMetadata, distanceM: Double)] {
        engine.nearbyStations(from: coordinate, limit: limit)
    }

    public func computeRoute() {
        let from = routeOriginQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        let to = routeDestQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !from.isEmpty, !to.isEmpty else {
            activeRoute = nil
            return
        }
        activeRoute = engine.findRoute(from: from, to: to)
    }

    public func clearRoute() {
        activeRoute = nil
    }

    public func resetToLive() {
        virtualServiceSeconds = nil
        timeSpeed = 1
        refreshSimulation()
    }

    public func carPoses(for train: TrainMarker) -> [TrainCarPose] {
        engine.carPoses(for: train, carCount: 5, carSpacingM: 15.2)
    }

    public func shapeCoordinates(forLineId lineId: String, direction: Int) -> [CLLocationCoordinate2D] {
        guard let poly = engine.shape(forLineId: lineId, direction: direction) else { return [] }
        var out: [CLLocationCoordinate2D] = []
        out.reserveCapacity(poly.coords.count / 2)
        for i in stride(from: 0, to: poly.coords.count - 1, by: 2) {
            out.append(CLLocationCoordinate2D(latitude: poly.coords[i + 1], longitude: poly.coords[i]))
        }
        return out
    }

    public func checkScheduleUpdates() async {
        await dataSync.syncInBackground()
        if let dataURL = Bundle.main.url(forResource: "lines", withExtension: "json")?.deletingLastPathComponent() {
            try? await engine.load(
                from: dataURL,
                scheduleOverrideURL: dataSync.cachedScheduleURL(),
                rerScheduleOverrideURL: dataSync.cachedRerScheduleURL()
            )
            refreshSimulation()
        }
    }
}
