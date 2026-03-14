import Foundation

struct UsageReader {
  static let appGroupId = "group.ai.openusage.local"
  static let fileName = "usage.json"

  static func load() -> UsagePayload? {
    guard let data = loadData() else { return nil }
    return try? JSONDecoder().decode(UsagePayload.self, from: data)
  }

  static func loadData() -> Data? {
    let fm = FileManager.default
    if let container = fm.containerURL(forSecurityApplicationGroupIdentifier: appGroupId) {
      let url = container.appendingPathComponent(fileName)
      return try? Data(contentsOf: url)
    }
    let fallback = fm.homeDirectoryForCurrentUser
      .appendingPathComponent("Library")
      .appendingPathComponent("Group Containers")
      .appendingPathComponent(appGroupId)
      .appendingPathComponent(fileName)
    return try? Data(contentsOf: fallback)
  }
}
