import SwiftUI

@main
struct OpenUsageWidgetApp: App {
  var body: some Scene {
    WindowGroup {
      ContentView()
    }
  }
}

struct ContentView: View {
  @State private var payload = UsageReader.load()

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("OpenUsage Widget Host")
        .font(.title2)
        .fontWeight(.semibold)
      Text("This app hosts the WidgetKit extension.")
        .font(.body)
      if let payload {
        Text("Last update: \(payload.generatedAt ?? "unknown")")
          .font(.caption)
          .foregroundStyle(.secondary)
      } else {
        Text("No usage data yet.")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
      Button("Reload") {
        payload = UsageReader.load()
      }
      .buttonStyle(.bordered)
      Spacer()
    }
    .padding(20)
    .frame(minWidth: 360, minHeight: 220)
  }
}
