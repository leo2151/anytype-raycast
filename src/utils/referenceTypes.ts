import { RawProperty, Type } from "../models";

export interface ReferenceTypePreference {
  mode: "auto" | "types" | "all";
  typeIds: string[];
}
export type ReferenceTypePreferences = Record<string, ReferenceTypePreference>;
export interface ReferenceTypeFilter {
  mode: "restricted" | "all" | "blocked";
  typeIds: string[];
  typeKeys: string[];
  label: string;
}
const normalize = (value: string) => value.toLowerCase().replace(/[\s_-]/g, "");
const aliases = [
  ["project", "projects", "项目", "所属项目"],
  ["place", "places", "地点", "场所"],
  ["person", "people", "persons", "联系人", "人物"],
];
/** Resolve local Type IDs first. API keys are used only for the server-side search. */
export function resolveReferenceTypes(
  property: Pick<RawProperty, "key" | "name">,
  types: Type[],
  preference?: ReferenceTypePreference,
): ReferenceTypeFilter {
  const blocked = (label: string): ReferenceTypeFilter => ({ mode: "blocked", typeIds: [], typeKeys: [], label });
  if (preference?.mode === "all") return { mode: "all", typeIds: [], typeKeys: [], label: "All Types" };
  const active = types.filter((type) => !type.archived);
  let matches: Type[];
  if (preference?.mode === "types") {
    const ids = [...new Set(preference.typeIds)];
    matches = active.filter((type) => ids.includes(type.id));
    if (!ids.length || matches.length !== ids.length) return blocked("Choose available reference types");
  } else {
    const names = new Set([normalize(property.key), normalize(property.name)]);
    for (const group of aliases) {
      if (group.some((name) => names.has(normalize(name)))) group.forEach((name) => names.add(normalize(name)));
    }
    matches = active.filter((type) =>
      [type.key, type.name, type.plural_name].some((name) => name && names.has(normalize(name))),
    );
    if (matches.length !== 1)
      return blocked(matches.length ? "Multiple matching types — choose reference types" : "Choose a reference type");
  }
  if (matches.some((type) => !type.key)) return blocked("Reference type is unavailable");
  return {
    mode: "restricted",
    typeIds: matches.map((type) => type.id),
    typeKeys: [...new Set(matches.map((type) => type.key))],
    label: matches.map((type) => type.name).join(" / "),
  };
}
/** Guard against old cached results, non-unique type keys, and unexpected server results. */
export function matchesReferenceType(
  object: { type: { id: string } | null; space_id: string; archived: boolean },
  filter: ReferenceTypeFilter,
  spaceId: string,
) {
  if (filter.mode === "blocked" || object.archived || object.space_id !== spaceId) return false;
  return filter.mode === "all" || (!!object.type && filter.typeIds.includes(object.type.id));
}
