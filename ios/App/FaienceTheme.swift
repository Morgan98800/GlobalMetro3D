import SwiftUI
import UIKit
import ParisSubwayCore

public enum FaiencePalette {
    public static let bleuEmail = Color(red: 0x1D / 255, green: 0x3F / 255, blue: 0x7A / 255)
    public static let ambreAfficheur = Color(red: 0xFF / 255, green: 0xB5 / 255, blue: 0x47 / 255)
    public static let fondAfficheur = Color(red: 0x0C / 255, green: 0x10 / 255, blue: 0x18 / 255)
    public static let vertNordSud = Color(red: 0x2B / 255, green: 0x6E / 255, blue: 0x52 / 255)
}

public extension Color {
    init(hex: String) {
        let cleaned = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: cleaned).scanHexInt64(&int)
        let r, g, b: UInt64
        switch cleaned.count {
        case 6:
            (r, g, b) = (int >> 16, (int >> 8) & 0xFF, int & 0xFF)
        default:
            (r, g, b) = (120, 120, 128)
        }
        self.init(.sRGB, red: Double(r) / 255, green: Double(g) / 255, blue: Double(b) / 255, opacity: 1)
    }
}

public struct LineBadgePill: View {
    public let shortName: String
    public let colorHex: String
    public let textColorHex: String
    public var size: CGFloat = 26

    public init(shortName: String, colorHex: String, textColorHex: String, size: CGFloat = 26) {
        self.shortName = shortName
        self.colorHex = colorHex
        self.textColorHex = textColorHex
        self.size = size
    }

    public var body: some View {
        let isRer = ["A", "B", "C", "D", "E"].contains(shortName.uppercased())
        Text(shortName)
            .font(.system(size: size * (shortName.count > 2 ? 0.42 : 0.56), weight: .bold, design: .rounded))
            .foregroundStyle(Color(hex: textColorHex))
            .frame(width: size, height: size)
            .background(Color(hex: colorHex))
            .clipShape(RoundedRectangle(cornerRadius: isRer ? size * 0.28 : size * 0.5))
    }
}

public struct PlaqueEmailView: View {
    public let title: String
    public var showChevron: Bool = false

    public init(title: String, showChevron: Bool = false) {
        self.title = title
        self.showChevron = showChevron
    }

    public var body: some View {
        HStack(spacing: 5) {
            Text(title)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(.white)
                .lineLimit(1)
            if showChevron {
                Image(systemName: "chevron.down")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(.white.opacity(0.85))
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 7)
        .background(FaiencePalette.bleuEmail)
        .overlay(
            RoundedRectangle(cornerRadius: 6)
                .strokeBorder(.white.opacity(0.92), lineWidth: 1.5)
                .padding(3)
        )
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .shadow(color: .black.opacity(0.28), radius: 8, y: 4)
    }
}

public struct AfficheurBadge: View {
    public let minutes: Int
    public let atStop: Bool

    public init(minutes: Int, atStop: Bool) {
        self.minutes = minutes
        self.atStop = atStop
    }

    public var body: some View {
        Text(atStop ? "À quai" : "\(minutes) min")
            .font(.system(size: 14, weight: .bold, design: .monospaced))
            .monospacedDigit()
            .foregroundStyle(atStop ? Color.green : FaiencePalette.ambreAfficheur)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(FaiencePalette.fondAfficheur)
            .clipShape(RoundedRectangle(cornerRadius: 6))
    }
}

/// Frise céramique biseautée (Cobalt CMP ou Nord-Sud) inspirée de HeritageDecor.tsx.
public struct FriseCeramiqueView: View {
    public let passionne: Bool

    public init(passionne: Bool = false) {
        self.passionne = passionne
    }

    public var body: some View {
        GeometryReader { geo in
            let accent = passionne ? FaiencePalette.vertNordSud : FaiencePalette.bleuEmail
            HStack(spacing: 2) {
                ForEach(0..<Int(max(8, geo.size.width / 16)), id: \.self) { idx in
                    RoundedRectangle(cornerRadius: 1.5)
                        .fill(idx % 2 == 0 ? accent : accent.opacity(0.32))
                        .frame(height: 5)
                }
            }
        }
        .frame(height: 5)
    }
}

/// Ruban horizontal de progression entre stations (CabHud & FollowTrainHud).
public struct PlanDeLigneHorizontalView: View {
    public let colorHex: String
    public let stops: [String]
    public let currentIndex: Int
    public var onSelectStop: ((String) -> Void)?

