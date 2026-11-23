import Foundation

public struct KinematicProfile: Sendable {
    public let accelMps2: Double
    public let decelMps2: Double
    public let vMaxMps: Double
    public let minDwellSec: Double

    public static let metro = KinematicProfile(accelMps2: 1.15, decelMps2: 1.25, vMaxMps: 20.0, minDwellSec: 12)
    public static let rer = KinematicProfile(accelMps2: 0.95, decelMps2: 1.05, vMaxMps: 33.3, minDwellSec: 20)

    public static func forLine(_ lineIdOrShort: String) -> KinematicProfile {
        let up = lineIdOrShort.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        if ["A", "B", "C", "D", "E"].contains(up) || up.contains("RER") || up.contains("C017") || up.contains("C018") {
            return .rer
        }
        return .metro
    }
}

public struct KinematicPosition: Sendable {
    public let distanceM: Double
    public let speedMps: Double
    public let nextStopName: String
    public let atStop: Bool
}

public enum Kinematics {
    public static func trapezoid(distanceM: Double, durationSec: Double, tau: Double, profile: KinematicProfile) -> (f: Double, v: Double) {
        guard distanceM > 0, durationSec > 0 else {
            return (tau >= 1 ? 1 : 0, 0)
        }
        let a = profile.accelMps2
        let b = profile.decelMps2
        let vMean = distanceM / durationSec
        let denom = 1.0 - (vMean * (a + b)) / (2.0 * a * b * durationSec)
        var vc = denom > 0.05 ? vMean / denom : vMean
        if !vc.isFinite || vc <= 0 { vc = vMean }
        vc = min(vc, profile.vMaxMps)

        let tA = vc / a
        let tD = vc / b
        let boundedTau = max(0, min(1, tau))
        let t = boundedTau * durationSec

        if t <= 0 { return (0, 0) }
        if t >= durationSec { return (1, 0) }

        let travelled: Double
        let v: Double
        if t < tA {
            travelled = 0.5 * a * t * t
            v = a * t
        } else if t > durationSec - tD {
            let u = durationSec - t
            travelled = distanceM - 0.5 * b * u * u
            v = b * u
        } else {
            travelled = 0.5 * vc * tA + vc * (t - tA)
            v = vc
        }
        return (max(0, min(1, travelled / distanceM)), max(0, min(profile.vMaxMps * 1.15, v)))
    }

    public static func evaluate(trip: TripData, atServiceSeconds t: Double, profile: KinematicProfile) -> KinematicPosition? {
        let stops = trip.stops
        guard stops.count >= 2 else { return nil }
        if t < stops[0].arrivalSec || t > stops[stops.count - 1].arrivalSec {
            return nil
        }

        for i in 0..<(stops.count - 1) {
            let a = stops[i]
            let b = stops[i + 1]
            let dwellEnd = max(a.departureSec, a.arrivalSec + 1)

            if t >= a.arrivalSec && t < dwellEnd {
                return KinematicPosition(
                    distanceM: a.distanceM,
                    speedMps: 0,
                    nextStopName: b.stationName,
                    atStop: true
                )
            }
            if t >= dwellEnd && t <= b.arrivalSec {
                let dist = max(0, b.distanceM - a.distanceM)
                let dur = max(1, b.arrivalSec - dwellEnd)
                let tau = (t - dwellEnd) / dur
                let (f, v) = trapezoid(distanceM: dist, durationSec: dur, tau: tau, profile: profile)
                return KinematicPosition(
                    distanceM: a.distanceM + f * dist,
                    speedMps: v,
                    nextStopName: b.stationName,
                    atStop: false
                )
            }
        }
        return nil
    }
}
