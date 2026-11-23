import Foundation
import SceneKit
import SwiftUI

/// Chargeur et cache natif SceneKit pour les modèles 3D `.usdz` convertis depuis `web/public/models/train/*.glb`.
@MainActor
public final class TrainModelLoader {
    public static let shared = TrainModelLoader()

    private var cache: [String: SCNNode] = [:]

    private init() {}

    public enum CarRole {
        case cab
        case neutral
        case tail
    }

    /// Résout le nom de base `.usdz` correspondant à la ligne et au matériel roulant parisien.
    public func familyBaseName(lineShortName: String, stockName: String? = nil) -> String {
        let upper = lineShortName.uppercased()
        if ["A", "B", "C", "D", "E"].contains(upper) {
            return "rer_generic_\(upper)"
        }
        if let stock = stockName {
            if stock.contains("MF77") { return "paris_mf77__neutral" }
            if stock.contains("MP14") || stock.contains("MP05") || stock.contains("MP89") {
                return "paris_idfm_pneu__neutral"
            }
            if stock.contains("MF01") { return "paris_idfm_steel__neutral" }
            if stock.contains("MF67") { return "steel_classic__neutral" }
        }
        switch upper {
        case "1", "4", "11", "14":
            return "paris_idfm_pneu__neutral"
        case "2", "5", "9":
            return "paris_idfm_steel__neutral"
        case "7", "8", "13":
            return "paris_mf77__neutral"
        case "6":
            return "pneumatic_generic__neutral"
        default:
            return "steel_classic__neutral"
        }
    }

    public func resourceName(lineShortName: String, stockName: String? = nil, role: CarRole) -> String {
        let base = familyBaseName(lineShortName: lineShortName, stockName: stockName)
        let isRer = base.hasPrefix("rer_generic_")
        switch role {
        case .cab:
            return isRer ? "\(base)__cab" : "\(base)__cab"
        case .tail:
            return isRer ? "\(base)__tail" : "\(base)__tail"
        case .neutral:
            return isRer ? "\(base)__neutral" : base
        }
    }

    /// Retourne un `SCNNode` cloné et normalisé aux dimensions cibles (`targetLength` en unités SceneKit).
    public func carNode(
        lineShortName: String,
        stockName: String? = nil,
        role: CarRole,
        targetLength: Float,
        lineColor: UIColor? = nil
    ) -> SCNNode? {
        let resName = resourceName(lineShortName: lineShortName, stockName: stockName, role: role)
        let proto: SCNNode
        if let cached = cache[resName] {
            proto = cached
        } else {
            guard let url = Bundle.main.url(forResource: resName, withExtension: "usdz", subdirectory: "Models")
                    ?? Bundle.main.url(forResource: resName, withExtension: "usdz"),
                  let loadedScene = try? SCNScene(url: url, options: nil) else {
                return nil
            }
            let container = SCNNode()
            for child in loadedScene.rootNode.childNodes {
                container.addChildNode(child.clone())
            }
            cache[resName] = container
            proto = container
        }

        let clone = proto.clone()
        let (minB, maxB) = clone.boundingBox
        let sizeX = max(0.001, maxB.x - minB.x)
        let sizeY = max(0.001, maxB.y - minB.y)
        let sizeZ = max(0.001, maxB.z - minB.z)
        let maxHoriz = max(sizeX, sizeZ)
        let scaleFactor = targetLength / maxHoriz

        clone.scale = SCNVector3(scaleFactor, scaleFactor, scaleFactor)
        // Blender exports Y-up or Z-forward; align longest horizontal axis along Z (track direction)
        if sizeX > sizeZ {
            clone.eulerAngles.y = Float.pi / 2
        }
        // Rest car bottom cleanly at y = 0
        let centerY = (minB.y + maxB.y) * 0.5 * scaleFactor
        let halfH = sizeY * 0.5 * scaleFactor
        clone.position.y = halfH - centerY

        if let col = lineColor {
            let stripe = SCNBox(
                width: CGFloat(targetLength * 0.22),
                height: CGFloat(targetLength * 0.04),
                length: CGFloat(targetLength * 0.92),
                chamferRadius: 0
            )
            stripe.firstMaterial?.diffuse.contents = col
            stripe.firstMaterial?.emission.contents = col.withAlphaComponent(0.35)
            let stripeNode = SCNNode(geometry: stripe)
            stripeNode.position = SCNVector3(0, halfH * 0.65, 0)
            clone.addChildNode(stripeNode)
        }

        return clone
    }
}
