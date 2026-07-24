import { ChildItem } from "@/types";

const statuses: ChildItem["status"][] = ["pending", "in_progress", "completed", "review"];
const names = [
  "Load Calculations", "Feeder Diagrams", "Protection Settings",
  "Cable Sizing", "Voltage Drop Analysis", "Short Circuit Study",
  "Earthing Design", "Lighting Design", "Single Line Diagram",
  "Substation Layout", "Transformer Sizing", "Switchgear Selection",
  "Cable Routing", "Panel Schedule", "Metering Scheme",
  "SCADA Integration", "Battery Backup Design", "UPS Sizing",
  "Fire Alarm Layout", "Security System Design",
];
const assignees = [
  "Alice Chen", "Bob Martinez", "Carol Singh", "David Kim",
  "Eva Johansson", "Frank Okafor", "Grace Liu", "Henry Park",
];

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateChildItems(recordIndex: number, parentId: string): ChildItem[] {
  const count = recordIndex % 5 === 0 ? 0 : (recordIndex % 3) + 2;
  if (count === 0) return [];
  const items: ChildItem[] = [];
  const usedNames = new Set<string>();
  for (let i = 0; i < count; i++) {
    let name: string;
    do { name = randomItem(names); } while (usedNames.has(name));
    usedNames.add(name);
    const day = 1 + Math.floor(Math.random() * 28);
    const month = 1 + Math.floor(Math.random() * 12);
    items.push({
      id: `${parentId}-child-${i}`,
      parentId,
      itemName: name,
      status: randomItem(statuses),
      assignedTo: randomItem(assignees),
      dueDate: `2024-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    });
  }
  return items;
}

export function generateAllChildData(recordIds: string[]): Record<string, ChildItem[]> {
  const result: Record<string, ChildItem[]> = {};
  recordIds.forEach((id, idx) => {
    result[id] = generateChildItems(idx, id);
  });
  return result;
}
