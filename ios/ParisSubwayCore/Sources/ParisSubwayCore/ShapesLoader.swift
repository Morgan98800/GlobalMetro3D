import Foundation
import CoreLocation

public struct ShapePolyline: Sendable {
    public let id: String
    /// Flat [lng, lat, lng, lat, ...]
    public let coords: [Double]
    public let distancesM: [Double]
    public let lengthM: Double

    public var pointCount: Int { distancesM.count }
}

public enum ShapesLoader {
    private static let magicV2: UInt32 = 0x53485032 // 'SHP2' BE
    private static let scale: Double = 1e-7

    public static func decode(data: Data) throws -> [String: ShapePolyline] {
        guard data.count >= 8 else { return [:] }
        let magicBE = data.withUnsafeBytes { raw -> UInt32 in
            let b0 = UInt32(raw[0]) << 24
            let b1 = UInt32(raw[1]) << 16
            let b2 = UInt32(raw[2]) << 8
            let b3 = UInt32(raw[3])
            return b0 | b1 | b2 | b3
        }
        if magicBE == magicV2 {
            return decodeV2(data: data)
        }
        return decodeV1(data: data)
    }

    private static func readUInt16LE(_ data: Data, at offset: Int) -> UInt16 {
        UInt16(data[offset]) | (UInt16(data[offset + 1]) << 8)
    }

    private static func readUInt32LE(_ data: Data, at offset: Int) -> UInt32 {
        UInt32(data[offset])
            | (UInt32(data[offset + 1]) << 8)
            | (UInt32(data[offset + 2]) << 16)
            | (UInt32(data[offset + 3]) << 24)
    }

    private static func readInt16LE(_ data: Data, at offset: Int) -> Int16 {
        Int16(bitPattern: readUInt16LE(data, at: offset))
    }

    private static func readInt32LE(_ data: Data, at offset: Int) -> Int32 {
        Int32(bitPattern: readUInt32LE(data, at: offset))
    }

    private static func readFloat32LE(_ data: Data, at offset: Int) -> Float {
        Float(bitPattern: readUInt32LE(data, at: offset))
    }

    private static func decodeV2(data: Data) -> [String: ShapePolyline] {
        var result: [String: ShapePolyline] = [:]
        let shapeCount = Int(readUInt16LE(data, at: 6))
        result.reserveCapacity(shapeCount)
        var off = 8

        for _ in 0..<shapeCount {
            guard off + 2 <= data.count else { break }
            let idLen = Int(readUInt16LE(data, at: off))
            off += 2
            guard off + idLen <= data.count else { break }
            let id = String(decoding: data[off..<(off + idLen)], as: UTF8.self)
            off += idLen
            off += (4 - (off % 4)) % 4

            guard off + 20 <= data.count else { break }
            let pointCount = Int(readUInt32LE(data, at: off))
            off += 4
            let step = Double(readFloat32LE(data, at: off))
            off += 4
            let tailLength = Double(readFloat32LE(data, at: off))
            off += 4
            var lngQ = Int64(readInt32LE(data, at: off))
            off += 4
            var latQ = Int64(readInt32LE(data, at: off))
            off += 4

            guard pointCount > 0, off + (pointCount - 1) * 4 <= data.count else { break }
            var coords = [Double](repeating: 0, count: pointCount * 2)
            var dist = [Double](repeating: 0, count: pointCount)
            coords[0] = Double(lngQ) * scale
            coords[1] = Double(latQ) * scale
            dist[0] = 0

            for i in 1..<pointCount {
                lngQ += Int64(readInt16LE(data, at: off))
                off += 2
                latQ += Int64(readInt16LE(data, at: off))
                off += 2
                coords[i * 2] = Double(lngQ) * scale
                coords[i * 2 + 1] = Double(latQ) * scale
                dist[i] = (i == pointCount - 1) ? Double(i - 1) * step + tailLength : Double(i) * step
            }

            result[id] = ShapePolyline(
                id: id,
                coords: coords,
                distancesM: dist,
                lengthM: dist[pointCount - 1]
            )
        }
        return result
    }

