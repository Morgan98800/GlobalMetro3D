import SwiftUI
import SceneKit
import UIKit
import AVFoundation
import CoreLocation
import ParisSubwayCore

/// Scène 3D Metal native complète (Quai 3D & Cabine 3D) avec parité CabHud / paris_ride_view.ts :
/// - Plaque de station cliquable (saut vers n'importe quelle station de la ligne)
/// - Sélecteur de ligne & sens cliquable en direct
/// - Sélecteur de version de matériel roulant (MP14, MP05, MP89, MF01, MF77, MF67, MI09, Z2N, Z50000)
/// - Ouverture physique des portes à quai, fenêtres, panneaux SIEL 3D, hublots Arts & Métiers, viaduc Tour Eiffel
/// - Contrôles Pause/Lecture, Allure, Son et ruban PlanDeLigneHorizontal
public struct Ride3DView: View {
    @Bindable var vm: ParisSubwayViewModel
    public let onDismiss: () -> Void

    @State private var currentLine: LineMetadata
    @State private var currentStationName: String
    @State private var cameraMode: CameraMode
    @State private var selectedStockName: String
    @State private var displayedSpeedKmh: Int = 0
    @State private var isAtQuai: Bool = true
    @State private var isPaused: Bool = false
    @State private var fastAllure: Bool = false
    @State private var lookingAtEiffel: Bool = false
    @State private var audioEnabled = false
    @State private var audioEngine = MetroAudioSynth()

    public enum CameraMode: String, CaseIterable {
        case quai = "Quai"
        case cabine = "Cabine"
    }

    public init(
        vm: ParisSubwayViewModel,
        initialMode: CameraMode = .quai,
        onDismiss: @escaping () -> Void
    ) {
        self.vm = vm
        self.onDismiss = onDismiss

        let followed = vm.followedTrain
        let line = followed.flatMap { vm.linesById[$0.lineId] }
            ?? vm.selectedLine
            ?? vm.lines.first(where: { $0.shortName == "6" })
            ?? vm.lines.first
            ?? LineMetadata(
                id: "IDFM:C01371",
                shortName: "1",
                longName: "Ligne 1",
                color: "#FFBE00",
                textColor: "#000000",
                mode: "metro",
                destinations: nil,
                measuredLengthKm: 16.5,
                elevationOffset: 0
            )
        let stName = followed?.nextStation
            ?? vm.selectedStation?.name
            ?? vm.orderedStations(for: line, direction: vm.lineDirection).first?.name
            ?? "Châtelet"
        let defaultStock = vm.rollingStockByLine[line.shortName]?.name ?? "MP 05 / MF 01"

        self._currentLine = State(initialValue: line)
        self._currentStationName = State(initialValue: stName)
        self._cameraMode = State(initialValue: initialMode)
        self._selectedStockName = State(initialValue: defaultStock)
    }

    private var lineStations: [StationMetadata] {
        let list = vm.orderedStations(for: currentLine, direction: vm.lineDirection)
        return list.isEmpty ? vm.stations.filter { $0.lines.contains(currentLine.id) } : list
    }

    private var stopNames: [String] {
        let names = lineStations.map(\.name)
        return names.isEmpty ? [currentStationName] : names
    }

    private var currentStopIndex: Int {
        let norm = normalizeStopName(currentStationName)
        return stopNames.firstIndex { normalizeStopName($0) == norm } ?? 0
    }

    private var nextStationLabel: String {
        let names = stopNames
        let idx = currentStopIndex
        if idx + 1 < names.count { return names[idx + 1] }
        return names.last ?? currentStationName
    }

    private var terminusLabel: String {
        if let followed = vm.followedTrain, followed.lineId == currentLine.id {
            return followed.destination
        }
        return stopNames.last ?? "Terminus"
    }

    private var archTheme: StationArchTheme {
        StationArchTheme.resolve(stationName: currentStationName, lineShortName: currentLine.shortName)
    }

    private var availableStockVersions: [String] {
        let fromCatalog = vm.rollingStockModels.map(\.name)
        let defaults = [
            "MP14 CA (8 voitures)",
            "MP05 (6 voitures)",
            "MP89 CC (6 voitures)",
            "MF01 (5 voitures)",
            "MF77 (5 voitures)",
            "MF67 (5 voitures)",
            "MI09 RER A (UM2)",
            "Z 50000 Francilien",
        ]
        let combined = Array(Set(fromCatalog + defaults)).sorted()
        return combined.isEmpty ? defaults : combined
    }

