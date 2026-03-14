import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"

export interface SortablePluginConfig {
  id: string
  name: string
  enabled: boolean
}

export function SortablePluginItem({
  plugin,
  onToggle,
}: {
  plugin: SortablePluginConfig
  onToggle: (id: string) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: plugin.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-md bg-card",
        "border border-transparent",
        isDragging && "opacity-50 border-border"
      )}
    >
      <button
        type="button"
        className="touch-none cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <span
        className={cn(
          "flex-1 text-sm",
          !plugin.enabled && "text-muted-foreground"
        )}
      >
        {plugin.name}
      </span>

      <Checkbox
        key={`${plugin.id}-${plugin.enabled}`}
        checked={plugin.enabled}
        onCheckedChange={() => onToggle(plugin.id)}
      />
    </div>
  )
}
