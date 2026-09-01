// Monster-1 — extracted from Production.tsx's own local
// checkMaterialAvailability so the Agent's completeProductionStage action
// can reuse the exact same "InProgress" material-shortage check instead of
// re-deriving it (canonical business logic, not a second implementation
// that could silently drift from the UI's).
import type { BomItem, InventoryItem } from "@/types";

export function checkMaterialAvailability(
  projectId: string,
  bomItems: BomItem[],
  inventoryItems: InventoryItem[],
): { ok: boolean; shortages: string[] } {
  const projBomItems = (bomItems || []).filter(
    (b) => b.projectId === projectId,
  );
  const shortages: string[] = [];
  for (const bom of projBomItems) {
    const inv = (inventoryItems || []).find(
      (i) =>
        i.id === bom.inventoryItemId ||
        i.name.trim().toLowerCase() === bom.materialName.trim().toLowerCase(),
    );
    const available = inv?.quantityAvailable ?? 0;
    if (available < bom.requiredQuantity) {
      shortages.push(
        `${bom.materialName} requires ${bom.requiredQuantity} but only ${available} available`,
      );
    }
  }
  return { ok: shortages.length === 0, shortages };
}