    public var body: some View {
        ZStack {
            ParisStationSceneRepresentable(
                stationName: currentStationName,
                nextStationName: nextStationLabel,
                terminusName: terminusLabel,
                lineShortName: currentLine.shortName,
                lineColorHex: currentLine.color,
                stockName: selectedStockName,
                theme: archTheme,
                cameraMode: cameraMode,
                lookingAtEiffel: lookingAtEiffel,
                isPaused: isPaused,
                fastAllure: fastAllure,
                liveSpeedKmh: vm.followedTrain?.lineId == currentLine.id ? vm.followedTrain?.speedKmh : nil,
                onStateUpdate: { kmh, atQuai in
                    if displayedSpeedKmh != kmh { displayedSpeedKmh = kmh }
                    if isAtQuai != atQuai { isAtQuai = atQuai }
                    audioEngine.updateSpeed(kmh: isPaused ? 0 : kmh)
                }
            )
            .id("\(currentLine.id)-\(currentStationName)-\(selectedStockName)")
            .ignoresSafeArea()

            VStack {
                // Zone haute CabHud : Quitter (×), Plaque station cliquable, Sélecteur de ligne cliquable
                HStack(spacing: 10) {
                    Button {
                        audioEngine.stop()
                        onDismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(width: 44, height: 44)
                            .background(.ultraThinMaterial, in: Circle())
                    }

                    Spacer(minLength: 4)

                    Menu {
                        ForEach(stopNames, id: \.self) { stName in
                            Button {
                                currentStationName = stName
                                lookingAtEiffel = false
                            } label: {
                                if stName == currentStationName {
                                    Label(stName, systemImage: "checkmark")
                                } else {
                                    Text(stName)
                                }
                            }
                        }
                    } label: {
                        PlaqueEmailView(title: currentStationName, showChevron: true)
                    }

                    Spacer(minLength: 4)

                    Menu {
                        ForEach(vm.lines) { l in
                            Button {
                                currentLine = l
                                lookingAtEiffel = false
                                let newStops = vm.orderedStations(for: l, direction: 0)
                                if let first = newStops.first {
                                    currentStationName = first.name
                                }
                                if let spec = vm.rollingStockByLine[l.shortName] {
                                    selectedStockName = spec.name
                                }
                            } label: {
                                Text("Ligne \(l.shortName) — \(l.longName)")
                            }
                        }
                    } label: {
                        HStack(spacing: 5) {
                            LineBadgePill(
                                shortName: currentLine.shortName,
                                colorHex: currentLine.color,
                                textColorHex: currentLine.textColor,
                                size: 30
                            )
                            Image(systemName: "chevron.down")
                                .font(.caption2.bold())
                                .foregroundStyle(.white.opacity(0.8))
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 7)
                        .background(.ultraThinMaterial, in: Capsule())
                    }
                }
                .padding(.horizontal, 14)
                .padding(.top, 8)

                Spacer()

                // Zone basse CabHud complète
                VStack(spacing: 10) {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(isAtQuai ? "À quai" : "En marche · prochaine") · \(archTheme.label)")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.white.opacity(0.72))
                            Text(isAtQuai ? currentStationName : nextStationLabel)
                                .font(.title3.bold())
                                .foregroundStyle(.white)
                                .lineLimit(1)
                            Text("Dir. \(terminusLabel)")
                                .font(.caption)
                                .foregroundStyle(.white.opacity(0.82))
                                .lineLimit(1)
                        }
                        Spacer()
                        HStack(alignment: .firstTextBaseline, spacing: 3) {
                            Text("\(displayedSpeedKmh)")
                                .font(.system(size: 24, weight: .bold, design: .monospaced))
                                .monospacedDigit()
                            Text("km/h")
                                .font(.caption2.bold())
                        }
                        .foregroundStyle(FaiencePalette.ambreAfficheur)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(FaiencePalette.fondAfficheur, in: RoundedRectangle(cornerRadius: 8))
                    }

                    // Ruban horizontal des arrêts de la ligne
                    PlanDeLigneHorizontalView(
                        colorHex: currentLine.color,
                        stops: stopNames,
                        currentIndex: currentStopIndex,
                        onSelectStop: { chosen in
                            currentStationName = chosen
                            lookingAtEiffel = false
                        }
                    )

                    // Point de vue Tour Eiffel (Ligne 6 / Viaduc) + Sélecteur Quai / Cabine
                    HStack(spacing: 8) {
                        if currentLine.shortName == "6" || archTheme == .viaductElevated {
                            Button {
                                lookingAtEiffel.toggle()
                            } label: {
                                Label(lookingAtEiffel ? "Retour voie" : "Tour Eiffel", systemImage: "eye.fill")
                                    .font(.caption.weight(.semibold))
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 7)
                                    .background(lookingAtEiffel ? FaiencePalette.ambreAfficheur : Color.white.opacity(0.14), in: Capsule())
                                    .foregroundStyle(lookingAtEiffel ? .black : .white)
                            }
                        }

                        FaienceSegmentedView(
                            options: [(.quai, "Quai"), (.cabine, "Cabine")],
                            selection: $cameraMode,
                            darkGlass: true
                        )
                    }

                    // Barre d'outils CabHud : Version matériel roulant, Allure, Pause, Son
                    HStack(spacing: 8) {
                        Menu {
                            ForEach(availableStockVersions, id: \.self) { stock in
                                Button {
                                    selectedStockName = stock
                                } label: {
                                    if stock == selectedStockName {
                                        Label(stock, systemImage: "checkmark")
                                    } else {
                                        Text(stock)
                                    }
                                }
                            }
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: "tram.fill")
                                    .font(.caption2)
                                Text(selectedStockName)
                                    .font(.caption.weight(.semibold))
                                    .lineLimit(1)
                                Image(systemName: "chevron.up.chevron.down")
                                    .font(.system(size: 9, weight: .bold))
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 7)
                            .background(Color.white.opacity(0.14), in: Capsule())
                            .foregroundStyle(.white)
                        }

                        Spacer(minLength: 2)

                        Button {
                            fastAllure.toggle()
                        } label: {
                            Text(fastAllure ? "Rapide 2×" : "Normale")
                                .font(.caption2.bold())
                                .padding(.horizontal, 9)
                                .padding(.vertical, 7)
                                .background(fastAllure ? FaiencePalette.bleuEmail : Color.white.opacity(0.14), in: Capsule())
                                .foregroundStyle(.white)
                        }

                        Button {
                            isPaused.toggle()
                        } label: {
                            Image(systemName: isPaused ? "play.fill" : "pause.fill")
                                .font(.caption.bold())
                                .frame(width: 34, height: 34)
                                .background(Color.white.opacity(0.14), in: Circle())
                                .foregroundStyle(.white)
                        }

