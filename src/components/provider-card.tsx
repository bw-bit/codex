import { useMemo } from "react"
import { Hourglass, RefreshCw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SkeletonLines } from "@/components/skeleton-lines"
import { PluginError } from "@/components/plugin-error"
import { useNowTicker } from "@/hooks/use-now-ticker"
import { REFRESH_COOLDOWN_MS, type DisplayMode } from "@/lib/settings"
import type { ManifestLine, MetricLine, PluginSection } from "@/lib/plugin-types"
import { MetricLineRenderer } from "@/components/metric-line"

interface ProviderCardProps {
  name: string
  plan?: string
  showSeparator?: boolean
  loading?: boolean
  error?: string | null
  lines?: MetricLine[]
  sections?: PluginSection[]
  skeletonLines?: ManifestLine[]
  lastManualRefreshAt?: number | null
  onRetry?: () => void
  scopeFilter?: "overview" | "all"
  displayMode: DisplayMode
}

export function ProviderCard({
  name,
  plan,
  showSeparator = true,
  loading = false,
  error = null,
  lines = [],
  sections = [],
  skeletonLines = [],
  lastManualRefreshAt,
  onRetry,
  scopeFilter = "all",
  displayMode,
}: ProviderCardProps) {
  const cooldownRemainingMs = useMemo(() => {
    if (!lastManualRefreshAt) return 0
    const remaining = REFRESH_COOLDOWN_MS - (Date.now() - lastManualRefreshAt)
    return remaining > 0 ? remaining : 0
  }, [lastManualRefreshAt])

  // Filter lines based on scope - match by label since runtime lines can differ from manifest
  const overviewLabels = new Set(
    skeletonLines
      .filter(line => line.scope === "overview")
      .map(line => line.label)
  )
  const filteredSkeletonLines = scopeFilter === "all"
    ? skeletonLines
    : skeletonLines.filter(line => line.scope === "overview")
  const filterLinesByScope = (input: MetricLine[]) => (
    scopeFilter === "all"
      ? input
      : input.filter(line => overviewLabels.has(line.label))
  )
  const filteredLines = filterLinesByScope(lines)
  const filteredSections = sections.map((section) => ({
    ...section,
    lines: filterLinesByScope(section.lines),
  }))

  const hasResetCountdown = (filteredSections.length > 0
    ? filteredSections.flatMap((section) => section.lines)
    : filteredLines
  ).some((line) => line.type === "progress" && Boolean(line.resetsAt))

  const now = useNowTicker({
    enabled: cooldownRemainingMs > 0 || hasResetCountdown,
    intervalMs: cooldownRemainingMs > 0 ? 1000 : 30_000,
    stopAfterMs: cooldownRemainingMs > 0 && !hasResetCountdown ? cooldownRemainingMs : null,
  })

  const inCooldown = lastManualRefreshAt
    ? now - lastManualRefreshAt < REFRESH_COOLDOWN_MS
    : false
  const hasSections = filteredSections.length > 0

  // Format remaining cooldown time as "Xm Ys"
  const formatRemainingTime = () => {
    if (!lastManualRefreshAt) return ""
    const remainingMs = REFRESH_COOLDOWN_MS - (now - lastManualRefreshAt)
    if (remainingMs <= 0) return ""
    const totalSeconds = Math.ceil(remainingMs / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    if (minutes > 0) {
      return `Available in ${minutes}m ${seconds}s`
    }
    return `Available in ${seconds}s`
  }

  return (
    <div>
      <div className="py-3">
        <div className="flex items-center justify-between mb-2">
          <div className="relative flex items-center">
            <h2 className="text-lg font-semibold" style={{ transform: "translateZ(0)" }}>{name}</h2>
            {onRetry && (
              loading ? (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="ml-1 pointer-events-none opacity-50"
                  style={{ transform: "translateZ(0)", backfaceVisibility: "hidden" }}
                  tabIndex={-1}
                >
                  <RefreshCw className="h-3 w-3 animate-spin" />
                </Button>
              ) : inCooldown ? (
                <Tooltip>
                  <TooltipTrigger
                    className="ml-1"
                    render={(props) => (
                      <span {...props} className={props.className}>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="pointer-events-none opacity-50"
                          style={{ transform: "translateZ(0)", backfaceVisibility: "hidden" }}
                          tabIndex={-1}
                        >
                          <Hourglass className="h-3 w-3" />
                        </Button>
                      </span>
                    )}
                  />
                  <TooltipContent side="top">
                    {formatRemainingTime()}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Retry"
                  onClick={(e) => {
                    e.currentTarget.blur()
                    onRetry()
                  }}
                  className="ml-1 opacity-0 hover:opacity-100 focus-visible:opacity-100"
                  style={{ transform: "translateZ(0)", backfaceVisibility: "hidden" }}
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
              )
            )}
          </div>
          {plan && (
            <Badge
              variant="outline"
              className="truncate min-w-0 max-w-[40%]"
              title={plan}
            >
              {plan}
            </Badge>
          )}
        </div>
        {error && <PluginError message={error} />}

        {loading && !error && (
          <SkeletonLines lines={filteredSkeletonLines} />
        )}

        {!loading && !error && (
          <div className="space-y-4">
            {hasSections ? (
              <div className="space-y-3">
                {filteredSections.map((section) => (
                  <div
                    key={section.id}
                    className="rounded-lg border border-border/60 bg-card/60 p-3"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-semibold">{section.label}</div>
                      {section.plan && (
                        <Badge
                          variant="outline"
                          className="truncate min-w-0 max-w-[50%]"
                          title={section.plan}
                        >
                          {section.plan}
                        </Badge>
                      )}
                    </div>
                    {section.subtitle && (
                      <div className="text-xs text-muted-foreground mb-2">{section.subtitle}</div>
                    )}
                    <div className="space-y-4">
                      {section.lines.map((line, index) => (
                        <MetricLineRenderer
                          key={`${section.id}-${line.label}-${index}`}
                          line={line}
                          displayMode={displayMode}
                          now={now}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              filteredLines.map((line, index) => (
                <MetricLineRenderer
                  key={`${line.label}-${index}`}
                  line={line}
                  displayMode={displayMode}
                  now={now}
                />
              ))
            )}
          </div>
        )}
      </div>
      {showSeparator && <Separator />}
    </div>
  )
}
