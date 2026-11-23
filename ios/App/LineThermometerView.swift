import SwiftUI
import ParisSubwayCore

public struct LineThermometerView: View {
    @Bindable var vm: ParisSubwayViewModel
    let line: LineMetadata
    let onSelectStation: (StationMetadata) -> Void

    public var body: some View {
        let stops = vm.orderedStations(for: line, direction: vm.lineDirection)
        let lineColor = Color(hex: line.color)
        let activeTrainsOnDir = vm.trains.filter { $0.lineId == line.id && $0.direction == vm.lineDirection }

        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Button {
                    withAnimation(.snappy(duration: 0.25)) {
                        vm.lineDirection = vm.lineDirection == 0 ? 1 : 0
                    }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.up.arrow.down")
                            .font(.caption.bold())
                        Text(stops.last.map { "Dir. \($0.name)" } ?? "Inverser le sens")
                            .font(.caption.weight(.semibold))
                            .lineLimit(1)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(lineColor.opacity(0.16), in: Capsule())
                    .foregroundStyle(.primary)
                }

                Spacer()

                Text("\(activeTrainsOnDir.count) rame\(activeTrainsOnDir.count > 1 ? "s" : "")")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            }

            if stops.isEmpty {
                Text("Plan de ligne indisponible pour cette direction.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(stops.enumerated()), id: \.element.id) { idx, st in
                            let isTerminus = idx == 0 || idx == stops.count - 1
                            let normSt = normalizeStopName(st.name)
                            let trainHere = activeTrainsOnDir.first {
                                normalizeStopName($0.nextStation) == normSt
                            }
                            let otherLines = st.lines
                                .filter { $0 != line.id }
                                .compactMap { vm.linesById[$0] }
                                .sorted { $0.shortName.localizedStandardCompare($1.shortName) == .orderedAscending }

                            Button {
                                onSelectStation(st)
                            } label: {
                                HStack(spacing: 12) {
                                    // Vertical thermometer rail + node
                                    ZStack {
                                        VStack(spacing: 0) {
                                            Rectangle()
                                                .fill(idx == 0 ? Color.clear : lineColor)
                                                .frame(width: 4)
                                            Rectangle()
                                                .fill(idx == stops.count - 1 ? Color.clear : lineColor)
                                                .frame(width: 4)
                                        }
                                        Circle()
                                            .fill(trainHere != nil ? lineColor : Color(.systemBackground))
                                            .stroke(lineColor, lineWidth: isTerminus ? 3 : 2)
                                            .frame(width: isTerminus ? 14 : 10, height: isTerminus ? 14 : 10)
                                    }
                                    .frame(width: 18, height: 38)

                                    VStack(alignment: .leading, spacing: 2) {
                                        HStack(spacing: 6) {
                                            Text(st.name)
                                                .font(isTerminus ? .subheadline.bold() : .subheadline)
                                                .foregroundStyle(.primary)
                                                .lineLimit(1)
                                            if let tr = trainHere {
                                                Text(tr.atStop ? "À quai" : "Approche")
                                                    .font(.system(size: 10, weight: .bold))
                                                    .padding(.horizontal, 6)
                                                    .padding(.vertical, 2)
                                                    .background(FaiencePalette.fondAfficheur, in: Capsule())
                                                    .foregroundStyle(tr.atStop ? Color.green : FaiencePalette.ambreAfficheur)
                                            }
                                        }
                                    }

                                    Spacer(minLength: 4)

                                    if !otherLines.isEmpty {
                                        HStack(spacing: 3) {
                                            ForEach(otherLines.prefix(5)) { corr in
                                                LineBadgePill(
                                                    shortName: corr.shortName,
                                                    colorHex: corr.color,
                                                    textColorHex: corr.textColor,
                                                    size: 18
                                                )
                                            }
                                            if otherLines.count > 5 {
                                                Text("+\(otherLines.count - 5)")
                                                    .font(.system(size: 10, weight: .semibold))
                                                    .foregroundStyle(.secondary)
                                            }
                                        }
                                    }
                                }
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
    }
}