                        Button {
                            audioEnabled.toggle()
                            if audioEnabled {
                                audioEngine.start()
                            } else {
                                audioEngine.stop()
                            }
                        } label: {
                            Image(systemName: audioEnabled ? "speaker.wave.2.fill" : "speaker.slash.fill")
                                .font(.caption.bold())
                                .frame(width: 34, height: 34)
                                .background(audioEnabled ? FaiencePalette.bleuEmail : Color.white.opacity(0.14), in: Circle())
                                .foregroundStyle(.white)
                        }
                    }
                }
                .padding(14)
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 22))
                .padding(.horizontal, 12)
                .padding(.bottom, 10)
            }
        }
        .preferredColorScheme(.dark)
        .onDisappear {
            audioEngine.stop()
        }
    }
}

private enum StationArchTheme: Equatable {
    case classicFaience
    case copperArtsEtMetiers
    case louvreRivoli
    case cathedralVault
    case viaductElevated

    var label: String {
        switch self {
        case .classicFaience: "Station souterraine · Faïence"
        case .copperArtsEtMetiers: "Arts & Métiers · Cuivre riveté"
        case .louvreRivoli: "Pierre de taille & alcôves"
        case .cathedralVault: "Grande voûte cathédrale"
        case .viaductElevated: "Viaduc aérien"
        }
    }

    static func resolve(stationName: String, lineShortName: String) -> StationArchTheme {
        let norm = normalizeStopName(stationName)
        if norm.contains("arts et metiers") {
            return .copperArtsEtMetiers
        }
        if norm.contains("louvre") || norm.contains("concorde") || norm.contains("assemblee nationale") {
            return .louvreRivoli
        }
        if StationLevels.isElevatedStation(lineShortName: lineShortName, stationName: stationName) {
            return .viaductElevated
        }
        if ["A", "B", "C", "D", "E"].contains(lineShortName.uppercased())
            || norm.contains("chatelet")
            || norm.contains("cite")
            || norm.contains("abbesses")
            || norm.contains("bibliotheque") {
            return .cathedralVault
        }
        return .classicFaience
    }
}

