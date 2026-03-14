import SwiftUI
import WidgetKit

struct WidgetRootView: View {
  let payload: UsagePayload?

  @Environment(\.widgetFamily) private var family

  var body: some View {
    switch family {
    case .systemSmall:
      SmallWidgetView(payload: payload)
    case .systemMedium:
      MediumWidgetView(payload: payload)
    default:
      LargeWidgetView(payload: payload)
    }
  }
}

struct SmallWidgetView: View {
  let payload: UsagePayload?

  var body: some View {
    let displayMode = payload?.displayMode ?? .used
    VStack(alignment: .leading, spacing: 6) {
      HeaderView(title: "OpenUsage", subtitle: formattedTime(payload?.generatedAt))
      if let payload, !payload.providers.isEmpty {
        ForEach(payload.providers.prefix(2)) { provider in
          ProviderSummaryRow(provider: provider, displayMode: displayMode)
        }
      } else {
        Text("No data")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
      Spacer(minLength: 0)
    }
    .padding(12)
  }
}

struct MediumWidgetView: View {
  let payload: UsagePayload?

  var body: some View {
    let displayMode = payload?.displayMode ?? .used
    VStack(alignment: .leading, spacing: 8) {
      HeaderView(title: "OpenUsage", subtitle: formattedTime(payload?.generatedAt))
      if let payload, !payload.providers.isEmpty {
        ForEach(payload.providers.prefix(3)) { provider in
          ProviderBlockView(provider: provider, displayMode: displayMode, maxLines: 2, maxSectionLines: 1)
        }
      } else {
        Text("No data")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
      Spacer(minLength: 0)
    }
    .padding(12)
  }
}

struct LargeWidgetView: View {
  let payload: UsagePayload?

  var body: some View {
    let displayMode = payload?.displayMode ?? .used
    VStack(alignment: .leading, spacing: 10) {
      HeaderView(title: "OpenUsage", subtitle: formattedTime(payload?.generatedAt))
      if let payload, !payload.providers.isEmpty {
        ForEach(payload.providers) { provider in
          ProviderBlockView(provider: provider, displayMode: displayMode, maxLines: 4, maxSectionLines: 2)
        }
      } else {
        Text("No data")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
      Spacer(minLength: 0)
    }
    .padding(12)
  }
}

struct HeaderView: View {
  let title: String
  let subtitle: String?

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 6) {
      Text(title)
        .font(.headline)
      Spacer(minLength: 0)
      if let subtitle {
        Text(subtitle)
          .font(.caption2)
          .foregroundStyle(.secondary)
      }
    }
  }
}

struct ProviderSummaryRow: View {
  let provider: ProviderUsage
  let displayMode: DisplayMode

  var body: some View {
    let summary = provider.flattenedLines().first.map { WidgetFormatter.summary(for: $0, displayMode: displayMode) } ?? ""
    HStack {
      Text(provider.name)
        .font(.caption)
        .fontWeight(.semibold)
      Spacer(minLength: 0)
      Text(summary)
        .font(.caption)
        .foregroundStyle(.secondary)
        .lineLimit(1)
    }
  }
}

struct ProviderBlockView: View {
  let provider: ProviderUsage
  let displayMode: DisplayMode
  let maxLines: Int
  let maxSectionLines: Int

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      ProviderHeaderView(provider: provider)
      if let error = provider.error, !error.isEmpty {
        Text(error)
          .font(.caption2)
          .foregroundStyle(.red)
          .lineLimit(2)
      } else if provider.hasSections {
        ForEach(provider.sections) { section in
          if !section.label.isEmpty {
            Text(section.label)
              .font(.caption2)
              .foregroundStyle(.secondary)
          }
          ForEach(section.lines.prefix(maxSectionLines)) { line in
            MetricLineView(line: line, displayMode: displayMode)
          }
        }
      } else {
        ForEach(provider.lines.prefix(maxLines)) { line in
          MetricLineView(line: line, displayMode: displayMode)
        }
      }
    }
  }
}

struct ProviderHeaderView: View {
  let provider: ProviderUsage

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 6) {
      Text(provider.name)
        .font(.subheadline)
        .fontWeight(.semibold)
      if let plan = provider.plan, !plan.isEmpty {
        Text(plan)
          .font(.caption2)
          .padding(.horizontal, 6)
          .padding(.vertical, 2)
          .background(Color.gray.opacity(0.2))
          .clipShape(Capsule())
      }
      Spacer(minLength: 0)
    }
  }
}

struct MetricLineView: View {
  let line: MetricLine
  let displayMode: DisplayMode

  var body: some View {
    switch line.type {
    case "progress":
      ProgressLineView(line: line, displayMode: displayMode)
    case "badge", "text":
      TextLineView(line: line, displayMode: displayMode)
    default:
      EmptyView()
    }
  }
}

struct TextLineView: View {
  let line: MetricLine
  let displayMode: DisplayMode

  var body: some View {
    let summary = WidgetFormatter.summary(for: line, displayMode: displayMode)
    HStack {
      Text(line.label)
        .font(.caption2)
        .foregroundStyle(.secondary)
      Spacer(minLength: 0)
      Text(summary)
        .font(.caption2)
        .foregroundStyle(.secondary)
        .lineLimit(1)
    }
  }
}

struct ProgressLineView: View {
  let line: MetricLine
  let displayMode: DisplayMode

  var body: some View {
    let summary = WidgetFormatter.summary(for: line, displayMode: displayMode)
    VStack(alignment: .leading, spacing: 2) {
      HStack {
        Text(line.label)
          .font(.caption2)
          .foregroundStyle(.secondary)
        Spacer(minLength: 0)
        Text(summary)
          .font(.caption2)
          .foregroundStyle(.secondary)
          .lineLimit(1)
      }
      if let fraction = WidgetFormatter.progressFraction(for: line, displayMode: displayMode) {
        ProgressView(value: fraction)
          .progressViewStyle(.linear)
      }
    }
  }
}

private func formattedTime(_ iso: String?) -> String? {
  guard let iso, let date = ISO8601DateFormatter().date(from: iso) else { return nil }
  let formatter = DateFormatter()
  formatter.dateStyle = .none
  formatter.timeStyle = .short
  return formatter.string(from: date)
}
