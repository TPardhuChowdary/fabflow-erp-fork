import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ClipboardCheck, LayoutGrid, ShieldOff, Star } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useAuth } from "../../AuthContext";
import { canView } from "../../permissions";
import type { Page } from "../../types";
import { CRITICALITY_BADGE_CLASS, CRITICALITY_LABELS } from "../constants";
import { useQmsStore } from "../store/useQmsStore";
import { QMS_CRITICALITY_LEVELS } from "../types";

interface Props {
  onNavigate: (page: Page) => void;
}

export function QmsDashboard({ onNavigate }: Props) {
  const { currentUser } = useAuth();
  const {
    loaded,
    characteristics,
    processes,
    templates,
    favoriteIds,
    loadAll,
  } = useQmsStore();
  const userId = currentUser?.id ?? "";

  // biome-ignore lint/correctness/useExhaustiveDependencies: load once on mount, re-run only if not yet loaded
  useEffect(() => {
    if (!loaded) loadAll(userId);
  }, [loaded]);

  const active = characteristics.filter((c) => c.status === "Active");
  const obsolete = characteristics.filter((c) => c.status === "Obsolete");

  const byCriticality = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const level of QMS_CRITICALITY_LEVELS) counts[level] = 0;
    for (const c of active)
      counts[c.criticality] = (counts[c.criticality] ?? 0) + 1;
    return counts;
  }, [active]);

  const byProcess = useMemo(() => {
    return processes
      .map((p) => ({
        process: p,
        count: active.filter((c) => c.processId === p.id).length,
      }))
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [processes, active]);

  if (
    !canView(currentUser, "qms_dashboard") &&
    !canView(currentUser, "quality_characteristics")
  ) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10">
          <ShieldOff className="w-8 h-8 text-destructive" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-bold">Access Restricted</h2>
          <p className="text-sm text-muted-foreground mt-1">
            You do not have permission to view this module.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-ocid="qms.dashboard.page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Quality Management</h1>
          <p className="text-sm text-muted-foreground">
            Master data overview for the Quality Characteristic Library.
          </p>
        </div>
        <Button
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={() => onNavigate("qms-characteristics")}
          data-ocid="qms.dashboard.open_library"
        >
          <ClipboardCheck className="w-3.5 h-3.5" />
          Open Characteristic Library
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Active Characteristics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{active.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Obsolete
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{obsolete.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <LayoutGrid className="w-3.5 h-3.5" /> Templates
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{templates.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Star className="w-3.5 h-3.5" /> Your Favorites
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{favoriteIds.length}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">
              Active Characteristics by Criticality
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {QMS_CRITICALITY_LEVELS.map((level) => (
              <div
                key={level}
                className="flex items-center justify-between text-sm"
              >
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] px-1.5 py-0.5",
                    CRITICALITY_BADGE_CLASS[level],
                  )}
                >
                  {CRITICALITY_LABELS[level]}
                </Badge>
                <span className="font-medium">{byCriticality[level] ?? 0}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">
              Active Characteristics by Process
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {byProcess.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No characteristics yet
              </p>
            )}
            {byProcess.map(({ process, count }) => (
              <div
                key={process.id}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-muted-foreground">{process.name}</span>
                <span className="font-medium">{count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
