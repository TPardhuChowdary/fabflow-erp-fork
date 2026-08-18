// Phase 18 — the one integration point that calls into the centralized
// hydration layer (src/lib/hydration.ts) and writes results into Zustand.
//
// Phase 34 fix: every hydration effect below used to run exactly once, on
// this hook's first mount, with an empty dependency array. Each
// hydrate*() function correctly checks for a live Supabase Auth session
// first and returns {status: "unauthenticated"} if there isn't one yet —
// but because the effects never re-ran, a user who was still on the login
// screen (or whose session hadn't finished restoring) at the moment this
// component first mounted would have every domain permanently stuck on
// "unauthenticated", even seconds later after they successfully logged in
// in the very same tab. The only way real data ever loaded was a full page
// reload *after* a session already existed in localStorage. That's the
// root cause of "data from a previous session doesn't reappear after a
// fresh login" — confirmed live, not guessed.
//
// Fix: derive one stable `authKey` from AuthContext (not a separate,
// independent session check) and key every hydration effect's dependency
// array off it, so hydration re-runs exactly when auth state actually
// changes — once when a session is confirmed (fresh login, hard refresh,
// or a second tab picking up the same localStorage-backed session), and
// again on logout (clearing this hook's domains back to empty so a second
// user signing in on the same tab never briefly shows the first user's
// data).
import { useAuth } from "@/AuthContext";
import {
  hydrateAdvanceRecords,
  hydrateAttendanceRecords,
  hydrateBillableServices,
  hydrateBomItems,
  hydrateBomRequisitions,
  hydrateCompanyPOs,
  hydrateCustomers,
  hydrateDeliveryChallans,
  hydrateDies,
  hydrateEmployeeDocuments,
  hydrateEmployees,
  hydrateExpenseFloats,
  hydrateInventoryItems,
  hydrateInventoryPurchases,
  hydrateInventoryUsages,
  hydrateInvoices,
  hydrateMachineDies,
  hydrateMachineServiceRates,
  hydrateMachineServiceUsage,
  hydrateMachineSpareParts,
  hydrateMachines,
  hydrateMasterPOs,
  hydrateOutsourcedWorks,
  hydratePayments,
  hydratePettyExpenses,
  hydrateProjectDies,
  hydrateProjectEmployees,
  hydrateProjectMachinery,
  hydrateProjectProductionStages,
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
  hydrateToolAssignmentHistory,
  hydrateTools,
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
//
// Phase 34: takes `authKey` and re-runs whenever it changes instead of
// running once. `authKey` is one of:
//   "pending" — AuthContext hasn't finished resolving the session yet;
//               do nothing (no pointless unauthenticated round-trip while
//               the login screen is still showing).
//   "anon"    — confirmed no signed-in user (logged out, or never logged
//               in); reset this domain to idle/empty rather than fetching.
//   <user id> — a confirmed signed-in user; fetch for real. Changes again
//               (to a different id, or back to "anon") on logout/user
//               switch within the same tab, which re-fires this effect.
function useHydrationEffect<T extends unknown[]>(
  fetcher: () => Promise<HydrationResult<T>>,
  setStatus: (
    status: "idle" | "loading" | "success" | "error" | "unauthenticated",
    error?: string,
  ) => void,
  setFromServer: (data: T) => void,
  authKey: string,
) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: fetcher/setStatus/setFromServer are stable per call site; authKey is the only real trigger
  useEffect(() => {
    if (authKey === "pending") return;
    if (authKey === "anon") {
      setStatus("idle");
      setFromServer([] as unknown as T);
      return;
    }

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
  }, [authKey]);
}

