import Foundation
import CoreLocation

public struct LineMetadata: Codable, Sendable, Identifiable, Hashable {
    public let id: String
    public let shortName: String
    public let longName: String
    public let color: String
    public let textColor: String
    public let mode: String
    public let destinations: [String: String]?
    public let measuredLengthKm: Double
    public let elevationOffset: Double

    public init(
        id: String,
        shortName: String,
        longName: String,
        color: String,
        textColor: String,
        mode: String,
        destinations: [String: String]? = nil,
        measuredLengthKm: Double,
        elevationOffset: Double
    ) {
        self.id = id
        self.shortName = shortName
        self.longName = longName
        self.color = color
        self.textColor = textColor
        self.mode = mode
        self.destinations = destinations
        self.measuredLengthKm = measuredLengthKm
        self.elevationOffset = elevationOffset
    }

    enum CodingKeys: String, CodingKey {
        case id
        case shortName = "short_name"
        case longName = "long_name"
        case color
        case textColor = "text_color"
        case mode
        case destinations
        case measuredLengthKm = "measured_length_km"
        case elevationOffset = "elevation_offset"
    }
}

public struct StationMetadata: Codable, Sendable, Identifiable, Hashable {
    public let id: String
    public let name: String
    public let coordinates: [Double] // [lng, lat]
    public let lines: [String]
    public let isHub: Bool?
    public let wheelchairBoarding: Int?

    public var coordinate: CLLocationCoordinate2D {
        guard coordinates.count >= 2 else { return CLLocationCoordinate2D(latitude: 48.8566, longitude: 2.3522) }
        return CLLocationCoordinate2D(latitude: coordinates[1], longitude: coordinates[0])
    }

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case coordinates
        case lines
        case isHub = "is_hub"
        case wheelchairBoarding = "wheelchair_boarding"
    }
}

public struct TrackSegment: Codable, Sendable, Identifiable {
    public let id = UUID()
    public let lineId: String
    public let shortName: String
    public let stroke: String
    public let coordinates: [[Double]]

    public init(lineId: String, shortName: String, stroke: String, coordinates: [[Double]]) {
        self.lineId = lineId
        self.shortName = shortName
        self.stroke = stroke
        self.coordinates = coordinates
    }

    enum CodingKeys: String, CodingKey {
        case lineId = "line_id"
        case shortName = "short_name"
        case stroke
        case coordinates
    }

    public var clCoordinates: [CLLocationCoordinate2D] {
        coordinates.compactMap { pt in
            guard pt.count >= 2 else { return nil }
            return CLLocationCoordinate2D(latitude: pt[1], longitude: pt[0])
        }
    }
}

public struct TripStop: Sendable {
    public let arrivalSec: Double
    public let departureSec: Double
    public let distanceM: Double
    public let stationName: String
    public let normalizedStopId: String
}

public struct TripData: Sendable {
    public let id: String
    public let lineId: String
    public let direction: Int
    public let shapeId: String
    public let t0: Double
    public let t1: Double
    public let destinationName: String
    public let stops: [TripStop]
}

public struct TrainMarker: Sendable, Identifiable {
    public let id: String
    public let lineId: String
    public let lineName: String
    public let colorHex: String
    public let textColorHex: String
    public let coordinate: CLLocationCoordinate2D
    public let bearingDeg: Double
    public let speedKmh: Int
    public let speedMps: Double
    public let destination: String
    public let nextStation: String
    public let atStop: Bool
    public let currentDistM: Double
    public let direction: Int
    public let shapeId: String
}

public struct StationDeparture: Sendable, Identifiable {
    public var id: String { "\(tripId)-\(direction)-\(arrivalSeconds)" }
    public let tripId: String
    public let lineId: String
    public let lineShortName: String
    public let colorHex: String
    public let textColorHex: String
    public let direction: Int
    public let destinationName: String
    public let arrivalSeconds: Double
    public let waitSeconds: Int
    public let waitMinutes: Int
    public let atStop: Bool
}

public struct DepartureGroup: Sendable, Identifiable {
    public var id: String { "\(lineId)-\(direction)-\(destinationName)" }
    public let lineId: String
    public let lineShortName: String
    public let colorHex: String
    public let textColorHex: String
    public let direction: Int
    public let destinationName: String
    public let passages: [StationDeparture]
}

public struct LineRollingStockSpec: Codable, Sendable, Identifiable, Hashable {
    public var id: String { shortName ?? modelId }
    public let lineId: String?
    public let shortName: String?
    public let modelId: String
    public let name: String
    public let manufacturer: String?
    public let carsCount: Int
    public let totalLengthM: Double
    public let carLengthM: Double
    public let widthM: Double
    public let driveType: String // "tire" or "steel"
    public let driverless: Bool

    enum CodingKeys: String, CodingKey {
        case lineId = "line_id"
        case shortName = "short_name"
        case modelId = "model_id"
        case name
        case manufacturer
        case carsCount = "cars_count"
        case totalLengthM = "total_length_m"
        case carLengthM = "car_length_m"
        case widthM = "width_m"
        case driveType = "drive_type"
        case driverless
    }
}

public struct RollingStockCatalog: Codable, Sendable {
    public let models: [String: LineRollingStockSpec]
    public let lines: [String: LineRollingStockSpec]
}

public func normalizeStopName(_ raw: String) -> String {
    raw
        .folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "fr_FR"))
        .replacingOccurrences(of: "’", with: " ")
        .replacingOccurrences(of: "'", with: " ")
        .replacingOccurrences(of: "–", with: " ")
        .replacingOccurrences(of: "—", with: " ")
        .replacingOccurrences(of: "-", with: " ")
        .split(whereSeparator: \.isWhitespace)
        .joined(separator: " ")
        .trimmingCharacters(in: .whitespacesAndNewlines)
}
