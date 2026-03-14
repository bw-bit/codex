import Foundation

struct WidgetFormatter {
  static func progressFraction(for line: MetricLine, displayMode: DisplayMode) -> Double? {
    guard line.type == "progress", let used = line.used, let limit = line.limit, limit > 0 else {
      return nil
    }
    let shown = displayMode == .used ? used : max(0, limit - used)
    let fraction = shown / limit
    if fraction < 0 { return 0 }
    if fraction > 1 { return 1 }
    return fraction
  }

  static func summary(for line: MetricLine, displayMode: DisplayMode) -> String {
    switch line.type {
    case "text":
      return line.value ?? ""
    case "badge":
      return line.text ?? ""
    case "progress":
      guard let used = line.used, let limit = line.limit else { return "" }
      let shown = displayMode == .used ? used : max(0, limit - used)
      let leftSuffix = displayMode == .left ? " left" : ""
      let kind = line.format?.kind ?? "count"
      if kind == "percent" {
        return "\(Int(shown.rounded()))%\(leftSuffix)"
      }
      if kind == "dollars" {
        return "$\(formatNumber(shown))\(leftSuffix)"
      }
      if kind == "count" {
        let suffix = line.format?.suffix ?? "units"
        return "\(formatNumber(shown)) \(suffix)\(leftSuffix)"
      }
      return "\(formatNumber(shown))\(leftSuffix)"
    default:
      return ""
    }
  }

  static func formatNumber(_ value: Double) -> String {
    let formatter = NumberFormatter()
    formatter.numberStyle = .decimal
    formatter.maximumFractionDigits = value.rounded() == value ? 0 : 2
    return formatter.string(from: NSNumber(value: value)) ?? String(value)
  }
}
