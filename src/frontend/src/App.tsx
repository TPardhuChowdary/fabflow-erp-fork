import { Toaster } from "@/components/ui/sonner";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AuthProvider, useAuth } from "./AuthContext";
import {
  type WorkspaceRecordType,
  useRecentWorkspaces,
} from "./RecentWorkspacesContext";
import type { LlmMessage } from "./agent/llm/client";
import type { PendingToolCall } from "./agent/llm/orchestrator";
import { ForcePasswordChangeScreen } from "./components/ForcePasswordChangeScreen";
import { InvoicePrintView } from "./components/InvoicePrintView";
import { Layout } from "./components/Layout";
import { QuotationPrintView } from "./components/QuotationPrintView";
import { DrawingEditorPage } from "./drawingEditor/pages/DrawingEditorPage";
import { useSupabaseHydration } from "./hooks/useSupabaseHydration";
import { getTenderDocumentSignedUrl } from "./lib/tendersApi";
import { AgentPage } from "./pages/AgentPage";
import type { AiChatEntry } from "./pages/AgentPage";
import { CompanyDocuments } from "./pages/CompanyDocuments";
import CompanyPOs from "./pages/CompanyPOs";
import { CustomerHistory } from "./pages/CustomerHistory";
import { Customers } from "./pages/Customers";
import { Dashboard } from "./pages/Dashboard";
import { DeliveryChallans } from "./pages/DeliveryChallans";
import { DieDetail } from "./pages/DieDetail";
import { Dies } from "./pages/Dies";
import { EmailCenter } from "./pages/EmailCenter";
import { EmployeeDetail } from "./pages/EmployeeDetail";
import { Employees } from "./pages/Employees";
import { EwayBills } from "./pages/EwayBills";
import { ExportEngine } from "./pages/ExportEngine";
import { Inventory } from "./pages/Inventory";
import { Invoices } from "./pages/Invoices";
import { JobCards } from "./pages/JobCards";
import { Ledger } from "./pages/Ledger";
import { LoginPage } from "./pages/LoginPage";
import { MachineDetail } from "./pages/MachineDetail";
import { MachineRevenue } from "./pages/MachineRevenue";
import { Machinery } from "./pages/Machinery";
import { MaterialRequisitions } from "./pages/MaterialRequisitions";
import { MyJobs } from "./pages/MyJobs";
import { Payables } from "./pages/Payables";
import { Payments } from "./pages/Payments";
import PettyExpenses from "./pages/PettyExpenses";
import { Production } from "./pages/Production";
import { ProjectDetail } from "./pages/ProjectDetail";
import { Projects } from "./pages/Projects";
import { PurchaseOrders } from "./pages/PurchaseOrders";
import { Quality } from "./pages/Quality";
import { Quotations } from "./pages/Quotations";
import { ScrapManagement } from "./pages/ScrapManagement";
import { Settings } from "./pages/Settings";
import { TenderDetail } from "./pages/TenderDetail";
import { TenderManagement } from "./pages/TenderManagement";
import { ToolDetail } from "./pages/ToolDetail";
import { Tools } from "./pages/Tools";
import { Vendors } from "./pages/Vendors";
import { DesignShowcase } from "./pages/design-lab/DesignShowcase";
import { DesignArchive } from "./pages/design-lab/archive/DesignArchive";
import { StyleShowcase } from "./pages/design-lab/stylekit/StyleShowcase";
import { FinalPrototype } from "./pages/design-lab/uxlab/FinalPrototype";
import { UxLabShowcase } from "./pages/design-lab/uxlab/UxLabShowcase";
import { UxDecisionLab } from "./pages/design-lab/uxlab/decisionlab/UxDecisionLab";
import { UxImplementationLab } from "./pages/design-lab/uxlab/implementationlab/UxImplementationLab";
import { VisualSystemLab } from "./pages/design-lab/uxlab/visuallab/VisualSystemLab";
import { ExplorationShowcase } from "./pages/design-lab/v2/ExplorationShowcase";
import { canView } from "./permissions";
import { InspectionSheetsList } from "./qms/pages/InspectionSheetsList";
import { InspectorDashboard } from "./qms/pages/InspectorDashboard";
import { QmsDashboard } from "./qms/pages/QmsDashboard";
import { QualityCharacteristicLibrary } from "./qms/pages/QualityCharacteristicLibrary";
import { useStore } from "./store";
import type { Invoice, Page, Quotation } from "./types";

