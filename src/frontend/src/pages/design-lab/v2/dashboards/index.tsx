// ERP Design Exploration — maps each concept's `dashboard` key to its body.
import type { DashboardKind } from "../concepts";
import {
  AiPriorityDashboard,
  CommandCenterDashboard,
  DenseGridDashboard,
  EditorialTimelineDashboard,
  KpiFocusDashboard,
  ManufacturingMonitorDashboard,
  WorkQueueDashboard,
} from "./setA";
import {
  ApprovalQueueDashboard,
  ContextThreadsDashboard,
  ConversationalDashboard,
  ExceptionOnlyDashboard,
  FactoryTwinDashboard,
  SpatialCanvasDashboard,
  TimelineMasterDashboard,
} from "./setB";

export const dashboardRegistry: Record<
  DashboardKind,
  React.ComponentType<{ concept: import("../concepts").Concept }>
> = {
  "kpi-focus": KpiFocusDashboard,
  "dense-grid": DenseGridDashboard,
  "command-center": CommandCenterDashboard,
  "editorial-timeline": EditorialTimelineDashboard,
  "ai-priority": AiPriorityDashboard,
  "manufacturing-monitor": ManufacturingMonitorDashboard,
  "work-queue": WorkQueueDashboard,
  "adaptive-modular": WorkQueueDashboard, // shares Work Queue's engine; a7's differentiation is in nav-reordering + saved views, not a distinct dashboard body — disclosed in the report.
  "spatial-canvas": SpatialCanvasDashboard,
  "exception-only": ExceptionOnlyDashboard,
  conversational: ConversationalDashboard,
  "context-threads": ContextThreadsDashboard,
  "timeline-master": TimelineMasterDashboard,
  "approval-queue": ApprovalQueueDashboard,
  "factory-twin": FactoryTwinDashboard,
};
