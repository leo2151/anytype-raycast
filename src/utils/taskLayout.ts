import { PropertyFormat, RawProperty } from "../models";
import { TaskValue } from "./task";

export type TaskLayout = "compact" | "standard";
export interface TaskPropertyGroup {
  id: string;
  title: string;
  properties: RawProperty[];
}
const normalize = (value: string) => value.toLowerCase().replace(/[\s_-]/g, "");
const definitions = [
  {
    id: "task",
    title: "Priority",
    names: ["task_type", "任务类型", "4type", "quadrant", "四象限", "eisenhower", "status", "状态"],
  },
  {
    id: "people",
    title: "People",
    names: [
      "assigned",
      "assignee",
      "assignees",
      "负责人",
      "指派给",
      "people",
      "person",
      "persons",
      "关联人员",
      "联系人",
    ],
  },
  { id: "gtd", title: "Effort", names: ["energy", "精力", "time", "耗时"] },
  {
    id: "resources",
    title: "Resources",
    names: [
      "skill",
      "skills",
      "技能",
      "experience",
      "经验",
      "tool",
      "tools",
      "工具",
      "equipment",
      "设备",
      "material",
      "materials",
      "材料",
      "resource",
      "resources",
      "资源",
    ],
  },
  { id: "location", title: "Location", names: ["city", "城市", "location", "地点", "place", "场所"] },
  { id: "tags", title: "Tag", names: ["tag", "tags", "标签"] },
];
/** Promote every matching core field, including fields whose format cannot be combined. */
export function taskPropertyGroups(properties: RawProperty[]) {
  const remaining = new Set(properties);
  const groups: TaskPropertyGroup[] = definitions.map(({ id, title, names }) => {
    const rank = (p: RawProperty) =>
      names.findIndex((name) => [p.key, p.name].some((value) => normalize(value) === normalize(name)));
    const members = properties.filter((p) => remaining.has(p) && rank(p) >= 0).sort((a, b) => rank(a) - rank(b));
    members.forEach((p) => remaining.delete(p));
    return { id, title, properties: members };
  });
  return { groups: groups.filter((g) => g.properties.length), additional: [...remaining] };
}
export function isTaskChoice(property: RawProperty) {
  return property.format === PropertyFormat.Select || property.format === PropertyFormat.MultiSelect;
}
/** Namespace choices by property key; different fields can contain the same tag ID. */
export function taskChoiceToken(propertyKey: string, tagId: string) {
  return JSON.stringify([propertyKey, tagId]);
}
export function taskChoiceIds(property: RawProperty, value: TaskValue | undefined): string[] {
  if (property.format === PropertyFormat.Select) return typeof value === "string" && value ? [value] : [];
  return property.format === PropertyFormat.MultiSelect && Array.isArray(value) ? value : [];
}
export function taskChoiceValues(properties: RawProperty[], values: Record<string, TaskValue>) {
  return properties.flatMap((p) => taskChoiceIds(p, values[p.key]).map((id) => taskChoiceToken(p.key, id)));
}
/** Apply one picker event atomically, preserving untouched fields and explicit clears. */
export function taskChoiceChanges(
  properties: RawProperty[],
  values: Record<string, TaskValue>,
  selection: string[],
): Record<string, TaskValue> {
  const selected = new Map<string, string[]>();
  for (const token of new Set(selection)) {
    try {
      const pair: unknown = JSON.parse(token);
      if (!Array.isArray(pair) || pair.length !== 2 || !pair.every((item) => typeof item === "string")) continue;
      const [key, id] = pair as [string, string];
      if (id) selected.set(key, [...(selected.get(key) ?? []), id]);
    } catch {
      // Only tokens emitted by this picker are property values.
    }
  }
  const changes: Record<string, TaskValue> = {};
  for (const property of properties.filter(isTaskChoice)) {
    const before = taskChoiceIds(property, values[property.key]);
    let after = selected.get(property.key) ?? [];
    if (property.format === PropertyFormat.Select) {
      // Prefer the newly added choice even if Raycast returns items in menu order.
      const added = after.filter((id) => !before.includes(id));
      after = (added.length ? added : after).slice(-1);
    }
    if (before.length === after.length && before.every((id) => after.includes(id))) continue;
    changes[property.key] = property.format === PropertyFormat.Select ? (after[0] ?? "") : after;
  }
  return changes;
}
