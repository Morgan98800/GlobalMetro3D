import Foundation

public struct ServiceCandidate: Sendable {
    public let serviceDate: String
    public let seconds: Double
}

public enum ParisClock {
    public static let parisTimeZone = TimeZone(identifier: "Europe/Paris")!

    public static func secondsSinceMidnight(for date: Date = Date(), timeZone: TimeZone = parisTimeZone) -> Double {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = timeZone
        let comps = cal.dateComponents([.hour, .minute, .second, .nanosecond], from: date)
        let h = Double(comps.hour ?? 0)
        let m = Double(comps.minute ?? 0)
        let s = Double(comps.second ?? 0)
        let ns = Double(comps.nanosecond ?? 0) / 1_000_000_000.0
        return h * 3600 + m * 60 + s + ns
    }

    public static func serviceCandidates(for date: Date = Date(), timeZone: TimeZone = parisTimeZone) -> [ServiceCandidate] {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = timeZone
        let sec = secondsSinceMidnight(for: date, timeZone: timeZone)
        let fmt = DateFormatter()
        fmt.calendar = cal
        fmt.timeZone = timeZone
        fmt.dateFormat = "yyyy-MM-dd"

        var out = [ServiceCandidate(serviceDate: fmt.string(from: date), seconds: sec)]
        if sec < 5 * 3600, let yesterday = cal.date(byAdding: .day, value: -1, to: date) {
            out.append(ServiceCandidate(serviceDate: fmt.string(from: yesterday), seconds: sec + 86400))
        }
        return out
    }

    public static func formatClock(_ seconds: Double) -> String {
        let civil = ((Int(seconds.rounded(.down)) % 86400) + 86400) % 86400
        let h = civil / 3600
        let m = (civil % 3600) / 60
        return String(format: "%02dh%02d", h, m)
    }
}
