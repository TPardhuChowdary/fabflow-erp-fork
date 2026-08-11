import type {
  DrawingDocument,
  DrawingLink,
  DrawingView,
  UserEditorPreference,
} from "../types";
import { DRAWING_EDITOR_STORES } from "./database";
import { Repository } from "./repository";

export const drawingRepo = new Repository<DrawingDocument>(
  DRAWING_EDITOR_STORES.drawings,
);
export const drawingViewRepo = new Repository<DrawingView>(
  DRAWING_EDITOR_STORES.drawingViews,
);
export const userPreferenceRepo = new Repository<UserEditorPreference>(
  DRAWING_EDITOR_STORES.userPreferences,
);
export const drawingLinkRepo = new Repository<DrawingLink>(
  DRAWING_EDITOR_STORES.drawingLinks,
);
