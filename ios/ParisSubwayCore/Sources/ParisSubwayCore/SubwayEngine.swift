import Foundation
import CoreLocation

public struct StopTripRef: Sendable {
    public let tripIndex: Int
    public let stopIndex: Int
}

public final class SubwayEngine: @unchecked Sendable {
    public private(set) var lines: [LineMetadata] = []
    public private(set) var linesById: [String: LineMetadata] = [:]
    public private(set) var stations: [StationMetadata] = []
    public private(set) var tracks: [TrackSegment] = []
    public private(set) var shapes: [String: ShapePolyline] = [:]
    public private(set) var trips: [TripData] = []
    public private(set) var rollingStockByLine: [String: LineRollingStockSpec] = [:]
    public private(set) var rollingStockModels: [LineRollingStockSpec] = []
    private var stopTripsIndex: [String: [StopTripRef]] = [:]
    private var stationsByNorm: [String: StationMetadata] = [:]
    private var routePlanner: RoutePlanner?

    public init() {}

    public func load(
        from directory: URL,
        scheduleOverrideURL: URL? = nil,
        rerScheduleOverrideURL: URL? = nil
    ) async throws {
        let linesData = try Data(contentsOf: directory.appendingPathComponent("lines.json"))
        let stationsData = try Data(contentsOf: directory.appendingPathComponent("stations.json"))
        let tracksData = try Data(contentsOf: directory.appendingPathComponent("tracks.json"))
        let shapesData = try Data(contentsOf: directory.appendingPathComponent("shapes.bin"))
        let scheduleURL = scheduleOverrideURL ?? directory.appendingPathComponent("schedule.json")
        let scheduleData = try Data(contentsOf: scheduleURL)

        let decoder = JSONDecoder()
        let loadedLines = try decoder.decode([LineMetadata].self, from: linesData)
        let loadedStations = try decoder.decode([StationMetadata].self, from: stationsData)
        var loadedTracks = try decoder.decode([TrackSegment].self, from: tracksData)
        var loadedShapes = try ShapesLoader.decode(data: shapesData)
        var loadedTrips = try Self.parseScheduleJSON(scheduleData)

        // Optional RER dataset
        let rerLinesURL = directory.appendingPathComponent("rer_lines.json")
        let rerShapesURL = directory.appendingPathComponent("rer_shapes.bin")
        let rerScheduleURL = rerScheduleOverrideURL ?? directory.appendingPathComponent("rer_schedule.json")
        if FileManager.default.fileExists(atPath: rerShapesURL.path),
           FileManager.default.fileExists(atPath: rerScheduleURL.path) {
            if let rerShapesData = try? Data(contentsOf: rerShapesURL),
               let rerShapes = try? ShapesLoader.decode(data: rerShapesData) {
                for (k, v) in rerShapes { loadedShapes[k] = v }
            }
            if let rerSchedData = try? Data(contentsOf: rerScheduleURL),
               let rerTrips = try? Self.parseScheduleJSON(rerSchedData) {
                loadedTrips.append(contentsOf: rerTrips)
            }
            if let rerLinesData = try? Data(contentsOf: rerLinesURL),
               let rawRer = try? JSONSerialization.jsonObject(with: rerLinesData) as? [[String: Any]] {
                for item in rawRer {
                    guard let routeId = item["route_id"] as? String,
                          let shortName = item["short_name"] as? String,
                          let color = item["color"] as? String,
                          let coords = item["coordinates"] as? [[Double]] else { continue }
                    let dirId = item["direction_id"] as? String ?? "0"
                    guard dirId == "0" else { continue }
                    // Clip to Paris & Petite Couronne so map rendering stays crisp
                    let clipped = coords.filter { pt in
                        pt.count >= 2 && pt[0] >= 2.20 && pt[0] <= 2.48 && pt[1] >= 48.80 && pt[1] <= 48.92
                    }
                    if clipped.count >= 2 {
                        loadedTracks.append(TrackSegment(
                            lineId: routeId,
                            shortName: shortName,
                            stroke: color,
                            coordinates: clipped
                        ))
                    }
                }
            }
        }

        // Rolling stock catalog (MP14, MP05, MP89, MF01, MF77, MF67, MI09, Z2N, Z50000)
        let rsURL = directory.appendingPathComponent("rolling-stock.json")
        if let rsData = try? Data(contentsOf: rsURL),
           let catalog = try? decoder.decode(RollingStockCatalog.self, from: rsData) {
            self.rollingStockByLine = catalog.lines
            self.rollingStockModels = catalog.models.values.sorted { $0.name < $1.name }
        }

        // Fallback if tracks.json doesn't contain all lines
        if loadedTracks.isEmpty {
            loadedTracks = []
        }

        self.lines = loadedLines
        self.linesById = Dictionary(uniqueKeysWithValues: loadedLines.map { ($0.id, $0) })
        let deduped = Self.deduplicateStations(loadedStations)
        self.stations = deduped
        self.stationsByNorm = Dictionary(deduped.map { (normalizeStopName($0.name), $0) }, uniquingKeysWith: { a, _ in a })
        self.tracks = loadedTracks
        self.shapes = loadedShapes
        self.trips = loadedTrips
        self.stopTripsIndex = Self.buildStopTripsIndex(trips: loadedTrips)
        self.routePlanner = RoutePlanner(trips: loadedTrips, linesById: self.linesById, stationsByNorm: self.stationsByNorm)
    }

