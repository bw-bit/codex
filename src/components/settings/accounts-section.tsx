import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import type { ProviderAccount, ProviderAccountAuthType, ProvidersConfig } from "@/lib/provider-accounts"

const INPUT_CLASS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

const SELECT_CLASS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

const TEXTAREA_CLASS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm min-h-[90px] resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

const PROVIDER_FORM_CONFIG: Record<string, {
  title: string
  authOptions: { value: ProviderAccountAuthType; label: string; needsSecret: boolean; secretLabel?: string; secretHint?: string }[]
  needsUsageUrl?: boolean
  supportsPaths?: boolean
  helperText?: string
}> = {
  codex: {
    title: "Codex",
    authOptions: [
      { value: "auto", label: "Auto (local login)", needsSecret: false },
      { value: "json", label: "Auth JSON", needsSecret: true, secretLabel: "Auth JSON", secretHint: "Paste Codex auth.json contents" },
    ],
    helperText: "Auto uses local Codex login. JSON lets you store multiple accounts via Keychain.",
  },
  claude: {
    title: "Claude",
    authOptions: [
      { value: "auto", label: "Auto (local login)", needsSecret: false },
      { value: "json", label: "Auth JSON", needsSecret: true, secretLabel: "Auth JSON", secretHint: "Paste ~/.claude/.credentials.json contents" },
    ],
    helperText: "Auto uses local Claude Code login. JSON lets you store multiple accounts via Keychain.",
  },
  antigravity: {
    title: "Antigravity",
    authOptions: [
      { value: "auto", label: "Local", needsSecret: false },
    ],
    helperText: "Uses local Antigravity language server.",
  },
  zai: {
    title: "z.ai",
    authOptions: [
      { value: "cookie", label: "Cookie", needsSecret: true, secretLabel: "Cookie", secretHint: "Paste Cookie header value" },
      { value: "apiKey", label: "API Key", needsSecret: true, secretLabel: "API Key", secretHint: "Paste API key" },
    ],
    needsUsageUrl: true,
    supportsPaths: true,
    helperText: "Provide the usage API URL from DevTools. Optional JSON paths help extraction.",
  },
  kimicode: {
    title: "Kimi Code",
    authOptions: [
      { value: "cookie", label: "Cookie", needsSecret: true, secretLabel: "Cookie", secretHint: "Paste Cookie header value" },
      { value: "apiKey", label: "API Key", needsSecret: true, secretLabel: "API Key", secretHint: "Paste API key" },
    ],
    needsUsageUrl: true,
    supportsPaths: true,
    helperText: "Provide the usage API URL from DevTools. Optional JSON paths help extraction.",
  },
  cursor: {
    title: "Cursor",
    authOptions: [
      { value: "auto", label: "Auto (local login)", needsSecret: false },
    ],
    helperText: "Uses local Cursor login.",
  },
}

type ProviderDescriptor = {
  id: string
  name: string
}

type AccountsSectionProps = {
  providers: ProviderDescriptor[]
  config: ProvidersConfig | null
  onUpsertAccount: (providerId: string, account: ProviderAccount, secret?: string | null) => Promise<void>
  onRemoveAccount: (providerId: string, accountId: string) => Promise<void>
}

