import Foundation
import CoreLocation

public struct RouteLeg: Sendable, Identifiable {
    public var id: String { "\(lineId)-\(fromStation)-\(toStation)" }
    public let lineId: String
    public let lineShortName: String
    public let colorHex: String
    public let textColorHex: String
    public let fromStation: String
    public let toStation: String
    public let stopNames: [String]
    public let estimatedSeconds: Int
    public let coordinates: [CLLocationCoordinate2D]
}

public struct PlannedRoute: Sendable, Identifiable {
    public let id = UUID()
    public let originName: String
    public let destinationName: String
    public let legs: [RouteLeg]
    public let totalSeconds: Int
    public let transferCount: Int

    public var totalMinutes: Int {
        max(1, Int((Double(totalSeconds) / 60.0).rounded()))
    }
}

public final class RoutePlanner: @unchecked Sendable {
    private struct Edge {
        let toNorm: String
        let lineId: String
        let durationSec: Double
    }

    private struct StateKey: Hashable {
        let stationNorm: String
        let lineId: String
    }

    private struct PrevStep {
        let prevKey: StateKey?
        let stationNorm: String
        let lineId: String
        let edgeDurationSec: Double
    }

    private let adj: [String: [Edge]]
    private let displayNames: [String: String]
    private let linesById: [String: LineMetadata]
    private let stationsByNorm: [String: StationMetadata]
    private let transferPenaltySec: Double = 240.0

    public init(
        trips: [TripData],
        linesById: [String: LineMetadata],
        stationsByNorm: [String: StationMetadata]
    ) {
        self.linesById = linesById
        self.stationsByNorm = stationsByNorm

        var names: [String: String] = [:]
        for (norm, st) in stationsByNorm {
            names[norm] = st.name
        }

        // Deduplicate directed edges (fromNorm|toNorm|lineId) keeping minimum travel time
        var bestEdge: [String: Edge] = [:]
        var fromMap: [String: String] = [:]

        for trip in trips where trip.stops.count >= 2 {
            for i in 0..<(trip.stops.count - 1) {
                let a = trip.stops[i]
                let b = trip.stops[i + 1]
                let aNorm = a.normalizedStopId
                let bNorm = b.normalizedStopId
                guard !aNorm.isEmpty, !bNorm.isEmpty, aNorm != bNorm else { continue }
                if names[aNorm] == nil { names[aNorm] = a.stationName }
                if names[bNorm] == nil { names[bNorm] = b.stationName }

                let dt = max(45.0, b.arrivalSec - a.departureSec)
                let key = "\(aNorm)|\(bNorm)|\(trip.lineId)"
                if let existing = bestEdge[key] {
                    if dt < existing.durationSec {
                        bestEdge[key] = Edge(toNorm: bNorm, lineId: trip.lineId, durationSec: dt)
                    }
                } else {
                    bestEdge[key] = Edge(toNorm: bNorm, lineId: trip.lineId, durationSec: dt)
                    fromMap[key] = aNorm
                }
            }
        }

        var graph: [String: [Edge]] = [:]
        for (key, edge) in bestEdge {
            guard let fromNorm = fromMap[key] else { continue }
            graph[fromNorm, default: []].append(edge)
        }

        self.adj = graph
        self.displayNames = names
    }

