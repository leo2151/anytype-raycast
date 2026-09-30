import { formatRFC3339 } from "date-fns";
import {
  CreateObjectRequest,
  ObjectLayout,
  PropertyFormat,
  PropertyLinkWithValue,
  RawProperty,
  RawPropertyWithValue,
  RawSpaceObjectWithBody,
  Type,
} from "../models";

export type TaskValue = string | string[] | boolean | null;
export interface TaskConfig {
  spaceId: string;
  typeId: string;
  typeKey: string;
  templateId: string;
}
export interface TaskDraft {
  context: string;
  name: string;
  notes: string;
  body: string;
  properties: Record<string, TaskValue>;
  changed: string[];
  listId: string;
  expanded: boolean;
  pending?: { objectId: string; listId: string; continueCreating: boolean };
}
export function taskContext(config: TaskConfig) {
  return JSON.stringify(config);
}
export function findTaskType(types: Type[]) {
  const tasks = types.filter((t) => !t.archived && t.layout === ObjectLayout.Action);
  return (
    tasks.find((t) => t.key === "task") ??
    (tasks.filter((t) => t.name.toLowerCase() === "task").length === 1
      ? tasks.find((t) => t.name.toLowerCase() === "task")
      : undefined)
  );
}
const normalize = (s: string) => s.toLowerCase().replace(/[\s_-]/g, "");
/** Match semantic fields only when name/key AND format agree. Never guess an ambiguous property. */
export function taskFields(properties: RawProperty[]) {
  const find = (names: string[], format: PropertyFormat) => {
    const matches = properties.filter(
      (p) =>
        p.format === format &&
        names.some((n) => normalize(p.name) === normalize(n) || normalize(p.key) === normalize(n)),
    );
    return matches.length === 1 ? matches[0] : undefined;
  };
  return {
    when: find(["when", "计划日期"], PropertyFormat.Date),
    due: find(["due_date", "截止日期"], PropertyFormat.Date),
    projects: find(["projects", "所属项目"], PropertyFormat.Objects),
    flag: find(["flag", "重要"], PropertyFormat.Checkbox),
  };
}
export function propertyDefault(p?: RawPropertyWithValue): TaskValue {
  if (!p) return null;
  switch (p.format) {
    case PropertyFormat.Checkbox:
      return p.checkbox ?? false;
    case PropertyFormat.Select:
      return p.select?.id ?? "";
    case PropertyFormat.MultiSelect:
      return p.multi_select?.map((t) => t.id) ?? [];
    case PropertyFormat.Objects:
      return p.objects ?? [];
    case PropertyFormat.Files:
      return p.files ?? [];
    case PropertyFormat.Number:
      return p.number == null ? "" : String(p.number);
    case PropertyFormat.Date:
      return p.date ?? null;
    default:
      return String(p[p.format as "text" | "url" | "email" | "phone"] ?? "");
  }
}
export function initialTaskDraft(
  config: TaskConfig,
  template?: RawSpaceObjectWithBody,
  saved?: TaskDraft,
  title?: string,
): TaskDraft {
  const sameContext = saved?.context === taskContext(config);
  if (sameContext && saved.pending) return saved;
  const properties = Object.fromEntries((template?.properties ?? []).map((p) => [p.key, propertyDefault(p)]));
  return {
    context: taskContext(config),
    name: title !== undefined ? title : (saved?.name ?? ""),
    notes: sameContext ? saved.notes : (template?.properties.find((p) => p.key === "description")?.text ?? ""),
    body: saved?.body ?? "",
    properties: { ...properties, ...(sameContext ? saved.properties : {}), done: false },
    changed: sameContext ? saved.changed : [],
    listId: sameContext ? saved.listId : "",
    expanded: sameContext ? saved.expanded : false,
  };
}
export function taskPropertyValue(property: RawProperty, value: TaskValue): PropertyLinkWithValue {
  const entry: PropertyLinkWithValue = { key: property.key };
  switch (property.format) {
    case PropertyFormat.Number: {
      const number = value === "" || value === null ? null : Number(value);
      if (number !== null && !Number.isFinite(number)) throw new Error(`${property.name} must be a valid number`);
      entry.number = number;
      break;
    }
    case PropertyFormat.Date: {
      if (!value) entry.date = null;
      else {
        const date = new Date(String(value));
        if (Number.isNaN(date.getTime())) throw new Error(`${property.name} has an invalid date`);
        entry.date = formatRFC3339(date);
      }
      break;
    }
    case PropertyFormat.Checkbox:
      entry.checkbox = Boolean(value);
      break;
    case PropertyFormat.Select:
      entry.select = value ? String(value) : null;
      break;
    case PropertyFormat.MultiSelect:
      entry.multi_select = Array.isArray(value) ? value : [];
      break;
    case PropertyFormat.Objects:
      entry.objects = Array.isArray(value) ? value : [];
      break;
    case PropertyFormat.Files:
      entry.files = Array.isArray(value) ? value : [];
      break;
    default:
      entry[property.format as "text" | "url" | "email" | "phone"] = String(value ?? "");
  }
  return entry;
}
export function taskRequest(config: TaskConfig, type: Type, draft: TaskDraft): CreateObjectRequest {
  if (!draft.name.trim()) throw new Error("Enter a task name");
  if (
    draft.context !== taskContext(config) ||
    type.id !== config.typeId ||
    type.key !== config.typeKey ||
    type.layout !== ObjectLayout.Action ||
    type.archived
  )
    throw new Error("Task settings are invalid. Select a channel and Task type again.");
  const properties = type.properties
    .filter((p) => p.key !== "done" && p.key !== "description" && draft.changed.includes(p.key))
    .map((p) => taskPropertyValue(p, draft.properties[p.key]));
  if (draft.changed.includes("description")) properties.push({ key: "description", text: draft.notes });
  properties.push({ key: "done", checkbox: false });
  return {
    name: draft.name.trim(),
    type_key: type.key,
    ...(config.templateId ? { template_id: config.templateId } : {}),
    // Omit icon and an empty body to preserve template content.
    ...(draft.body.trim() ? { body: draft.body } : {}),
    properties,
  };
}
export function nextTaskDraft(
  config: TaskConfig,
  type: Type,
  template: RawSpaceObjectWithBody | undefined,
  previous: TaskDraft,
): TaskDraft {
  const next = initialTaskDraft(config, template);
  const fields = taskFields(type.properties);
  for (const p of [fields.when, fields.due, fields.flag].filter((p): p is RawProperty => !!p)) {
    next.properties[p.key] = p.format === PropertyFormat.Checkbox ? false : null;
    next.changed.push(p.key);
  }
  if (fields.projects) {
    next.properties[fields.projects.key] = previous.properties[fields.projects.key] ?? [];
    next.changed.push(fields.projects.key);
  }
  next.notes = "";
  next.changed.push("description");
  next.listId = previous.listId;
  return next;
}
