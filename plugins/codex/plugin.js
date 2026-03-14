(function () {
  const AUTH_FILE = "auth.json"
  const CONFIG_AUTH_PATHS = ["~/.config/codex", "~/.codex"]
  const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"
  const REFRESH_URL = "https://auth.openai.com/oauth/token"
  const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage"
  const REFRESH_AGE_MS = 8 * 24 * 60 * 60 * 1000
  const PROVIDERS_CONFIG = "providers.json"

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
      var accounts = json && json.providers && json.providers.codex && json.providers.codex.accounts
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

  function joinPath(base, leaf) {
    return base.replace(/[\\/]+$/, "") + "/" + leaf
  }

  function readCodexHome(ctx) {
    if (!ctx.host.env || typeof ctx.host.env.get !== "function") {
      return null
    }

    try {
      const value = ctx.host.env.get("CODEX_HOME")
      if (typeof value !== "string") return null
      const trimmed = value.trim()
      return trimmed || null
    } catch (e) {
      ctx.host.log.warn("CODEX_HOME read failed: " + String(e))
      return null
    }
  }

  function resolveAuthPath(ctx) {
    const codexHome = readCodexHome(ctx)

    // If CODEX_HOME is set, use it
    if (codexHome) {
      return joinPath(codexHome, AUTH_FILE)
    }

    // Otherwise, return the first existing auth file path
    for (const basePath of CONFIG_AUTH_PATHS) {
      const authPath = joinPath(basePath, AUTH_FILE)
      if (ctx.host.fs.exists(authPath)) {
        return authPath
      }
    }

    return null
  }

  function loadAuth(ctx) {
    const authPath = resolveAuthPath(ctx)

    if (!authPath || !ctx.host.fs.exists(authPath)) {
      ctx.host.log.warn("auth file not found: " + authPath)
      return null
    }

    try {
      const text = ctx.host.fs.readText(authPath)
      const auth = ctx.util.tryParseJson(text)
      if (auth) {
        ctx.host.log.info("auth loaded from file: " + authPath)
      } else {
        ctx.host.log.warn("auth file exists but not valid JSON")
      }
      return { auth, storage: { type: "file", path: authPath } }
    } catch (e) {
      ctx.host.log.warn("auth file read failed: " + String(e))
      return null
    }
  }

  function loadAuthFromKeychain(ctx, service) {
    try {
      const value = ctx.host.keychain.readGenericPassword(service)
      const auth = ctx.util.tryParseJson(value)
      if (!auth) {
        ctx.host.log.warn("keychain auth invalid JSON: " + service)
        return null
      }
      return { auth, storage: { type: "keychain", service: service } }
    } catch (e) {
      ctx.host.log.warn("keychain read failed: " + String(e))
      return null
    }
  }

  function persistAuth(ctx, storage, auth) {
    if (!storage) return
    if (storage.type === "file" && storage.path) {
      try {
        ctx.host.fs.writeText(storage.path, JSON.stringify(auth, null, 2))
      } catch (e) {
        ctx.host.log.warn("auth persist failed: " + String(e))
      }
      return
    }
    if (storage.type === "keychain" && storage.service) {
      try {
        ctx.host.keychain.writeGenericPassword(storage.service, JSON.stringify(auth))
      } catch (e) {
        ctx.host.log.warn("keychain persist failed: " + String(e))
      }
    }
  }

  function needsRefresh(ctx, auth, nowMs) {
    if (!auth.last_refresh) return true
    const lastMs = ctx.util.parseDateMs(auth.last_refresh)
    if (lastMs === null) return true
    return nowMs - lastMs > REFRESH_AGE_MS
  }

  function refreshToken(ctx, auth, storage) {
    if (!auth.tokens || !auth.tokens.refresh_token) {
      ctx.host.log.warn("refresh skipped: no refresh token")
      return null
    }

    ctx.host.log.info("attempting token refresh")
    try {
      const resp = ctx.util.request({
        method: "POST",
        url: REFRESH_URL,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        bodyText:
          "grant_type=refresh_token" +
          "&client_id=" + encodeURIComponent(CLIENT_ID) +
          "&refresh_token=" + encodeURIComponent(auth.tokens.refresh_token),
        timeoutMs: 15000,
      })

      if (resp.status === 400 || resp.status === 401) {
        let code = null
        const body = ctx.util.tryParseJson(resp.bodyText)
        if (body) {
          code = body.error?.code || body.error || body.code
        }
        ctx.host.log.error("refresh failed: status=" + resp.status + " code=" + String(code))
        if (code === "refresh_token_expired") {
          throw "Session expired. Run `codex` to log in again."
        }
        if (code === "refresh_token_reused") {
          throw "Token conflict. Run `codex` to log in again."
        }
        if (code === "refresh_token_invalidated") {
          throw "Token revoked. Run `codex` to log in again."
        }
        throw "Token expired. Run `codex` to log in again."
      }
      if (resp.status < 200 || resp.status >= 300) {
        ctx.host.log.warn("refresh returned unexpected status: " + resp.status)
        return null
      }

      const body = ctx.util.tryParseJson(resp.bodyText)
      if (!body) {
        ctx.host.log.warn("refresh response not valid JSON")
        return null
      }
      const newAccessToken = body.access_token
      if (!newAccessToken) {
        ctx.host.log.warn("refresh response missing access_token")
        return null
      }

      auth.tokens.access_token = newAccessToken
      if (body.refresh_token) auth.tokens.refresh_token = body.refresh_token
      if (body.id_token) auth.tokens.id_token = body.id_token
      auth.last_refresh = new Date().toISOString()

      persistAuth(ctx, storage, auth)

      return newAccessToken
    } catch (e) {
      if (typeof e === "string") throw e
      ctx.host.log.error("refresh exception: " + String(e))
      return null
    }
  }

  function fetchUsage(ctx, accessToken, accountId) {
    const headers = {
      Authorization: "Bearer " + accessToken,
      Accept: "application/json",
      "User-Agent": "OpenUsage",
    }
    if (accountId) {
      headers["ChatGPT-Account-Id"] = accountId
    }
    return ctx.util.request({
      method: "GET",
      url: USAGE_URL,
      headers,
      timeoutMs: 10000,
    })
  }

  function readPercent(value) {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }

  function readNumber(value) {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }

  function getResetsAtIso(ctx, nowSec, window) {
    if (!window) return null
    if (typeof window.reset_at === "number") {
      return ctx.util.toIso(window.reset_at)
    }
    if (typeof window.reset_after_seconds === "number") {
      return ctx.util.toIso(nowSec + window.reset_after_seconds)
    }
    return null
  }

  // Period durations in milliseconds
  var PERIOD_SESSION_MS = 5 * 60 * 60 * 1000    // 5 hours
  var PERIOD_WEEKLY_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

  function errorLine(ctx, message) {
    return ctx.line.badge({ label: "Error", text: message })
  }

  function probeAccount(ctx, account) {
    var authState = null
    if (account && account.authType === "json") {
      if (!account.authRef) {
        throw "Missing keychain secret for account."
      }
      authState = loadAuthFromKeychain(ctx, account.authRef)
      if (!authState || !authState.auth) {
        throw "Keychain credentials missing."
      }
    } else if (account && account.authType && account.authType !== "auto") {
      throw "Unsupported auth type for Codex."
    } else {
      authState = loadAuth(ctx)
    }
    if (!authState || !authState.auth) {
      ctx.host.log.error("probe failed: not logged in")
      throw "Not logged in. Run `codex` to authenticate."
    }
    const auth = authState.auth
    const storage = authState.storage

    if (auth.tokens && auth.tokens.access_token) {
      const nowMs = Date.now()
      let accessToken = auth.tokens.access_token
      const accountId = (account && account.meta && account.meta.accountId) || auth.tokens.account_id

      if (needsRefresh(ctx, auth, nowMs)) {
        ctx.host.log.info("token needs refresh (age > " + (REFRESH_AGE_MS / 1000 / 60 / 60 / 24) + " days)")
        const refreshed = refreshToken(ctx, auth, storage)
        if (refreshed) {
          accessToken = refreshed
        } else {
          ctx.host.log.warn("proactive refresh failed, trying with existing token")
        }
      }

      let resp
      let didRefresh = false
      try {
        resp = ctx.util.retryOnceOnAuth({
          request: (token) => {
            try {
              return fetchUsage(ctx, token || accessToken, accountId)
            } catch (e) {
              ctx.host.log.error("usage request exception: " + String(e))
              if (didRefresh) {
                throw "Usage request failed after refresh. Try again."
              }
              throw "Usage request failed. Check your connection."
            }
          },
          refresh: () => {
            ctx.host.log.info("usage returned 401, attempting refresh")
            didRefresh = true
            return refreshToken(ctx, auth, storage)
          },
        })
      } catch (e) {
        if (typeof e === "string") throw e
        ctx.host.log.error("usage request failed: " + String(e))
        throw "Usage request failed. Check your connection."
      }

      if (ctx.util.isAuthStatus(resp.status)) {
        ctx.host.log.error("usage returned auth error after all retries: status=" + resp.status)
        throw "Token expired. Run `codex` to log in again."
      }

      if (resp.status < 200 || resp.status >= 300) {
        ctx.host.log.error("usage returned error: status=" + resp.status)
        throw "Usage request failed (HTTP " + String(resp.status) + "). Try again later."
      }

      ctx.host.log.info("usage fetch succeeded")

      const data = ctx.util.tryParseJson(resp.bodyText)
      if (data === null) {
        throw "Usage response invalid. Try again later."
      }

      const lines = []
      const nowSec = Math.floor(Date.now() / 1000)
      const rateLimit = data.rate_limit || null
      const primaryWindow = rateLimit && rateLimit.primary_window ? rateLimit.primary_window : null
      const secondaryWindow = rateLimit && rateLimit.secondary_window ? rateLimit.secondary_window : null
      const reviewWindow =
        data.code_review_rate_limit && data.code_review_rate_limit.primary_window
          ? data.code_review_rate_limit.primary_window
          : null

      const headerPrimary = readPercent(resp.headers["x-codex-primary-used-percent"])
      const headerSecondary = readPercent(resp.headers["x-codex-secondary-used-percent"])

      if (headerPrimary !== null) {
        lines.push(ctx.line.progress({
          label: "Session",
          used: headerPrimary,
          limit: 100,
          format: { kind: "percent" },
          resetsAt: getResetsAtIso(ctx, nowSec, primaryWindow),
          periodDurationMs: PERIOD_SESSION_MS
        }))
      }
      if (headerSecondary !== null) {
        lines.push(ctx.line.progress({
          label: "Weekly",
          used: headerSecondary,
          limit: 100,
          format: { kind: "percent" },
          resetsAt: getResetsAtIso(ctx, nowSec, secondaryWindow),
          periodDurationMs: PERIOD_WEEKLY_MS
        }))
      }

      if (lines.length === 0 && data.rate_limit) {
        if (data.rate_limit.primary_window && typeof data.rate_limit.primary_window.used_percent === "number") {
          lines.push(ctx.line.progress({
            label: "Session",
            used: data.rate_limit.primary_window.used_percent,
            limit: 100,
            format: { kind: "percent" },
            resetsAt: getResetsAtIso(ctx, nowSec, primaryWindow),
            periodDurationMs: PERIOD_SESSION_MS
          }))
        }
        if (data.rate_limit.secondary_window && typeof data.rate_limit.secondary_window.used_percent === "number") {
          lines.push(ctx.line.progress({
            label: "Weekly",
            used: data.rate_limit.secondary_window.used_percent,
            limit: 100,
            format: { kind: "percent" },
            resetsAt: getResetsAtIso(ctx, nowSec, secondaryWindow),
            periodDurationMs: PERIOD_WEEKLY_MS
          }))
        }
      }

      if (reviewWindow) {
        const used = reviewWindow.used_percent
        if (typeof used === "number") {
          lines.push(ctx.line.progress({
            label: "Reviews",
            used: used,
            limit: 100,
            format: { kind: "percent" },
            resetsAt: getResetsAtIso(ctx, nowSec, reviewWindow),
            periodDurationMs: PERIOD_WEEKLY_MS // code_review_rate_limit is a 7-day window
          }))
        }
      }

      const creditsBalance = resp.headers["x-codex-credits-balance"]
      const creditsHeader = readNumber(creditsBalance)
      const creditsData = data.credits ? readNumber(data.credits.balance) : null
      const creditsRemaining = creditsHeader ?? creditsData
      if (creditsRemaining !== null) {
        const remaining = creditsRemaining
        const limit = 1000
        const used = Math.max(0, Math.min(limit, limit - remaining))
        lines.push(ctx.line.progress({
          label: "Credits",
          used: used,
          limit: limit,
          format: { kind: "count", suffix: "credits" },
        }))
      }

      let plan = null
      if (data.plan_type) {
        const planLabel = ctx.fmt.planLabel(data.plan_type)
        if (planLabel) {
          plan = planLabel
        }
      }

      if (lines.length === 0) {
        lines.push(ctx.line.badge({ label: "Status", text: "No usage data", color: "#a3a3a3" }))
      }

      return { plan: plan, lines: lines }
    }

    if (auth.OPENAI_API_KEY) {
      throw "Usage not available for API key."
    }

    throw "Not logged in. Run `codex` to authenticate."
  }

  function probe(ctx) {
    var accounts = loadAccounts(ctx)
    if (!accounts || accounts.length === 0) {
      return probeAccount(ctx, null)
    }

    var sections = []
    for (var i = 0; i < accounts.length; i++) {
      var account = accounts[i]
      try {
        var result = probeAccount(ctx, account)
        sections.push({
          id: account.id,
          label: account.label,
          plan: result.plan,
          lines: result.lines,
        })
      } catch (e) {
        var msg = typeof e === "string" ? e : "Probe failed"
        sections.push({
          id: account.id,
          label: account.label,
          lines: [errorLine(ctx, msg)],
        })
      }
    }

    return { lines: [], sections: sections }
  }

  globalThis.__openusage_plugin = { id: "codex", probe }
})()