    private static func deduplicateStations(_ raw: [StationMetadata]) -> [StationMetadata] {
        var byName: [String: StationMetadata] = [:]
        var ordered: [String] = []
        for st in raw {
            if let existing = byName[st.name] {
                var mergedLines = existing.lines
                for l in st.lines where !mergedLines.contains(l) {
                    mergedLines.append(l)
                }
                byName[st.name] = StationMetadata(
                    id: existing.id,
                    name: existing.name,
                    coordinates: existing.coordinates,
                    lines: mergedLines,
                    isHub: (existing.isHub ?? false) || (st.isHub ?? false),
                    wheelchairBoarding: existing.wheelchairBoarding ?? st.wheelchairBoarding
                )
            } else {
                byName[st.name] = st
                ordered.append(st.name)
            }
        }
        return ordered.compactMap { byName[$0] }
    }

    private static func parseScheduleJSON(_ data: Data) throws -> [TripData] {
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let stationNames = root["stations"] as? [String],
              let rawTrips = root["trips"] as? [[Any]] else {
            return []
        }

        let normCache = stationNames.map { normalizeStopName($0) }
        var out: [TripData] = []
        out.reserveCapacity(rawTrips.count)

        for t in rawTrips {
            guard t.count >= 8,
                  let tripId = t[0] as? String,
                  let lineId = t[1] as? String,
                  let dirNum = (t[2] as? NSNumber)?.intValue,
                  let shapeId = t[3] as? String,
                  let t0 = (t[4] as? NSNumber)?.doubleValue,
                  let t1 = (t[5] as? NSNumber)?.doubleValue,
                  let destIdx = (t[6] as? NSNumber)?.intValue,
                  let rawStops = t[7] as? [[Any]] else {
                continue
            }
            let destName = (destIdx >= 0 && destIdx < stationNames.count) ? stationNames[destIdx] : "Terminus"
            var stops: [TripStop] = []
            stops.reserveCapacity(rawStops.count)

            for s in rawStops {
                guard s.count >= 4,
                      let arr = (s[0] as? NSNumber)?.doubleValue,
                      let dep = (s[1] as? NSNumber)?.doubleValue,
                      let distM = (s[2] as? NSNumber)?.doubleValue,
                      let stIdx = (s[3] as? NSNumber)?.intValue else {
                    continue
                }
                let stName = (stIdx >= 0 && stIdx < stationNames.count) ? stationNames[stIdx] : "Station"
                let norm = (stIdx >= 0 && stIdx < normCache.count) ? normCache[stIdx] : normalizeStopName(stName)
                stops.append(TripStop(
                    arrivalSec: arr,
                    departureSec: dep,
                    distanceM: distM,
                    stationName: stName,
                    normalizedStopId: norm
                ))
            }

            out.append(TripData(
                id: tripId,
                lineId: lineId,
                direction: dirNum == 0 ? 0 : 1,
                shapeId: shapeId,
                t0: t0,
                t1: t1,
                destinationName: destName,
                stops: stops
            ))
        }
        return out
    }

