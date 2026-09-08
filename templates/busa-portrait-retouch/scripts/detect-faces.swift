import AppKit
import Foundation
import Vision

guard CommandLine.arguments.count == 2 else {
  fputs("usage: detect-faces.swift IMAGE\n", stderr)
  exit(2)
}

let url = URL(fileURLWithPath: CommandLine.arguments[1])
guard let image = NSImage(contentsOf: url),
      let data = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: data),
      let cgImage = bitmap.cgImage else {
  fputs("could not decode image\n", stderr)
  exit(1)
}

let request = VNDetectFaceRectanglesRequest()
let handler = VNImageRequestHandler(cgImage: cgImage, orientation: .up)

do {
  try handler.perform([request])
  let faces = (request.results ?? []).map { observation in
    let box = observation.boundingBox
    return ["x": box.origin.x, "y": box.origin.y, "width": box.width, "height": box.height]
  }
  let output = try JSONSerialization.data(withJSONObject: faces)
  print(String(data: output, encoding: .utf8) ?? "[]")
} catch {
  fputs("face detection failed\n", stderr)
  exit(1)
}
