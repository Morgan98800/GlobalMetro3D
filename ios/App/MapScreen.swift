import SwiftUI
import MapKit
import ParisSubwayCore

public struct MapScreen: View {
    @Bindable var vm: ParisSubwayViewModel
    @State private var locationService = LocationService()
    @State private var cameraPosition: MapCameraPosition = .camera(
        MapCamera(
            centerCoordinate: CLLocationCoordinate2D(latitude: 48.8566, longitude: 2.3522),
            distance: 24_000,
            heading: 0,
            pitch: 45
        )
    )
    @State private var sheetDetent: PresentationDetent = .height(275)
    @State private var is3DSubsurface = false
    @State private var mapPitch3D = true
    @State private var showingMenu = false
    @State private var showingAbout = false
    @State private var activeTab: SheetTab = .explorer

    public init(vm: ParisSubwayViewModel) {
        self.vm = vm
    }

    private var preferredScheme: ColorScheme? {
        switch vm.themeChoice {
        case "clair": .light
        case "sombre": .dark
        default: nil
        }
    }

    public var body: some View {
        ZStack(alignment: .top) {
            if is3DSubsurface {
                Subsurface3DMapView(
                    vm: vm,
                    onSelectStation: { st in
                        vm.selectedStation = st
                        sheetDetent = .medium
                    },
                    onSelectTrain: { tr in
                        vm.followedTrainId = tr.id
                    }
                )
                .ignoresSafeArea()
            } else {
                Map(position: $cameraPosition) {
                    UserAnnotation()

                    ForEach(displayedTracks) { seg in
                        MapPolyline(coordinates: seg.clCoordinates)
                            .stroke(
                                Color(hex: seg.stroke).opacity(vm.activeRoute != nil ? 0.28 : 1.0),
                                lineWidth: vm.selectedLine != nil ? 5.0 : 3.0
                            )
                    }

                    if let route = vm.activeRoute {
                        ForEach(route.legs) { leg in
                            if leg.coordinates.count >= 2 {
                                MapPolyline(coordinates: leg.coordinates)
                                    .stroke(Color(hex: leg.colorHex), lineWidth: 6.5)
                            }
                        }
                    }

                    ForEach(displayedStations) { st in
                        let isHub = st.lines.count >= 2
                        Annotation(st.name, coordinate: st.coordinate) {
                            Button {
                                vm.selectedStation = st
                                sheetDetent = .medium
                            } label: {
                                Circle()
                                    .fill(.white)
                                    .stroke(Color.primary, lineWidth: isHub ? 2.0 : 1.4)
                                    .frame(width: isHub ? 13 : 10, height: isHub ? 13 : 10)
                                    .padding(6)
                                    .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    if vm.showGhostStations {
                        ForEach(GhostStationsRegistry.all) { ghost in
                            Annotation(ghost.name, coordinate: ghost.coordinate) {
                                Button {
                                    vm.selectedStation = nil
                                    vm.selectedLine = nil
                                    vm.selectedGhostStation = ghost
                                    sheetDetent = .medium
                                } label: {
                                    Circle()
                                        .fill(Color.orange.opacity(0.35))
                                        .stroke(Color.orange, lineWidth: 2.2)
                                        .frame(width: 16, height: 16)
                                }
                            }
                        }
                    }

                    ForEach(vm.trains.prefix(280)) { train in
                        let isFollowed = train.id == vm.followedTrainId
                        Annotation("", coordinate: train.coordinate) {
                            Button {
                                vm.followedTrainId = train.id
                                flyToCoordinate(train.coordinate, distance: 3_200, pitch: 58)
                            } label: {
                                Capsule()
                                    .fill(Color(hex: train.colorHex))
                                    .stroke(.white, lineWidth: isFollowed ? 2.2 : 1.1)
                                    .frame(width: isFollowed ? 18 : 12, height: isFollowed ? 9 : 6)
                                    .shadow(color: isFollowed ? Color(hex: train.colorHex).opacity(0.8) : .clear, radius: 5)
                                    .rotationEffect(.degrees(train.bearingDeg - 90))
                                    .padding(4)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .mapStyle(
                    .standard(
                        elevation: vm.show3DBuildings ? .realistic : .flat,
                        emphasis: .muted,
                        pointsOfInterest: .excludingAll,
                        showsTraffic: false
                    )
                )
                .ignoresSafeArea()
            }

            // TopNavBar + TimeScrubber + FollowTrainHud
            VStack(spacing: 8) {
                HStack(spacing: 8) {
                    // Left plate: Marque + Paris + Clock
                    HStack(spacing: 8) {
                        ZStack {
                            Circle()
                                .fill(FaiencePalette.bleuEmail)
                                .frame(width: 26, height: 26)
                            Image(systemName: "tram.fill")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(.white)
                        }
                        Text("Paris")
                            .font(.subheadline.weight(.bold))
                        Text(vm.displayedServiceClock)
                            .font(.caption.bold().monospacedDigit())
                            .padding(.horizontal, 7)
                            .padding(.vertical, 3)
                            .background(FaiencePalette.fondAfficheur, in: RoundedRectangle(cornerRadius: 5))
                            .foregroundStyle(FaiencePalette.ambreAfficheur)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 7)
                    .background(.ultraThinMaterial, in: Capsule())

                    Spacer()

                    // Mode Simple / Passionné
                    Button {
                        vm.passionneMode.toggle()
                    } label: {
                        Text(vm.passionneMode ? "Passionné" : "Simple")
                            .font(.caption.weight(.semibold))
                            .padding(.horizontal, 11)
                            .padding(.vertical, 8)
                            .background(vm.passionneMode ? FaiencePalette.bleuEmail : Color(.secondarySystemBackground))
                            .foregroundStyle(vm.passionneMode ? .white : .primary)
                            .clipShape(Capsule())
                    }

                    // Menu Principal (⋮)
                    Button {
                        showingMenu = true
                    } label: {
                        Image(systemName: "ellipsis.circle.fill")
                            .font(.title3)
                            .foregroundStyle(.primary)
                            .padding(6)
                            .background(.ultraThinMaterial, in: Circle())
                    }
                    .sheet(isPresented: $showingMenu) {
                        MenuPrincipalSheet(
                            vm: vm,
                            is3DSubsurface: $is3DSubsurface,
                            onOpenAbout: {
                                showingMenu = false
                                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                                    showingAbout = true
                                }
                            }
                        )
                        .presentationDetents([.height(370)])
                    }
                    .sheet(isPresented: $showingAbout) {
                        AboutOpenDataView(vm: vm)
                    }
                }
                .padding(.horizontal, 12)

                // TimeScrubber (Passionné)
                if vm.passionneMode {
                    VStack(spacing: 6) {
                        HStack(spacing: 8) {
                            Button {
                                vm.timePaused.toggle()
                            } label: {
                                Image(systemName: vm.timePaused ? "play.fill" : "pause.fill")
                                    .font(.caption.bold())
                                    .frame(width: 26, height: 26)
                                    .background(Color.secondary.opacity(0.18), in: Circle())
                            }

                            Text(vm.displayedServiceClock)
                                .font(.caption.bold().monospacedDigit())

                            Slider(
                                value: Binding(
                                    get: { vm.virtualServiceSeconds ?? ParisClock.secondsSinceMidnight() },
                                    set: {
                                        vm.virtualServiceSeconds = $0
                                        vm.refreshSimulation()
                                    }
                                ),
                                in: (5 * 3600)...(25 * 3600 + 15 * 60),
                                step: 60
                            )

                            Button(vm.showGhostStations ? "Fantômes ✓" : "Fantômes") {
                                vm.showGhostStations.toggle()
                            }
                            .font(.caption2.weight(.semibold))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 5)
                            .background(vm.showGhostStations ? Color.orange.opacity(0.28) : Color.secondary.opacity(0.15))
                            .clipShape(Capsule())
                        }

                        HStack(spacing: 6) {
                            Text("Allure")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                            ForEach([1.0, 10.0, 60.0], id: \.self) { spd in
                                Button("\(Int(spd))×") {
                                    vm.timeSpeed = spd
                                    vm.timePaused = false
                                }
                                .font(.caption2.bold().monospacedDigit())
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(vm.timeSpeed == spd && !vm.timePaused ? FaiencePalette.bleuEmail : Color.secondary.opacity(0.15))
                                .foregroundStyle(vm.timeSpeed == spd && !vm.timePaused ? .white : .primary)
                                .clipShape(Capsule())
                            }
                            Spacer()
                            if vm.virtualServiceSeconds != nil || vm.timeSpeed > 1 || vm.timePaused {
                                Button("Direct") {
                                    vm.timePaused = false
                                    vm.resetToLive()
                                }
                                .font(.caption2.bold())
                                .foregroundStyle(.green)
                            }
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
                    .padding(.horizontal, 12)
                }

                // FollowTrainHud
                if let followed = vm.followedTrain {
                    FollowTrainHudView(
                        vm: vm,
                        train: followed,
                        onBoardCab: {
                            vm.rideInitialMode = .cabine
                            vm.showingRide3D = true
                        },
                        onStop: {
                            vm.followedTrainId = nil
                        }
                    )
                    .padding(.horizontal, 12)
                    .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
            .padding(.top, 4)

            // Floating MapControls on the right (exact match with MapControls.tsx!)
            VStack {
                Spacer()
                MapControlsOverlay(
                    is3DSubsurface: $is3DSubsurface,
                    mapPitch3D: $mapPitch3D,
                    show3DBuildings: $vm.show3DBuildings,
                    onToggleSubsurface: {
                        withAnimation(.snappy(duration: 0.3)) {
                            is3DSubsurface.toggle()
                        }
                    },
                    onTogglePitch: {
                        mapPitch3D.toggle()
                        flyToCoordinate(
                            vm.selectedStation?.coordinate ?? CLLocationCoordinate2D(latitude: 48.8566, longitude: 2.3522),
                            distance: vm.selectedStation != nil ? 2_800 : 18_000,
                            pitch: mapPitch3D ? 58 : 0
                        )
                    },
                    onLocateMe: {
                        locationService.requestLocation()
                        if let coord = locationService.userLocation {
                            flyToCoordinate(coord, distance: 2_500, pitch: mapPitch3D ? 55 : 0)
                        }
                    },
                    onRecenterParis: {
                        vm.selectedLine = nil
                        vm.selectedStation = nil
                        vm.followedTrainId = nil
                        flyToCoordinate(
                            CLLocationCoordinate2D(latitude: 48.8566, longitude: 2.3522),
                            distance: 22_000,
                            pitch: mapPitch3D ? 48 : 0
                        )
                    }
                )
                .padding(.trailing, 12)
                .padding(.bottom, 290)
            }
            .frame(maxWidth: .infinity, alignment: .trailing)
        }
        .preferredColorScheme(preferredScheme)
        .sensoryFeedback(.selection, trigger: vm.selectedLine?.id)
        .sensoryFeedback(.selection, trigger: vm.selectedStation?.id)
        .sensoryFeedback(.selection, trigger: vm.followedTrainId)
        .onChange(of: vm.selectedLine) { _, newLine in
            if let line = newLine {
                frameLine(line)
            }
        }
        .onChange(of: vm.selectedStation) { _, newStation in
            if let st = newStation {
                frameStation(st)
            }
        }
        .onChange(of: vm.activeRoute?.id) { _, _ in
            if let route = vm.activeRoute {
                frameRoute(route)
            }
        }
        .onChange(of: vm.followedTrain?.coordinate.latitude) { _, _ in
            if let tr = vm.followedTrain, !is3DSubsurface {
                flyToCoordinate(
                    CLLocationCoordinate2D(latitude: tr.coordinate.latitude - 0.0020, longitude: tr.coordinate.longitude),
                    distance: 3_000,
                    pitch: 58,
                    duration: 0.45
                )
            }
        }
        .sheet(isPresented: .constant(true)) {
            SheetContentView(
                vm: vm,
                locationService: locationService,
                sheetDetent: $sheetDetent,
                activeTab: $activeTab,
                is3DSubsurface: $is3DSubsurface
            )
            .presentationDetents([.height(275), .medium, .large], selection: $sheetDetent)
            .presentationBackgroundInteraction(.enabled(upThrough: .medium))
            .interactiveDismissDisabled()
        }
        .fullScreenCover(isPresented: $vm.showingRide3D) {
            Ride3DView(
                vm: vm,
                initialMode: vm.rideInitialMode,
                onDismiss: { vm.showingRide3D = false }
            )
        }
    }

    private var displayedTracks: [TrackSegment] {
        if let line = vm.selectedLine {
            return vm.tracks.filter { $0.lineId == line.id }
        }
        return vm.tracks
    }

    private var displayedStations: [StationMetadata] {
        if let line = vm.selectedLine {
            return vm.stations.filter { $0.lines.contains(line.id) }
        }
        // Show all multi-line transfer stations on full map so the user can easily tap stations anywhere in Paris
        return vm.stations.filter { $0.lines.count >= 2 }
    }

    private func flyToCoordinate(_ coord: CLLocationCoordinate2D, distance: Double, pitch: Double, duration: Double = 0.55) {
        withAnimation(.easeInOut(duration: duration)) {
            cameraPosition = .camera(
                MapCamera(
                    centerCoordinate: coord,
                    distance: distance,
                    heading: 0,
                    pitch: pitch
                )
            )
        }
    }

    private func frameLine(_ line: LineMetadata) {
        let coords = vm.tracks
            .filter { $0.lineId == line.id }
            .flatMap(\.clCoordinates)
        frameCoordinates(coords, defaultSpan: 0.08)
    }

    private func frameStation(_ st: StationMetadata) {
        flyToCoordinate(
            CLLocationCoordinate2D(latitude: st.coordinate.latitude - 0.0018, longitude: st.coordinate.longitude),
            distance: 2_400,
            pitch: mapPitch3D ? 58 : 0
        )
    }

    private func frameRoute(_ route: PlannedRoute) {
        let coords = route.legs.flatMap(\.coordinates)
        frameCoordinates(coords, defaultSpan: 0.05)
    }

    private func frameCoordinates(_ coords: [CLLocationCoordinate2D], defaultSpan: Double) {
        guard let first = coords.first else { return }
        var minLat = first.latitude
        var maxLat = first.latitude
        var minLng = first.longitude
        var maxLng = first.longitude
        for c in coords {
            minLat = min(minLat, c.latitude)
            maxLat = max(maxLat, c.latitude)
            minLng = min(minLng, c.longitude)
            maxLng = max(maxLng, c.longitude)
        }
        let latSpan = max(defaultSpan, (maxLat - minLat) * 1.38)
        let lngSpan = max(defaultSpan, (maxLng - minLng) * 1.32)
        let centerLat = (minLat + maxLat) / 2 - latSpan * 0.14
        let centerLng = (minLng + maxLng) / 2

        withAnimation(.easeInOut(duration: 0.55)) {
            cameraPosition = .region(
                MKCoordinateRegion(
                    center: CLLocationCoordinate2D(latitude: centerLat, longitude: centerLng),
                    span: MKCoordinateSpan(latitudeDelta: latSpan, longitudeDelta: lngSpan)
                )
            )
        }
    }
}

/// Contrôles de carte flottants à droite (parité MapControls.tsx) :
/// - Cube 3D Sous-sol (métro sous terre)
/// - Inclinaison / Bâtiments 3D
/// - GPS (Suivre ma position)
/// - Recentrer sur Paris
private struct MapControlsOverlay: View {
    @Binding var is3DSubsurface: Bool
    @Binding var mapPitch3D: Bool
    @Binding var show3DBuildings: Bool
    let onToggleSubsurface: () -> Void
    let onTogglePitch: () -> Void
    let onLocateMe: () -> Void
    let onRecenterParis: () -> Void

    var body: some View {
        VStack(spacing: 6) {
            Button(action: onToggleSubsurface) {
                VStack(spacing: 2) {
                    Image(systemName: is3DSubsurface ? "cube.transparent.fill" : "cube.fill")
                        .font(.system(size: 16, weight: .bold))
                    Text("Sous-sol")
                        .font(.system(size: 8, weight: .bold))
                }
                .frame(width: 44, height: 44)
                .background(is3DSubsurface ? FaiencePalette.fondAfficheur : Color.clear)
                .foregroundStyle(is3DSubsurface ? FaiencePalette.ambreAfficheur : .primary)
                .clipShape(RoundedRectangle(cornerRadius: 11))
            }

            Divider().frame(width: 28)

            Button {
                show3DBuildings.toggle()
                onTogglePitch()
            } label: {
                Image(systemName: "building.2.fill")
                    .font(.system(size: 15, weight: .semibold))
                    .frame(width: 40, height: 38)
                    .background(show3DBuildings && mapPitch3D ? FaiencePalette.bleuEmail.opacity(0.2) : Color.clear)
                    .foregroundStyle(show3DBuildings && mapPitch3D ? FaiencePalette.bleuEmail : .primary)
                    .clipShape(RoundedRectangle(cornerRadius: 9))
            }

            Button(action: onLocateMe) {
                Image(systemName: "location.fill")
                    .font(.system(size: 15, weight: .semibold))
                    .frame(width: 40, height: 38)
                    .foregroundStyle(.primary)
            }

            Button(action: onRecenterParis) {
                Image(systemName: "safari.fill")
                    .font(.system(size: 15, weight: .semibold))
                    .frame(width: 40, height: 38)
                    .foregroundStyle(.primary)
            }
        }
        .padding(5)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 15))
        .shadow(color: .black.opacity(0.14), radius: 8, y: 3)
    }
}

/// Menu Principal (⋮) — Parité MenuPrincipal.tsx
private struct MenuPrincipalSheet: View {
    @Bindable var vm: ParisSubwayViewModel
    @Binding var is3DSubsurface: Bool
    let onOpenAbout: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section("Niveau de détail") {
                    FaienceSegmentedView(
                        options: [(false, "Simple"), (true, "Passionné")],
                        selection: $vm.passionneMode
                    )
                }

                Section("Thème d’affichage") {
                    FaienceSegmentedView(
                        options: [("systeme", "Système"), ("clair", "Clair"), ("sombre", "Sombre")],
                        selection: $vm.themeChoice
                    )
                }

                Section("Options 3D & Patrimoine") {
                    Toggle(isOn: $is3DSubsurface) {
                        Label("Métro 3D sous terre (Sous-sol)", systemImage: "cube.transparent.fill")
                    }
                    Toggle(isOn: $vm.showGhostStations) {
                        Label("Stations fantômes & boucles", systemImage: "sparkles")
                    }
                    Toggle(isOn: $vm.show3DBuildings) {
                        Label("Bâtiments en relief", systemImage: "building.2.fill")
                    }
                }

                Section {
                    Button(action: onOpenAbout) {
                        Label("À propos, méthode & Open Data (v2.1)", systemImage: "info.circle")
                    }
                }
            }
            .navigationTitle("Menu et réglages")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Fermer") { dismiss() }
                }
            }
        }
    }
}

private struct FollowTrainHudView: View {
    @Bindable var vm: ParisSubwayViewModel
    let train: TrainMarker
    let onBoardCab: () -> Void
    let onStop: () -> Void

    var body: some View {
        let line = vm.linesById[train.lineId]
        let stops = line.map { vm.orderedStations(for: $0, direction: train.direction).map(\.name) } ?? [train.nextStation]
        let curIdx = stops.firstIndex { normalizeStopName($0) == normalizeStopName(train.nextStation) } ?? 0

        VStack(spacing: 8) {
            HStack(spacing: 10) {
                LineBadgePill(
                    shortName: train.lineName,
                    colorHex: train.colorHex,
                    textColorHex: train.textColorHex,
                    size: 30
                )
                VStack(alignment: .leading, spacing: 2) {
                    Text(train.nextStation)
                        .font(.subheadline.bold())
                        .lineLimit(1)
                    Text("Dir. \(train.destination)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer(minLength: 4)
                AfficheurBadge(minutes: train.atStop ? 0 : 1, atStop: train.atStop)

                Button(action: onStop) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.title3)
                        .foregroundStyle(.secondary)
                }
            }

            PlanDeLigneHorizontalView(
                colorHex: train.colorHex,
                stops: stops,
                currentIndex: curIdx
            )

            HStack {
                Text("\(train.speedKmh) km/h")
                    .font(.caption.bold().monospacedDigit())
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(FaiencePalette.fondAfficheur, in: RoundedRectangle(cornerRadius: 6))
                    .foregroundStyle(FaiencePalette.ambreAfficheur)

                Spacer()

                Button(action: onBoardCab) {
                    Label("Monter en 3D", systemImage: "cube.fill")
                        .font(.caption.bold())
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(FaiencePalette.fondAfficheur, in: Capsule())
                        .foregroundStyle(FaiencePalette.ambreAfficheur)
                }
            }
        }
        .padding(12)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 18))
        .shadow(color: .black.opacity(0.14), radius: 8, y: 3)
    }
}

