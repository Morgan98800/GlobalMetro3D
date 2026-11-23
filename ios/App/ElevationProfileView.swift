import SwiftUI
import ParisSubwayCore

/// Profil altimétrique longitudinal de la ligne (tunnels souterrains vs viaducs aériens).
public struct ElevationProfileView: View {
    public let line: LineMetadata
    public let stops: [StationMetadata]

    public init(line: LineMetadata, stops: [StationMetadata]) {
        self.line = line
        self.stops = stops
    }

    private func elevationMeters(for station: StationMetadata) -> Double {
        let lower = station.name.lowercased()
        let elevatedKeywords = [
            "bir-hakeim", "passy", "dupleix", "motte-picquet", "cambronne",
            "sèvres-lecourbe", "sevres-lecourbe", "nationale", "chevaleret",
            "quai de la gare", "barbès", "barbes", "la chapelle", "stalingrad",
            "jaurès", "jaures", "quai de la rapée", "rapee"
        ]
        if ["2", "5", "6"].contains(line.shortName),
           elevatedKeywords.contains(where: { lower.contains($0) }) {
            return 7.5
        }
        if line.mode == "rer" {
            return -24.0 - line.elevationOffset * 1.2
        }
        let base = -11.0 - line.elevationOffset * 1.1
        return station.lines.count >= 3 ? base - 4.0 : base
    }

    public var body: some View {
        if stops.count >= 2 {
            let elevations = stops.map { elevationMeters(for: $0) }
            let minPos = elevations.min() ?? -18
            let maxPos = elevations.max() ?? 0
            let minZ = min(-18.0, minPos) - 3
            let maxZ = max(8.0, maxPos) + 3
            let spanZ = max(10.0, maxZ - minZ)
            let lineColor = Color(hex: line.color)

            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("Profil altimétrique")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text("\(Int(minPos.rounded())) m … \(maxPos > 0 ? "+\(Int(maxPos.rounded()))" : "\(Int(maxPos.rounded()))") m")
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(.secondary)
                }

                GeometryReader { geo in
                    let w = geo.size.width
                    let h = geo.size.height
                    let padX: CGFloat = 6
                    let padY: CGFloat = 8

                    let xAt: (Int) -> CGFloat = { idx in
                        padX + CGFloat(idx) / CGFloat(max(1, stops.count - 1)) * (w - padX * 2)
                    }
                    let yAt: (Double) -> CGFloat = { z in
                        padY + CGFloat((maxZ - z) / spanZ) * (h - padY * 2)
                    }

                    let yGround = yAt(0)

                    ZStack(alignment: .topLeading) {
                        // Ground level dashed line
                        Path { path in
                            path.move(to: CGPoint(x: padX, y: yGround))
                            path.addLine(to: CGPoint(x: w - padX, y: yGround))
                        }
                        .stroke(Color.secondary.opacity(0.35), style: StrokeStyle(lineWidth: 1, dash: [4, 3]))

                        Text("Sol (0 m)")
                            .font(.system(size: 9, weight: .medium))
                            .foregroundStyle(.secondary)
                            .position(x: padX + 24, y: max(8, yGround - 7))

                        // Filled area
                        Path { path in
                            path.move(to: CGPoint(x: xAt(0), y: h - 2))
                            for i in 0..<elevations.count {
                                path.addLine(to: CGPoint(x: xAt(i), y: yAt(elevations[i])))
                            }
                            path.addLine(to: CGPoint(x: xAt(elevations.count - 1), y: h - 2))
                            path.closeSubpath()
                        }
                        .fill(lineColor.opacity(0.16))

                        // Track elevation curve
                        Path { path in
                            for i in 0..<elevations.count {
                                let pt = CGPoint(x: xAt(i), y: yAt(elevations[i]))
                                if i == 0 { path.move(to: pt) } else { path.addLine(to: pt) }
                            }
                        }
                        .stroke(lineColor, style: StrokeStyle(lineWidth: 2.2, lineCap: .round, lineJoin: .round))
                    }
                }
                .frame(height: 62)
            }
            .padding(10)
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
        }
    }
}
