import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Star, X } from "lucide-react";
import {
  CRITICALITY_LABELS,
  INSPECTION_METHOD_TYPE_LABELS,
  QMS_GENERIC_CUSTOMER_SCOPE,
} from "../constants";
import type {
  CharacteristicLibraryFilters,
  InspectionMethod,
  ManufacturingProcess,
  Operation,
  QmsTemplate,
} from "../types";
import { QMS_CRITICALITY_LEVELS } from "../types";

const ALL = "__all__";
const GENERIC = QMS_GENERIC_CUSTOMER_SCOPE;

interface Props {
  filters: CharacteristicLibraryFilters;
  onChange: (filters: CharacteristicLibraryFilters) => void;
  processes: ManufacturingProcess[];
  operations: Operation[];
  inspectionMethods: InspectionMethod[];
  categories: string[];
  customers: Array<{ id: string; name: string }>;
  templates: QmsTemplate[];
  favoriteCount: number;
}

export function CharacteristicFilters({
  filters,
  onChange,
  processes,
  operations,
  inspectionMethods,
  categories,
  customers,
  templates,
  favoriteCount,
}: Props) {
  const set = (patch: Partial<CharacteristicLibraryFilters>) =>
    onChange({ ...filters, ...patch });

  const visibleOperations = filters.processId
    ? operations.filter((o) => o.processId === filters.processId)
    : operations;

  const activeCount = [
    filters.processId,
    filters.operationId,
    filters.category,
    filters.criticality,
    filters.inspectionMethodId,
    filters.customerScope,
    filters.templateId,
  ].filter(Boolean).length;

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-ocid="qms.characteristics.filters"
    >
      <Select
        value={filters.processId || ALL}
        onValueChange={(v) =>
          set({ processId: v === ALL ? "" : v, operationId: "" })
        }
      >
        <SelectTrigger
          className="h-8 text-xs w-36"
          data-ocid="qms.filter.process"
        >
          <SelectValue placeholder="Process" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL} className="text-xs">
            All Processes
          </SelectItem>
          {processes.map((p) => (
            <SelectItem key={p.id} value={p.id} className="text-xs">
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.operationId || ALL}
        onValueChange={(v) => set({ operationId: v === ALL ? "" : v })}
      >
        <SelectTrigger
          className="h-8 text-xs w-36"
          data-ocid="qms.filter.operation"
        >
          <SelectValue placeholder="Operation" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL} className="text-xs">
            All Operations
          </SelectItem>
          {visibleOperations.map((o) => (
            <SelectItem key={o.id} value={o.id} className="text-xs">
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.category || ALL}
        onValueChange={(v) => set({ category: v === ALL ? "" : v })}
      >
        <SelectTrigger
          className="h-8 text-xs w-32"
          data-ocid="qms.filter.category"
        >
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL} className="text-xs">
            All Categories
          </SelectItem>
          {categories.map((c) => (
            <SelectItem key={c} value={c} className="text-xs">
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.criticality || ALL}
        onValueChange={(v) => set({ criticality: v === ALL ? "" : v })}
      >
        <SelectTrigger
          className="h-8 text-xs w-40"
          data-ocid="qms.filter.criticality"
        >
          <SelectValue placeholder="Criticality" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL} className="text-xs">
            All Criticality
          </SelectItem>
          {QMS_CRITICALITY_LEVELS.map((c) => (
            <SelectItem key={c} value={c} className="text-xs">
              {CRITICALITY_LABELS[c]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.inspectionMethodId || ALL}
        onValueChange={(v) => set({ inspectionMethodId: v === ALL ? "" : v })}
      >
        <SelectTrigger
          className="h-8 text-xs w-36"
          data-ocid="qms.filter.method"
        >
          <SelectValue placeholder="Method" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL} className="text-xs">
            All Methods
          </SelectItem>
          {inspectionMethods.map((m) => (
            <SelectItem key={m.id} value={m.id} className="text-xs">
              {INSPECTION_METHOD_TYPE_LABELS[m.type]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.customerScope || ALL}
        onValueChange={(v) => set({ customerScope: v === ALL ? "" : v })}
      >
        <SelectTrigger
          className="h-8 text-xs w-32"
          data-ocid="qms.filter.customer"
        >
          <SelectValue placeholder="Customer" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL} className="text-xs">
            All Customers
          </SelectItem>
          <SelectItem value={GENERIC} className="text-xs">
            Generic (no scope)
          </SelectItem>
          {customers.map((c) => (
            <SelectItem key={c.id} value={c.id} className="text-xs">
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.status}
        onValueChange={(v) =>
          set({ status: v as CharacteristicLibraryFilters["status"] })
        }
      >
        <SelectTrigger
          className="h-8 text-xs w-28"
          data-ocid="qms.filter.status"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="Active" className="text-xs">
            Active
          </SelectItem>
          <SelectItem value="Obsolete" className="text-xs">
            Obsolete
          </SelectItem>
          <SelectItem value="All" className="text-xs">
            All Statuses
          </SelectItem>
        </SelectContent>
      </Select>

      {templates.length > 0 && (
        <Select
          value={filters.templateId || ALL}
          onValueChange={(v) => set({ templateId: v === ALL ? "" : v })}
        >
          <SelectTrigger
            className="h-8 text-xs w-40"
            data-ocid="qms.filter.template"
          >
            <SelectValue placeholder="Template" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL} className="text-xs">
              No Template Filter
            </SelectItem>
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.id} className="text-xs">
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Button
        type="button"
        size="sm"
        variant={filters.favoritesOnly ? "default" : "outline"}
        className="h-8 text-xs gap-1.5"
        onClick={() => set({ favoritesOnly: !filters.favoritesOnly })}
        data-ocid="qms.filter.favorites_only"
      >
        <Star
          className={cn("w-3.5 h-3.5", filters.favoritesOnly && "fill-current")}
        />
        Favorites ({favoriteCount})
      </Button>

      {activeCount > 0 && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 text-xs gap-1 text-muted-foreground"
          onClick={() =>
            set({
              processId: "",
              operationId: "",
              category: "",
              criticality: "",
              inspectionMethodId: "",
              customerScope: "",
              templateId: "",
            })
          }
          data-ocid="qms.filter.clear"
        >
          <X className="w-3.5 h-3.5" />
          Clear ({activeCount})
        </Button>
      )}
    </div>
  );
}