    public init(
        colorHex: String,
        stops: [String],
        currentIndex: Int,
        onSelectStop: ((String) -> Void)? = nil
    ) {
        self.colorHex = colorHex
        self.stops = stops
        self.currentIndex = currentIndex
        self.onSelectStop = onSelectStop
    }

    public var body: some View {
        let lineColor = Color(hex: colorHex)
        let windowStops = windowedStops()

        VStack(spacing: 5) {
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(Color.primary.opacity(0.16))
                    .frame(height: 4)

                GeometryReader { geo in
                    let frac = windowStops.count > 1
                        ? CGFloat(windowStops.activeLocalIdx) / CGFloat(windowStops.count - 1)
                        : 0.5
                    Capsule()
                        .fill(lineColor)
                        .frame(width: max(8, geo.size.width * frac), height: 4)
                }
                .frame(height: 4)

                HStack {
                    ForEach(Array(windowStops.names.enumerated()), id: \.offset) { idx, name in
                        Button {
                            onSelectStop?(name)
                        } label: {
                            Circle()
                                .fill(idx <= windowStops.activeLocalIdx ? lineColor : Color(.systemBackground))
                                .stroke(lineColor, lineWidth: 2)
                                .frame(width: idx == windowStops.activeLocalIdx ? 12 : 9, height: idx == windowStops.activeLocalIdx ? 12 : 9)
                        }
                        .buttonStyle(.plain)
                        if idx < windowStops.names.count - 1 {
                            Spacer()
                        }
                    }
                }
            }

            HStack {
                ForEach(Array(windowStops.names.enumerated()), id: \.offset) { idx, name in
                    Text(name)
                        .font(.system(size: 10, weight: idx == windowStops.activeLocalIdx ? .bold : .medium))
                        .foregroundStyle(idx == windowStops.activeLocalIdx ? .primary : .secondary)
                        .lineLimit(1)
                        .frame(maxWidth: .infinity)
                }
            }
        }
    }

    private func windowedStops() -> (names: [String], count: Int, activeLocalIdx: Int) {
        guard !stops.isEmpty else { return (["Station"], 1, 0) }
        let clamped = max(0, min(stops.count - 1, currentIndex))
        let start = max(0, min(stops.count - 4, clamped - 1))
        let end = min(stops.count, start + 4)
        let slice = Array(stops[start..<end])
        return (slice, slice.count, max(0, clamped - start))
    }
}

/// Contrôle segmenté Faïence v2.1 (remplace les Pickers système SwiftUI).
public struct FaienceSegmentedView<Option: Hashable>: View {
    public let options: [(value: Option, label: String)]
    @Binding public var selection: Option
    public var darkGlass: Bool = false

    public init(
        options: [(value: Option, label: String)],
        selection: Binding<Option>,
        darkGlass: Bool = false
    ) {
        self.options = options
        self._selection = selection
        self.darkGlass = darkGlass
    }

    public var body: some View {
        HStack(spacing: 4) {
            ForEach(Array(options.enumerated()), id: \.offset) { _, opt in
                let isSelected = opt.value == selection
                Button {
                    withAnimation(.snappy(duration: 0.22)) {
                        selection = opt.value
                    }
                } label: {
                    Text(opt.label)
                        .font(.system(size: 13, weight: .semibold, design: .rounded))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(
                            RoundedRectangle(cornerRadius: 8)
                                .fill(
                                    isSelected
                                        ? (darkGlass ? FaiencePalette.ambreAfficheur : FaiencePalette.bleuEmail)
                                        : Color.clear
                                )
                        )
                        .foregroundStyle(
                            isSelected
                                ? (darkGlass ? Color.black : Color.white)
                                : (darkGlass ? Color.white.opacity(0.78) : Color.primary.opacity(0.78))
                        )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(3)
        .background(
            RoundedRectangle(cornerRadius: 11)
                .fill(darkGlass ? Color.white.opacity(0.12) : Color(.secondarySystemFill))
        )
    }
}