export function useSupabaseHydration() {
  // Phase 34 — the single trigger every hydration effect below keys off.
  // Deliberately derived from AuthContext (the same session AppInner
  // already gates the whole app on) rather than each domain re-deriving
  // its own independent "is there a session" check the way it used to —
  // that independence was never the point (every hydrate*() function
  // still does its own defensive getSession() check too), it was just an
  // accident of how this hook was originally written, and it's exactly
  // what let hydration and login state drift out of sync.
  const { currentUser, isInitializing } = useAuth();
  const authKey = isInitializing ? "pending" : (currentUser?.id ?? "anon");

  const setEmployeesFromServer = useStore((s) => s.setEmployeesFromServer);
  const setEmployeesHydrationStatus = useStore(
    (s) => s.setEmployeesHydrationStatus,
  );
  const setCustomersFromServer = useStore((s) => s.setCustomersFromServer);
  const setCustomersHydrationStatus = useStore(
    (s) => s.setCustomersHydrationStatus,
  );
  const setInventoryItemsFromServer = useStore(
    (s) => s.setInventoryItemsFromServer,
  );
  const setInventoryItemsHydrationStatus = useStore(
    (s) => s.setInventoryItemsHydrationStatus,
  );
  const setVendorsFromServer = useStore((s) => s.setVendorsFromServer);
  const setVendorsHydrationStatus = useStore(
    (s) => s.setVendorsHydrationStatus,
  );
  const setCompanyPOsFromServer = useStore((s) => s.setCompanyPOsFromServer);
  const setCompanyPOsHydrationStatus = useStore(
    (s) => s.setCompanyPOsHydrationStatus,
  );
  const setProjectsFromServer = useStore((s) => s.setProjectsFromServer);
  const setProjectsHydrationStatus = useStore(
    (s) => s.setProjectsHydrationStatus,
  );
  const setOutsourcedWorksFromServer = useStore(
    (s) => s.setOutsourcedWorksFromServer,
  );
  const setOutsourcedWorksHydrationStatus = useStore(
    (s) => s.setOutsourcedWorksHydrationStatus,
  );

  // Phase 18/19/20/21/22/24 domains — previously 7 hand-written,
  // near-identical effects; now routed through the same
  // useHydrationEffect() every later domain already used, so the Phase 34
  // authKey fix applies uniformly instead of needing to be hand-applied 7
  // times.
  useHydrationEffect(
    hydrateEmployees,
    setEmployeesHydrationStatus,
    setEmployeesFromServer,
    authKey,
  );
  useHydrationEffect(
    hydrateCustomers,
    setCustomersHydrationStatus,
    setCustomersFromServer,
    authKey,
  );
  useHydrationEffect(
    hydrateInventoryItems,
    setInventoryItemsHydrationStatus,
    setInventoryItemsFromServer,
    authKey,
  );
  useHydrationEffect(
    hydrateVendors,
    setVendorsHydrationStatus,
    setVendorsFromServer,
    authKey,
  );
  useHydrationEffect(
    hydrateCompanyPOs,
    setCompanyPOsHydrationStatus,
    setCompanyPOsFromServer,
    authKey,
  );
  useHydrationEffect(
    hydrateProjects,
    setProjectsHydrationStatus,
    setProjectsFromServer,
    authKey,
  );
  useHydrationEffect(
    hydrateOutsourcedWorks,
    setOutsourcedWorksHydrationStatus,
    setOutsourcedWorksFromServer,
    authKey,
  );

  // Phase 35 — Machines (see database/phase-35).
  useHydrationEffect(
    hydrateMachines,
    useStore((s) => s.setMachinesHydrationStatus),
    useStore((s) => s.setMachinesFromServer),
    authKey,
  );

  // Phase 45 — Production Stages (see database/phase-45).
  useHydrationEffect(
    hydrateProjectProductionStages,
    useStore((s) => s.setProjectProductionsHydrationStatus),
    useStore((s) => s.setProjectProductionsFromServer),
    authKey,
  );

  // Phase 37 — Tools (see database/phase-37).
  useHydrationEffect(
    hydrateTools,
    useStore((s) => s.setToolsHydrationStatus),
    useStore((s) => s.setToolsFromServer),
    authKey,
  );

  // Phase 43 — Tool Assignment History (see database/phase-43).
  useHydrationEffect(
    hydrateToolAssignmentHistory,
    useStore((s) => s.setToolAssignmentHistoryHydrationStatus),
    useStore((s) => s.setToolAssignmentHistoryFromServer),
    authKey,
  );

  // Phase 38 — Dies + Machine<->Spare Part/Die compatibility (see
  // database/phase-38).
  useHydrationEffect(
    hydrateDies,
    useStore((s) => s.setDiesHydrationStatus),
    useStore((s) => s.setDiesFromServer),
    authKey,
  );
  useHydrationEffect(
    hydrateMachineSpareParts,
    useStore((s) => s.setMachineSparePartsHydrationStatus),
    useStore((s) => s.setMachineSparePartsFromServer),
    authKey,
  );
  useHydrationEffect(
    hydrateMachineDies,
    useStore((s) => s.setMachineDiesHydrationStatus),
    useStore((s) => s.setMachineDiesFromServer),
    authKey,
  );

  // Phase 27 Batch 1 — 9 more independent domains, same shape.
  useHydrationEffect(
    hydrateAdvanceRecords,
    useStore((s) => s.setAdvanceRecordsHydrationStatus),
    useStore((s) => s.setAdvanceRecordsFromServer),
    authKey,
  );
  useHydrationEffect(
    hydrateAttendanceRecords,
    useStore((s) => s.setAttendanceRecordsHydrationStatus),
    useStore((s) => s.setAttendanceRecordsFromServer),
    authKey,
  );
  useHydrationEffect(
    hydrateEmployeeDocuments,
    useStore((s) => s.setEmployeeDocumentsHydrationStatus),
    useStore((s) => s.setEmployeeDocumentsFromServer),
    authKey,
  );
  useHydrationEffect(
    hydrateSalaryPayments,
    useStore((s) => s.setSalaryPaymentsHydrationStatus),
    useStore((s) => s.setSalaryPaymentsFromServer),
    authKey,
  );
  useHydrationEffect(
    hydrateInventoryPurchases,
    useStore((s) => s.setInventoryPurchasesHydrationStatus),
    useStore((s) => s.setInventoryPurchasesFromServer),
    authKey,
  );
  useHydrationEffect(
    hydrateInventoryUsages,
    useStore((s) => s.setInventoryUsagesHydrationStatus),
    useStore((s) => s.setInventoryUsagesFromServer),
    authKey,
  );
  useHydrationEffect(
    hydrateBomItems,
    useStore((s) => s.setBomItemsHydrationStatus),
    useStore((s) => s.setBomItemsFromServer),
    authKey,
  );
  useHydrationEffect(
    hydrateBomRequisitions,
    useStore((s) => s.setBomRequisitionsHydrationStatus),
    useStore((s) => s.setBomRequisitionsFromServer),
    authKey,
  );
  useHydrationEffect(
    hydrateProjectEmployees,
    useStore((s) => s.setProjectEmployeesHydrationStatus),
    useStore((s) => s.setProjectEmployeesFromServer),
    authKey,
  );
  useHydrationEffect(
    hydrateProjectMachinery,
    useStore((s) => s.setProjectMachineryHydrationStatus),
    useStore((s) => s.setProjectMachineryFromServer),
    authKey,
  );
  useHydrationEffect(
    hydrateProjectDies,
    useStore((s) => s.setProjectDiesHydrationStatus),
    useStore((s) => s.setProjectDiesFromServer),
    authKey,
  );
  useHydrationEffect(
    hydrateBillableServices,
    useStore((s) => s.setBillableServicesHydrationStatus),
    useStore((s) => s.setBillableServicesFromServer),
    authKey,
  );
  useHydrationEffect(
    hydrateMachineServiceRates,
    useStore((s) => s.setMachineServiceRatesHydrationStatus),
    useStore((s) => s.setMachineServiceRatesFromServer),
    authKey,
  );
  useHydrationEffect(
    hydrateMachineServiceUsage,
    useStore((s) => s.setMachineServiceUsageHydrationStatus),
    useStore((s) => s.setMachineServiceUsageFromServer),
    authKey,
  );

  // Phase 27 Batch 2 — quotations, quotation_revisions, master_pos,
  // quotation_purchase_orders, project_purchase_orders.
  useHydrationEffect(
    hydrateQuotations,
    useStore((s) => s.setQuotationsHydrationStatus),
    useStore((s) => s.setQuotationsFromServer),
    authKey,
  );
  useHydrationEffect(
    hydrateQuotationRevisions,
    useStore((s) => s.setQuotationRevisionsHydrationStatus),
    useStore((s) => s.setQuotationRevisionsFromServer),
    authKey,
  );
  useHydrationEffect(
    hydrateMasterPOs,
    useStore((s) => s.setMasterPOsHydrationStatus),
    useStore((s) => s.setMasterPOsFromServer),
    authKey,
  );
  useHydrationEffect(
    hydrateQuotationPurchaseOrders,
    useStore((s) => s.setQuotationPurchaseOrdersHydrationStatus),
    useStore((s) => s.setQuotationPurchaseOrdersFromServer),
    authKey,
  );
  useHydrationEffect(
    hydrateProjectPurchaseOrders,
    useStore((s) => s.setProjectPurchaseOrdersHydrationStatus),
    useStore((s) => s.setProjectPurchaseOrdersFromServer),
    authKey,
  );

  // Phase 27 Batch 3 — expense_floats, petty_expenses.
  useHydrationEffect(
    hydrateExpenseFloats,
    useStore((s) => s.setExpenseFloatsHydrationStatus),
    useStore((s) => s.setExpenseFloatsFromServer),
    authKey,
  );
  useHydrationEffect(
    hydratePettyExpenses,
    useStore((s) => s.setPettyExpensesHydrationStatus),
    useStore((s) => s.setPettyExpensesFromServer),
    authKey,
  );

  // Phase 27 Batch 4 — delivery_challans.
  useHydrationEffect(
    hydrateDeliveryChallans,
    useStore((s) => s.setDeliveryChallansHydrationStatus),
    useStore((s) => s.setDeliveryChallansFromServer),
    authKey,
  );

  // Phase 27 Batch 5 — invoices (incl. invoice_items, joined into
  // lineItems), payments.
  useHydrationEffect(
    hydrateInvoices,
    useStore((s) => s.setInvoicesHydrationStatus),
    useStore((s) => s.setInvoicesFromServer),
    authKey,
  );
  useHydrationEffect(
    hydratePayments,
    useStore((s) => s.setPaymentsHydrationStatus),
    useStore((s) => s.setPaymentsFromServer),
    authKey,
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
    authKey,
  );
  useHydrationEffect(
    hydrateProjectQmsInspectionCharacteristics,
    useQmsStore((s) => s.setProjectQmsInspectionCharacteristicsHydrationStatus),
    useQmsStore((s) => s.setProjectQmsInspectionCharacteristicsFromServer),
    authKey,
  );
  useHydrationEffect(
    hydrateProjectQmsInspectionAttempts,
    useQmsStore((s) => s.setProjectQmsInspectionAttemptsHydrationStatus),
    useQmsStore((s) => s.setProjectQmsInspectionAttemptsFromServer),
    authKey,
  );
  useHydrationEffect(
    hydrateProjectQmsInspectionOverrides,
    useQmsStore((s) => s.setProjectQmsInspectionOverridesHydrationStatus),
    useQmsStore((s) => s.setProjectQmsInspectionOverridesFromServer),
    authKey,
  );
}