    private static func buildStopTripsIndex(trips: [TripData]) -> [String: [StopTripRef]] {
        var index: [String: [StopTripRef]] = [:]
        for (tripIdx, trip) in trips.enumerated() where trip.stops.count >= 2 {
            for stopIdx in 0..<(trip.stops.count - 1) {
                let norm = trip.stops[stopIdx].normalizedStopId
                guard !norm.isEmpty else { continue }
                index[norm, default: []].append(StopTripRef(tripIndex: tripIdx, stopIndex: stopIdx))
            }
        }
        return index
    }

    public func activeTrains(at date: Date = Date(), virtualServiceSeconds: Double? = nil) -> [TrainMarker] {
        let candidates: [Double] = if let v = virtualServiceSeconds {
            [v]
        } else {
            ParisClock.serviceCandidates(for: date).map(\.seconds)
        }

        var markers: [TrainMarker] = []
        markers.reserveCapacity(550)

        for trip in trips {
            var chosenSec: Double?
            for sec in candidates {
                if sec >= trip.t0 && sec <= trip.t1 {
                    chosenSec = sec
                    break
                }
            }
            guard let serviceSec = chosenSec,
                  let shape = shapes[trip.shapeId],
                  let line = linesById[trip.lineId] else {
                continue
            }

            let profile = KinematicProfile.forLine(line.shortName)
            guard let kin = Kinematics.evaluate(trip: trip, atServiceSeconds: serviceSec, profile: profile) else {
                continue
            }
            let clampedDist = max(0, min(shape.lengthM, kin.distanceM))
            let coord = ShapesLoader.coordinate(on: shape, atDistance: clampedDist)
            let brg = ShapesLoader.smoothedBearing(on: shape, atDistance: clampedDist)
            let maxKmh = profile.vMaxMps * 3.6
            let kmh = Int(min(maxKmh, (kin.speedMps * 3.6)).rounded())

            markers.append(TrainMarker(
                id: trip.id,
                lineId: trip.lineId,
                lineName: line.shortName,
                colorHex: line.color,
                textColorHex: line.textColor,
                coordinate: coord,
                bearingDeg: brg,
                speedKmh: kmh,
                speedMps: kin.speedMps,
                destination: trip.destinationName,
                nextStation: kin.nextStopName,
                atStop: kin.atStop,
                currentDistM: clampedDist,
                direction: trip.direction,
                shapeId: trip.shapeId
            ))
        }
        return markers
    }

    public func departures(
        forStation stationName: String,
        at date: Date = Date(),
        virtualServiceSeconds: Double? = nil,
        limitPerLineDir: Int = 2,
        horizonSeconds: Double = 2700
    ) -> [StationDeparture] {
        let targetNorm = normalizeStopName(stationName)
        guard !targetNorm.isEmpty else { return [] }

        let candidates: [Double] = if let v = virtualServiceSeconds {
            [v]
        } else {
            ParisClock.serviceCandidates(for: date).map(\.seconds)
        }

        var matchedRefs: [StopTripRef] = []
        if let exact = stopTripsIndex[targetNorm] {
            matchedRefs.append(contentsOf: exact)
        }
        for (key, refs) in stopTripsIndex where key != targetNorm {
            if key.count >= 4 && targetNorm.count >= 4 && (key.contains(targetNorm) || targetNorm.contains(key)) {
                matchedRefs.append(contentsOf: refs)
            }
        }

        var seenTrips = Set<Int>()
        var perGroup: [String: [StationDeparture]] = [:]

        for ref in matchedRefs {
            guard seenTrips.insert(ref.tripIndex).inserted else { continue }
            let trip = trips[ref.tripIndex]
            guard ref.stopIndex < trip.stops.count - 1 else { continue }
            let stop = trip.stops[ref.stopIndex]

            var bestWait: Double?
            var atStop = false
            for sec in candidates {
                if sec <= stop.departureSec + 15 && sec >= stop.arrivalSec - 15 {
                    bestWait = 0
                    atStop = true
                    break
                }
                let delta = stop.arrivalSec - sec
                if delta >= 0 && delta <= horizonSeconds {
                    if bestWait == nil || delta < bestWait! {
                        bestWait = delta
                    }
                }
            }
            guard let waitSec = bestWait else { continue }

            let line = linesById[trip.lineId]
            let groupKey = "\(trip.lineId)|\(trip.direction)"
            perGroup[groupKey, default: []].append(StationDeparture(
                tripId: trip.id,
                lineId: trip.lineId,
                lineShortName: line?.shortName ?? trip.lineId,
                colorHex: line?.color ?? "#6B7280",
                textColorHex: line?.textColor ?? "#FFFFFF",
                direction: trip.direction,
                destinationName: trip.destinationName,
                arrivalSeconds: stop.arrivalSec,
                waitSeconds: max(0, Int(waitSec.rounded())),
                waitMinutes: max(0, Int((waitSec / 60).rounded())),
                atStop: atStop
            ))
        }

        var out: [StationDeparture] = []
        for list in perGroup.values {
            let sorted = list.sorted { $0.waitSeconds < $1.waitSeconds }
            out.append(contentsOf: sorted.prefix(limitPerLineDir))
        }
        return out.sorted { $0.waitSeconds < $1.waitSeconds }
    }

