// Phase 18 — the one integration point that calls into the centralized
// hydration layer (src/lib/hydration.ts) and writes results into Zustand.
// Deliberately independent of AuthContext: it checks its own, separate
// Supabase Auth session state, and safely no-ops when none exists (the
// normal case today, since local login and Supabase Auth remain two
// independent systems per Phase 17B/17C - unifying them is not part of
// this phase).

import {
  hydrateAdvanceRecords,
  hydrateAttendanceRecords,
  hydrateBomItems,
  hydrateBomRequisitions,
  hydrateCompanyPOs,
  hydrateCustomers,
  hydrateDeliveryChallans,
  hydrateEmployeeDocuments,
  hydrateEmployees,
  hydrateExpenseFloats,
  hydrateInventoryItems,
  hydrateInventoryPurchases,
  hydrateInventoryUsages,
  hydrateInvoices,
  hydrateMasterPOs,
  hydrateOutsourcedWorks,
  hydratePayments,
  hydratePettyExpenses,
  hydrateProjectEmployees,
  hydrateProjectPurchaseOrders,
  hydrateProjectQmsInspectionAttempts,
  hydrateProjectQmsInspectionCharacteristics,
  hydrateProjectQmsInspectionOverrides,
  hydrateProjectQmsInspections,
  hydrateProjects,
  hydrateQuotationPurchaseOrders,
  hydrateQuotationRevisions,
  hydrateQuotations,
  hydrateSalaryPayments,
  hydrateVendors,
} from "@/lib/hydration";
import type { HydrationResult } from "@/lib/hydration";
import { useQmsStore } from "@/qms/store/useQmsStore";
import { useStore } from "@/store";
import { useEffect } from "react";

