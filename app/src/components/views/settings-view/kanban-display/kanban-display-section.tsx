import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { LayoutGrid, Minimize2, Square, Maximize2 } from "lucide-react";
import type { KanbanDetailLevel } from "../shared/types";

interface KanbanDisplaySectionProps {
  detailLevel: KanbanDetailLevel;
  onChange: (level: KanbanDetailLevel) => void;
}

export function KanbanDisplaySection({
  detailLevel,
  onChange,
}: KanbanDisplaySectionProps) {
  return (
    <div
      id="kanban"
      className="rounded-xl border border-border bg-card backdrop-blur-md overflow-hidden scroll-mt-6"
    >
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-2 mb-2">
          <LayoutGrid className="w-5 h-5 text-brand-500" />
          <h2 className="text-lg font-semibold text-foreground">
            Kanban Card Display
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Control how much information is displayed on Kanban cards.
        </p>
      </div>
      <div className="p-6 space-y-4">
        <div className="space-y-3">
          <Label className="text-foreground">Detail Level</Label>
          <div className="grid grid-cols-3 gap-3">
            <Button
              variant={detailLevel === "minimal" ? "secondary" : "outline"}
              onClick={() => onChange("minimal")}
              className={`flex flex-col items-center justify-center gap-2 px-4 py-4 h-auto ${
                detailLevel === "minimal"
                  ? "border-brand-500 ring-1 ring-brand-500/50"
                  : ""
              }`}
              data-testid="kanban-detail-minimal"
            >
              <Minimize2 className="w-5 h-5" />
              <span className="font-medium text-sm">Minimal</span>
              <span className="text-xs text-muted-foreground text-center">
                Title & category only
              </span>
            </Button>
            <Button
              variant={detailLevel === "standard" ? "secondary" : "outline"}
              onClick={() => onChange("standard")}
              className={`flex flex-col items-center justify-center gap-2 px-4 py-4 h-auto ${
                detailLevel === "standard"
                  ? "border-brand-500 ring-1 ring-brand-500/50"
                  : ""
              }`}
              data-testid="kanban-detail-standard"
            >
              <Square className="w-5 h-5" />
              <span className="font-medium text-sm">Standard</span>
              <span className="text-xs text-muted-foreground text-center">
                Steps & progress
              </span>
            </Button>
            <Button
              variant={detailLevel === "detailed" ? "secondary" : "outline"}
              onClick={() => onChange("detailed")}
              className={`flex flex-col items-center justify-center gap-2 px-4 py-4 h-auto ${
                detailLevel === "detailed"
                  ? "border-brand-500 ring-1 ring-brand-500/50"
                  : ""
              }`}
              data-testid="kanban-detail-detailed"
            >
              <Maximize2 className="w-5 h-5" />
              <span className="font-medium text-sm">Detailed</span>
              <span className="text-xs text-muted-foreground text-center">
                Model, tools & tasks
              </span>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            <strong>Minimal:</strong> Shows only title and category
            <br />
            <strong>Standard:</strong> Adds steps preview and progress bar
            <br />
            <strong>Detailed:</strong> Shows all info including model, tool
            calls, task list, and summaries
          </p>
        </div>
      </div>
    </div>
  );
}