function AppInner() {
  const { currentUser, isInitializing } = useAuth();
  // Phase 18 — independent of the local-auth gate above: checks its own
  // Supabase Auth session and safely no-ops if none exists (see
  // useSupabaseHydration.ts for the full rationale).
  useSupabaseHydration();
  const [page, setPage] = useState<Page>("dashboard");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(
    null,
  );
  const [selectedMachineId, setSelectedMachineId] = useState<string>("");
  const [selectedDieId, setSelectedDieId] = useState<string>("");
  const [selectedToolId, setSelectedToolId] = useState<string>("");
  const [selectedTenderId, setSelectedTenderId] = useState<string>("");
  const [exportContext, setExportContext] = useState<{
    type: "project" | "customer";
    id: string;
    name: string;
  } | null>(null);
  const [selectedDrawingEditorContext, setSelectedDrawingEditorContext] =
    useState<{
      // Only "project"/"machine" are ever passed as initialOwnerType below
      // - a die can never actually own a drawing (drawings.owner_type has
      // no "die" value; dies only ever appear on the drawing_links side -
      // see DieDetail.tsx). backTo exists purely so the editor's own
      // "back" button can return to the die detail page it was opened
      // from, without pretending the die owns anything.
      ownerType?: "project" | "machine";
      ownerId?: string;
      drawingId?: string;
      backTo?: { type: "die" | "tool"; id: string };
    } | null>(null);
  /** Carries a one-shot "land on this tab, highlight this row" instruction
   * for a cross-module navigation (e.g. Petty Expense History's "View
   * Inventory Record"). Consumed by Inventory/MachineDetail/EmployeeDetail
   * as initialTab/highlight props. */
  const [moduleNavContext, setModuleNavContext] = useState<{
    tab?: string;
    highlightId?: string;
  } | null>(null);
  // Workspaces feature (see chat) — pushRecent is called from the one
  // navigateToRecord chokepoint below. The visible sidebar Workspaces
  // section reads the same shared context directly in Layout.tsx (no
  // prop-drilling needed - it's a real React Context, not local state).
  const { pushRecent } = useRecentWorkspaces();

  // AI Agent redesign (see chat) — the AI panel's conversation state,
  // lifted here (same pattern as selectedProjectId etc. above) so
  // navigating away from and back to the Agent page keeps the
  // conversation instead of losing it on unmount. See AgentPage.tsx's
  // AgentAiState for the full rationale.
  const [aiChat, setAiChat] = useState<AiChatEntry[]>([]);
  const [aiMessages, setAiMessages] = useState<LlmMessage[]>([]);
  const [aiPending, setAiPending] = useState<{
    messages: LlmMessage[];
    pendingCalls: PendingToolCall[];
  } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiInstruction, setAiInstruction] = useState("");
  const [pendingFiles, setPendingFiles] = useState<
    Array<{ id: string; file: File; rejected?: string }>
  >([]);

  // Clear the carried-over project/drawing context as soon as the user
  // leaves the editor — otherwise clicking the plain global nav item after
  // visiting a project would incorrectly reopen that project's context.
  useEffect(() => {
    if (page !== "drawing-editor" && selectedDrawingEditorContext) {
      setSelectedDrawingEditorContext(null);
    }
  }, [page, selectedDrawingEditorContext]);

  // QA acceptance testing found: the AI Agent conversation above is lifted
  // to this component specifically so it survives navigating away and back
  // (see the comment at its declaration) — but AppInner itself is never
  // remounted on sign-out/sign-in (by design, so sign-out renders instantly
  // instead of a full reload), so a second user signing into the SAME
  // browser tab right after another user's session inherited that first
  // user's chat transcript verbatim. Reset it whenever the signed-in
  // identity changes (covers sign-out -> null and switching accounts).
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberately keyed only on identity — the setters are stable and don't need to be listed
  useEffect(() => {
    setAiChat([]);
    setAiMessages([]);
    setAiPending(null);
    setAiBusy(false);
    setAiInstruction("");
    setPendingFiles([]);
  }, [currentUser?.id]);

  // Same rationale as above, for moduleNavContext: only relevant on the
  // three pages it can target, otherwise clear it so a later plain visit
  // to that page doesn't inherit a stale highlight/tab.
  useEffect(() => {
    if (
      page !== "inventory" &&
      page !== "machine-detail" &&
      page !== "employee-detail" &&
      moduleNavContext
    ) {
      setModuleNavContext(null);
    }
  }, [page, moduleNavContext]);
  const { customers, tenders, invoices } = useStore();

  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginPage />;
  }

  if (currentUser.mustChangePassword) {
    return <ForcePasswordChangeScreen />;
  }

  // Workspaces feature (see chat) — the ONE real navigation chokepoint
  // for every "open this real record" action in the whole app: every
  // page component below reports "the user picked record X" up to this
  // single function via its own onView*/onOpen* callback prop (already
  // true before this pass - only what those callbacks DO changed), so
  // this is the one place that needs to register a recent workspace,
  // not every call site individually. Vendors has no id-driven route of
  // its own (list+dialog screen) - it reuses the exact same
  // moduleNavContext "land on this tab, highlight this row" mechanism
  // Inventory/MachineDetail/EmployeeDetail already use, now also
  // consumed by Vendors.tsx. Quotations still has no supported jump
  // target - the palette's "Go to Quotations" module entry covers that
  // list-level case.
  const navigateToRecord = (type: WorkspaceRecordType, id: string) => {
    switch (type) {
      case "project":
        setSelectedProjectId(id);
        setPage("project-detail");
        break;
      case "customer":
        setSelectedCustomerId(id);
        setPage("customer-history");
        break;
      case "employee":
        setSelectedEmployeeId(id);
        setPage("employee-detail");
        break;
      case "machine":
        setSelectedMachineId(id);
        setPage("machine-detail");
        break;
      case "vendor":
        setModuleNavContext({ highlightId: id });
        setPage("vendors");
        break;
      case "die":
        setSelectedDieId(id);
        setPage("die-detail");
        break;
      case "tool":
        setSelectedToolId(id);
        setPage("tool-detail");
        break;
      case "tender":
        setSelectedTenderId(id);
        setPage("tender-detail");
        break;
      case "invoice":
        // Same "land on this list page, open this exact record" pattern
        // already used for "vendor" above — Invoices.tsx is a dialog/
        // list page with no separate detail route, exactly like Vendors.
        setModuleNavContext({ highlightId: id });
        setPage("invoices");
        break;
    }
    pushRecent(type, id);
  };

  // Phase 20 (Group 2) — "Extract Requirements with AI" from
  // TenderDetail.tsx's Overview tab. Reuses the exact chat-attachment
  // pipeline already proven for reading PDFs (see AgentPage.tsx's
  // pendingFiles -> uploadAgentDocument -> "document" content block ->
  // openaiProvider.ts's input_file handling) — the only difference from a
  // user manually attaching a file is that this fetches the tender's
  // ALREADY-uploaded document and pre-fills the prompt, instead of making
  // the user re-pick a file they already uploaded once. No new backend
  // path, no parallel extraction system.
  const handleExtractTenderWithAI = async (tenderId: string) => {
    const tender = tenders.find((t) => t.id === tenderId);
    if (!tender?.sourceDocumentStoragePath) {
      toast.error("This tender has no source document uploaded yet.");
      return;
    }
    const url = await getTenderDocumentSignedUrl(
      tender.sourceDocumentStoragePath,
    );
    if (!url) {
      toast.error("Could not access the tender's source document.");
      return;
    }
    let file: File;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`fetch failed (${res.status})`);
      const blob = await res.blob();
      file = new File(
        [blob],
        tender.sourceDocumentFilename || "tender-document.pdf",
        { type: blob.type || "application/pdf" },
      );
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `Could not load the document: ${err.message}`
          : "Could not load the document.",
      );
      return;
    }
    setPendingFiles((prev) => [...prev, { id: crypto.randomUUID(), file }]);
    setAiInstruction(
      `I've attached the source document for tender ${tender.tenderNumber} ("${tender.title}"). Please read the entire document (all pages, including any tables/annexures) and add every distinct requirement you find using addTenderRequirement, preserving the tender's exact wording — never paraphrase. Use findTender first to confirm the tender id.`,
    );
    setPage("agent");
  };

  const accessDenied = (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10">
        <span className="text-2xl">🔒</span>
      </div>
      <div className="text-center">
        <h2 className="text-lg font-bold">Access Restricted</h2>
        <p className="text-sm text-muted-foreground mt-1">
          You do not have permission to view this module.
        </p>
      </div>
    </div>
  );

  const renderPage = () => {
    switch (page) {
      case "dashboard":
        return <Dashboard onNavigate={setPage} />;
      case "customers":
        return (
          <Customers onViewHistory={(id) => navigateToRecord("customer", id)} />
        );
      case "customer-history":
        if (!canView(currentUser, "customers")) return accessDenied;
        return (
          <CustomerHistory
            customerId={selectedCustomerId}
            onNavigate={setPage}
            onViewInvoice={setSelectedInvoice}
            onViewQuotation={setSelectedQuotation}
            onViewProject={(id) => navigateToRecord("project", id)}
            onGenerateReport={(id, name) => {
              setExportContext({ type: "customer", id, name });
              setPage("export-engine");
            }}
          />
        );
      case "projects":
        return (
          <Projects onViewProject={(id) => navigateToRecord("project", id)} />
        );
      case "project-detail":
        if (!canView(currentUser, "projects")) return accessDenied;
        return (
          <ProjectDetail
            projectId={selectedProjectId}
            onBack={() => setPage("projects")}
            onGenerateReport={(id, name) => {
              setExportContext({ type: "project", id, name });
              setPage("export-engine");
            }}
            onOpenDrawingEditor={(context) => {
              setSelectedDrawingEditorContext({
                ownerType: "project",
                ownerId: context.projectId,
                drawingId: context.drawingId,
              });
              setPage("drawing-editor");
            }}
            onViewInvoices={() => setPage("invoices")}
            onViewInvoice={(id) => navigateToRecord("invoice", id)}
          />
        );
      case "employees":
        return (
          <Employees
            onViewEmployee={(id) => navigateToRecord("employee", id)}
          />
        );
      case "employee-detail":
        if (!canView(currentUser, "employees")) return accessDenied;
        return (
          <EmployeeDetail
            employeeId={selectedEmployeeId}
            onBack={() => setPage("employees")}
            initialTab={moduleNavContext?.tab}
          />
        );
      case "inventory":
        return (
          <Inventory
            initialTab={
              moduleNavContext?.tab as "stock" | "purchases" | undefined
            }
            highlightPurchaseId={moduleNavContext?.highlightId}
            onNavigateToRecord={navigateToRecord}
          />
        );
      case "settings":
        if (!canView(currentUser, "settings")) return accessDenied;
        return <Settings />;
      case "quotations":
        return <Quotations />;
      case "purchase-orders":
        if (!canView(currentUser, "purchase_orders")) return accessDenied;
        return <PurchaseOrders />;
      case "company-po":
        return <CompanyPOs />;
      case "production":
        return (
          <Production onOpenProject={(id) => navigateToRecord("project", id)} />
        );
      case "job-cards":
        if (!canView(currentUser, "job_cards")) return accessDenied;
        return <JobCards />;
      case "my-jobs":
        if (!canView(currentUser, "job_cards")) return accessDenied;
        return <MyJobs />;
      case "material-requisitions":
        if (!canView(currentUser, "material_requisitions")) return accessDenied;
        return <MaterialRequisitions />;
      case "quality":
        return <Quality />;
      case "delivery-challans":
        return <DeliveryChallans />;
      case "invoices":
        return (
          <Invoices
            highlightInvoiceId={
              page === "invoices" ? moduleNavContext?.highlightId : undefined
            }
            onViewProject={(id) => navigateToRecord("project", id)}
            onViewCustomer={(id) => navigateToRecord("customer", id)}
          />
        );
      case "eway-bills":
        return (
          <EwayBills
            onViewInvoice={(invoiceId) => {
              // Reuses the app-level InvoicePrintView dialog wired below
              // (selectedInvoice/setSelectedInvoice) — no second invoice
              // viewer is created for this page.
              const inv = invoices.find((i) => i.id === invoiceId);
              if (inv) setSelectedInvoice(inv);
            }}
          />
        );
      case "payments":
        if (!canView(currentUser, "payments")) return accessDenied;
        return <Payments />;
      case "payables":
        if (!canView(currentUser, "payables")) return accessDenied;
        return <Payables />;
      case "petty-expenses":
        if (!canView(currentUser, "petty_expenses")) return accessDenied;
        return (
          <PettyExpenses
            onViewInventoryPurchase={(purchaseId) => {
              setModuleNavContext({
                tab: "purchases",
                highlightId: purchaseId,
              });
              setPage("inventory");
            }}
            onViewMachineService={(machineId, serviceId) => {
              if (!canView(currentUser, "machinery")) return;
              setSelectedMachineId(machineId);
              setModuleNavContext({ tab: "service", highlightId: serviceId });
              setPage("machine-detail");
            }}
            onViewEmployeeRecord={(employeeId) => {
              if (!canView(currentUser, "employees")) return;
              setSelectedEmployeeId(employeeId);
              setModuleNavContext({ tab: "salary" });
              setPage("employee-detail");
            }}
          />
        );
      case "vendors":
        return (
          <Vendors
            onNavigate={setPage}
            onViewProject={(id) => navigateToRecord("project", id)}
            highlightVendorId={moduleNavContext?.highlightId}
            onOpenVendor={(id) => pushRecent("vendor", id)}
          />
        );
      case "machinery":
        if (!canView(currentUser, "machinery")) return accessDenied;
        return (
          <Machinery onViewMachine={(id) => navigateToRecord("machine", id)} />
        );
      case "machine-detail":
        if (!canView(currentUser, "machinery")) return accessDenied;
        return (
          <MachineDetail
            machineId={selectedMachineId}
            onBack={() => setPage("machinery")}
            initialTab={moduleNavContext?.tab}
            highlightServiceId={moduleNavContext?.highlightId}
            onOpenDrawingEditor={(context) => {
              setSelectedDrawingEditorContext({
                ownerType: "machine",
                ownerId: context.machineId,
                drawingId: context.drawingId,
              });
              setPage("drawing-editor");
            }}
            onViewVendor={(id) => navigateToRecord("vendor", id)}
          />
        );
      case "tools":
        if (!canView(currentUser, "tools")) return accessDenied;
        return <Tools onViewTool={(id) => navigateToRecord("tool", id)} />;
      case "tool-detail":
        if (!canView(currentUser, "tools")) return accessDenied;
        return (
          <ToolDetail
            toolId={selectedToolId}
            onBack={() => setPage("tools")}
            onOpenDrawing={(drawingId) => {
              setSelectedDrawingEditorContext({
                drawingId,
                backTo: { type: "tool", id: selectedToolId },
              });
              setPage("drawing-editor");
            }}
            onViewVendor={(id) => navigateToRecord("vendor", id)}
          />
        );
      case "dies":
        if (!canView(currentUser, "tooling_dies")) return accessDenied;
        return <Dies onViewDie={(id) => navigateToRecord("die", id)} />;
      case "die-detail":
        if (!canView(currentUser, "tooling_dies")) return accessDenied;
        return (
          <DieDetail
            dieId={selectedDieId}
            onBack={() => setPage("dies")}
            onOpenDrawing={(drawingId) => {
              setSelectedDrawingEditorContext({
                drawingId,
                backTo: { type: "die", id: selectedDieId },
              });
              setPage("drawing-editor");
            }}
            onViewVendor={(id) => navigateToRecord("vendor", id)}
          />
        );
      case "machine-revenue":
        if (!canView(currentUser, "machine_revenue")) return accessDenied;
        return <MachineRevenue />;
      case "agent":
        // No page-level permission gate: every action the Agent can take is
        // individually checked against the current user's real permissions
        // at execution time (agent/actions.ts's runAction). A user with no
        // permissions can open the page but every action will be blocked,
        // same as it would be by hand.
        return (
          <AgentPage
            onNavigate={setPage}
            onNavigateToRecord={navigateToRecord}
            aiState={{
              aiChat,
              setAiChat,
              aiMessages,
              setAiMessages,
              aiPending,
              setAiPending,
              aiBusy,
              setAiBusy,
              aiInstruction,
              setAiInstruction,
              pendingFiles,
              setPendingFiles,
            }}
          />
        );
      case "email-center":
        // Universal Email Integration (see chat) — gated on the real
        // "email" permission module (unlike AI Agent above), since this
        // page reads real connected-mailbox content, not just proposes
        // ERP actions someone else must confirm. ERP-reference linking
        // (clicking a matched vendor/PO in a message) is a later phase,
        // once AI classification/entity matching exists — this page has
        // no navigateToRecord prop yet because it has nothing real to
        // navigate to from an email today.
        if (!canView(currentUser, "email")) return accessDenied;
        return <EmailCenter />;
      case "company-documents":
        if (!canView(currentUser, "company_documents")) return accessDenied;
        return <CompanyDocuments />;
      case "tenders":
        if (!canView(currentUser, "tenders")) return accessDenied;
        return (
          <TenderManagement
            onViewTender={(id) => navigateToRecord("tender", id)}
          />
        );
      case "tender-detail":
        if (!canView(currentUser, "tenders")) return accessDenied;
        return (
          <TenderDetail
            tenderId={selectedTenderId}
            onBack={() => setPage("tenders")}
            onExtractWithAI={handleExtractTenderWithAI}
          />
        );
      case "design-lab":
        // Isolated design-presentation tool (see components/Layout.tsx's
        // "Design Lab" group). Renders entirely inside its own scoped
        // wrapper — never touches global tokens or shared components, so
        // it can't affect the rest of the app. No permission gate, same
        // policy as AI Agent above: it's a presentation surface, not a
        // data-bearing module.
        return <DesignShowcase />;
      case "design-lab-v2":
        // Second, separate isolated design-exploration surface (14 new
        // concepts) — additive alongside "design-lab" above, does not
        // touch or replace the original 6-style showcase. Same no-gate
        // policy: presentation tool, not a data-bearing module.
        return <ExplorationShowcase />;
      case "style-lab":
        // Third, separate isolated design-exploration surface (10
        // aesthetic-movement concepts) — additive alongside "design-lab"
        // and "design-lab-v2" above, does not touch either. Same no-gate
        // policy: presentation tool, not a data-bearing module.
        return <StyleShowcase />;
      case "design-archive":
        // Consolidates rounds 1–3 (design-lab, design-lab/v2,
        // design-lab/stylekit) into one browsable gallery — reuses each
        // round's own exported components directly, touches none of
        // their files. Same no-gate policy as the other lab pages.
        return <DesignArchive />;
      case "ux-lab":
        // 5 working UX prototypes with a real mutable mock store (see
        // pages/design-lab/uxlab/store.tsx) — fully additive alongside
        // the other 3 lab pages, no shared state or files with any of
        // them. Same no-gate policy: presentation/prototype tool.
        return <UxLabShowcase />;
      case "ux-final":
        // The final unified prototype (see pages/design-lab/uxlab/
        // FinalPrototype.tsx) — Model 05's shell with the Role/
        // Attention/Relationship/Command/Briefing/Pipeline layers
        // merged in. Reuses the same store/ModuleRouter as ux-lab;
        // fully additive, no shared files with any other page.
        return <FinalPrototype />;
      case "ux-decision-lab":
        // UX Consolidation / Decision Lab (see pages/design-lab/uxlab/
        // decisionlab/UxDecisionLab.tsx) — a UX ARCHITECTURE DECISION
        // phase, not implementation. Compares production vs. the Final
        // UX Prototype module-by-module (KEEP/ADOPT/HYBRID/REJECT),
        // reuses the same store/ModuleRouter as ux-final rather than
        // duplicating it; fully additive, no shared files with any
        // other page. Same no-gate policy as every other lab entry.
        return <UxDecisionLab />;
      case "ux-visual-lab":
        // Visual System Lab (see pages/design-lab/uxlab/visuallab/
        // VisualSystemLab.tsx) — Phase 3: determines the VISUAL system
        // for the UX architecture approved in ux-decision-lab. Reuses
        // the existing 6-style Design Lab harness (ShowcaseTemplate.tsx/
        // themes.ts) for the comparison rather than duplicating it; adds
        // two new "Instrument" palettes (light+dark) as the
        // recommendation. Fully additive, no shared files with any
        // other page. Same no-gate policy as every other lab entry.
        return <VisualSystemLab />;
      case "ux-implementation-lab":
        // UX Implementation Lab (see pages/design-lab/uxlab/
        // implementationlab/UxImplementationLab.tsx) — Phase 4: the
        // FINAL UX IMPLEMENTATION BLUEPRINT's representative screens —
        // real production functionality + approved UX architecture
        // (ux-decision-lab) + approved Instrument visual system
        // (ux-visual-lab), combined. Reuses decisionlab's real screens
        // wrapped in the Instrument skin rather than duplicating them a
        // third time. Design validation only — NOT a production
        // implementation sign-off. Fully additive, no shared files with
        // any other page. Same no-gate policy as every other lab entry.
        return <UxImplementationLab />;
      case "export-engine":
        if (!canView(currentUser, "export_engine")) return accessDenied;
        return (
          <ExportEngine
            context={exportContext}
            onBack={() => {
              if (exportContext?.type === "project") setPage("project-detail");
              else setPage("customers");
            }}
          />
        );
      case "scrap":
        return <ScrapManagement />;
      case "qms-dashboard":
        if (!canView(currentUser, "quality_characteristics"))
          return accessDenied;
        return <QmsDashboard onNavigate={setPage} />;
      case "qms-characteristics":
        if (!canView(currentUser, "quality_characteristics"))
          return accessDenied;
        return <QualityCharacteristicLibrary />;
      case "qms-inspection-sheets":
        if (!canView(currentUser, "inspection_sheets")) return accessDenied;
        return (
          <InspectionSheetsList
            onViewProject={(id) => navigateToRecord("project", id)}
          />
        );
      case "qms-my-inspections":
        if (!canView(currentUser, "inspection_sheets")) return accessDenied;
        return (
          <InspectorDashboard
            onOpenProject={(id) => navigateToRecord("project", id)}
          />
        );
      case "drawing-editor":
        if (!canView(currentUser, "drawing_editor")) return accessDenied;
        return (
          <DrawingEditorPage
            initialOwnerType={selectedDrawingEditorContext?.ownerType}
            initialOwnerId={selectedDrawingEditorContext?.ownerId}
            initialDrawingId={selectedDrawingEditorContext?.drawingId}
            onExitContext={
              selectedDrawingEditorContext?.ownerType === "machine"
                ? () => setPage("machine-detail")
                : selectedDrawingEditorContext?.ownerType === "project"
                  ? () => setPage("project-detail")
                  : selectedDrawingEditorContext?.backTo?.type === "die"
                    ? () => setPage("die-detail")
                    : selectedDrawingEditorContext?.backTo?.type === "tool"
                      ? () => setPage("tool-detail")
                      : undefined
            }
          />
        );
      case "ledger":
        if (!canView(currentUser, "ledger")) return accessDenied;
        return <Ledger />;
      default:
        return <Dashboard onNavigate={setPage} />;
    }
  };

  // Workspaces feature (see chat) — which sidebar Workspaces entry (if
  // any) matches the record actually being viewed right now, so it can
  // be highlighted. Matches pushRecent's own `${type}-${id}` key shape.
  const activeWorkspaceKey: string | undefined =
    page === "project-detail" && selectedProjectId
      ? `project-${selectedProjectId}`
      : page === "customer-history" && selectedCustomerId
        ? `customer-${selectedCustomerId}`
        : page === "employee-detail" && selectedEmployeeId
          ? `employee-${selectedEmployeeId}`
          : page === "machine-detail" && selectedMachineId
            ? `machine-${selectedMachineId}`
            : page === "vendors" && moduleNavContext?.highlightId
              ? `vendor-${moduleNavContext.highlightId}`
              : page === "tender-detail" && selectedTenderId
                ? `tender-${selectedTenderId}`
                : undefined;

  return (
    <>
      <Layout
        currentPage={page}
        onNavigate={setPage}
        onNavigateToRecord={navigateToRecord}
        activeWorkspaceKey={activeWorkspaceKey}
      >
        {renderPage()}
      </Layout>
      <Toaster richColors position="top-right" />
      <InvoicePrintView
        invoice={selectedInvoice}
        customer={
          customers.find((c) => c.id === selectedInvoice?.customerId) ?? null
        }
        open={!!selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
      />
      <QuotationPrintView
        quotation={selectedQuotation}
        customer={
          customers.find((c) => c.id === selectedQuotation?.customerId) ?? null
        }
        open={!!selectedQuotation}
        onClose={() => setSelectedQuotation(null)}
      />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