export function AccountsSection({
  providers,
  config,
  onUpsertAccount,
  onRemoveAccount,
}: AccountsSectionProps) {
  const [editor, setEditor] = useState<{ providerId: string; account?: ProviderAccount } | null>(null)

  const providersById = useMemo(() => {
    const map = new Map<string, ProviderDescriptor>()
    for (const provider of providers) {
      map.set(provider.id, provider)
    }
    return map
  }, [providers])

  const providerIds = useMemo(() => providers.map((provider) => provider.id), [providers])

  const renderAccounts = (providerId: string) => {
    const accounts = config?.providers?.[providerId]?.accounts ?? []
    if (accounts.length === 0) {
      return <div className="text-xs text-muted-foreground">No accounts yet.</div>
    }
    return (
      <div className="space-y-2">
        {accounts.map((account) => (
          <div
            key={account.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-card/60 px-3 py-2"
          >
            <div>
              <div className="text-sm font-medium">{account.label}</div>
              <div className="text-xs text-muted-foreground">{account.authType}</div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setEditor({ providerId, account })}
              >
                Edit
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onRemoveAccount(providerId, account.id)}
              >
                Remove
              </Button>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <section>
      <h3 className="text-lg font-semibold mb-0">Accounts</h3>
      <p className="text-sm text-muted-foreground mb-2">
        Provider logins and usage sources
      </p>
      <div className="space-y-4">
        {providerIds.map((providerId, index) => {
          const provider = providersById.get(providerId)
          const configForProvider = PROVIDER_FORM_CONFIG[providerId]
          if (!provider || !configForProvider) return null
          const isEditing = editor?.providerId === providerId
          return (
            <div key={providerId} className="rounded-lg border border-border/60 bg-card/40 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">{provider.name}</div>
                  {configForProvider.helperText && (
                    <div className="text-xs text-muted-foreground">{configForProvider.helperText}</div>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setEditor({ providerId })}
                >
                  Add account
                </Button>
              </div>
              <div className="mt-3 space-y-3">
                {renderAccounts(providerId)}
                {isEditing && (
                  <AccountForm
                    providerId={providerId}
                    providerName={provider.name}
                    config={configForProvider}
                    initialAccount={editor?.account}
                    onCancel={() => setEditor(null)}
                    onSave={async (nextAccount, secret) => {
                      await onUpsertAccount(providerId, nextAccount, secret)
                      setEditor(null)
                    }}
                  />
                )}
              </div>
              {index < providerIds.length - 1 && <Separator className="mt-3" />}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function AccountForm({
  providerId,
  providerName,
  config,
  initialAccount,
  onCancel,
  onSave,
}: {
  providerId: string
  providerName: string
  config: typeof PROVIDER_FORM_CONFIG[string]
  initialAccount?: ProviderAccount
  onCancel: () => void
  onSave: (account: ProviderAccount, secret?: string | null) => Promise<void>
}) {
  const defaultAuthType = initialAccount?.authType ?? config.authOptions[0]?.value ?? "auto"
  const initialMeta = (initialAccount?.meta as Record<string, unknown> | undefined) ?? {}

  const [label, setLabel] = useState(initialAccount?.label ?? "")
  const [authType, setAuthType] = useState<ProviderAccountAuthType>(defaultAuthType)
  const [secret, setSecret] = useState("")
  const [usageUrl, setUsageUrl] = useState(String(initialMeta.usageUrl ?? ""))
  const [usedPath, setUsedPath] = useState(String(initialMeta.usedPath ?? ""))
  const [limitPath, setLimitPath] = useState(String(initialMeta.limitPath ?? ""))
  const [resetAtPath, setResetAtPath] = useState(String(initialMeta.resetAtPath ?? ""))
  const [planPath, setPlanPath] = useState(String(initialMeta.planPath ?? ""))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const authOption = config.authOptions.find((option) => option.value === authType)
  const needsSecret = authOption?.needsSecret ?? false

  const handleSave = async () => {
    setError(null)
    const trimmedLabel = label.trim() || `${providerName} Account`

    if (config.needsUsageUrl && !usageUrl.trim()) {
      setError("Usage URL is required.")
      return
    }
    if (!initialAccount && needsSecret && !secret.trim()) {
      setError("Secret is required.")
      return
    }

    const meta: Record<string, unknown> = {}
    if (config.needsUsageUrl) meta.usageUrl = usageUrl.trim()
    if (config.supportsPaths && usedPath.trim()) meta.usedPath = usedPath.trim()
    if (config.supportsPaths && limitPath.trim()) meta.limitPath = limitPath.trim()
    if (config.supportsPaths && resetAtPath.trim()) meta.resetAtPath = resetAtPath.trim()
    if (config.supportsPaths && planPath.trim()) meta.planPath = planPath.trim()

    const nextAccount: ProviderAccount = {
      id: initialAccount?.id ?? "",
      label: trimmedLabel,
      authType,
      meta: Object.keys(meta).length > 0 ? meta : undefined,
    }

    try {
      setSaving(true)
      await onSave(nextAccount, secret.trim() ? secret.trim() : null)
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-md border border-border/60 bg-background p-3 space-y-3">
      <div className="text-sm font-medium">{initialAccount ? "Edit account" : "New account"}</div>
      <label className="block">
        <span className="text-xs text-muted-foreground">Label</span>
        <input
          className={INPUT_CLASS}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={`${providerName} Account`}
        />
      </label>
      <label className="block">
        <span className="text-xs text-muted-foreground">Auth type</span>
        <select
          className={SELECT_CLASS}
          value={authType}
          onChange={(e) => setAuthType(e.target.value as ProviderAccountAuthType)}
        >
          {config.authOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {needsSecret && (
        <label className="block">
          <span className="text-xs text-muted-foreground">
            {authOption?.secretLabel ?? "Secret"}
            {initialAccount && <Badge variant="outline" className="ml-2">Optional</Badge>}
          </span>
          <textarea
            className={TEXTAREA_CLASS}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder={authOption?.secretHint ?? "Paste secret"}
          />
          {initialAccount && (
            <div className="text-[11px] text-muted-foreground mt-1">
              Leave blank to keep existing secret
            </div>
          )}
        </label>
      )}
      {config.needsUsageUrl && (
        <label className="block">
          <span className="text-xs text-muted-foreground">Usage URL</span>
          <input
            className={INPUT_CLASS}
            value={usageUrl}
            onChange={(e) => setUsageUrl(e.target.value)}
            placeholder="https://..."
          />
        </label>
      )}
      {config.supportsPaths && (
        <div className="grid gap-2">
          <div className="text-xs text-muted-foreground">JSON paths (optional)</div>
          <div className="grid gap-2">
            <input
              className={INPUT_CLASS}
              value={usedPath}
              onChange={(e) => setUsedPath(e.target.value)}
              placeholder="usedPath (e.g. data.usage.used)"
            />
            <input
              className={INPUT_CLASS}
              value={limitPath}
              onChange={(e) => setLimitPath(e.target.value)}
              placeholder="limitPath (e.g. data.usage.limit)"
            />
            <input
              className={INPUT_CLASS}
              value={resetAtPath}
              onChange={(e) => setResetAtPath(e.target.value)}
              placeholder="resetAtPath (e.g. data.usage.resetAt)"
            />
            <input
              className={INPUT_CLASS}
              value={planPath}
              onChange={(e) => setPlanPath(e.target.value)}
              placeholder="planPath (e.g. data.plan)"
            />
          </div>
        </div>
      )}
      {error && (
        <div className={cn("text-xs", "text-red-500")}>{error}</div>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  )
}
