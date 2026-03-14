(function () {
  var PROVIDER_ID = "zai"
  var PROVIDERS_CONFIG = "providers.json"

  function getProvidersConfigPath(ctx) {
    return ctx.app.appDataDir + "/" + PROVIDERS_CONFIG
  }

  function normalizeAccount(raw, index) {
    if (!raw || typeof raw !== "object") return null
    var id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : "account-" + (index + 1)
    var label = typeof raw.label === "string" && raw.label.trim() ? raw.label.trim() : "Account " + (index + 1)
    var authType = typeof raw.authType === "string" ? raw.authType : null
    var authRef = typeof raw.authRef === "string" && raw.authRef.trim() ? raw.authRef.trim() : null
    var meta = raw.meta && typeof raw.meta === "object" ? raw.meta : null
    if (!authType) return null
    return { id: id, label: label, authType: authType, authRef: authRef, meta: meta }
  }

  function loadAccounts(ctx) {
    var path = getProvidersConfigPath(ctx)
    if (!ctx.host.fs.exists(path)) return []
    try {
      var text = ctx.host.fs.readText(path)
      var json = ctx.util.tryParseJson(text)
      var accounts = json && json.providers && json.providers[PROVIDER_ID] && json.providers[PROVIDER_ID].accounts
      if (!Array.isArray(accounts)) return []
      var out = []
      for (var i = 0; i < accounts.length; i++) {
        var normalized = normalizeAccount(accounts[i], i)
        if (normalized) out.push(normalized)
      }
      return out
    } catch (e) {
      ctx.host.log.warn("providers config read failed: " + String(e))
      return []
    }
  }

  function readSecret(ctx, account) {
    if (!account.authRef) throw "Missing keychain secret for account."
    try {
      return ctx.host.keychain.readGenericPassword(account.authRef)
    } catch (e) {
      ctx.host.log.warn("keychain read failed: " + String(e))
      throw "Keychain secret missing."
    }
  }

  function splitPath(path) {
    var out = []
    var buf = ""
    for (var i = 0; i < path.length; i++) {
      var ch = path[i]
      if (ch === ".") {
        if (buf) out.push(buf)
        buf = ""
        continue
      }
      if (ch === "[") {
        if (buf) out.push(buf)
        buf = ""
        var end = path.indexOf("]", i)
        if (end === -1) break
        var idx = path.slice(i + 1, end)
        if (idx) out.push(idx)
        i = end
        continue
      }
      buf += ch
    }
    if (buf) out.push(buf)
    return out
  }

  function readPath(obj, path) {
    if (!path || !obj) return null
    var parts = splitPath(String(path))
    var cur = obj
    for (var i = 0; i < parts.length; i++) {
      if (cur === null || cur === undefined) return null
      var key = parts[i]
      if (/^\d+$/.test(key)) {
        var idx = Number(key)
        cur = cur[idx]
      } else {
        cur = cur[key]
      }
    }
    return cur
  }

  function readNumber(value) {
    var n = Number(value)
    return Number.isFinite(n) ? n : null
  }

  function extractUsage(ctx, data, meta) {
    var used = null
    var limit = null
    var remaining = null

    if (meta && meta.usedPath) used = readNumber(readPath(data, meta.usedPath))
    if (meta && meta.limitPath) limit = readNumber(readPath(data, meta.limitPath))
    if (meta && meta.remainingPath) remaining = readNumber(readPath(data, meta.remainingPath))

    if (used === null) {
      used = readNumber(readPath(data, "usage.used"))
      if (used === null) used = readNumber(readPath(data, "data.usage.used"))
      if (used === null) used = readNumber(readPath(data, "used"))
    }

    if (limit === null) {
      limit = readNumber(readPath(data, "usage.limit"))
      if (limit === null) limit = readNumber(readPath(data, "data.usage.limit"))
      if (limit === null) limit = readNumber(readPath(data, "limit"))
      if (limit === null) limit = readNumber(readPath(data, "total"))
      if (limit === null) limit = readNumber(readPath(data, "quota"))
    }

    if (remaining === null) {
      remaining = readNumber(readPath(data, "usage.remaining"))
      if (remaining === null) remaining = readNumber(readPath(data, "data.usage.remaining"))
      if (remaining === null) remaining = readNumber(readPath(data, "remaining"))
    }

    if (used === null && remaining !== null && limit !== null) used = limit - remaining
    if (limit === null && remaining !== null && used !== null) limit = used + remaining

    if (used === null || limit === null || limit <= 0) {
      throw "Missing usage fields. Configure JSON paths."
    }

    var resetsAt = null
    if (meta && meta.resetAtPath) {
      resetsAt = ctx.util.toIso(readPath(data, meta.resetAtPath))
    } else {
      resetsAt = ctx.util.toIso(readPath(data, "resetAt")) || ctx.util.toIso(readPath(data, "resetsAt"))
    }

    var plan = null
    if (meta && meta.planPath) {
      var planValue = readPath(data, meta.planPath)
      if (planValue) plan = String(planValue)
    } else if (data && data.plan) {
      plan = String(data.plan)
    }

    return { used: used, limit: limit, resetsAt: resetsAt, plan: plan }
  }

  function resolveFormat(meta, used, limit) {
    if (meta && meta.formatKind) {
      if (meta.formatKind === "dollars") return { kind: "dollars" }
      if (meta.formatKind === "percent") return { kind: "percent" }
      if (meta.formatKind === "count" && meta.formatSuffix) return { kind: "count", suffix: String(meta.formatSuffix) }
    }
    if (limit <= 100 && used <= 100) return { kind: "percent" }
    return { kind: "count", suffix: "units" }
  }

  function fetchUsage(ctx, account, secret) {
    var meta = account.meta || {}
    var url = meta.usageUrl
    if (!url) throw "Usage URL required."
    var headers = {
      Accept: "application/json",
      "User-Agent": "OpenUsage",
    }
    if (account.authType === "cookie") {
      headers.Cookie = secret
    } else if (account.authType === "apiKey") {
      headers.Authorization = "Bearer " + secret
    } else {
      throw "Unsupported auth type."
    }
    var resp = ctx.util.request({
      method: "GET",
      url: url,
      headers: headers,
      timeoutMs: 10000,
    })
    if (resp.status < 200 || resp.status >= 300) {
      throw "Usage request failed (HTTP " + String(resp.status) + ")"
    }
    var data = ctx.util.tryParseJson(resp.bodyText)
    if (data === null) {
      throw "Usage response invalid."
    }
    return data
  }

  function probeAccount(ctx, account) {
    if (!account || !account.authType) throw "Missing account configuration."
    if (account.authType !== "cookie" && account.authType !== "apiKey") {
      throw "Unsupported auth type."
    }
    var secret = readSecret(ctx, account)
    var data = fetchUsage(ctx, account, secret)
    var usage = extractUsage(ctx, data, account.meta || {})

    var format = resolveFormat(account.meta || {}, usage.used, usage.limit)
    var label = (account.meta && account.meta.label) ? String(account.meta.label) : "Usage"

    var lines = [ctx.line.progress({
      label: label,
      used: usage.used,
      limit: usage.limit,
      format: format,
      resetsAt: usage.resetsAt || undefined,
    })]

    if (lines.length === 0) throw "No usage data."
    return { plan: usage.plan || null, lines: lines }
  }

  function errorLine(ctx, message) {
    return ctx.line.badge({ label: "Error", text: message })
  }

  function probe(ctx) {
    var accounts = loadAccounts(ctx)
    if (!accounts || accounts.length === 0) {
      throw "No accounts configured. Add one in Settings."
    }
    var sections = []
    for (var i = 0; i < accounts.length; i++) {
      var account = accounts[i]
      try {
        var result = probeAccount(ctx, account)
        sections.push({ id: account.id, label: account.label, plan: result.plan, lines: result.lines })
      } catch (e) {
        var msg = typeof e === "string" ? e : "Probe failed"
        sections.push({ id: account.id, label: account.label, lines: [errorLine(ctx, msg)] })
      }
    }
    return { lines: [], sections: sections }
  }

  globalThis.__openusage_plugin = { id: PROVIDER_ID, probe: probe }
})()
