import SwiftUI
import WidgetKit

struct UsageEntry: TimelineEntry {
  let date: Date
  let payload: UsagePayload?
}

struct UsageTimelineProvider: TimelineProvider {
  func placeholder(in context: Context) -> UsageEntry {
    UsageEntry(date: Date(), payload: UsagePayload.sample)
  }

  func getSnapshot(in context: Context, completion: @escaping (UsageEntry) -> Void) {
    if context.isPreview {
      completion(UsageEntry(date: Date(), payload: UsagePayload.sample))
      return
    }
    let payload = UsageReader.load()
    completion(UsageEntry(date: Date(), payload: payload))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<UsageEntry>) -> Void) {
    let payload = UsageReader.load()
    let entry = UsageEntry(date: Date(), payload: payload)
    let refresh = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date().addingTimeInterval(900)
    let timeline = Timeline(entries: [entry], policy: .after(refresh))
    completion(timeline)
  }
}

struct OpenUsageWidgetEntryView: View {
  let entry: UsageEntry

  var body: some View {
    WidgetRootView(payload: entry.payload)
  }
}

@main
struct OpenUsageWidget: Widget {
  let kind = "OpenUsageWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: UsageTimelineProvider()) { entry in
      OpenUsageWidgetEntryView(entry: entry)
    }
    .configurationDisplayName("OpenUsage")
    .description("Usage summary from OpenUsage")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}