    public func findRoute(from originName: String, to destinationName: String) -> PlannedRoute? {
        let startNorm = resolveStationNorm(originName)
        let goalNorm = resolveStationNorm(destinationName)
        guard let startNorm, let goalNorm, startNorm != goalNorm else { return nil }

        var dist: [StateKey: Double] = [:]
        var prev: [StateKey: PrevStep] = [:]
        var queue: [(cost: Double, key: StateKey)] = []

        // Seed from all outgoing edges of startNorm (no transfer penalty for first boarding)
        let startEdges = adj[startNorm] ?? []
        var visitedInitialLines = Set<String>()
        for edge in startEdges where visitedInitialLines.insert(edge.lineId).inserted {
            let k = StateKey(stationNorm: startNorm, lineId: edge.lineId)
            dist[k] = 0
            queue.append((0, k))
        }

        var bestGoalKey: StateKey?
        var bestGoalCost = Double.infinity

        while !queue.isEmpty {
            // Pop smallest cost (graph is ~380 stations, linear min-pop is <0.5ms)
            var minIdx = 0
            for i in 1..<queue.count where queue[i].cost < queue[minIdx].cost {
                minIdx = i
            }
            let current = queue.remove(at: minIdx)
            if current.cost > (dist[current.key] ?? .infinity) { continue }
            if current.cost >= bestGoalCost { break }

            if current.key.stationNorm == goalNorm {
                bestGoalCost = current.cost
                bestGoalKey = current.key
                break
            }

            let edges = adj[current.key.stationNorm] ?? []
            for edge in edges {
                let isTransfer = edge.lineId != current.key.lineId
                let stepCost = edge.durationSec + (isTransfer ? transferPenaltySec : 0.0)
                let nextCost = current.cost + stepCost
                let nextKey = StateKey(stationNorm: edge.toNorm, lineId: edge.lineId)

                if nextCost < (dist[nextKey] ?? .infinity) {
                    dist[nextKey] = nextCost
                    prev[nextKey] = PrevStep(
                        prevKey: current.key,
                        stationNorm: edge.toNorm,
                        lineId: edge.lineId,
                        edgeDurationSec: edge.durationSec
                    )
                    queue.append((nextCost, nextKey))
                }
            }
        }

        guard let endKey = bestGoalKey else { return nil }

        // Reconstruct raw edge steps
        var rawSteps: [(fromNorm: String, toNorm: String, lineId: String, durationSec: Double)] = []
        var cursor: StateKey? = endKey
        while let k = cursor, let step = prev[k], let parent = step.prevKey {
            rawSteps.append((parent.stationNorm, step.stationNorm, step.lineId, step.edgeDurationSec))
            cursor = parent
        }
        rawSteps.reverse()
        guard !rawSteps.isEmpty else { return nil }

        // Group consecutive steps on the same line into RouteLegs
        var legs: [RouteLeg] = []
        var curLineId = rawSteps[0].lineId
        var curStops = [rawSteps[0].fromNorm, rawSteps[0].toNorm]
        var curDuration = rawSteps[0].durationSec

        func flushLeg() {
            let line = linesById[curLineId]
            let stopNames = curStops.map { displayNames[$0] ?? $0.capitalized }
            let coords = curStops.compactMap { stationsByNorm[$0]?.coordinate }
            legs.append(RouteLeg(
                lineId: curLineId,
                lineShortName: line?.shortName ?? curLineId,
                colorHex: line?.color ?? "#6B7280",
                textColorHex: line?.textColor ?? "#FFFFFF",
                fromStation: stopNames.first ?? "",
                toStation: stopNames.last ?? "",
                stopNames: stopNames,
                estimatedSeconds: Int(curDuration.rounded()),
                coordinates: coords
            ))
        }

        for step in rawSteps.dropFirst() {
            if step.lineId == curLineId {
                curStops.append(step.toNorm)
                curDuration += step.durationSec
            } else {
                flushLeg()
                curLineId = step.lineId
                curStops = [step.fromNorm, step.toNorm]
                curDuration = step.durationSec
            }
        }
        flushLeg()

        return PlannedRoute(
            originName: displayNames[startNorm] ?? originName,
            destinationName: displayNames[goalNorm] ?? destinationName,
            legs: legs,
            totalSeconds: Int(bestGoalCost.rounded()),
            transferCount: max(0, legs.count - 1)
        )
    }

    private func resolveStationNorm(_ raw: String) -> String? {
        let norm = normalizeStopName(raw)
        if adj[norm] != nil { return norm }
        guard norm.count >= 4 else { return nil }
        return adj.keys.first { $0.contains(norm) || norm.contains($0) }
    }
}