private struct ParisStationSceneRepresentable: UIViewRepresentable {
    let stationName: String
    let nextStationName: String
    let terminusName: String
    let lineShortName: String
    let lineColorHex: String
    let stockName: String
    let theme: StationArchTheme
    let cameraMode: Ride3DView.CameraMode
    let lookingAtEiffel: Bool
    let isPaused: Bool
    let fastAllure: Bool
    let liveSpeedKmh: Int?
    let onStateUpdate: @MainActor @Sendable (Int, Bool) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onStateUpdate: onStateUpdate)
    }

    func makeUIView(context: Context) -> SCNView {
        let view = SCNView()
        switch theme {
        case .viaductElevated:
            view.backgroundColor = UIColor(red: 0.12, green: 0.20, blue: 0.34, alpha: 1)
        case .copperArtsEtMetiers:
            view.backgroundColor = UIColor(red: 0.08, green: 0.04, blue: 0.02, alpha: 1)
        case .cathedralVault:
            view.backgroundColor = UIColor(red: 0.06, green: 0.07, blue: 0.09, alpha: 1)
        case .louvreRivoli, .classicFaience:
            view.backgroundColor = UIColor(red: 0.04, green: 0.05, blue: 0.06, alpha: 1)
        }
        view.antialiasingMode = .multisampling4X
        view.allowsCameraControl = true
        view.autoenablesDefaultLighting = false
        view.preferredFramesPerSecond = 120
        view.isPlaying = true
        view.delegate = context.coordinator

        let built = buildScene()
        context.coordinator.scrollNode = built.scrollNode
        context.coordinator.opposingTrainNode = built.trainNode
        context.coordinator.leftDoorNodes = built.leftDoors
        context.coordinator.rightDoorNodes = built.rightDoors
        context.coordinator.cameraMode = cameraMode
        context.coordinator.isPaused = isPaused
        context.coordinator.fastAllure = fastAllure
        context.coordinator.liveSpeedKmh = liveSpeedKmh
        view.scene = built.scene
        return view
    }

    func updateUIView(_ uiView: SCNView, context: Context) {
        context.coordinator.cameraMode = cameraMode
        context.coordinator.isPaused = isPaused
        context.coordinator.fastAllure = fastAllure
        context.coordinator.liveSpeedKmh = liveSpeedKmh

        guard let cam = uiView.scene?.rootNode.childNode(withName: "mainCam", recursively: false) else { return }
        SCNTransaction.begin()
        SCNTransaction.animationDuration = 0.65
        if lookingAtEiffel {
            cam.position = SCNVector3(x: -3.5, y: 3.0, z: 8)
            cam.look(at: SCNVector3(34, 8, -95))
        } else if cameraMode == .quai {
            cam.position = SCNVector3(x: -5.1, y: 2.15, z: 15)
            cam.eulerAngles = SCNVector3(x: -0.04, y: -0.26, z: 0)
        } else {
            cam.position = SCNVector3(x: -1.8, y: 2.28, z: -6)
            cam.eulerAngles = SCNVector3(x: -0.02, y: 0.0, z: 0)
        }
        SCNTransaction.commit()
    }

    private struct BuiltSceneRefs {
        let scene: SCNScene
        let scrollNode: SCNNode
        let trainNode: SCNNode
        let leftDoors: [SCNNode]
        let rightDoors: [SCNNode]
    }

    private func buildScene() -> BuiltSceneRefs {
        let scene = SCNScene()
        let lineUIColor = UIColor(Color(hex: lineColorHex))

        // Ambient & station lighting
        let ambient = SCNNode()
        ambient.light = SCNLight()
        ambient.light?.type = .ambient
        ambient.light?.intensity = theme == .viaductElevated ? 620 : 380
        ambient.light?.color = theme == .viaductElevated
            ? UIColor(red: 0.86, green: 0.92, blue: 1.0, alpha: 1)
            : UIColor(red: 1.0, green: 0.96, blue: 0.88, alpha: 1)
        scene.rootNode.addChildNode(ambient)

        for zOff in stride(from: -36.0, through: 36.0, by: 16.0) {
            let omni = SCNNode()
            omni.light = SCNLight()
            omni.light?.type = .omni
            omni.light?.intensity = theme == .copperArtsEtMetiers ? 600 : 720
            omni.light?.attenuationEndDistance = 28
            omni.light?.color = theme == .copperArtsEtMetiers
                ? UIColor(red: 1.0, green: 0.80, blue: 0.52, alpha: 1)
                : UIColor(red: 1.0, green: 0.94, blue: 0.84, alpha: 1)
            omni.position = SCNVector3(0, 4.8, Float(zOff))
            scene.rootNode.addChildNode(omni)
        }

        // Ballast bed & dual rails
        let bed = SCNNode(geometry: SCNBox(width: 8.4, height: 0.2, length: 160, chamferRadius: 0))
        bed.geometry?.firstMaterial?.diffuse.contents = UIColor(white: 0.14, alpha: 1)
        bed.position = SCNVector3(0, -0.1, 0)
        scene.rootNode.addChildNode(bed)

        for trackX: Float in [-1.8, 1.8] {
            for railOff: Float in [-0.72, 0.72] {
                let rail = SCNNode(geometry: SCNBox(width: 0.08, height: 0.14, length: 160, chamferRadius: 0))
                rail.geometry?.firstMaterial?.diffuse.contents = UIColor(white: 0.68, alpha: 1)
                rail.geometry?.firstMaterial?.metalness.contents = 0.88
                rail.position = SCNVector3(trackX + railOff, 0.08, 0)
                scene.rootNode.addChildNode(rail)
            }
        }

        // Scrolling sleepers & tunnel ribs / viaduct trusses
        let scrollNode = SCNNode()
        for z in stride(from: Float(-70), through: Float(70), by: 2.0) {
            for trackX: Float in [-1.8, 1.8] {
                let sleeper = SCNNode(geometry: SCNBox(width: 1.95, height: 0.06, length: 0.24, chamferRadius: 0))
                sleeper.geometry?.firstMaterial?.diffuse.contents = UIColor(red: 0.28, green: 0.24, blue: 0.20, alpha: 1)
                sleeper.position = SCNVector3(trackX, 0.02, z)
                scrollNode.addChildNode(sleeper)
            }
            if Int(abs(z)) % 10 == 0 {
                if theme == .viaductElevated {
                    for side: Float in [-1, 1] {
                        let post = SCNNode(geometry: SCNBox(width: 0.18, height: 2.1, length: 0.18, chamferRadius: 0))
                        post.geometry?.firstMaterial?.diffuse.contents = UIColor(red: 0.30, green: 0.38, blue: 0.42, alpha: 1)
                        post.position = SCNVector3(side * 6.75, 1.2, z)
                        scrollNode.addChildNode(post)
                    }
                } else {
                    let rib = SCNNode(geometry: SCNBox(width: 13.8, height: 0.24, length: 0.35, chamferRadius: 0))
                    rib.geometry?.firstMaterial?.diffuse.contents = UIColor(white: 0.25, alpha: 1)
                    rib.position = SCNVector3(0, 4.75, z)
                    scrollNode.addChildNode(rib)
                }
            }
        }
        scene.rootNode.addChildNode(scrollNode)

        // Vaulted ceiling (underground stations)
        if theme != .viaductElevated {
            let vaultRadius: CGFloat = theme == .cathedralVault ? 8.6 : 7.0
            let vault = SCNNode(geometry: SCNCylinder(radius: vaultRadius, height: 92))
            switch theme {
            case .copperArtsEtMetiers:
                vault.geometry?.firstMaterial?.diffuse.contents = UIColor(red: 0.52, green: 0.28, blue: 0.14, alpha: 1)
                vault.geometry?.firstMaterial?.metalness.contents = 0.72
            case .louvreRivoli:
                vault.geometry?.firstMaterial?.diffuse.contents = UIColor(red: 0.76, green: 0.70, blue: 0.58, alpha: 1)
            case .cathedralVault:
                vault.geometry?.firstMaterial?.diffuse.contents = UIColor(red: 0.30, green: 0.33, blue: 0.38, alpha: 1)
            default:
                vault.geometry?.firstMaterial?.diffuse.contents = renderTileTexture(lineColor: lineUIColor)
            }
            vault.geometry?.firstMaterial?.isDoubleSided = true
            vault.eulerAngles = SCNVector3(Float.pi / 2, 0, 0)
            vault.position = SCNVector3(0, 1.65, 0)
            scene.rootNode.addChildNode(vault)

            for zLamp in stride(from: Float(-32), through: Float(32), by: 16.0) {
                let lamp = SCNNode(geometry: SCNBox(width: 2.4, height: 0.12, length: 0.48, chamferRadius: 0.04))
                lamp.geometry?.firstMaterial?.diffuse.contents = UIColor(red: 1.0, green: 0.93, blue: 0.78, alpha: 1)
                lamp.geometry?.firstMaterial?.emission.contents = UIColor(red: 1.0, green: 0.86, blue: 0.58, alpha: 0.9)
                lamp.position = SCNVector3(0, 4.65, zLamp)
                scene.rootNode.addChildNode(lamp)
            }
        }

        let plaqueImg = renderPlaqueImage(title: stationName)
        let sielImg = renderSielBoardImage(destination: terminusName)
        let tileWallImg = renderTileTexture(lineColor: lineUIColor)

        // Dual platforms + walls + plaques + SIEL boards + benches + archetype decorations
        for side: Float in [-1, 1] {
            let plat = SCNNode(geometry: SCNBox(width: 3.2, height: 1.0, length: 88, chamferRadius: 0.04))
            plat.geometry?.firstMaterial?.diffuse.contents = UIColor(red: 0.54, green: 0.53, blue: 0.50, alpha: 1)
            plat.position = SCNVector3(side * 5.2, 0.45, 0)
            scene.rootNode.addChildNode(plat)

            // Tactile pale platform edge strip
            let strip = SCNNode(geometry: SCNBox(width: 0.22, height: 0.02, length: 88, chamferRadius: 0))
            strip.geometry?.firstMaterial?.diffuse.contents = UIColor(red: 0.92, green: 0.90, blue: 0.84, alpha: 1)
            strip.position = SCNVector3(side * 3.74, 0.96, 0)
            scene.rootNode.addChildNode(strip)

            if theme == .viaductElevated {
                let railTop = SCNNode(geometry: SCNBox(width: 0.14, height: 1.15, length: 88, chamferRadius: 0))
                railTop.geometry?.firstMaterial?.diffuse.contents = UIColor(red: 0.30, green: 0.38, blue: 0.42, alpha: 0.85)
                railTop.geometry?.firstMaterial?.metalness.contents = 0.7
                railTop.position = SCNVector3(side * 6.75, 1.5, 0)
                scene.rootNode.addChildNode(railTop)
            } else {
                let wall = SCNNode(geometry: SCNBox(width: 0.2, height: 4.5, length: 88, chamferRadius: 0))
                switch theme {
                case .copperArtsEtMetiers:
                    wall.geometry?.firstMaterial?.diffuse.contents = UIColor(red: 0.58, green: 0.31, blue: 0.16, alpha: 1)
                    wall.geometry?.firstMaterial?.metalness.contents = 0.78
                    wall.geometry?.firstMaterial?.roughness.contents = 0.30
                case .louvreRivoli:
                    wall.geometry?.firstMaterial?.diffuse.contents = UIColor(red: 0.78, green: 0.72, blue: 0.60, alpha: 1)
                default:
                    wall.geometry?.firstMaterial?.diffuse.contents = tileWallImg
                }
                wall.position = SCNVector3(side * 6.8, 2.4, 0)
                scene.rootNode.addChildNode(wall)
            }

            // Enamel station plaques along the platform
            for zPlaque: Float in [-22, -2, 18] {
                let plaque = SCNNode(geometry: SCNPlane(width: 3.4, height: 0.68))
                plaque.geometry?.firstMaterial?.diffuse.contents = plaqueImg
                plaque.position = SCNVector3(side * 6.64, 2.45, zPlaque)
                plaque.eulerAngles = SCNVector3(0, side > 0 ? -Float.pi / 2 : Float.pi / 2, 0)
                scene.rootNode.addChildNode(plaque)
            }

            // Hanging SIEL amber departure display board on platform
            let siel = SCNNode(geometry: SCNBox(width: 1.6, height: 0.46, length: 0.14, chamferRadius: 0.02))
            siel.geometry?.firstMaterial?.diffuse.contents = sielImg
            siel.position = SCNVector3(side * 4.6, 3.25, 6)
            scene.rootNode.addChildNode(siel)

            // Iconic orange/blue station benches
            for zBench: Float in [-12, 10] {
                let bench = SCNNode(geometry: SCNBox(width: 0.55, height: 0.52, length: 2.2, chamferRadius: 0.06))
                bench.geometry?.firstMaterial?.diffuse.contents = lineUIColor
                bench.position = SCNVector3(side * 5.6, 1.22, zBench)
                scene.rootNode.addChildNode(bench)
            }

            // Archetype specific 3D decorations (Arts & Métiers portholes / Louvre pilasters)
            if theme == .copperArtsEtMetiers {
                for zPort: Float in [-28, -14, 0, 14, 28] {
                    let ring = SCNNode(geometry: SCNTorus(ringRadius: 0.62, pipeRadius: 0.08))
                    ring.geometry?.firstMaterial?.diffuse.contents = UIColor(red: 0.78, green: 0.48, blue: 0.24, alpha: 1)
                    ring.geometry?.firstMaterial?.metalness.contents = 0.88
                    ring.position = SCNVector3(side * 6.62, 2.15, zPort)
                    ring.eulerAngles = SCNVector3(0, 0, Float.pi / 2)
                    scene.rootNode.addChildNode(ring)
                }
            } else if theme == .louvreRivoli {
                for zPil: Float in [-24, -8, 8, 24] {
                    let pil = SCNNode(geometry: SCNBox(width: 0.35, height: 3.4, length: 0.45, chamferRadius: 0.02))
                    pil.geometry?.firstMaterial?.diffuse.contents = UIColor(red: 0.82, green: 0.76, blue: 0.64, alpha: 1)
                    pil.position = SCNVector3(side * 6.55, 2.3, zPil)
                    scene.rootNode.addChildNode(pil)
                }
            }

            // Glass platform screen doors on automated lines (L1, L4, L14)
            if StationLevels.hasPlatformScreenDoors(lineShortName: lineShortName) {
                let glass = SCNNode(geometry: SCNBox(width: 0.08, height: 1.75, length: 80, chamferRadius: 0))
                glass.geometry?.firstMaterial?.diffuse.contents = UIColor(red: 0.74, green: 0.90, blue: 0.98, alpha: 0.28)
                glass.position = SCNVector3(side * 3.65, 1.82, 0)
                scene.rootNode.addChildNode(glass)

                let header = SCNNode(geometry: SCNBox(width: 0.14, height: 0.18, length: 80, chamferRadius: 0))
                header.geometry?.firstMaterial?.diffuse.contents = lineUIColor
                header.position = SCNVector3(side * 3.65, 2.74, 0)
                scene.rootNode.addChildNode(header)
            }
        }

        // Elevated Viaduct Backdrop: La Seine + Pont de Bir-Hakeim + Detailed Tour Eiffel
        if theme == .viaductElevated || lineShortName == "6" {
            let seine = SCNNode(geometry: SCNBox(width: 180, height: 0.1, length: 48, chamferRadius: 0))
            seine.geometry?.firstMaterial?.diffuse.contents = UIColor(red: 0.12, green: 0.36, blue: 0.62, alpha: 0.88)
            seine.position = SCNVector3(0, -9.5, -55)
            scene.rootNode.addChildNode(seine)

            let eiffelGroup = SCNNode()
            eiffelGroup.position = SCNVector3(34, -9.5, -95)
            let bronze = UIColor(red: 0.78, green: 0.64, blue: 0.42, alpha: 0.92)
            let base = SCNNode(geometry: SCNPyramid(width: 14, height: 16, length: 14))
            base.geometry?.firstMaterial?.diffuse.contents = bronze
            eiffelGroup.addChildNode(base)
            let mid = SCNNode(geometry: SCNPyramid(width: 8, height: 22, length: 8))
            mid.geometry?.firstMaterial?.diffuse.contents = bronze
            mid.position = SCNVector3(0, 14, 0)
            eiffelGroup.addChildNode(mid)
            let spire = SCNNode(geometry: SCNCone(topRadius: 0.2, bottomRadius: 3.2, height: 24))
            spire.geometry?.firstMaterial?.diffuse.contents = bronze
            spire.position = SCNVector3(0, 34, 0)
            eiffelGroup.addChildNode(spire)
            let beacon = SCNNode(geometry: SCNSphere(radius: 0.9))
            beacon.geometry?.firstMaterial?.emission.contents = UIColor(red: 1.0, green: 0.92, blue: 0.55, alpha: 1)
            beacon.position = SCNVector3(0, 46.5, 0)
            eiffelGroup.addChildNode(beacon)
            scene.rootNode.addChildNode(eiffelGroup)
        }

        // Detailed 5-car articulated train with windows + animated sliding doors!
        let (trainNode, leftDoors, rightDoors) = buildDetailedTrain(lineColor: lineUIColor)
        scene.rootNode.addChildNode(trainNode)

        // Camera
        let camNode = SCNNode()
        camNode.name = "mainCam"
        camNode.camera = SCNCamera()
        camNode.camera?.fieldOfView = 58
        if cameraMode == .quai {
            camNode.position = SCNVector3(x: -5.1, y: 2.15, z: 15)
            camNode.eulerAngles = SCNVector3(x: -0.04, y: -0.26, z: 0)
        } else {
            camNode.position = SCNVector3(x: -1.8, y: 2.28, z: -6)
            camNode.eulerAngles = SCNVector3(x: -0.02, y: 0.0, z: 0)
        }
        scene.rootNode.addChildNode(camNode)

        return BuiltSceneRefs(
            scene: scene,
            scrollNode: scrollNode,
            trainNode: trainNode,
            leftDoors: leftDoors,
            rightDoors: rightDoors
        )
    }

    private func buildDetailedTrain(lineColor: UIColor) -> (SCNNode, [SCNNode], [SCNNode]) {
        let trainNode = SCNNode()
        var leftDoors: [SCNNode] = []
        var rightDoors: [SCNNode] = []

        let isIDFM = stockName.contains("MP14") || stockName.contains("MF01") || stockName.contains("MI09") || stockName.contains("Z 50000")
        let bodyCol = isIDFM
            ? UIColor(red: 0.93, green: 0.95, blue: 0.97, alpha: 1)
            : UIColor(red: 0.95, green: 0.95, blue: 0.93, alpha: 1)
        let doorCol = isIDFM
            ? UIColor(red: 0.45, green: 0.72, blue: 0.92, alpha: 1)
            : lineColor

        let glassMat = SCNMaterial()
        glassMat.diffuse.contents = UIColor(red: 0.12, green: 0.16, blue: 0.22, alpha: 0.85)
        glassMat.emission.contents = UIColor(red: 1.0, green: 0.94, blue: 0.76, alpha: 0.28)

        for i in 0..<5 {
            let carZ = Float(i) * 14.3 - 28.0
            let role: TrainModelLoader.CarRole = i == 0 ? .cab : (i == 4 ? .tail : .neutral)
            let car = SCNNode()
            car.position = SCNVector3(1.8, 1.55, carZ)

            if let usdzCar = TrainModelLoader.shared.carNode(
                lineShortName: lineShortName,
                stockName: stockName,
                role: role,
                targetLength: 13.6,
                lineColor: lineColor
            ) {
                // Center vertically around y = 0 inside car container (since car.position.y = 1.55)
                usdzCar.position.y -= 1.40
                car.addChildNode(usdzCar)
            } else {
                let hull = SCNNode(geometry: SCNBox(width: 2.42, height: 2.85, length: 13.6, chamferRadius: 0.22))
                hull.geometry?.firstMaterial?.diffuse.contents = bodyCol
                hull.geometry?.firstMaterial?.roughness.contents = 0.26
                car.addChildNode(hull)

                // Lower line-colored livery band
                let band = SCNNode(geometry: SCNBox(width: 2.45, height: 0.64, length: 13.55, chamferRadius: 0.04))
                band.geometry?.firstMaterial?.diffuse.contents = lineColor
                band.position = SCNVector3(0, -0.82, 0)
                car.addChildNode(band)

                // Illuminated windows along both sides
                for wZ: Float in [-4.8, -2.0, 2.0, 4.8] {
                    let win = SCNNode(geometry: SCNBox(width: 2.46, height: 0.76, length: 1.35, chamferRadius: 0.04))
                    win.geometry?.materials = [glassMat]
                    win.position = SCNVector3(0, 0.32, wZ)
                    car.addChildNode(win)
                }
            }

            // 3 pairs of sliding doors per side (left = -Z, right = +Z when open!)
            for dZ: Float in [-3.4, 0.0, 3.4] {
                let leftLeaf = SCNNode(geometry: SCNBox(width: 2.47, height: 1.92, length: 0.64, chamferRadius: 0.02))
                leftLeaf.geometry?.firstMaterial?.diffuse.contents = doorCol
                leftLeaf.position = SCNVector3(0, -0.18, dZ - 0.33)
                car.addChildNode(leftLeaf)
                leftDoors.append(leftLeaf)

                let rightLeaf = SCNNode(geometry: SCNBox(width: 2.47, height: 1.92, length: 0.64, chamferRadius: 0.02))
                rightLeaf.geometry?.firstMaterial?.diffuse.contents = doorCol
                rightLeaf.position = SCNVector3(0, -0.18, dZ + 0.33)
                car.addChildNode(rightLeaf)
                rightDoors.append(rightLeaf)
            }

            // Front cab windshield & warm headlights on Car 0
            if i == 0 {
                let windshield = SCNNode(geometry: SCNBox(width: 2.1, height: 1.1, length: 0.08, chamferRadius: 0.04))
                windshield.geometry?.materials = [glassMat]
                windshield.position = SCNVector3(0, 0.42, -6.82)
                car.addChildNode(windshield)

                for hX: Float in [-0.75, 0.75] {
                    let headlight = SCNNode(geometry: SCNSphere(radius: 0.14))
                    headlight.geometry?.firstMaterial?.diffuse.contents = UIColor.white
                    headlight.geometry?.firstMaterial?.emission.contents = UIColor(red: 1.0, green: 0.94, blue: 0.72, alpha: 1)
                    headlight.position = SCNVector3(hX, -0.45, -6.82)
                    car.addChildNode(headlight)
                }
            }

            trainNode.addChildNode(car)
        }

        return (trainNode, leftDoors, rightDoors)
    }

    private func renderTileTexture(lineColor: UIColor) -> UIImage {
        let size = CGSize(width: 512, height: 256)
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { ctx in
            UIColor(red: 0.95, green: 0.94, blue: 0.91, alpha: 1).setFill()
            ctx.fill(CGRect(origin: .zero, size: size))

            // Grout lines (bevelled Paris 15x7.5cm tile pattern)
            UIColor(red: 0.78, green: 0.80, blue: 0.82, alpha: 1).setStroke()
            ctx.cgContext.setLineWidth(2)
            for row in 0..<8 {
                let y = CGFloat(row) * 32
                ctx.cgContext.move(to: CGPoint(x: 0, y: y))
                ctx.cgContext.addLine(to: CGPoint(x: size.width, y: y))
                let offset: CGFloat = (row % 2 == 0) ? 0 : 32
                for col in 0..<9 {
                    let x = CGFloat(col) * 64 + offset
                    ctx.cgContext.move(to: CGPoint(x: x, y: y))
                    ctx.cgContext.addLine(to: CGPoint(x: x, y: y + 32))
                }
            }
            ctx.cgContext.strokePath()

            // Ceramic top frieze in line color
            lineColor.setFill()
            ctx.fill(CGRect(x: 0, y: 16, width: size.width, height: 18))
        }
    }

    private func renderPlaqueImage(title: String) -> UIImage {
        let size = CGSize(width: 640, height: 128)
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { ctx in
            UIColor(red: 0x1D / 255, green: 0x3F / 255, blue: 0x7A / 255, alpha: 1).setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
            UIColor.white.setStroke()
            let rect = CGRect(x: 8, y: 8, width: size.width - 16, height: size.height - 16)
            ctx.cgContext.setLineWidth(4)
            ctx.stroke(rect)

            let attrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 44, weight: .semibold),
                .foregroundColor: UIColor.white,
            ]
            let textSize = title.size(withAttributes: attrs)
            let drawPt = CGPoint(
                x: max(20, (size.width - textSize.width) / 2),
                y: (size.height - textSize.height) / 2
            )
            title.draw(at: drawPt, withAttributes: attrs)
        }
    }

    private func renderSielBoardImage(destination: String) -> UIImage {
        let size = CGSize(width: 512, height: 140)
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { ctx in
            UIColor(red: 0.05, green: 0.07, blue: 0.10, alpha: 1).setFill()
            ctx.fill(CGRect(origin: .zero, size: size))

            let amber = UIColor(red: 1.0, green: 0.71, blue: 0.28, alpha: 1)
            let destAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 32, weight: .bold),
                .foregroundColor: UIColor.white,
            ]
            let timeAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.monospacedDigitSystemFont(ofSize: 38, weight: .bold),
                .foregroundColor: amber,
            ]
            destination.draw(at: CGPoint(x: 20, y: 24), withAttributes: destAttrs)
            "1 min   4 min".draw(at: CGPoint(x: 20, y: 74), withAttributes: timeAttrs)
        }
    }

    final class Coordinator: NSObject, SCNSceneRendererDelegate {
        weak var scrollNode: SCNNode?
        weak var opposingTrainNode: SCNNode?
        var leftDoorNodes: [SCNNode] = []
        var rightDoorNodes: [SCNNode] = []
        var cameraMode: Ride3DView.CameraMode = .quai
        var isPaused: Bool = false
        var fastAllure: Bool = false
        var liveSpeedKmh: Int?
        let onStateUpdate: @MainActor @Sendable (Int, Bool) -> Void

        private var lastTime: TimeInterval?
        private var phaseTime: Double = 0
        private var scrollOffset: Float = 0

        init(onStateUpdate: @escaping @MainActor @Sendable (Int, Bool) -> Void) {
            self.onStateUpdate = onStateUpdate
        }

        func renderer(_ renderer: SCNSceneRenderer, updateAtTime time: TimeInterval) {
            let rawDt = lastTime.map { min(0.05, max(0, time - $0)) } ?? (1.0 / 60.0)
            lastTime = time
            let speedMult = isPaused ? 0.0 : (fastAllure ? 2.0 : 1.0)
            let dt = rawDt * speedMult
            phaseTime += dt

            let cycle = phaseTime.truncatingRemainder(dividingBy: 18.0)
            let targetSpeedKmh: Double
            let atQuai: Bool

            if isPaused {
                targetSpeedKmh = 0
                atQuai = cycle >= 5.0 && cycle <= 10.5
            } else if let live = liveSpeedKmh, cameraMode == .cabine {
                targetSpeedKmh = Double(live) * (fastAllure ? 1.5 : 1.0)
                atQuai = live == 0
            } else if cameraMode == .cabine {
                targetSpeedKmh = (cycle < 3.0 ? 22.0 + cycle * 8.0 : (cycle > 14.5 ? max(0, (18.0 - cycle) * 13.0) : 52.0)) * (fastAllure ? 1.4 : 1.0)
                atQuai = targetSpeedKmh < 1.0
            } else {
                if cycle < 5.0 {
                    targetSpeedKmh = max(0, (5.0 - cycle) * 10.0)
                    atQuai = false
                } else if cycle < 10.5 {
                    targetSpeedKmh = 0
                    atQuai = true
                } else {
                    targetSpeedKmh = min(54.0, (cycle - 10.5) * 9.5)
                    atQuai = false
                }
            }

            let speedMps = Float(targetSpeedKmh / 3.6)

            if cameraMode == .cabine, let scroll = scrollNode {
                scrollOffset += speedMps * Float(rawDt) * (isPaused ? 0 : 1)
                if scrollOffset >= 10.0 { scrollOffset -= 10.0 }
                scroll.position.z = scrollOffset
            } else if let scroll = scrollNode {
                scroll.position.z = 0
            }

            // Animate train arrival, station dwell & physical door opening!
            let doorSlide: Float = (atQuai && cycle >= 5.4 && cycle <= 9.8) ? 0.52 : 0.0
            if let train = opposingTrainNode {
                let zPos: Float
                if cycle < 5.0 {
                    let u = Float(cycle / 5.0)
                    zPos = 55.0 * pow(1.0 - u, 2)
                } else if cycle < 10.5 {
                    zPos = 0
                } else {
                    let u = Float((cycle - 10.5) / 7.5)
                    zPos = -72.0 * (u * u)
                }
                train.position.z = zPos
            }

            let doorCenters: [Float] = [-3.4, 0.0, 3.4]
            for (idx, node) in leftDoorNodes.enumerated() {
                let baseZ = doorCenters[idx % 3] - 0.33
                node.position.z = baseZ - doorSlide
            }
            for (idx, node) in rightDoorNodes.enumerated() {
                let baseZ = doorCenters[idx % 3] + 0.33
                node.position.z = baseZ + doorSlide
            }

            let rounded = Int(targetSpeedKmh.rounded())
            let callback = onStateUpdate
            Task { @MainActor in
                callback(rounded, atQuai)
            }
        }
    }
}