    private static func decodeV1(data: Data) -> [String: ShapePolyline] {
        guard data.count >= 32 else { return [:] }
        let magicStr = String(decoding: data[0..<4], as: UTF8.self)
        guard magicStr == "MSHP" else { return [:] }
        let shapeCount = Int(readUInt16LE(data, at: 6))
        let tableOffset = 32
        let entrySize = 64
        let dataStart = tableOffset + shapeCount * entrySize
        var result: [String: ShapePolyline] = [:]

        for i in 0..<shapeCount {
            let entryStart = tableOffset + i * entrySize
            guard entryStart + entrySize <= data.count else { break }
            let idSlice = data[entryStart..<(entryStart + 32)]
            let nulIdx = idSlice.firstIndex(of: 0) ?? idSlice.endIndex
            let id = String(decoding: idSlice[..<nulIdx], as: UTF8.self)
            let ptCount = Int(readUInt32LE(data, at: entryStart + 52))
            let byteOffset = Int(readUInt32LE(data, at: entryStart + 60))
            let start = dataStart + byteOffset
            guard ptCount > 0, start + ptCount * 12 <= data.count else { continue }

            var coords = [Double](repeating: 0, count: ptCount * 2)
            var dist = [Double](repeating: 0, count: ptCount)
            for j in 0..<ptCount {
                let pOff = start + j * 12
                coords[j * 2] = Double(readFloat32LE(data, at: pOff))
                coords[j * 2 + 1] = Double(readFloat32LE(data, at: pOff + 4))
                dist[j] = Double(readFloat32LE(data, at: pOff + 8))
            }
            result[id] = ShapePolyline(
                id: id,
                coords: coords,
                distancesM: dist,
                lengthM: dist[ptCount - 1]
            )
        }
        return result
    }

    public static func coordinate(on shape: ShapePolyline, atDistance targetM: Double) -> CLLocationCoordinate2D {
        let n = shape.pointCount
        guard n > 0 else { return CLLocationCoordinate2D(latitude: 48.8566, longitude: 2.3522) }
        if targetM <= 0 || n == 1 {
            return CLLocationCoordinate2D(latitude: shape.coords[1], longitude: shape.coords[0])
        }
        if targetM >= shape.lengthM {
            return CLLocationCoordinate2D(latitude: shape.coords[(n - 1) * 2 + 1], longitude: shape.coords[(n - 1) * 2])
        }

        // Binary search on monotonically increasing distancesM
        var lo = 0
        var hi = n - 1
        while lo + 1 < hi {
            let mid = (lo + hi) >> 1
            if shape.distancesM[mid] <= targetM {
                lo = mid
            } else {
                hi = mid
            }
        }

        let d0 = shape.distancesM[lo]
        let d1 = shape.distancesM[hi]
        let span = max(1e-6, d1 - d0)
        let frac = max(0, min(1, (targetM - d0) / span))
        let lng = shape.coords[lo * 2] + (shape.coords[hi * 2] - shape.coords[lo * 2]) * frac
        let lat = shape.coords[lo * 2 + 1] + (shape.coords[hi * 2 + 1] - shape.coords[lo * 2 + 1]) * frac
        return CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }

    public static func smoothedBearing(on shape: ShapePolyline, atDistance distM: Double, windowM: Double = 80) -> Double {
        let p1 = coordinate(on: shape, atDistance: max(0, distM - windowM))
        let p2 = coordinate(on: shape, atDistance: min(shape.lengthM, distM + windowM))
        let phi1 = p1.latitude * .pi / 180
        let phi2 = p2.latitude * .pi / 180
        let dLam = (p2.longitude - p1.longitude) * .pi / 180
        let y = sin(dLam) * cos(phi2)
        let x = cos(phi1) * sin(phi2) - sin(phi1) * cos(phi2) * cos(dLam)
        let deg = atan2(y, x) * 180 / .pi
        return (deg + 360).truncatingRemainder(dividingBy: 360)
    }
}
