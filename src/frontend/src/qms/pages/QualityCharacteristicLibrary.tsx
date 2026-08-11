import { Button } from "@/components/ui/button";
import { LayoutGrid, Plus, ShieldOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../AuthContext";
import { canCreate, canEdit, canView } from "../../permissions";
import { useStore } from "../../store";
import { BulkSelectToolbar } from "../components/BulkSelectToolbar";
import { CharacteristicFilters } from "../components/CharacteristicFilters";
import { CharacteristicFormDialog } from "../components/CharacteristicFormDialog";
import { CharacteristicSearchBar } from "../components/CharacteristicSearchBar";
import { CharacteristicTable } from "../components/CharacteristicTable";
import { TemplateManagerDialog } from "../components/TemplateManagerDialog";
import { QMS_GENERIC_CUSTOMER_SCOPE } from "../constants";
import { useQmsStore } from "../store/useQmsStore";
import type {
  CharacteristicLibraryFilters,
  QualityCharacteristic,
} from "../types";
import { DEFAULT_LIBRARY_FILTERS } from "../types";

export function QualityCharacteristicLibrary() {
  const { currentUser } = useAuth();
  const { customers } = useStore();
  const {
    loaded,
    processes,
    operations,
    inspectionMethods,
    characteristics,
    templates,
    favoriteIds,
    loadAll,
    createCharacteristic,
    updateCharacteristic,
    bulkSetCharacteristicStatus,
    toggleFavorite,
    bulkAddFavorites,
    createTemplate,
    renameTemplate,
    addCharacteristicsToTemplate,
    removeCharacteristicFromTemplate,
    deleteTemplate,
  } = useQmsStore();

  const userId = currentUser?.id ?? "";

  // biome-ignore lint/correctness/useExhaustiveDependencies: load once on mount, re-run only if not yet loaded
  useEffect(() => {
    if (!loaded) loadAll(userId);
  }, [loaded]);

  const [filters, setFilters] = useState<CharacteristicLibraryFilters>(
    DEFAULT_LIBRARY_FILTERS,
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<QualityCharacteristic | null>(null);
  const [templateManagerOpen, setTemplateManagerOpen] = useState(false);

  const pView = canView(currentUser, "quality_characteristics");
  const pCreate = canCreate(currentUser, "quality_characteristics");
  const pEdit = canEdit(currentUser, "quality_characteristics");

  const favoriteIdSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const selectedTemplate = templates.find((t) => t.id === filters.templateId);

  const categories = useMemo(
    () => Array.from(new Set(characteristics.map((c) => c.category))).sort(),
    [characteristics],
  );

  const filtered = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return characteristics.filter((c) => {
      if (filters.status !== "All" && c.status !== filters.status) return false;
      if (filters.processId && c.processId !== filters.processId) return false;
      if (filters.operationId && c.operationId !== filters.operationId)
        return false;
      if (filters.category && c.category !== filters.category) return false;
      if (filters.criticality && c.criticality !== filters.criticality)
        return false;
      if (
        filters.inspectionMethodId &&
        c.inspectionMethodId !== filters.inspectionMethodId
      )
        return false;
      if (
        filters.customerScope === QMS_GENERIC_CUSTOMER_SCOPE &&
        c.customerScope
      )
        return false;
      if (
        filters.customerScope &&
        filters.customerScope !== QMS_GENERIC_CUSTOMER_SCOPE &&
        c.customerScope !== filters.customerScope
      )
        return false;
      if (filters.favoritesOnly && !favoriteIdSet.has(c.id)) return false;
      if (
        selectedTemplate &&
        !selectedTemplate.characteristicIds.includes(c.id)
      )
        return false;
      if (search) {
        const process = processes.find((p) => p.id === c.processId)?.name ?? "";
        const operation =
          operations.find((o) => o.id === c.operationId)?.name ?? "";
        const haystack = [
          c.name,
          c.description,
          c.category,
          process,
          operation,
          c.standardReference,
          ...c.tags,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  }, [
    characteristics,
    filters,
    favoriteIdSet,
    selectedTemplate,
    processes,
    operations,
  ]);

  if (!pView) {
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

  const toggleSelect = (id: string) =>
    setSelectedIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id));

  const selectAllVisible = () =>
    setSelectedIds((s) => {
      if (allVisibleSelected) {
        const next = new Set(s);
        for (const c of filtered) next.delete(c.id);
        return next;
      }
      return new Set([...s, ...filtered.map((c) => c.id)]);
    });

  return (
    <div className="space-y-4" data-ocid="qms.characteristics.page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Quality Characteristic Library</h1>
          <p className="text-sm text-muted-foreground">
            Master library of reusable inspection checkpoints across all
            manufacturing processes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => setTemplateManagerOpen(true)}
            data-ocid="qms.characteristics.manage_templates"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            Templates ({templates.length})
          </Button>
          {pCreate && (
            <Button
              type="button"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              data-ocid="qms.characteristics.new"
            >
              <Plus className="w-3.5 h-3.5" />
              New Characteristic
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <CharacteristicSearchBar
          value={filters.search}
          onChange={(search) => setFilters((f) => ({ ...f, search }))}
        />
      </div>

      <CharacteristicFilters
        filters={filters}
        onChange={setFilters}
        processes={processes}
        operations={operations}
        inspectionMethods={inspectionMethods}
        categories={categories}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        templates={templates}
        favoriteCount={favoriteIds.length}
      />

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span data-ocid="qms.characteristics.count">
          {filtered.length} of {characteristics.length} characteristics shown
        </span>
      </div>

      <BulkSelectToolbar
        selectedCount={selectedIds.size}
        totalVisible={filtered.length}
        allVisibleSelected={allVisibleSelected}
        onSelectAllVisible={selectAllVisible}
        onClearSelection={() => setSelectedIds(new Set())}
        onSetStatus={async (status) => {
          await bulkSetCharacteristicStatus(Array.from(selectedIds), status);
          setSelectedIds(new Set());
        }}
        onAddFavorites={async () => {
          await bulkAddFavorites(userId, Array.from(selectedIds));
        }}
        templates={templates}
        onAddToTemplate={async (templateId) => {
          await addCharacteristicsToTemplate(
            templateId,
            Array.from(selectedIds),
          );
        }}
        onCreateTemplateWithSelection={async (name) => {
          await createTemplate({
            name,
            category: "Custom",
            characteristicIds: Array.from(selectedIds),
          });
        }}
      />

      <CharacteristicTable
        characteristics={filtered}
        processes={processes}
        operations={operations}
        inspectionMethods={inspectionMethods}
        selectedIds={selectedIds}
        favoriteIds={favoriteIdSet}
        onToggleSelect={toggleSelect}
        onToggleFavorite={(id) => toggleFavorite(userId, id)}
        onEdit={(c) => {
          setEditing(c);
          setFormOpen(true);
        }}
        canEdit={pEdit}
      />

      <CharacteristicFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        processes={processes}
        operations={operations}
        inspectionMethods={inspectionMethods}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        onCreate={createCharacteristic}
        onUpdate={updateCharacteristic}
      />

      <TemplateManagerDialog
        open={templateManagerOpen}
        onOpenChange={setTemplateManagerOpen}
        templates={templates}
        characteristics={characteristics}
        onRename={renameTemplate}
        onDelete={deleteTemplate}
        onRemoveCharacteristic={removeCharacteristicFromTemplate}
      />
    </div>
  );
}