private final class MetroAudioSynth {
    private var engine: AVAudioEngine?
    private var sourceNode: AVAudioSourceNode?
    private var currentKmh: Float = 0
    private var phase: Float = 0

    func updateSpeed(kmh: Int) {
        currentKmh = Float(kmh)
    }

    func start() {
        guard engine == nil else { return }
        let eng = AVAudioEngine()
        let format = eng.outputNode.inputFormat(forBus: 0)
        let sampleRate = Float(format.sampleRate > 0 ? format.sampleRate : 44100)

        let node = AVAudioSourceNode { [weak self] _, _, frameCount, audioBufferList -> OSStatus in
            guard let self else { return noErr }
            let abl = UnsafeMutableAudioBufferListPointer(audioBufferList)
            let freq: Float = 68.0 + self.currentKmh * 2.4
            let amp: Float = self.currentKmh > 1 ? 0.035 : 0.008
            let dPhase = (2.0 * Float.pi * freq) / sampleRate

            for frame in 0..<Int(frameCount) {
                let sample = (sinf(self.phase) * 0.65 + sinf(self.phase * 2.02) * 0.35) * amp
                self.phase += dPhase
                if self.phase > 2.0 * Float.pi { self.phase -= 2.0 * Float.pi }
                for buf in abl {
                    if let ptr = buf.mData?.assumingMemoryBound(to: Float.self) {
                        ptr[frame] = sample
                    }
                }
            }
            return noErr
        }

        eng.attach(node)
        eng.connect(node, to: eng.mainMixerNode, format: format)
        try? eng.start()
        self.sourceNode = node
        self.engine = eng
    }

    func stop() {
        engine?.stop()
        engine = nil
        sourceNode = nil
    }
}
