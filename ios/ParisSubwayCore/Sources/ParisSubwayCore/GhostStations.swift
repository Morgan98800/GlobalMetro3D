import Foundation
import CoreLocation

public struct GhostStationSpec: Sendable, Identifiable {
    public let id: String
    public let name: String
    public let shortNote: String
    public let lines: [String]
    public let isLoop: Bool
    public let coordinate: CLLocationCoordinate2D
    public let yearClosed: Int?
}

public enum GhostStationsRegistry {
    public static let all: [GhostStationSpec] = [
        GhostStationSpec(
            id: "ghost:arsenal",
            name: "Arsenal",
            shortNote: "Station fermée en 1939 (entre Bastille et Quai de la Rapée)",
            lines: ["5"],
            isLoop: false,
            coordinate: CLLocationCoordinate2D(latitude: 48.8504, longitude: 2.3660),
            yearClosed: 1939
        ),
        GhostStationSpec(
            id: "ghost:saint_martin",
            name: "Saint-Martin",
            shortNote: "Grande station à 4 voies fermée en 1939 (L8 / L9)",
            lines: ["8", "9"],
            isLoop: false,
            coordinate: CLLocationCoordinate2D(latitude: 48.8685, longitude: 2.3578),
            yearClosed: 1939
        ),
        GhostStationSpec(
            id: "ghost:croix_rouge",
            name: "Croix-Rouge",
            shortNote: "Ancien terminus L10 fermé en 1939",
            lines: ["10"],
            isLoop: false,
            coordinate: CLLocationCoordinate2D(latitude: 48.8520, longitude: 2.3283),
            yearClosed: 1939
        ),
        GhostStationSpec(
            id: "ghost:champ_de_mars",
            name: "Champ de Mars",
            shortNote: "Station L8 fermée en 1939",
            lines: ["8"],
            isLoop: false,
            coordinate: CLLocationCoordinate2D(latitude: 48.8548, longitude: 2.3016),
            yearClosed: 1939
        ),
        GhostStationSpec(
            id: "ghost:haxo",
            name: "Haxo",
            shortNote: "Station jamais ouverte sur la Voie des Fêtes (L3bis / L7bis)",
            lines: ["3bis", "7bis"],
            isLoop: false,
            coordinate: CLLocationCoordinate2D(latitude: 48.8781, longitude: 2.4008),
            yearClosed: nil
        ),
        GhostStationSpec(
            id: "ghost:porte_molitor",
            name: "Porte Molitor",
            shortNote: "Station jamais ouverte sur la Voie Murat (L9 / L10)",
            lines: ["9", "10"],
            isLoop: false,
            coordinate: CLLocationCoordinate2D(latitude: 48.8439, longitude: 2.2537),
            yearClosed: nil
        ),
        GhostStationSpec(
            id: "ghost:martin_nadaud",
            name: "Martin Nadaud",
            shortNote: "Absorbée par Gambetta lors du prolongement de 1969 (L3)",
            lines: ["3"],
            isLoop: false,
            coordinate: CLLocationCoordinate2D(latitude: 48.8648, longitude: 2.3949),
            yearClosed: 1969
        ),
        GhostStationSpec(
            id: "loop:porte_dauphine",
            name: "Boucle Porte Dauphine",
            shortNote: "Boucle historique de retournement terminus Ouest L2 (1900)",
            lines: ["2"],
            isLoop: true,
            coordinate: CLLocationCoordinate2D(latitude: 48.8712, longitude: 2.2750),
            yearClosed: nil
        ),
        GhostStationSpec(
            id: "loop:nation",
            name: "Boucles de Nation",
            shortNote: "Boucles de retournement et ateliers souterrains (L1, L2, L6)",
            lines: ["1", "2", "6"],
            isLoop: true,
            coordinate: CLLocationCoordinate2D(latitude: 48.8482, longitude: 2.3982),
            yearClosed: nil
        ),
        GhostStationSpec(
            id: "loop:etoile",
            name: "Boucle Charles de Gaulle – Étoile",
            shortNote: "Boucle terminale serrée à quai unique de la Ligne 6",
            lines: ["6"],
            isLoop: true,
            coordinate: CLLocationCoordinate2D(latitude: 48.8742, longitude: 2.2949),
            yearClosed: nil
        ),
    ]
}
