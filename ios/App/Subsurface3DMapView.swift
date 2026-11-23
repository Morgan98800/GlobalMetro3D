import SwiftUI
import SceneKit
import UIKit
import MapKit
import CoreLocation
import ParisSubwayCore

/// Vue 3D Sous-sol native (SceneKit / Metal) affichant le réseau métro & RER
/// à ses profondeurs réelles sous une carte translucide de Paris (Seine, parcs, monuments).
public struct Subsurface3DMapView: UIViewRepresentable {
    @Bindable var vm: ParisSubwayViewModel
    let onSelectStation: (StationMetadata) -> Void
    let onSelectTrain: (TrainMarker) -> Void

    public init(
        vm: ParisSubwayViewModel,
        onSelectStation: @escaping (StationMetadata) -> Void,
        onSelectTrain: @escaping (TrainMarker) -> Void
    ) {
        self.vm = vm
        self.onSelectStation = onSelectStation
        self.onSelectTrain = onSelectTrain
    }

    public func makeCoordinator() -> Coordinator {
        Coordinator(onSelectStation: onSelectStation, onSelectTrain: onSelectTrain)
    }

    public func makeUIView(context: Context) -> SCNView {
        let view = SCNView()
        view.backgroundColor = UIColor(red: 0.04, green: 0.06, blue: 0.11, alpha: 1.0)
        view.antialiasingMode = .multisampling4X
        view.allowsCameraControl = true
        view.defaultCameraController.interactionMode = .orbitTurntable
        view.defaultCameraController.inertiaEnabled = true
        view.defaultCameraController.maximumVerticalAngle = 82
        view.defaultCameraController.minimumVerticalAngle = 8
        view.autoenablesDefaultLighting = false
        view.preferredFramesPerSecond = 60

        let scene = buildInitialScene(coordinator: context.coordinator)
        view.scene = scene

        let tap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.handleTap(_:)))
        view.addGestureRecognizer(tap)
        context.coordinator.scnView = view
        return view
    }

    public func updateUIView(_ uiView: SCNView, context: Context) {
        let coord = context.coordinator
        coord.stationsById = Dictionary(uniqueKeysWithValues: vm.stations.map { ($0.id, $0) })
        coord.trainsById = Dictionary(uniqueKeysWithValues: vm.trains.map { ($0.id, $0) })

        // Update line highlight / dimming
        let selectedLineId = vm.selectedLine?.id
        if coord.lastSelectedLineId != selectedLineId {
            coord.lastSelectedLineId = selectedLineId
            SCNTransaction.begin()
            SCNTransaction.animationDuration = 0.35
            for (lineId, nodes) in coord.trackNodesByLine {
                let isSelected = (selectedLineId == nil || selectedLineId == lineId)
                for node in nodes {
                    node.opacity = isSelected ? 1.0 : 0.14
                }
            }
            for (stId, node) in coord.stationNodes {
                if let lineId = selectedLineId, let st = coord.stationsById[stId] {
                    node.opacity = st.lines.contains(lineId) ? 1.0 : 0.15
                } else {
                    node.opacity = 1.0
                }
            }
            SCNTransaction.commit()
        }

        // Update Ghost stations & 3D buildings visibility
        coord.ghostRoot?.isHidden = !vm.showGhostStations
        coord.buildingsRoot?.isHidden = !vm.show3DBuildings

        // Update 3D trains smoothly
        updateTrainNodes(coordinator: coord)

        // Frame selected station in 3D underground
        if let st = vm.selectedStation, coord.lastSelectedStationId != st.id {
            coord.lastSelectedStationId = st.id
            let target = ParisProjection.project(st.coordinate, y: -1.8)
            if let cam = uiView.scene?.rootNode.childNode(withName: "subsurfaceCam", recursively: false) {
                SCNTransaction.begin()
                SCNTransaction.animationDuration = 0.65
                cam.position = SCNVector3(target.x, 12, target.z + 16)
                cam.look(at: target)
                SCNTransaction.commit()
            }
        } else if vm.selectedStation == nil {
            coord.lastSelectedStationId = nil
        }

        // Follow train camera if locked
        if let followed = vm.followedTrain, coord.lastFollowedTrainId != followed.id {
            coord.lastFollowedTrainId = followed.id
            let target = ParisProjection.project(
                followed.coordinate,
                y: ParisProjection.depthY(for: vm.linesById[followed.lineId])
            )
            if let cam = uiView.scene?.rootNode.childNode(withName: "subsurfaceCam", recursively: false) {
                SCNTransaction.begin()
                SCNTransaction.animationDuration = 0.65
                cam.position = SCNVector3(target.x, target.y + 14, target.z + 18)
                cam.look(at: target)
                SCNTransaction.commit()
            }
        } else if vm.followedTrain == nil {
            coord.lastFollowedTrainId = nil
        }
    }

    private func buildInitialScene(coordinator: Coordinator) -> SCNScene {
        let scene = SCNScene()

        // Lighting
        let ambient = SCNNode()
        ambient.light = SCNLight()
        ambient.light?.type = .ambient
        ambient.light?.intensity = 520
        ambient.light?.color = UIColor(red: 0.88, green: 0.92, blue: 1.0, alpha: 1)
        scene.rootNode.addChildNode(ambient)

        let dirLight = SCNNode()
        dirLight.light = SCNLight()
        dirLight.light?.type = .directional
        dirLight.light?.intensity = 720
        dirLight.eulerAngles = SCNVector3(-Float.pi / 3, Float.pi / 6, 0)
        scene.rootNode.addChildNode(dirLight)

        // Surface Paris Layer (translucent so underground network is clearly visible!)
        let surfaceRoot = buildParisSurfaceLayer(coordinator: coordinator)
        scene.rootNode.addChildNode(surfaceRoot)

        // Underground Track Tubes/Ribbons
        let tracksRoot = SCNNode()
        for seg in vm.tracks {
            let line = vm.linesById[seg.lineId]
            let yDepth = ParisProjection.depthY(for: line)
            let pts = seg.clCoordinates.map { ParisProjection.project($0, y: yDepth) }
            guard pts.count >= 2 else { continue }

            let geom = ParisGeometryBuilder.ribbonGeometry(points: pts, width: line?.mode == "rer" ? 0.55 : 0.42)
            let mat = SCNMaterial()
            let uiCol = UIColor(Color(hex: seg.stroke))
            mat.diffuse.contents = uiCol
            mat.emission.contents = uiCol.withAlphaComponent(0.32)
            mat.isDoubleSided = true
            geom.materials = [mat]

            let node = SCNNode(geometry: geom)
            tracksRoot.addChildNode(node)
            coordinator.trackNodesByLine[seg.lineId, default: []].append(node)
        }
        scene.rootNode.addChildNode(tracksRoot)

        // Underground & Multi-Level Stations + Vertical Access Shafts + Viaduct Pillars
        let stationsRoot = SCNNode()
        let shaftMat = SCNMaterial()
        shaftMat.diffuse.contents = UIColor.white.withAlphaComponent(0.22)

        for st in vm.stations {
            let stLines = st.lines.compactMap { vm.linesById[$0] }
            let basePos = ParisProjection.project(st.coordinate, y: 0)

            let stNode = SCNNode()
            stNode.name = "station:\(st.id)"
            stNode.position = SCNVector3(basePos.x, 0, basePos.z)

            var minY: Float = 0
            var maxY: Float = 0

            if stLines.isEmpty {
                let yDepth: Float = -1.6
                minY = yDepth
                let sphere = SCNSphere(radius: 0.30)
                sphere.firstMaterial?.diffuse.contents = UIColor.white
                let sNode = SCNNode(geometry: sphere)
                sNode.name = "station:\(st.id)"
                sNode.position = SCNVector3(0, yDepth, 0)
                stNode.addChildNode(sNode)
            } else {
                for line in stLines {
                    let elevM = StationLevels.elevationMeters(
                        forLineShortName: line.shortName,
                        atStationName: st.name,
                        fallbackOffset: line.elevationOffset
                    )
                    let yLevel = Float(elevM * 0.14)
                    minY = min(minY, yLevel)
                    maxY = max(maxY, yLevel)

                    let isElevated = elevM > 0
                    let slab = SCNBox(
                        width: stLines.count >= 2 ? 0.95 : 0.68,
                        height: 0.18,
                        length: stLines.count >= 2 ? 0.56 : 0.42,
                        chamferRadius: 0.04
                    )
                    let mat = SCNMaterial()
                    let col = UIColor(Color(hex: line.color))
                    mat.diffuse.contents = col
                    mat.emission.contents = col.withAlphaComponent(0.45)
                    slab.materials = [mat]

                    let slabNode = SCNNode(geometry: slab)
                    slabNode.name = "station:\(st.id)"
                    slabNode.position = SCNVector3(0, yLevel, 0)
                    stNode.addChildNode(slabNode)

                    if isElevated {
                        // Viaduct support pillar down to ground (y=0)
                        let pillar = SCNCylinder(radius: 0.12, height: CGFloat(yLevel))
                        pillar.firstMaterial?.diffuse.contents = UIColor(white: 0.55, alpha: 0.75)
                        let pNode = SCNNode(geometry: pillar)
                        pNode.position = SCNVector3(0, yLevel / 2, 0)
                        stNode.addChildNode(pNode)
                    }
                }
            }

            // Vertical transfer shaft connecting surface (y=0) through all underground levels
            let shaftLow = min(0, minY)
            let shaftHigh = max(0, maxY)
            let shaftH = shaftHigh - shaftLow
            if shaftH > 0.25 {
                let shaft = SCNCylinder(radius: stLines.count >= 3 ? 0.12 : 0.07, height: CGFloat(shaftH))
                shaft.materials = [shaftMat]
                let shaftNode = SCNNode(geometry: shaft)
                shaftNode.position = SCNVector3(0, (shaftHigh + shaftLow) / 2, 0)
                stNode.addChildNode(shaftNode)
            }

            stationsRoot.addChildNode(stNode)
            coordinator.stationNodes[st.id] = stNode
        }
        scene.rootNode.addChildNode(stationsRoot)

        // Ghost Stations
        let ghostRoot = SCNNode()
        ghostRoot.isHidden = !vm.showGhostStations
        for ghost in GhostStationsRegistry.all {
            let pos = ParisProjection.project(ghost.coordinate, y: -2.2)
            let sphere = SCNSphere(radius: 0.45)
            sphere.firstMaterial?.diffuse.contents = UIColor.systemOrange
            sphere.firstMaterial?.emission.contents = UIColor.systemOrange.withAlphaComponent(0.6)
            let node = SCNNode(geometry: sphere)
            node.position = pos
            ghostRoot.addChildNode(node)
        }
        scene.rootNode.addChildNode(ghostRoot)
        coordinator.ghostRoot = ghostRoot

        // Trains container
        let trainsRoot = SCNNode()
        scene.rootNode.addChildNode(trainsRoot)
        coordinator.trainsRoot = trainsRoot

        // Camera positioned at an oblique 3D angle looking down into Paris underground
        let camNode = SCNNode()
        camNode.name = "subsurfaceCam"
        camNode.camera = SCNCamera()
        camNode.camera?.fieldOfView = 50
        camNode.camera?.zNear = 0.5
        camNode.camera?.zFar = 600
        camNode.position = SCNVector3(0, 42, 62)
        camNode.look(at: SCNVector3(0, -3.0, 0))
        scene.rootNode.addChildNode(camNode)

        return scene
    }

    private func updateTrainNodes(coordinator: Coordinator) {
        guard let root = coordinator.trainsRoot else { return }
        let activeTrains = Array(vm.trains.prefix(320))
        let activeIds = Set(activeTrains.map(\.id))

        // Remove trains no longer active
        for (id, node) in coordinator.trainNodes where !activeIds.contains(id) {
            node.removeFromParentNode()
            coordinator.trainNodes.removeValue(forKey: id)
        }

        SCNTransaction.begin()
        SCNTransaction.animationDuration = 0.46
        SCNTransaction.animationTimingFunction = CAMediaTimingFunction(name: .linear)

        for train in activeTrains {
            let line = vm.linesById[train.lineId]
            let yDepth = ParisProjection.depthY(for: line)
            let poses = vm.carPoses(for: train)

            let trainNode: SCNNode
            if let existing = coordinator.trainNodes[train.id] {
                trainNode = existing
            } else {
                trainNode = makeArticulatedTrainNode(train: train, carCount: poses.count)
                root.addChildNode(trainNode)
                coordinator.trainNodes[train.id] = trainNode
            }

            for (idx, pose) in poses.enumerated() where idx < trainNode.childNodes.count {
                let carNode = trainNode.childNodes[idx]
                carNode.position = ParisProjection.project(pose.coordinate, y: yDepth + 0.22)
                carNode.eulerAngles = SCNVector3(0, -Float(pose.bearingDeg * .pi / 180.0), 0)
            }
        }
        SCNTransaction.commit()
    }

    private func makeArticulatedTrainNode(train: TrainMarker, carCount: Int) -> SCNNode {
        let group = SCNNode()
        group.name = "train:\(train.id)"

        let col = UIColor(Color(hex: train.colorHex))
        let bodyMat = SCNMaterial()
        bodyMat.diffuse.contents = col
        bodyMat.emission.contents = col.withAlphaComponent(0.50)

        let roofMat = SCNMaterial()
        roofMat.diffuse.contents = UIColor(white: 0.94, alpha: 1.0)

        for idx in 0..<max(1, carCount) {
            let car = SCNNode()
            car.name = "train:\(train.id)"

            let role: TrainModelLoader.CarRole = idx == 0 ? .cab : (idx == carCount - 1 ? .tail : .neutral)
            if let usdzCar = TrainModelLoader.shared.carNode(
                lineShortName: train.lineName,
                role: role,
                targetLength: 0.34,
                lineColor: col
            ) {
                usdzCar.name = "train:\(train.id)"
                car.addChildNode(usdzCar)
            } else {
                let hull = SCNBox(width: 0.36, height: 0.26, length: 0.24, chamferRadius: 0.04)
                hull.materials = [bodyMat]
                let hullNode = SCNNode(geometry: hull)
                hullNode.name = "train:\(train.id)"
                car.addChildNode(hullNode)

                let roof = SCNBox(width: 0.30, height: 0.05, length: 0.22, chamferRadius: 0.02)
                roof.materials = [roofMat]
                let roofNode = SCNNode(geometry: roof)
                roofNode.position = SCNVector3(0, 0.14, 0)
                car.addChildNode(roofNode)
            }

            if idx == 0 {
                // Front cab headlights
                let lightBar = SCNBox(width: 0.28, height: 0.07, length: 0.04, chamferRadius: 0.01)
                lightBar.firstMaterial?.diffuse.contents = UIColor.white
                lightBar.firstMaterial?.emission.contents = UIColor(red: 1.0, green: 0.95, blue: 0.72, alpha: 1.0)
                let lightNode = SCNNode(geometry: lightBar)
                lightNode.position = SCNVector3(0, 0.02, -0.13)
                car.addChildNode(lightNode)
            } else if idx == carCount - 1 {
                // Rear red tail lights
                let tailBar = SCNBox(width: 0.26, height: 0.06, length: 0.04, chamferRadius: 0.01)
                tailBar.firstMaterial?.diffuse.contents = UIColor.systemRed
                tailBar.firstMaterial?.emission.contents = UIColor.systemRed
                let tailNode = SCNNode(geometry: tailBar)
                tailNode.position = SCNVector3(0, 0.02, 0.13)
                car.addChildNode(tailNode)
            }

            group.addChildNode(car)
        }

        return group
    }

    private func buildParisSurfaceLayer(coordinator: Coordinator) -> SCNNode {
        let root = SCNNode()

        // Translucent ground sheet with live MKMapSnapshotter texture of Paris streets!
        let ground = SCNPlane(width: 180, height: 150)
        let groundMat = SCNMaterial()
        groundMat.diffuse.contents = UIColor(red: 0.14, green: 0.18, blue: 0.25, alpha: 0.45)
        groundMat.transparency = 0.56
        groundMat.isDoubleSided = true
        ground.materials = [groundMat]
        let groundNode = SCNNode(geometry: ground)
        groundNode.eulerAngles = SCNVector3(-Float.pi / 2, 0, 0)
        groundNode.position = SCNVector3(0, 0, 0)
        root.addChildNode(groundNode)

        // Generate real Paris street map snapshot (18km x 15km centered on 48.8566, 2.3522)
        let snapOpts = MKMapSnapshotter.Options()
        snapOpts.region = MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: 48.8566, longitude: 2.3522),
            span: MKCoordinateSpan(latitudeDelta: 15_000.0 / 111_132.0, longitudeDelta: 18_000.0 / 73_120.0)
        )
        snapOpts.size = CGSize(width: 1440, height: 1200)
        snapOpts.mapType = .mutedStandard
        snapOpts.showsBuildings = true
        let snapshotter = MKMapSnapshotter(options: snapOpts)
        snapshotter.start { snapshot, _ in
            guard let img = snapshot?.image else { return }
            Task { @MainActor in
                groundMat.diffuse.contents = img
                groundMat.transparency = 0.54
            }
        }

        // 3D Haussmann City Blocks in Relief (toggled by Bâtiments 3D)
        let buildingsRoot = SCNNode()
        buildingsRoot.isHidden = !vm.show3DBuildings
        let bMat = SCNMaterial()
        bMat.diffuse.contents = UIColor(red: 0.78, green: 0.76, blue: 0.72, alpha: 0.34)
        for st in vm.stations.prefix(95) {
            let p = ParisProjection.project(st.coordinate, y: 0.35)
            let block = SCNBox(width: 1.4, height: 0.7, length: 1.1, chamferRadius: 0.04)
            block.materials = [bMat]
            let bNode = SCNNode(geometry: block)
            bNode.position = SCNVector3(p.x + 0.9, 0.35, p.z - 0.8)
            buildingsRoot.addChildNode(bNode)
        }
        root.addChildNode(buildingsRoot)
        coordinator.buildingsRoot = buildingsRoot

        // Subtle Haussmann grid lines on surface
        let gridMat = SCNMaterial()
        gridMat.diffuse.contents = UIColor.white.withAlphaComponent(0.06)
        for offset in stride(from: Float(-70), through: Float(70), by: 10) {
            let hLine = SCNBox(width: 160, height: 0.02, length: 0.08, chamferRadius: 0)
            hLine.materials = [gridMat]
            let hNode = SCNNode(geometry: hLine)
            hNode.position = SCNVector3(0, 0.01, offset)
            root.addChildNode(hNode)

            let vLine = SCNBox(width: 0.08, height: 0.02, length: 140, chamferRadius: 0)
            vLine.materials = [gridMat]
            let vNode = SCNNode(geometry: vLine)
            vNode.position = SCNVector3(offset, 0.01, 0)
            root.addChildNode(vNode)
        }

        // La Seine river path across Paris
        let seineCoords: [CLLocationCoordinate2D] = [
            .init(latitude: 48.828, longitude: 2.412),
            .init(latitude: 48.838, longitude: 2.382),
            .init(latitude: 48.849, longitude: 2.362),
            .init(latitude: 48.854, longitude: 2.349), // Île de la Cité
            .init(latitude: 48.861, longitude: 2.332),
            .init(latitude: 48.864, longitude: 2.308),
            .init(latitude: 48.858, longitude: 2.290), // Tour Eiffel / Bir-Hakeim
            .init(latitude: 48.846, longitude: 2.273),
            .init(latitude: 48.833, longitude: 2.256),
        ]
        let seinePts = seineCoords.map { ParisProjection.project($0, y: 0.03) }
        let seineGeom = ParisGeometryBuilder.ribbonGeometry(points: seinePts, width: 2.2)
        let seineMat = SCNMaterial()
        seineMat.diffuse.contents = UIColor(red: 0.16, green: 0.44, blue: 0.78, alpha: 0.48)
        seineMat.isDoubleSided = true
        seineGeom.materials = [seineMat]
        root.addChildNode(SCNNode(geometry: seineGeom))

        // Key Paris Parks (translucent emerald)
        let parks: [(CLLocationCoordinate2D, Float, Float)] = [
            (.init(latitude: 48.862, longitude: 2.249), 18, 22), // Bois de Boulogne
            (.init(latitude: 48.828, longitude: 2.435), 22, 18), // Bois de Vincennes
            (.init(latitude: 48.846, longitude: 2.337), 5.5, 5.0), // Luxembourg
            (.init(latitude: 48.863, longitude: 2.327), 6.0, 2.5), // Tuileries
            (.init(latitude: 48.880, longitude: 2.382), 5.0, 4.5), // Buttes-Chaumont
        ]
        for (coord, w, h) in parks {
            let park = SCNPlane(width: CGFloat(w), height: CGFloat(h))
            park.firstMaterial?.diffuse.contents = UIColor(red: 0.18, green: 0.56, blue: 0.34, alpha: 0.25)
            park.firstMaterial?.isDoubleSided = true
            let pNode = SCNNode(geometry: park)
            pNode.eulerAngles = SCNVector3(-Float.pi / 2, 0, 0)
            pNode.position = ParisProjection.project(coord, y: 0.02)
            root.addChildNode(pNode)
        }

        // 3D Landmark Silhouettes on surface (orientation anchors!)
        let eiffelPos = ParisProjection.project(.init(latitude: 48.8584, longitude: 2.2945), y: 0)
        let eiffel = SCNPyramid(width: 1.6, height: 4.8, length: 1.6)
        eiffel.firstMaterial?.diffuse.contents = UIColor(red: 0.85, green: 0.72, blue: 0.48, alpha: 0.55)
        let eiffelNode = SCNNode(geometry: eiffel)
        eiffelNode.position = eiffelPos
        root.addChildNode(eiffelNode)

        let arcPos = ParisProjection.project(.init(latitude: 48.8738, longitude: 2.2950), y: 0.6)
        let arc = SCNBox(width: 1.4, height: 1.2, length: 0.8, chamferRadius: 0.08)
        arc.firstMaterial?.diffuse.contents = UIColor(white: 0.92, alpha: 0.48)
        let arcNode = SCNNode(geometry: arc)
        arcNode.position = arcPos
        root.addChildNode(arcNode)

        let montparnassePos = ParisProjection.project(.init(latitude: 48.8421, longitude: 2.3219), y: 1.6)
        let tour = SCNBox(width: 0.9, height: 3.2, length: 0.6, chamferRadius: 0.05)
        tour.firstMaterial?.diffuse.contents = UIColor(red: 0.35, green: 0.42, blue: 0.55, alpha: 0.55)
        let tourNode = SCNNode(geometry: tour)
        tourNode.position = montparnassePos
        root.addChildNode(tourNode)

        return root
    }

    @MainActor
    public final class Coordinator: NSObject {
        weak var scnView: SCNView?
        weak var trainsRoot: SCNNode?
        weak var ghostRoot: SCNNode?
        weak var buildingsRoot: SCNNode?
        var trackNodesByLine: [String: [SCNNode]] = [:]
        var stationNodes: [String: SCNNode] = [:]
        var trainNodes: [String: SCNNode] = [:]
        var stationsById: [String: StationMetadata] = [:]
        var trainsById: [String: TrainMarker] = [:]
        var lastSelectedLineId: String?
        var lastSelectedStationId: String?
        var lastFollowedTrainId: String?

        let onSelectStation: (StationMetadata) -> Void
        let onSelectTrain: (TrainMarker) -> Void

        init(
            onSelectStation: @escaping (StationMetadata) -> Void,
            onSelectTrain: @escaping (TrainMarker) -> Void
        ) {
            self.onSelectStation = onSelectStation
            self.onSelectTrain = onSelectTrain
        }

        @objc func handleTap(_ gesture: UITapGestureRecognizer) {
            guard let view = scnView else { return }
            let pt = gesture.location(in: view)
            let hits = view.hitTest(pt, options: [.searchMode: SCNHitTestSearchMode.closest.rawValue])
            for hit in hits {
                var cur: SCNNode? = hit.node
                while let n = cur {
                    if let name = n.name {
                        if name.hasPrefix("train:") {
                            let id = String(name.dropFirst("train:".count))
                            if let tr = trainsById[id] {
                                onSelectTrain(tr)
                                return
                            }
                        } else if name.hasPrefix("station:") {
                            let id = String(name.dropFirst("station:".count))
                            if let st = stationsById[id] {
                                onSelectStation(st)
                                return
                            }
                        }
                    }
                    cur = n.parent
                }
            }
        }
    }
}

