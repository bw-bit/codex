import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { AccountsSection } from "@/components/settings/accounts-section";
import { SortablePluginItem, type SortablePluginConfig } from "@/components/settings/sortable-plugin-item";
import { TrayIconStylePreview } from "@/components/settings/tray-icon-style-preview";
import {
  AUTO_UPDATE_OPTIONS,
  DISPLAY_MODE_OPTIONS,
  TRAY_ICON_STYLE_OPTIONS,
  THEME_OPTIONS,
  isTrayPercentageMandatory,
  type AutoUpdateIntervalMinutes,
  type DisplayMode,
  type ThemeMode,
  type TrayIconStyle,
} from "@/lib/settings";
import type { ProviderAccount, ProvidersConfig } from "@/lib/provider-accounts";

interface SettingsPageProps {
  plugins: SortablePluginConfig[];
  onReorder: (orderedIds: string[]) => void;
  onToggle: (id: string) => void;
  autoUpdateInterval: AutoUpdateIntervalMinutes;
  onAutoUpdateIntervalChange: (value: AutoUpdateIntervalMinutes) => void;
  themeMode: ThemeMode;
  onThemeModeChange: (value: ThemeMode) => void;
  displayMode: DisplayMode;
  onDisplayModeChange: (value: DisplayMode) => void;
  trayIconStyle: TrayIconStyle;
  onTrayIconStyleChange: (value: TrayIconStyle) => void;
  trayShowPercentage: boolean;
  onTrayShowPercentageChange: (value: boolean) => void;
  showCursorProvider: boolean;
  onShowCursorProviderChange: (value: boolean) => void;
  providersConfig: ProvidersConfig | null;
  providers: { id: string; name: string }[];
  onUpsertAccount: (providerId: string, account: ProviderAccount, secret?: string | null) => Promise<void>;
  onRemoveAccount: (providerId: string, accountId: string) => Promise<void>;
  providerIconUrl?: string;
}

export function SettingsPage({
  plugins,
  onReorder,
  onToggle,
  autoUpdateInterval,
  onAutoUpdateIntervalChange,
  themeMode,
  onThemeModeChange,
  displayMode,
  onDisplayModeChange,
  trayIconStyle,
  onTrayIconStyleChange,
  trayShowPercentage,
  onTrayShowPercentageChange,
  showCursorProvider,
  onShowCursorProviderChange,
  providersConfig,
  providers,
  onUpsertAccount,
  onRemoveAccount,
  providerIconUrl,
}: SettingsPageProps) {
  const percentageMandatory = isTrayPercentageMandatory(trayIconStyle);
  const trayShowPercentageChecked = percentageMandatory
    ? true
    : trayShowPercentage;

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = plugins.findIndex((item) => item.id === active.id);
      const newIndex = plugins.findIndex((item) => item.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const next = arrayMove(plugins, oldIndex, newIndex);
      onReorder(next.map((item) => item.id));
    }
  };

  return (
    <div className="py-3 space-y-4">
      <section>
        <h3 className="text-lg font-semibold mb-0">Auto Refresh</h3>
        <p className="text-sm text-muted-foreground mb-2">
          How obsessive are you
        </p>
        <div className="bg-muted/50 rounded-lg p-1">
          <div className="flex gap-1" role="radiogroup" aria-label="Auto-update interval">
            {AUTO_UPDATE_OPTIONS.map((option) => {
              const isActive = option.value === autoUpdateInterval;
              return (
                <Button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  variant={isActive ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => onAutoUpdateIntervalChange(option.value)}
                >
                  {option.label}
                </Button>
              );
            })}
          </div>
        </div>
      </section>
      <section>
        <h3 className="text-lg font-semibold mb-0">Usage Mode</h3>
        <p className="text-sm text-muted-foreground mb-2">
          Glass half full or half empty
        </p>
        <div className="bg-muted/50 rounded-lg p-1">
          <div className="flex gap-1" role="radiogroup" aria-label="Usage display mode">
            {DISPLAY_MODE_OPTIONS.map((option) => {
              const isActive = option.value === displayMode;
              return (
                <Button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  variant={isActive ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => onDisplayModeChange(option.value)}
                >
                  {option.label}
                </Button>
              );
            })}
          </div>
        </div>
      </section>
      <section>
        <h3 className="text-lg font-semibold mb-0">Bar Icon</h3>
        <p className="text-sm text-muted-foreground mb-2">
          The little guy up top
        </p>
        <div className="bg-muted/50 rounded-lg p-1">
          <div className="flex gap-1" role="radiogroup" aria-label="Tray icon style">
            {TRAY_ICON_STYLE_OPTIONS.map((option) => {
              const isActive = option.value === trayIconStyle;
              return (
                <Button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-label={option.label}
                  aria-checked={isActive}
                  variant={isActive ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => onTrayIconStyleChange(option.value)}
                >
                  <TrayIconStylePreview
                    style={option.value}
                    isActive={isActive}
                    providerIconUrl={option.value === "provider" ? providerIconUrl : undefined}
                  />
                </Button>
              );
            })}
          </div>
        </div>
        <label
          className={cn(
            "mt-2 flex items-center gap-2 text-sm select-none",
            percentageMandatory
              ? "text-muted-foreground cursor-not-allowed"
              : "text-foreground"
          )}
        >
          <Checkbox
            key={`tray-pct-${trayShowPercentageChecked}-${percentageMandatory}`}
            checked={trayShowPercentageChecked}
            disabled={percentageMandatory}
            onCheckedChange={(checked) => {
              if (percentageMandatory) return;
              onTrayShowPercentageChange(checked === true);
            }}
          />
          Show percentage
        </label>
      </section>
      <section>
        <h3 className="text-lg font-semibold mb-0">App Theme</h3>
        <p className="text-sm text-muted-foreground mb-2">
          How it looks around here
        </p>
        <div className="bg-muted/50 rounded-lg p-1">
          <div className="flex gap-1" role="radiogroup" aria-label="Theme mode">
            {THEME_OPTIONS.map((option) => {
              const isActive = option.value === themeMode;
              return (
                <Button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  variant={isActive ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => onThemeModeChange(option.value)}
                >
                  {option.label}
                </Button>
              );
            })}
          </div>
        </div>
      </section>
      <section>
        <h3 className="text-lg font-semibold mb-0">Optional Providers</h3>
        <p className="text-sm text-muted-foreground mb-2">
          Show extra providers in the app
        </p>
        <label className="flex items-center gap-2 text-sm select-none">
          <Checkbox
            checked={showCursorProvider}
            onCheckedChange={(checked) => onShowCursorProviderChange(checked === true)}
          />
          Show Cursor
        </label>
      </section>
      <section>
        <h3 className="text-lg font-semibold mb-0">Plugins</h3>
        <p className="text-sm text-muted-foreground mb-2">
          Your AI coding lineup
        </p>
        <div className="bg-muted/50 rounded-lg p-1 space-y-1">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={plugins.map((p) => p.id)}
              strategy={verticalListSortingStrategy}
            >
              {plugins.map((plugin) => (
                <SortablePluginItem
                  key={plugin.id}
                  plugin={plugin}
                  onToggle={onToggle}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      </section>
      <AccountsSection
        providers={providers}
        config={providersConfig}
        onUpsertAccount={onUpsertAccount}
        onRemoveAccount={onRemoveAccount}
      />
    </div>
  );
}