private enum SheetTab: String, CaseIterable {
    case explorer = "Explorer"
    case nearby = "Autour"
    case route = "Itinéraire"
}

private struct SheetContentView: View {
    @Bindable var vm: ParisSubwayViewModel
    var locationService: LocationService
    @Binding var sheetDetent: PresentationDetent
    @Binding var activeTab: SheetTab
    @Binding var is3DSubsurface: Bool

    @State private var editingOrigin = false
    @State private var editingDest = false

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 10) {
                if let ghost = vm.selectedGhostStation {
                    ghostDetail(ghost)
                } else if let station = vm.selectedStation {
                    stationDetail(station)
                } else if let line = vm.selectedLine {
                    lineDetail(line)
                } else {
                    homeSheet
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
        }
    }

    private var homeSheet: some View {
        VStack(alignment: .leading, spacing: 10) {
            FaienceSegmentedView(
                options: SheetTab.allCases.map { ($0, $0.rawValue) },
                selection: $activeTab
            )
            .onChange(of: activeTab) { _, newTab in
                if newTab == .nearby {
                    locationService.requestLocation()
                    if sheetDetent == .height(275) { sheetDetent = .medium }
                } else if newTab == .route && sheetDetent == .height(275) {
                    sheetDetent = .medium
                }
            }

            switch activeTab {
            case .explorer:
                explorerTab
            case .nearby:
                nearbyTab
            case .route:
                routeTab
            }
        }
    }

    private var explorerTab: some View {
        let metroLines = vm.lines.filter { $0.mode != "rer" && !["A", "B", "C", "D", "E"].contains($0.shortName.uppercased()) }
        let rerLines = vm.lines.filter { $0.mode == "rer" || ["A", "B", "C", "D", "E"].contains($0.shortName.uppercased()) }

        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                TextField("Où allez-vous ? (Station)", text: $vm.searchQuery)
                    .textFieldStyle(.plain)
                if !vm.searchQuery.isEmpty {
                    Button { vm.searchQuery = "" } label: {
                        Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                    }
                }
            }
            .padding(10)
            .background(Color(.secondarySystemFill), in: RoundedRectangle(cornerRadius: 12))

            if !vm.searchQuery.isEmpty {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 6) {
                        ForEach(vm.filteredStations.prefix(15)) { st in
                            Button {
                                vm.selectedStation = st
                                vm.searchQuery = ""
                                sheetDetent = .medium
                            } label: {
                                HStack {
                                    Text(st.name).font(.body.weight(.medium)).foregroundStyle(.primary)
                                    Spacer()
                                    Text("\(st.lines.count) ligne\(st.lines.count > 1 ? "s" : "")")
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                                .padding(.vertical, 6)
                            }
                        }
                    }
                }
            } else {
                // 4 Raccourcis MobileHomeSheet (Domicile, Travail, Sous-sol 3D, Quai 3D)
                HStack(spacing: 8) {
                    ShortcutPillButton(
                        icon: "house.fill",
                        label: vm.homeStationName ?? "Domicile",
                        active: vm.homeStationName != nil
                    ) {
                        if let name = vm.homeStationName, let st = vm.station(named: name) {
                            vm.selectedStation = st
                            sheetDetent = .medium
                        } else if let chatelet = vm.station(named: "Châtelet") {
                            vm.selectedStation = chatelet
                            sheetDetent = .medium
                        }
                    }

                    ShortcutPillButton(
                        icon: "briefcase.fill",
                        label: vm.workStationName ?? "Travail",
                        active: vm.workStationName != nil
                    ) {
                        if let name = vm.workStationName, let st = vm.station(named: name) {
                            vm.selectedStation = st
                            sheetDetent = .medium
                        } else if let defense = vm.station(named: "La Défense") ?? vm.station(named: "Opéra") {
                            vm.selectedStation = defense
                            sheetDetent = .medium
                        }
                    }

                    Button {
                        withAnimation(.snappy(duration: 0.3)) {
                            is3DSubsurface.toggle()
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "cube.transparent.fill")
                            Text("Sous-sol")
                        }
                        .font(.caption.weight(.bold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 9)
                        .background(is3DSubsurface ? FaiencePalette.bleuEmail : Color(.secondarySystemFill), in: RoundedRectangle(cornerRadius: 10))
                        .foregroundStyle(is3DSubsurface ? .white : .primary)
                    }

                    Button {
                        vm.rideInitialMode = .quai
                        vm.showingRide3D = true
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "cube.fill")
                            Text("Quai 3D")
                        }
                        .font(.caption.weight(.bold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 9)
                        .background(FaiencePalette.fondAfficheur, in: RoundedRectangle(cornerRadius: 10))
                        .foregroundStyle(FaiencePalette.ambreAfficheur)
                    }
                }

                FriseCeramiqueView(passionne: vm.passionneMode)

                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            Circle().fill(.green).frame(width: 7, height: 7)
                            Text("Trafic normal · \(vm.trains.count) rames en circulation")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)
                            Spacer()
                            if sheetDetent == .height(275) {
                                Button("Tout voir") { sheetDetent = .medium }
                                    .font(.caption.bold())
                            }
                        }

                        // Métro Grid
                        VStack(alignment: .leading, spacing: 6) {
                            Text("MÉTRO")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundStyle(.secondary)
                            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 8), spacing: 8) {
                                ForEach(metroLines) { line in
                                    Button {
                                        vm.selectedLine = line
                                        sheetDetent = .medium
                                    } label: {
                                        LineBadgePill(
                                            shortName: line.shortName,
                                            colorHex: line.color,
                                            textColorHex: line.textColor,
                                            size: 34
                                        )
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }

                        // RER Grid
                        if !rerLines.isEmpty {
                            VStack(alignment: .leading, spacing: 6) {
                                Text("RER")
                                    .font(.system(size: 11, weight: .bold))
                                    .foregroundStyle(.secondary)
                                HStack(spacing: 8) {
                                    ForEach(rerLines) { line in
                                        Button {
                                            vm.selectedLine = line
                                            sheetDetent = .medium
                                        } label: {
                                            LineBadgePill(
                                                shortName: line.shortName,
                                                colorHex: line.color,
                                                textColorHex: line.textColor,
                                                size: 34
                                            )
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                            }
                        }

                        if vm.passionneMode {
                            HStack {
                                Label("\(vm.trains.count) rames actives", systemImage: "waveform.path.ecg")
                                Spacer()
                                Text("214 km de réseau · 16 Métro + 5 RER")
                            }
                            .font(.caption2.monospacedDigit())
                            .foregroundStyle(.secondary)
                            .padding(10)
                            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
                        }
                    }
                }
            }
        }
    }

    private var nearbyTab: some View {
        let refCoord = locationService.userLocation ?? CLLocationCoordinate2D(latitude: 48.8566, longitude: 2.3522)
        let nearby = vm.nearbyStations(from: refCoord, limit: 10)

        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(locationService.userLocation != nil ? "Stations autour de vous" : "Autour du centre de Paris")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Spacer()
                Button("Actualiser") {
                    locationService.requestLocation()
                }
                .font(.caption2.bold())
            }

            ScrollView {
                LazyVStack(spacing: 8) {
                    ForEach(nearby, id: \.station.id) { item in
                        let distM = Int(item.distanceM.rounded())
                        let walkMin = max(1, Int((item.distanceM / 75.0).rounded()))
                        Button {
                            vm.selectedStation = item.station
                            sheetDetent = .medium
                        } label: {
                            HStack(spacing: 10) {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(item.station.name)
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundStyle(.primary)
                                    Text("\(distM) m · \(walkMin) min à pied")
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                HStack(spacing: 4) {
                                    ForEach(item.station.lines.prefix(4), id: \.self) { lid in
                                        if let l = vm.linesById[lid] {
                                            LineBadgePill(
                                                shortName: l.shortName,
                                                colorHex: l.color,
                                                textColorHex: l.textColor,
                                                size: 20
                                            )
                                        }
                                    }
                                }
                            }
                            .padding(10)
                            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private var routeTab: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                VStack(spacing: 6) {
                    TextField("Départ (ex: Châtelet)", text: $vm.routeOriginQuery)
                        .textFieldStyle(.plain)
                        .padding(9)
                        .background(Color(.secondarySystemFill), in: RoundedRectangle(cornerRadius: 10))
                        .onTapGesture {
                            editingOrigin = true
                            editingDest = false
                        }

                    TextField("Arrivée (ex: Nation)", text: $vm.routeDestQuery)
                        .textFieldStyle(.plain)
                        .padding(9)
                        .background(Color(.secondarySystemFill), in: RoundedRectangle(cornerRadius: 10))
                        .onTapGesture {
                            editingDest = true
                            editingOrigin = false
                        }
                }

                Button {
                    let tmp = vm.routeOriginQuery
                    vm.routeOriginQuery = vm.routeDestQuery
                    vm.routeDestQuery = tmp
                    vm.computeRoute()
                } label: {
                    Image(systemName: "arrow.up.arrow.down")
                        .font(.subheadline.bold())
                        .frame(width: 38, height: 64)
                        .background(Color(.secondarySystemFill), in: RoundedRectangle(cornerRadius: 10))
                }
            }

            HStack {
                Button {
                    editingOrigin = false
                    editingDest = false
                    vm.computeRoute()
                } label: {
                    Label("Calculer", systemImage: "arrow.triangle.turn.up.right.diamond.fill")
                        .font(.subheadline.weight(.semibold))
                }
                .buttonStyle(.borderedProminent)
                .tint(FaiencePalette.bleuEmail)

                if vm.activeRoute != nil {
                    Button("Effacer") {
                        vm.clearRoute()
                    }
                    .font(.subheadline)
                }
                Spacer()
            }

            let activeQuery = editingOrigin ? vm.routeOriginQuery : (editingDest ? vm.routeDestQuery : "")
            if !activeQuery.isEmpty && (editingOrigin || editingDest) {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 4) {
                        ForEach(vm.filterStations(query: activeQuery).prefix(6)) { st in
                            Button(st.name) {
                                if editingOrigin {
                                    vm.routeOriginQuery = st.name
                                    editingOrigin = false
                                } else {
                                    vm.routeDestQuery = st.name
                                    editingDest = false
                                }
                                if !vm.routeOriginQuery.isEmpty && !vm.routeDestQuery.isEmpty {
                                    vm.computeRoute()
                                }
                            }
                            .font(.subheadline)
                            .padding(.vertical, 5)
                        }
                    }
                }
            } else if let route = vm.activeRoute {
                ScrollView {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Text("\(route.totalMinutes) min")
                                .font(.title3.bold())
                            Text("· \(route.transferCount) correspondance\(route.transferCount > 1 ? "s" : "")")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }

                        ForEach(route.legs) { leg in
                            HStack(spacing: 10) {
                                LineBadgePill(
                                    shortName: leg.lineShortName,
                                    colorHex: leg.colorHex,
                                    textColorHex: leg.textColorHex,
                                    size: 26
                                )
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("\(leg.fromStation) → \(leg.toStation)")
                                        .font(.subheadline.weight(.semibold))
                                        .lineLimit(1)
                                    Text("\(max(1, leg.stopNames.count - 1)) arrêt\(leg.stopNames.count > 2 ? "s" : "") · ~\(max(1, leg.estimatedSeconds / 60)) min")
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .padding(9)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
                        }
                    }
                }
            }
        }
    }

    private func lineDetail(_ line: LineMetadata) -> some View {
        let stockSpec = vm.rollingStockByLine[line.shortName]

        return VStack(alignment: .leading, spacing: 10) {
            FriseCeramiqueView(passionne: vm.passionneMode)

            HStack {
                Button {
                    vm.selectedLine = nil
                } label: {
                    Label("Toutes", systemImage: "chevron.left")
                        .font(.subheadline.weight(.semibold))
                }
                Spacer()
                Button {
                    vm.rideInitialMode = .quai
                    vm.showingRide3D = true
                } label: {
                    Label("Quai 3D", systemImage: "cube.fill")
                        .font(.caption.bold())
                        .padding(.horizontal, 11)
                        .padding(.vertical, 7)
                        .background(FaiencePalette.fondAfficheur, in: Capsule())
                        .foregroundStyle(FaiencePalette.ambreAfficheur)
                }

                Button {
                    vm.rideInitialMode = .cabine
                    vm.showingRide3D = true
                } label: {
                    Label("Cabine 3D", systemImage: "tram.fill")
                        .font(.caption.bold())
                        .padding(.horizontal, 11)
                        .padding(.vertical, 7)
                        .background(FaiencePalette.bleuEmail, in: Capsule())
                        .foregroundStyle(.white)
                }
            }

            HStack(spacing: 12) {
                LineBadgePill(shortName: line.shortName, colorHex: line.color, textColorHex: line.textColor, size: 38)
                VStack(alignment: .leading, spacing: 2) {
                    Text(line.longName.isEmpty ? "Ligne \(line.shortName)" : line.longName)
                        .font(.headline.bold())
                        .lineLimit(1)
                    Text("\(vm.trains.count) rames actives · \(String(format: "%.1f", line.measuredLengthKm)) km")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    if let spec = stockSpec {
                        Text("Matériel : \(spec.name) · \(spec.driveType == "tire" ? "Pneu" : "Fer")\(spec.driverless ? " · Automatique" : "")")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(FaiencePalette.bleuEmail)
                    }
                }
            }

            ElevationProfileView(
                line: line,
                stops: vm.orderedStations(for: line, direction: vm.lineDirection)
            )

            LineThermometerView(vm: vm, line: line) { station in
                vm.selectedStation = station
                sheetDetent = .medium
            }
        }
    }

    private func stationDetail(_ station: StationMetadata) -> some View {
        let stationLines = station.lines
            .compactMap { vm.linesById[$0] }
            .sorted { $0.shortName.localizedStandardCompare($1.shortName) == .orderedAscending }
        let isFav = vm.favoriteStations.contains(station.name)
        let isHome = vm.homeStationName == station.name
        let isWork = vm.workStationName == station.name

        return VStack(alignment: .leading, spacing: 10) {
            FriseCeramiqueView(passionne: vm.passionneMode)

            // Header: Plaque + Favori + Menu (Domicile/Travail) + Fermer
            HStack(spacing: 8) {
                PlaqueEmailView(title: station.name)

                Spacer(minLength: 2)

                Button {
                    if isFav {
                        vm.favoriteStations.remove(station.name)
                    } else {
                        vm.favoriteStations.insert(station.name)
                    }
                } label: {
                    Image(systemName: isFav ? "star.fill" : "star")
                        .foregroundStyle(isFav ? .yellow : .secondary)
                        .frame(width: 32, height: 32)
                        .background(Color(.secondarySystemFill), in: Circle())
                }

                Menu {
                    Button {
                        vm.homeStationName = isHome ? nil : station.name
                    } label: {
                        Label(isHome ? "Retirer comme Domicile" : "Définir comme Domicile", systemImage: "house.fill")
                    }
                    Button {
                        vm.workStationName = isWork ? nil : station.name
                    } label: {
                        Label(isWork ? "Retirer comme Travail" : "Définir comme Travail", systemImage: "briefcase.fill")
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .frame(width: 32, height: 32)
                        .background(Color(.secondarySystemFill), in: Circle())
                }

                Button {
                    vm.selectedStation = nil
                } label: {
                    Image(systemName: "xmark")
                        .font(.caption.bold())
                        .frame(width: 32, height: 32)
                        .background(Color(.secondarySystemFill), in: Circle())
                }
            }

            // Lignes + Accessibilité
            HStack(spacing: 6) {
                ForEach(stationLines) { l in
                    Button {
                        vm.selectedStation = nil
                        vm.selectedLine = l
                    } label: {
                        LineBadgePill(shortName: l.shortName, colorHex: l.color, textColorHex: l.textColor, size: 24)
                    }
                }
                if station.wheelchairBoarding == 1 {
                    Label("Accessible", systemImage: "figure.roll")
                        .font(.caption2.weight(.semibold))
                        .padding(.horizontal, 7)
                        .padding(.vertical, 4)
                        .background(FaiencePalette.bleuEmail.opacity(0.15), in: Capsule())
                        .foregroundStyle(FaiencePalette.bleuEmail)
                }
            }

            if stationLines.count >= 2 {
                let advicePos: VoiturePosition = station.lines.count >= 4 ? .milieu : (station.name.count % 2 == 0 ? .tete : .queue)
                VoitureConseilleeView(
                    position: advicePos,
                    reason: "correspondance \(stationLines.prefix(2).map(\.shortName).joined(separator: " / "))"
                )
            }

            // Passages groupés (2 horaires par direction comme Passages.tsx)
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 8) {
                    ForEach(vm.departureGroups.prefix(10)) { grp in
                        HStack(spacing: 10) {
                            LineBadgePill(
                                shortName: grp.lineShortName,
                                colorHex: grp.colorHex,
                                textColorHex: grp.textColorHex,
                                size: 26
                            )
                            Text(grp.destinationName)
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(.primary)
                                .lineLimit(1)
                            Spacer()
                            HStack(spacing: 5) {
                                ForEach(grp.passages) { dep in
                                    Button {
                                        vm.followedTrainId = dep.tripId
                                        vm.selectedStation = nil
                                        sheetDetent = .height(275)
                                    } label: {
                                        AfficheurBadge(minutes: dep.waitMinutes, atStop: dep.atStop)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                        .padding(.vertical, 3)
                        Divider()
                    }
                    if vm.departureGroups.isEmpty {
                        Text("Aucun passage prévu dans les 45 prochaines minutes.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            // Pied de page fixe StationDrawer : Y aller · Partir d'ici · Quai 3D
            HStack(spacing: 8) {
                Button {
                    vm.routeDestQuery = station.name
                    if vm.routeOriginQuery.isEmpty, let home = vm.homeStationName {
                        vm.routeOriginQuery = home
                    }
                    vm.selectedStation = nil
                    activeTab = .route
                    vm.computeRoute()
                    sheetDetent = .medium
                } label: {
                    Label("Y aller", systemImage: "arrow.triangle.turn.up.right.diamond.fill")
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(FaiencePalette.bleuEmail, in: RoundedRectangle(cornerRadius: 11))
                        .foregroundStyle(.white)
                }

                Button {
                    vm.routeOriginQuery = station.name
                    vm.selectedStation = nil
                    activeTab = .route
                    sheetDetent = .medium
                } label: {
                    Text("Partir d’ici")
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(Color(.secondarySystemFill), in: RoundedRectangle(cornerRadius: 11))
                        .foregroundStyle(.primary)
                }

                Button {
                    vm.rideInitialMode = .quai
                    vm.showingRide3D = true
                } label: {
                    Label("Quai 3D", systemImage: "cube.fill")
                        .font(.subheadline.weight(.bold))
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(FaiencePalette.fondAfficheur, in: RoundedRectangle(cornerRadius: 11))
                        .foregroundStyle(FaiencePalette.ambreAfficheur)
                }
            }
            .padding(.bottom, 6)
        }
    }

    private func ghostDetail(_ ghost: GhostStationSpec) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Button {
                    vm.selectedGhostStation = nil
                } label: {
                    Label("Retour", systemImage: "chevron.left")
                        .font(.subheadline.weight(.semibold))
                }
                Spacer()
                Text(ghost.isLoop ? "Boucle technique" : (ghost.yearClosed.map { "Fermée en \($0)" } ?? "Jamais ouverte"))
                    .font(.caption.bold())
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(Color.orange.opacity(0.2), in: Capsule())
                    .foregroundStyle(.orange)
            }

            Text(ghost.name)
                .font(.title2.bold())

            Text(ghost.shortNote)
                .font(.subheadline)
                .foregroundStyle(.secondary)

            HStack(spacing: 6) {
                ForEach(ghost.lines, id: \.self) { shortName in
                    if let l = vm.lines.first(where: { $0.shortName == shortName }) {
                        LineBadgePill(shortName: l.shortName, colorHex: l.color, textColorHex: l.textColor, size: 26)
                    }
                }
            }
        }
    }
}

private struct ShortcutPillButton: View {
    let icon: String
    let label: String
    let active: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.caption2)
                Text(label)
                    .font(.caption.weight(.semibold))
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 9)
            .background(active ? FaiencePalette.bleuEmail.opacity(0.15) : Color(.secondarySystemFill), in: RoundedRectangle(cornerRadius: 10))
            .foregroundStyle(active ? FaiencePalette.bleuEmail : .primary)
        }
        .buttonStyle(.plain)
    }
}
