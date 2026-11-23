import Foundation
import CoreLocation

public struct TrainCarPose: Sendable {
    public let coordinate: CLLocationCoordinate2D
    public let bearingDeg: Double
    public let isCab: Bool
    public let isTail: Bool
}

/// Niveaux architecturaux réels des pôles parisiens (profondeurs et viaducs aériens),
/// alignés sur `core/ui/map/station_levels.ts`.
public enum StationLevels {
    public static let hubLevelStepM: Double = 7.5
    public static let hubBaseZM: Double = -7.5
    public static let viaductZM: Double = 10.5

    /// Ordre surface → profondeur des lignes pour les grands pôles parisiens.
    public static let hubShallowToDeepOverrides: [String: [String]] = [
        "strasbourg - saint-denis": ["4", "8", "9"],
        "strasbourg saint-denis": ["4", "8", "9"],
        "opera": ["3", "7", "8"],
        "chatelet": ["1", "7", "4", "11", "14", "B", "D", "A"],
        "chatelet - les halles": ["1", "7", "4", "11", "14", "B", "D", "A"],
        "republique": ["3", "5", "8", "9", "11"],
        "concorde": ["1", "8", "12"],
        "bastille": ["1", "5", "8"],
        "nation": ["1", "2", "6", "9", "A"],
        "charles de gaulle - etoile": ["1", "2", "6", "A"],
        "place d'italie": ["6", "5", "7"],
        "place d italie": ["6", "5", "7"],
        "la motte-picquet - grenelle": ["6", "8", "10"],
        "la motte picquet grenelle": ["6", "8", "10"],
        "montparnasse - bienvenue": ["4", "6", "12", "13"],
        "grands boulevards": ["8", "9"],
        "bonne nouvelle": ["8", "9"],
        "richelieu - drouot": ["8", "9"],
        "saint-lazare": ["3", "12", "13", "14", "E"],
        "saint lazare": ["3", "12", "13", "14", "E"],
        "gare de lyon": ["1", "14", "A", "D"],
        "gare du nord": ["4", "5", "B", "D", "E"],
        "denfert-rochereau": ["6", "4", "B"],
        "denfert rochereau": ["6", "4", "B"],
    ]

    private static let elevatedStationsByLine: [String: [String]] = [
        "6": ["bir hakeim", "passy", "dupleix", "motte picquet", "cambronne", "sevres lecourbe", "nationale", "chevaleret", "quai de la gare"],
        "2": ["barbes", "la chapelle", "stalingrad", "jaures"],
        "5": ["quai de la rapee", "gare d austerlitz"],
    ]

    public static func isElevatedStation(lineShortName: String, stationName: String) -> Bool {
        guard let keywords = elevatedStationsByLine[lineShortName.uppercased()] else { return false }
        let norm = normalizeStopName(stationName)
        return keywords.contains { norm.contains($0) }
    }

    public static func hasPlatformScreenDoors(lineShortName: String) -> Bool {
        ["1", "4", "14"].contains(lineShortName)
    }

    public static func elevationMeters(
        forLineShortName lineShortName: String,
        atStationName stationName: String,
        fallbackOffset: Double = 0
    ) -> Double {
        if isElevatedStation(lineShortName: lineShortName, stationName: stationName) {
            return viaductZM
        }
        let normStation = normalizeStopName(stationName)
        let targetLine = lineShortName.uppercased()
        if let order = hubShallowToDeepOverrides[normStation],
           let idx = order.firstIndex(where: { $0.uppercased() == targetLine }) {
            return hubBaseZM - Double(idx) * hubLevelStepM
        }
        if ["A", "B", "C", "D", "E"].contains(targetLine) {
            return -28.0 - fallbackOffset * 1.5
        }
        return hubBaseZM - 4.0 - fallbackOffset * 1.1
    }
}
