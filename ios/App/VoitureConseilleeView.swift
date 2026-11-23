import SwiftUI

public enum VoiturePosition {
    case tete
    case milieu
    case queue

    var label: String {
        switch self {
        case .tete: "Montez en tête de train"
        case .milieu: "Montez au milieu du train"
        case .queue: "Montez en queue de train"
        }
    }
}

/// Schéma de rame 5 voitures indiquant la voiture conseillée pour les correspondances.
public struct VoitureConseilleeView: View {
    public let position: VoiturePosition
    public let reason: String?

    public init(position: VoiturePosition, reason: String? = nil) {
        self.position = position
        self.reason = reason
    }

    private var targetIndex: Int {
        switch position {
        case .tete: 4
        case .milieu: 2
        case .queue: 0
        }
    }

    public var body: some View {
        HStack(spacing: 10) {
            HStack(spacing: 3) {
                ForEach(0..<5, id: \.self) { idx in
                    let active = idx == targetIndex
                    let isHead = idx == 4
                    RoundedRectangle(cornerRadius: isHead ? 5 : 3)
                        .fill(active ? FaiencePalette.bleuEmail : Color.clear)
                        .stroke(active ? FaiencePalette.bleuEmail : Color.secondary.opacity(0.45), lineWidth: 1.5)
                        .frame(width: isHead ? 22 : 18, height: 12)
                }
            }

            Text(reason.map { "\(position.label), \($0)" } ?? position.label)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(2)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
    }
}
