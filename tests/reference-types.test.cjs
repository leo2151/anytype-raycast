const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.cjs");
const { resolveReferenceTypes, matchesReferenceType } = load("src/utils/referenceTypes.ts");
const project = {
  id: "project-id",
  key: "custom-project-key",
  name: "Project",
  plural_name: "Projects",
  archived: false,
};
const place = { id: "place-id", key: "custom-place-key", name: "Place", plural_name: "Places", archived: false };
const types = [project, place];
const projects = { id: "relation-id", key: "relation-projects", name: "Projects", format: "objects" };
const places = { key: "relation-places", name: "Place" };
const object = (id, type, overrides = {}) => ({ id, name: id, type, space_id: "space", archived: false, ...overrides });

test("Projects and Place resolve actual local type keys and IDs, never hardcoded search keys", () => {
  const filter = resolveReferenceTypes(projects, types);
  assert.equal(filter.mode, "restricted");
  assert.deepEqual(filter.typeKeys, ["custom-project-key"]);
  assert.deepEqual(filter.typeIds, ["project-id"]);
  assert.deepEqual(resolveReferenceTypes(places, types).typeIds, ["place-id"]);
  assert.deepEqual(resolveReferenceTypes({ key: "x", name: "所属项目" }, types).typeIds, ["project-id"]);
  const human = { id: "human-id", key: "custom-human", name: "Human", plural_name: "Humans", archived: false };
  assert.deepEqual(resolveReferenceTypes({ key: "x", name: "Assigned" }, [...types, human]).typeIds, ["human-id"]);
  assert.deepEqual(resolveReferenceTypes({ key: "y", name: "People" }, [...types, human]).typeIds, ["human-id"]);
  assert.equal(
    resolveReferenceTypes({ key: "x", name: "Assigned" }, [human, { ...human, id: "contact-id", name: "Contact" }])
      .mode,
    "blocked",
  );
});
test("missing, archived and ambiguous types never silently widen to all objects", () => {
  for (const candidates of [[], [{ ...project, archived: true }], [project, { ...project, id: "duplicate" }]])
    assert.equal(resolveReferenceTypes(projects, candidates).mode, "blocked");
  assert.equal(resolveReferenceTypes({ key: "unknown", name: "Assigned" }, types).mode, "blocked");
});
test("manual multi-type filters are exact, stale IDs block search, unrestricted requires explicit selection", () => {
  assert.deepEqual(resolveReferenceTypes(projects, types, { mode: "types", typeIds: [place.id, project.id] }).typeIds, [
    project.id,
    place.id,
  ]);
  for (const ids of [[], [project.id, "deleted"]])
    assert.equal(resolveReferenceTypes(projects, types, { mode: "types", typeIds: ids }).mode, "blocked");
  assert.equal(resolveReferenceTypes(projects, [], { mode: "all", typeIds: [] }).mode, "all");
});
test("same-name objects, cached results from another field/space and shared type keys cannot pass the filter", () => {
  const filter = resolveReferenceTypes(projects, types);
  assert.equal(matchesReferenceType(object("p", project), filter, "space"), true);
  for (const candidate of [
    object("Project", place),
    object("p", project, { space_id: "other" }),
    object("p", project, { archived: true }),
    object("p", { ...project, id: "different-type" }),
    object("p", null),
  ])
    assert.equal(matchesReferenceType(candidate, filter, "space"), false);
});

function renderReferences({
  filter = resolveReferenceTypes(projects, types),
  objects = [],
  loading = false,
  error,
  selected = [],
  value = [],
} = {}) {
  const queries = [],
    changes = [];
  const jsx = (type, props) => ({ type, props });
  const { TaskPropertyField } = load("src/components/CreateTask/TaskPropertyField.tsx", {
    "@raycast/api": {
      Form: { TagPicker: { Item: "tag" }, Dropdown: { Item: "item" }, Description: "description" },
      Icon: {},
    },
    "@raycast/utils": { useCachedPromise: () => ({ data: selected }) },
    react: { useState: () => ["query", () => {}] },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "../../api": {},
    "../../hooks": {
      useSearch: (...args) => {
        queries.push(args);
        return { objects, isLoadingObjects: loading, objectsError: error };
      },
    },
    "../../utils/cacheScope": { getCacheNamespace: () => "test" },
  });
  const component = TaskPropertyField({
    spaceId: "space",
    property: projects,
    value,
    referenceFilter: filter,
    onChange: (v) => changes.push(v),
  });
  const tree = component.type(component.props);
  const nodes = [];
  const visit = (n) => {
    if (Array.isArray(n)) return n.forEach(visit);
    if (!n || !n.props) return;
    nodes.push(n);
    visit(n.props.children);
  };
  visit(tree);
  return { queries, changes, nodes, dropdown: nodes.find((n) => n.props.id === "add:" + projects.key) };
}
test("reference picker sends server type filters and rejects an unrelated ID in its onChange handler", () => {
  const h = renderReferences({ objects: [object("good", project), object("wrong", place)] });
  assert.deepEqual(h.queries[0], ["space", "query", [project.key], { execute: true }]);
  assert(!h.nodes.some((n) => n.props.value === "wrong"));
  h.dropdown.props.onChange("wrong");
  assert.deepEqual(h.changes, []);
  h.dropdown.props.onChange("good");
  assert.deepEqual(h.changes, [["good"]]);
});
test("unresolved filters disable the request and cannot expose previous unfiltered results", () => {
  const h = renderReferences({ filter: resolveReferenceTypes(projects, []), objects: [object("stale", project)] });
  assert.equal(h.queries[0][3].execute, false);
  assert.equal(h.dropdown, undefined);
  assert(!h.nodes.some((n) => n.props.value === "stale"));
});
test("loading or failed searches never leave stale candidates selectable; existing selections remain removable", () => {
  for (const state of [{ loading: true }, { error: new Error("offline") }]) {
    const h = renderReferences({
      ...state,
      objects: [object("stale", project)],
      selected: [{ id: "old", name: "Existing", outsideFilter: true }],
      value: ["old"],
    });
    assert(!h.nodes.some((n) => n.props.value === "stale"));
    assert(h.nodes.some((n) => n.props.title === "Existing (outside filter)"));
    h.dropdown.props.onChange("stale");
    assert.deepEqual(h.changes, []);
  }
});
