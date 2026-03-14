export type ProviderId =
  | "codex"
  | "claude"
  | "antigravity"
  | "zai"
  | "kimicode"
  | "cursor"

export type ProviderAccountAuthType = "auto" | "json" | "cookie" | "apiKey"

export type ProviderAccount = {
  id: string
  label: string
  authType: ProviderAccountAuthType
  authRef?: string
  meta?: Record<string, unknown>
}

export type ProviderConfig = {
  accounts: ProviderAccount[]
}

export type ProvidersConfig = {
  version: 1
  providers: Record<string, ProviderConfig>
}

export const PROVIDER_IDS: ProviderId[] = [
  "codex",
  "claude",
  "antigravity",
  "zai",
  "kimicode",
  "cursor",
]

const DEFAULT_AUTO_ACCOUNT_PROVIDERS = new Set<ProviderId>([
  "codex",
  "claude",
  "antigravity",
])

const DEFAULT_ACCOUNT_LABELS: Record<ProviderId, string> = {
  codex: "Default",
  claude: "Default",
  antigravity: "Local",
  zai: "Primary",
  kimicode: "Primary",
  cursor: "Default",
}

const DEFAULT_ACCOUNT_ID = "default"

export function buildKeychainService(providerId: string, accountId: string): string {
  return `openusage.${providerId}.${accountId}`
}

export function normalizeProvidersConfig(input: ProvidersConfig | null): ProvidersConfig {
  const normalized: ProvidersConfig = {
    version: 1,
    providers: {},
  }

  const rawProviders = input?.providers && typeof input.providers === "object"
    ? input.providers
    : {}

  for (const id of PROVIDER_IDS) {
    const raw = rawProviders[id]
    const accounts = Array.isArray(raw?.accounts) ? raw.accounts : []
    const sanitized = accounts
      .map((account, index) => normalizeAccount(account, index, id))
      .filter((account): account is ProviderAccount => Boolean(account))

    if (sanitized.length === 0 && DEFAULT_AUTO_ACCOUNT_PROVIDERS.has(id)) {
      sanitized.push({
        id: DEFAULT_ACCOUNT_ID,
        label: DEFAULT_ACCOUNT_LABELS[id],
        authType: "auto",
      })
    }

    normalized.providers[id] = { accounts: sanitized }
  }

  return normalized
}

function normalizeAccount(
  account: ProviderAccount | null | undefined,
  index: number,
  providerId: ProviderId
): ProviderAccount | null {
  if (!account || typeof account !== "object") return null
  const id = typeof account.id === "string" && account.id.trim()
    ? account.id.trim()
    : `${providerId}-${index + 1}`
  const label = typeof account.label === "string" && account.label.trim()
    ? account.label.trim()
    : DEFAULT_ACCOUNT_LABELS[providerId]
  const authType = account.authType
  if (!authType || typeof authType !== "string") return null
  const authRef = typeof account.authRef === "string" && account.authRef.trim()
    ? account.authRef.trim()
    : undefined
  const meta = account.meta && typeof account.meta === "object" ? account.meta : undefined
  return { id, label, authType: authType as ProviderAccountAuthType, authRef, meta }
}
