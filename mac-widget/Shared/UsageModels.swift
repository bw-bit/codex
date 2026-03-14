import Foundation

enum DisplayMode: String, Codable {
  case used
  case left

  init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    let raw = (try? container.decode(String.self)) ?? "used"
    self = DisplayMode(rawValue: raw) ?? .used
  }
}

struct UsagePayload: Codable {
  let generatedAt: String?
  let displayMode: DisplayMode
  let providers: [ProviderUsage]

  init(generatedAt: String?, displayMode: DisplayMode, providers: [ProviderUsage]) {
    self.generatedAt = generatedAt
    self.displayMode = displayMode
    self.providers = providers
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    generatedAt = try container.decodeIfPresent(String.self, forKey: .generatedAt)
    displayMode = (try? container.decode(DisplayMode.self, forKey: .displayMode)) ?? .used
    providers = try container.decodeIfPresent([ProviderUsage].self, forKey: .providers) ?? []
  }

  static var sample: UsagePayload {
    UsagePayload(
      generatedAt: "2026-02-08T00:00:00Z",
      displayMode: .used,
      providers: [
        ProviderUsage(
          id: "codex",
          name: "Codex",
          plan: "Pro",
          lines: [
            MetricLine.progress(label: "Session", used: 73, limit: 100, format: ProgressFormat(kind: "percent", suffix: nil)),
            MetricLine.progress(label: "Weekly", used: 9, limit: 100, format: ProgressFormat(kind: "percent", suffix: nil)),
          ],
          sections: [],
          error: nil
        ),
        ProviderUsage(
          id: "claude",
          name: "Claude",
          plan: "Max",
          lines: [
            MetricLine.progress(label: "Session", used: 0, limit: 100, format: ProgressFormat(kind: "percent", suffix: nil)),
          ],
          sections: [],
          error: nil
        ),
      ]
    )
  }
}

struct ProviderUsage: Codable, Identifiable {
  let id: String
  let name: String
  let plan: String?
  let lines: [MetricLine]
  let sections: [ProviderSection]
  let error: String?

  init(id: String, name: String, plan: String?, lines: [MetricLine], sections: [ProviderSection], error: String?) {
    self.id = id
    self.name = name
    self.plan = plan
    self.lines = lines
    self.sections = sections
    self.error = error
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    id = try container.decodeIfPresent(String.self, forKey: .id) ?? "unknown"
    name = try container.decodeIfPresent(String.self, forKey: .name) ?? id
    plan = try container.decodeIfPresent(String.self, forKey: .plan)
    lines = try container.decodeIfPresent([MetricLine].self, forKey: .lines) ?? []
    sections = try container.decodeIfPresent([ProviderSection].self, forKey: .sections) ?? []
    error = try container.decodeIfPresent(String.self, forKey: .error)
  }

  var hasSections: Bool {
    !sections.isEmpty
  }

  func flattenedLines() -> [MetricLine] {
    if hasSections {
      return sections.flatMap { $0.lines }
    }
    return lines
  }
}

struct ProviderSection: Codable, Identifiable {
  let id: String
  let label: String
  let plan: String?
  let subtitle: String?
  let lines: [MetricLine]

  init(id: String, label: String, plan: String?, subtitle: String?, lines: [MetricLine]) {
    self.id = id
    self.label = label
    self.plan = plan
    self.subtitle = subtitle
    self.lines = lines
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    id = try container.decodeIfPresent(String.self, forKey: .id) ?? UUID().uuidString
    label = try container.decodeIfPresent(String.self, forKey: .label) ?? ""
    plan = try container.decodeIfPresent(String.self, forKey: .plan)
    subtitle = try container.decodeIfPresent(String.self, forKey: .subtitle)
    lines = try container.decodeIfPresent([MetricLine].self, forKey: .lines) ?? []
  }
}

struct ProgressFormat: Codable {
  let kind: String
  let suffix: String?
}

struct MetricLine: Codable, Identifiable {
  let id: UUID
  let type: String
  let label: String
  let value: String?
  let text: String?
  let used: Double?
  let limit: Double?
  let format: ProgressFormat?
  let resetsAt: String?

  init(type: String, label: String, value: String?, text: String?, used: Double?, limit: Double?, format: ProgressFormat?, resetsAt: String?) {
    self.id = UUID()
    self.type = type
    self.label = label
    self.value = value
    self.text = text
    self.used = used
    self.limit = limit
    self.format = format
    self.resetsAt = resetsAt
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    id = UUID()
    type = try container.decodeIfPresent(String.self, forKey: .type) ?? ""
    label = try container.decodeIfPresent(String.self, forKey: .label) ?? ""
    value = try container.decodeIfPresent(String.self, forKey: .value)
    text = try container.decodeIfPresent(String.self, forKey: .text)
    used = try container.decodeIfPresent(Double.self, forKey: .used)
    limit = try container.decodeIfPresent(Double.self, forKey: .limit)
    format = try container.decodeIfPresent(ProgressFormat.self, forKey: .format)
    resetsAt = try container.decodeIfPresent(String.self, forKey: .resetsAt)
  }

  static func progress(label: String, used: Double, limit: Double, format: ProgressFormat) -> MetricLine {
    MetricLine(type: "progress", label: label, value: nil, text: nil, used: used, limit: limit, format: format, resetsAt: nil)
  }
}
