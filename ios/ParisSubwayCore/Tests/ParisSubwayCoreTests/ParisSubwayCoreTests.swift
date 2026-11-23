import Foundation
import Testing
@testable import ParisSubwayCore

@Suite("ParisSubwayCore Engine & Binary Data Verification")
struct ParisSubwayCoreTests {
    private func dataDirectoryURL() -> URL {
        // Resolve <repo-root>/web/public/data relative to this test file
        let thisFile = URL(fileURLWithPath: #filePath)
        return thisFile
            .deletingLastPathComponent() // ParisSubwayCoreTests
            .deletingLastPathComponent() // Tests
            .deletingLastPathComponent() // ParisSubwayCore
            .deletingLastPathComponent() // ios
            .deletingLastPathComponent() // repo root
            .appendingPathComponent("web/public/data")
    }

    @Test("Loads real Paris Metro + RER shapes.bin and schedules cleanly")
    func loadsRealParisDataset() async throws {
        let engine = SubwayEngine()
        try await engine.load(from: dataDirectoryURL())

        #expect(engine.lines.count >= 16)
        #expect(engine.shapes.count >= 116)
        #expect(engine.trips.count >= 11_252)
        #expect(engine.stations.count >= 300)

        // Peak hour 08:30 service simulation
        let peakTrains = engine.activeTrains(virtualServiceSeconds: 8 * 3600 + 30 * 60)
        #expect(peakTrains.count >= 450)

        // O(1) Châtelet departures at 08:30
        let chateletDeps = engine.departures(forStation: "Châtelet", virtualServiceSeconds: 8 * 3600 + 30 * 60)
        #expect(!chateletDeps.isEmpty)
        let lineNames = Set(chateletDeps.map(\.lineShortName))
        #expect(lineNames.contains("1") || lineNames.contains("4") || lineNames.contains("14"))
    }

    @Test("Trapezoidal kinematics accelerate smoothly from rest and brake cleanly into station")
    func trapezoidalKinematicsSmoothness() {
        let profile = KinematicProfile.metro
        let start = Kinematics.trapezoid(distanceM: 600, durationSec: 50, tau: 0.0, profile: profile)
        let accel = Kinematics.trapezoid(distanceM: 600, durationSec: 50, tau: 0.1, profile: profile)
        let cruise = Kinematics.trapezoid(distanceM: 600, durationSec: 50, tau: 0.5, profile: profile)
        let end = Kinematics.trapezoid(distanceM: 600, durationSec: 50, tau: 1.0, profile: profile)

        #expect(start.f == 0 && start.v == 0)
        #expect(accel.v > 0 && accel.v <= cruise.v)
        #expect(cruise.f > 0.4 && cruise.f < 0.6)
        #expect(end.f == 1 && end.v == 0)
    }

    @Test("Ghost stations registry includes Arsenal, Saint-Martin, and Croix-Rouge")
    func ghostStationsIntegrity() {
        let names = Set(GhostStationsRegistry.all.map(\.name))
        #expect(names.contains("Arsenal"))
        #expect(names.contains("Saint-Martin"))
        #expect(names.contains("Croix-Rouge"))
    }

    @Test("Ordered stops and RoutePlanner compute valid Paris routes")
    func orderedStopsAndRoutePlanner() async throws {
        let engine = SubwayEngine()
        try await engine.load(from: dataDirectoryURL())

        if let line6 = engine.lines.first(where: { $0.shortName == "6" }) {
            let stops0 = engine.orderedStops(forLine: line6.id, direction: 0)
            let stops1 = engine.orderedStops(forLine: line6.id, direction: 1)
            #expect(stops0.count >= 25)
            #expect(stops1.count >= 25)
        }

        let directRoute = engine.findRoute(from: "Châtelet", to: "Nation")
        #expect(directRoute != nil)
        #expect(directRoute!.legs.count >= 1)
        #expect(directRoute!.totalMinutes >= 5)

        let transferRoute = engine.findRoute(from: "République", to: "Charles de Gaulle - Etoile")
        #expect(transferRoute != nil)
        #expect(!transferRoute!.legs.isEmpty)
    }

    @Test("StationLevels orders hub depths accurately and carPoses returns 5 articulated cars")
    func stationLevelsAndArticulatedCars() async throws {
        let zL1 = StationLevels.elevationMeters(forLineShortName: "1", atStationName: "Châtelet")
        let zL4 = StationLevels.elevationMeters(forLineShortName: "4", atStationName: "Châtelet")
        let zL14 = StationLevels.elevationMeters(forLineShortName: "14", atStationName: "Châtelet")
        #expect(zL1 > zL4 && zL4 > zL14)

        let zBirHakeim = StationLevels.elevationMeters(forLineShortName: "6", atStationName: "Bir-Hakeim")
        #expect(zBirHakeim == StationLevels.viaductZM)

        let engine = SubwayEngine()
        try await engine.load(from: dataDirectoryURL())
        let trains = engine.activeTrains(virtualServiceSeconds: 8 * 3600 + 30 * 60)
        if let sampleTrain = trains.first {
            let poses = engine.carPoses(for: sampleTrain, carCount: 5)
            #expect(poses.count == 5)
            #expect(poses.first?.isCab == true)
            #expect(poses.last?.isTail == true)
        }

        // Rolling stock catalog & RER tracks parity
        #expect(engine.rollingStockByLine["14"]?.modelId == "MP14_8V")
        #expect(engine.rollingStockByLine["1"]?.driverless == true)
        let trackShortNames = Set(engine.tracks.map(\.shortName))
        #expect(trackShortNames.contains("A"))
        #expect(trackShortNames.contains("B"))

        let groups = engine.groupedDepartures(forStation: "Châtelet", virtualServiceSeconds: 8 * 3600 + 30 * 60)
        #expect(!groups.isEmpty)
        #expect((groups.first?.passages.count ?? 0) >= 1)
    }
}
