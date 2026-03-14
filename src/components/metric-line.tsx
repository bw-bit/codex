import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { calculatePaceStatus, type PaceStatus } from "@/lib/pace-status"
import { buildPaceDetailText, formatCompactDuration, getPaceStatusText } from "@/lib/pace-tooltip"
import type { MetricLine } from "@/lib/plugin-types"
import { clamp01 } from "@/lib/utils"
import type { DisplayMode } from "@/lib/settings"

export function formatNumber(value: number) {
  if (Number.isNaN(value)) return "0"
  const fractionDigits = Number.isInteger(value) ? 0 : 2
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value)
}

function formatCount(value: number) {
  if (!Number.isFinite(value)) return "0"
  const maximumFractionDigits = Number.isInteger(value) ? 0 : 2
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(value)
}

function formatResetIn(nowMs: number, resetsAtIso: string): string | null {
  const resetsAtMs = Date.parse(resetsAtIso)
  if (!Number.isFinite(resetsAtMs)) return null
  const deltaMs = resetsAtMs - nowMs
  if (deltaMs <= 0) return "Resets now"
  const durationText = formatCompactDuration(deltaMs)
  return durationText ? `Resets in ${durationText}` : "Resets in <1m"
}

/** Colored dot indicator showing pace status */
function PaceIndicator({
  status,
  detailText,
  isLimitReached,
}: {
  status: PaceStatus
  detailText?: string | null
  isLimitReached?: boolean
}) {
  const colorClass =
    status === "ahead"
      ? "bg-green-500"
      : status === "on-track"
        ? "bg-yellow-500"
        : "bg-red-500"

  const statusText = getPaceStatusText(status)

  return (
    <Tooltip>
      <TooltipTrigger
        render={(props) => (
          <span
            {...props}
            className={`inline-block w-2 h-2 rounded-full ${colorClass}`}
            aria-label={isLimitReached ? "Limit reached" : statusText}
          />
        )}
      />
      <TooltipContent side="top" className="text-xs text-center">
        {isLimitReached ? (
          "Limit reached"
        ) : (
          <>
            <div>{statusText}</div>
            {detailText && <div className="text-[10px] opacity-60">{detailText}</div>}
          </>
        )}
      </TooltipContent>
    </Tooltip>
  )
}

export function MetricLineRenderer({
  line,
  displayMode,
  now,
}: {
  line: MetricLine
  displayMode: DisplayMode
  now: number
}) {
  if (line.type === "text") {
    return (
      <div>
        <div className="flex justify-between items-center h-[22px]">
          <span className="text-sm text-muted-foreground flex-shrink-0">{line.label}</span>
          <span
            className="text-sm text-muted-foreground truncate min-w-0 max-w-[60%] text-right"
            style={line.color ? { color: line.color } : undefined}
            title={line.value}
          >
            {line.value}
          </span>
        </div>
        {line.subtitle && (
          <div className="text-xs text-muted-foreground text-right -mt-0.5">{line.subtitle}</div>
        )}
      </div>
    )
  }

  if (line.type === "badge") {
    return (
      <div>
        <div className="flex justify-between items-center h-[22px]">
          <span className="text-sm text-muted-foreground flex-shrink-0">{line.label}</span>
          <Badge
            variant="outline"
            className="truncate min-w-0 max-w-[60%]"
            style={
              line.color
                ? { color: line.color, borderColor: line.color }
                : undefined
            }
            title={line.text}
          >
            {line.text}
          </Badge>
        </div>
        {line.subtitle && (
          <div className="text-xs text-muted-foreground text-right -mt-0.5">{line.subtitle}</div>
        )}
      </div>
    )
  }

  if (line.type === "progress") {
    const resetsAtMs = line.resetsAt ? Date.parse(line.resetsAt) : Number.NaN
    const hasPaceContext = Number.isFinite(resetsAtMs) && Number.isFinite(line.periodDurationMs)
    const shownAmount =
      displayMode === "used"
        ? line.used
        : Math.max(0, line.limit - line.used)
    const percent = Math.round(clamp01(shownAmount / line.limit) * 10000) / 100
    const leftSuffix = displayMode === "left" ? " left" : ""

    const primaryText =
      line.format.kind === "percent"
        ? `${Math.round(shownAmount)}%${leftSuffix}`
        : line.format.kind === "dollars"
          ? `$${formatNumber(shownAmount)}${leftSuffix}`
          : `${formatCount(shownAmount)} ${line.format.suffix}${leftSuffix}`

    const secondaryText =
      line.resetsAt
        ? formatResetIn(now, line.resetsAt)
        : line.format.kind === "percent"
          ? `${line.limit}% cap`
          : line.format.kind === "dollars"
            ? `$${formatNumber(line.limit)} limit`
            : `${formatCount(line.limit)} ${line.format.suffix}`

    // Calculate pace status if we have reset time and period duration
    const paceResult = hasPaceContext
      ? calculatePaceStatus(line.used, line.limit, resetsAtMs, line.periodDurationMs!, now)
      : null
    const paceStatus = paceResult?.status ?? null
    const isLimitReached = line.used >= line.limit
    const paceDetailText =
      hasPaceContext && !isLimitReached
        ? buildPaceDetailText({
            paceResult,
            used: line.used,
            limit: line.limit,
            periodDurationMs: line.periodDurationMs!,
            resetsAtMs,
            nowMs: now,
            displayMode,
          })
        : null

    return (
      <div>
        <div className="text-sm font-medium mb-1.5 flex items-center gap-1.5">
          {line.label}
          {paceStatus && (
            <PaceIndicator status={paceStatus} detailText={paceDetailText} isLimitReached={isLimitReached} />
          )}
        </div>
        <Progress
          value={percent}
          indicatorColor={line.color}
        />
        <div className="flex justify-between items-center mt-1.5">
          <span className="text-xs text-muted-foreground tabular-nums">
            {primaryText}
          </span>
          {secondaryText && (
            <span className="text-xs text-muted-foreground">
              {secondaryText}
            </span>
          )}
        </div>
      </div>
    )
  }

  return null
}