    public func groupedDepartures(
        forStation stationName: String,
        at date: Date = Date(),
        virtualServiceSeconds: Double? = nil
    ) -> [DepartureGroup] {
        let deps = departures(
            forStation: stationName,
            at: date,
            virtualServiceSeconds: virtualServiceSeconds,
            limitPerLineDir: 2
        )
        var byKey: [String: [StationDeparture]] = [:]
        var orderedKeys: [String] = []
        for d in deps {
            let k = "\(d.lineId)|\(d.direction)|\(d.destinationName)"
            if byKey[k] == nil { orderedKeys.append(k) }
            byKey[k, default: []].append(d)
        }
        return orderedKeys.compactMap { k in
            guard let list = byKey[k], let first = list.first else { return nil }
            return DepartureGroup(
                lineId: first.lineId,
                lineShortName: first.lineShortName,
                colorHex: first.colorHex,
                textColorHex: first.textColorHex,
                direction: first.direction,
                destinationName: first.destinationName,
                passages: list
            )
        }
    }

    public func station(named name: String) -> StationMetadata? {
        let norm = normalizeStopName(name)
        if let exact = stationsByNorm[norm] { return exact }
        guard norm.count >= 4 else { return nil }
        return stationsByNorm.first { $0.key.contains(norm) || norm.contains($0.key) }?.value
    }

    public func orderedStops(forLine lineId: String, direction: Int) -> [String] {
        var bestStops: [TripStop] = []
        for trip in trips where trip.lineId == lineId && trip.direction == direction {
            if trip.stops.count > bestStops.count {
                bestStops = trip.stops
            }
        }
        return bestStops.map(\.stationName)
    }

    public func nearbyStations(from coordinate: CLLocationCoordinate2D, limit: Int = 8) -> [(station: StationMetadata, distanceM: Double)] {
        let origin = CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude)
        let scored = stations.map { st -> (StationMetadata, Double) in
            let loc = CLLocation(latitude: st.coordinate.latitude, longitude: st.coordinate.longitude)
            return (st, origin.distance(from: loc))
        }
        return Array(scored.sorted { $0.1 < $1.1 }.prefix(limit))
    }

    public func findRoute(from originName: String, to destinationName: String) -> PlannedRoute? {
        routePlanner?.findRoute(from: originName, to: destinationName)
    }

    public func shape(forLineId lineId: String, direction: Int) -> ShapePolyline? {
        var bestTrip: TripData?
        for trip in trips where trip.lineId == lineId && trip.direction == direction {
            if bestTrip == nil || trip.stops.count > bestTrip!.stops.count {
                bestTrip = trip
            }
        }
        guard let shapeId = bestTrip?.shapeId else { return nil }
        return shapes[shapeId]
    }

    public func carPoses(for train: TrainMarker, carCount: Int = 5, carSpacingM: Double = 15.2) -> [TrainCarPose] {
        guard let shape = shapes[train.shapeId], shape.lengthM > 0 else {
            return [TrainCarPose(coordinate: train.coordinate, bearingDeg: train.bearingDeg, isCab: true, isTail: true)]
        }
        var poses: [TrainCarPose] = []
        poses.reserveCapacity(carCount)
        for i in 0..<carCount {
            let offsetM = Double(i) * carSpacingM
            let dist = max(0, min(shape.lengthM, train.currentDistM - offsetM))
            let coord = ShapesLoader.coordinate(on: shape, atDistance: dist)
            let brg = ShapesLoader.smoothedBearing(on: shape, atDistance: dist)
            poses.append(TrainCarPose(
                coordinate: coord,
                bearingDeg: brg,
                isCab: i == 0,
                isTail: i == carCount - 1
            ))
        }
        return poses
    }
}