// Phase 27 — shared shape for a "loading -> replace-on-success" effect,
// factored out to avoid repeating the same 15-line block for every one
// of Batch 1's 9 new independent domains. Behavior is identical to every
// hand-written effect above it: only a successful fetch ever replaces
// local state; loading/error/unauthenticated results only update the
// status, never touch the domain's array.
function useHydrationEffect<T>(
  fetcher: () => Promise<HydrationResult<T>>,
  setStatus: (
    status: "idle" | "loading" | "success" | "error" | "unauthenticated",
    error?: string,
  ) => void,
  setFromServer: (data: T) => void,
) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
  useEffect(() => {
    let cancelled = false;

    async function run() {
      setStatus("loading");
      const result = await fetcher();
      if (cancelled) return;

      if (result.status === "success" && result.data) {
        setFromServer(result.data);
      } else {
        setStatus(result.status, result.error);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);
}

export function useSupabaseHydration() {
  const setEmployeesFromServer = useStore((s) => s.setEmployeesFromServer);
  const setEmployeesHydrationStatus = useStore(
    (s) => s.setEmployeesHydrationStatus,
  );
  // Phase 19 — customers domain, same independent-per-domain shape as
  // employees above.
  const setCustomersFromServer = useStore((s) => s.setCustomersFromServer);
  const setCustomersHydrationStatus = useStore(
    (s) => s.setCustomersHydrationStatus,
  );
  // Phase 20 — inventory items domain, master-data scope only (see
  // lib/inventoryApi.ts). Hydration itself reads all columns including
  // the trigger-owned stock fields, for display purposes only.
  const setInventoryItemsFromServer = useStore(
    (s) => s.setInventoryItemsFromServer,
  );
  const setInventoryItemsHydrationStatus = useStore(
    (s) => s.setInventoryItemsHydrationStatus,
  );
  // Phase 21A — vendors domain, same independent-per-domain shape.
  const setVendorsFromServer = useStore((s) => s.setVendorsFromServer);
  const setVendorsHydrationStatus = useStore(
    (s) => s.setVendorsHydrationStatus,
  );
  // Phase 21B — company POs domain, same independent-per-domain shape.
  const setCompanyPOsFromServer = useStore((s) => s.setCompanyPOsFromServer);
  const setCompanyPOsHydrationStatus = useStore(
    (s) => s.setCompanyPOsHydrationStatus,
  );
  // Phase 22 — projects domain, same independent-per-domain shape.
  // setProjectsFromServer itself does the assignedEmployeeIds/pos/
  // poNumber/poDate/poFiles local-field merge (see store.ts) - this hook
  // stays identical to every other domain's effect shape.
  const setProjectsFromServer = useStore((s) => s.setProjectsFromServer);
  const setProjectsHydrationStatus = useStore(
    (s) => s.setProjectsHydrationStatus,
  );
  // Phase 24 — outsourced works domain, same independent-per-domain shape.
  // Plain wholesale replace - no local-only fields in this domain.
  const setOutsourcedWorksFromServer = useStore(
    (s) => s.setOutsourcedWorksFromServer,
  );
  const setOutsourcedWorksHydrationStatus = useStore(
    (s) => s.setOutsourcedWorksHydrationStatus,
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
  useEffect(() => {
    let cancelled = false;

    async function run() {
      setEmployeesHydrationStatus("loading");
      const result = await hydrateEmployees();
      if (cancelled) return;

      if (result.status === "success" && result.data) {
        // Only a successful fetch ever replaces local state - loading/
        // error/unauthenticated results only update the status, never
        // touch the employees array itself.
        setEmployeesFromServer(result.data);
      } else {
        setEmployeesHydrationStatus(result.status, result.error);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
  useEffect(() => {
    let cancelled = false;

    async function run() {
      setCustomersHydrationStatus("loading");
      const result = await hydrateCustomers();
      if (cancelled) return;

      if (result.status === "success" && result.data) {
        setCustomersFromServer(result.data);
      } else {
        setCustomersHydrationStatus(result.status, result.error);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
  useEffect(() => {
    let cancelled = false;

    async function run() {
      setInventoryItemsHydrationStatus("loading");
      const result = await hydrateInventoryItems();
      if (cancelled) return;

      if (result.status === "success" && result.data) {
        setInventoryItemsFromServer(result.data);
      } else {
        setInventoryItemsHydrationStatus(result.status, result.error);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
  useEffect(() => {
    let cancelled = false;

    async function run() {
      setVendorsHydrationStatus("loading");
      const result = await hydrateVendors();
      if (cancelled) return;

      if (result.status === "success" && result.data) {
        setVendorsFromServer(result.data);
      } else {
        setVendorsHydrationStatus(result.status, result.error);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
  useEffect(() => {
    let cancelled = false;

    async function run() {
      setCompanyPOsHydrationStatus("loading");
      const result = await hydrateCompanyPOs();
      if (cancelled) return;

      if (result.status === "success" && result.data) {
        setCompanyPOsFromServer(result.data);
      } else {
        setCompanyPOsHydrationStatus(result.status, result.error);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
  useEffect(() => {
    let cancelled = false;

    async function run() {
      setProjectsHydrationStatus("loading");
      const result = await hydrateProjects();
      if (cancelled) return;

      if (result.status === "success" && result.data) {
        setProjectsFromServer(result.data);
      } else {
        setProjectsHydrationStatus(result.status, result.error);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
  useEffect(() => {
    let cancelled = false;

    async function run() {
      setOutsourcedWorksHydrationStatus("loading");
      const result = await hydrateOutsourcedWorks();
      if (cancelled) return;

      if (result.status === "success" && result.data) {
        setOutsourcedWorksFromServer(result.data);
      } else {
        setOutsourcedWorksHydrationStatus(result.status, result.error);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  // Phase 27 Batch 1 — 9 more independent domains, same shape, factored
  // through useHydrationEffect above.
  useHydrationEffect(
    hydrateAdvanceRecords,
    useStore((s) => s.setAdvanceRecordsHydrationStatus),
    useStore((s) => s.setAdvanceRecordsFromServer),
  );
  useHydrationEffect(
    hydrateAttendanceRecords,
    useStore((s) => s.setAttendanceRecordsHydrationStatus),
    useStore((s) => s.setAttendanceRecordsFromServer),
  );
  useHydrationEffect(
    hydrateEmployeeDocuments,
    useStore((s) => s.setEmployeeDocumentsHydrationStatus),
    useStore((s) => s.setEmployeeDocumentsFromServer),
  );
  useHydrationEffect(
    hydrateSalaryPayments,
    useStore((s) => s.setSalaryPaymentsHydrationStatus),
    useStore((s) => s.setSalaryPaymentsFromServer),
  );
  useHydrationEffect(
    hydrateInventoryPurchases,
    useStore((s) => s.setInventoryPurchasesHydrationStatus),
    useStore((s) => s.setInventoryPurchasesFromServer),
  );
  useHydrationEffect(
    hydrateInventoryUsages,
    useStore((s) => s.setInventoryUsagesHydrationStatus),
    useStore((s) => s.setInventoryUsagesFromServer),
  );
  useHydrationEffect(
    hydrateBomItems,
    useStore((s) => s.setBomItemsHydrationStatus),
    useStore((s) => s.setBomItemsFromServer),
  );
  useHydrationEffect(
    hydrateBomRequisitions,
    useStore((s) => s.setBomRequisitionsHydrationStatus),
    useStore((s) => s.setBomRequisitionsFromServer),
  );
  useHydrationEffect(
    hydrateProjectEmployees,
    useStore((s) => s.setProjectEmployeesHydrationStatus),
    useStore((s) => s.setProjectEmployeesFromServer),
  );

  // Phase 27 Batch 2 — quotations, quotation_revisions, master_pos,
  // quotation_purchase_orders, project_purchase_orders. Same
  // independent-per-domain shape as every domain above.
  useHydrationEffect(
    hydrateQuotations,
    useStore((s) => s.setQuotationsHydrationStatus),
    useStore((s) => s.setQuotationsFromServer),
  );
  useHydrationEffect(
    hydrateQuotationRevisions,
    useStore((s) => s.setQuotationRevisionsHydrationStatus),
    useStore((s) => s.setQuotationRevisionsFromServer),
  );
  useHydrationEffect(
    hydrateMasterPOs,
    useStore((s) => s.setMasterPOsHydrationStatus),
    useStore((s) => s.setMasterPOsFromServer),
  );
  useHydrationEffect(
    hydrateQuotationPurchaseOrders,
    useStore((s) => s.setQuotationPurchaseOrdersHydrationStatus),
    useStore((s) => s.setQuotationPurchaseOrdersFromServer),
  );
  useHydrationEffect(
    hydrateProjectPurchaseOrders,
    useStore((s) => s.setProjectPurchaseOrdersHydrationStatus),
    useStore((s) => s.setProjectPurchaseOrdersFromServer),
  );

  // Phase 27 Batch 3 — expense_floats, petty_expenses.
  useHydrationEffect(
    hydrateExpenseFloats,
    useStore((s) => s.setExpenseFloatsHydrationStatus),
    useStore((s) => s.setExpenseFloatsFromServer),
  );
  useHydrationEffect(
    hydratePettyExpenses,
    useStore((s) => s.setPettyExpensesHydrationStatus),
    useStore((s) => s.setPettyExpensesFromServer),
  );

  // Phase 27 Batch 4 — delivery_challans.
  useHydrationEffect(
    hydrateDeliveryChallans,
    useStore((s) => s.setDeliveryChallansHydrationStatus),
    useStore((s) => s.setDeliveryChallansFromServer),
  );

  // Phase 27 Batch 5 — invoices (incl. invoice_items, joined into
  // lineItems), payments.
  useHydrationEffect(
    hydrateInvoices,
    useStore((s) => s.setInvoicesHydrationStatus),
    useStore((s) => s.setInvoicesFromServer),
  );
  useHydrationEffect(
    hydratePayments,
    useStore((s) => s.setPaymentsHydrationStatus),
    useStore((s) => s.setPaymentsFromServer),
  );

  // Phase 32 — Production ↔ QMS gate persistence (project_qms_inspections,
  // _characteristics, _attempts, _overrides). Deliberately writes into
  // useQmsStore, NOT useStore() - see that store's own Phase 32 section
  // comment. project_qms_inspection_attempt_photos is intentionally not
  // hydrated here at all (on-demand only, see
  // useQmsStore.loadProjectQmsInspectionAttemptPhotosForAttempts).
  useHydrationEffect(
    hydrateProjectQmsInspections,
    useQmsStore((s) => s.setProjectQmsInspectionsHydrationStatus),
    useQmsStore((s) => s.setProjectQmsInspectionsFromServer),
  );
  useHydrationEffect(
    hydrateProjectQmsInspectionCharacteristics,
    useQmsStore((s) => s.setProjectQmsInspectionCharacteristicsHydrationStatus),
    useQmsStore((s) => s.setProjectQmsInspectionCharacteristicsFromServer),
  );
  useHydrationEffect(
    hydrateProjectQmsInspectionAttempts,
    useQmsStore((s) => s.setProjectQmsInspectionAttemptsHydrationStatus),
    useQmsStore((s) => s.setProjectQmsInspectionAttemptsFromServer),
  );
  useHydrationEffect(
    hydrateProjectQmsInspectionOverrides,
    useQmsStore((s) => s.setProjectQmsInspectionOverridesHydrationStatus),
    useQmsStore((s) => s.setProjectQmsInspectionOverridesFromServer),
  );
}