private enum ParisProjection {
    static let centerLat = 48.8566
    static let centerLng = 2.3522
    static let metersPerDegLat = 111_132.0
    static let metersPerDegLng = 111_132.0 * cos(48.8566 * .pi / 180.0)
    static let scale: Double = 0.01 // 1 unit = 100 meters

    static func project(_ coord: CLLocationCoordinate2D, y: Float) -> SCNVector3 {
        let dx = (coord.longitude - centerLng) * metersPerDegLng * scale
        let dz = -(coord.latitude - centerLat) * metersPerDegLat * scale
        return SCNVector3(Float(dx), y, Float(dz))
    }

    static func depthY(for line: LineMetadata?) -> Float {
        guard let line else { return -2.5 }
        if line.mode == "rer" {
            return -6.5 + Float(line.elevationOffset) * 0.4
        }
        return -1.2 - Float(line.elevationOffset) * 0.34
    }
}

private enum ParisGeometryBuilder {
    static func ribbonGeometry(points: [SCNVector3], width: Float) -> SCNGeometry {
        var vertices: [SCNVector3] = []
        var indices: [Int32] = []
        let halfW = width * 0.5

        for i in 0..<points.count {
            let p = points[i]
            let prev = i > 0 ? points[i - 1] : p
            let next = i < points.count - 1 ? points[i + 1] : p
            let tx = next.x - prev.x
            let tz = next.z - prev.z
            let len = max(0.0001, sqrtf(tx * tx + tz * tz))
            let nx = -tz / len * halfW
            let nz = tx / len * halfW

            vertices.append(SCNVector3(p.x - nx, p.y, p.z - nz))
            vertices.append(SCNVector3(p.x + nx, p.y, p.z + nz))

            if i > 0 {
                let base = Int32((i - 1) * 2)
                indices.append(contentsOf: [base, base + 1, base + 2, base + 1, base + 3, base + 2])
            }
        }

        let source = SCNGeometrySource(vertices: vertices)
        let element = SCNGeometryElement(indices: indices, primitiveType: .triangles)
        return SCNGeometry(sources: [source], elements: [element])
    }
}
