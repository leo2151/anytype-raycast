const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.cjs");
const layout = load("src/utils/taskLayout.ts");
const task = load("src/utils/task.ts");
const property = (key, name, format = "select") => ({ id: `id-${key}`, key, name, format });
const city = property("customCity", "City");
const place = property("customPlace", "Place");
const tags = property("tag", "Tag", "multi_select");
const token = layout.taskChoiceToken;

test("core fields are promoted without coercing numbers, object references, or custom fields", () => {
  const fields = [
    property("4type", "4Type"),
    property("time", "Time", "number"),
    tags,
    city,
    property("location", "Location", "objects"),
    property("energy", "Energy"),
    property("assignee", "Assigned", "objects"),
    property("people", "People", "objects"),
    property("tools", "Tools", "objects"),
    property("custom", "Unrelated"),
  ];
  const result = layout.taskPropertyGroups(fields);
  assert.deepEqual(
    result.groups.map((g) => [g.id, g.properties.map((p) => p.key)]),
    [
      ["task", ["4type"]],
      ["people", ["assignee", "people"]],
      ["gtd", ["energy", "time"]],
      ["resources", ["tools"]],
      ["location", ["customCity", "location"]],
      ["tags", ["tag"]],
    ],
  );
  assert.deepEqual(
    result.additional.map((p) => p.key),
    ["custom"],
  );
  assert.equal(layout.isTaskChoice(fields[1]), false);
  assert.equal(layout.isTaskChoice(fields[4]), false);
});
test("single-select replacement is independent of menu order and does not dirty adjacent fields", () => {
  const before = { customCity: "shanghai", customPlace: "office", tag: ["work"] };
  for (const selection of [
    [token(city.key, "beijing"), token(city.key, "shanghai"), token(place.key, "office")],
    [token(city.key, "shanghai"), token(place.key, "office"), token(city.key, "beijing")],
  ]) {
    assert.deepEqual(layout.taskChoiceChanges([city, place], before, selection), { customCity: "beijing" });
  }
  assert.equal(before.customCity, "shanghai");
});
test("removing one chip clears only its property; removing all selections clears both field formats", () => {
  const before = { customCity: "shanghai", tag: ["work", "personal"] };
  assert.deepEqual(layout.taskChoiceChanges([city, tags], before, [token("tag", "work"), token("tag", "personal")]), {
    customCity: "",
  });
  assert.deepEqual(layout.taskChoiceChanges([city, tags], before, []), { customCity: "", tag: [] });
});
test("multi-select additions/removals preserve other selected values and ignore ordering-only changes", () => {
  const before = { tag: ["work", "personal"] };
  assert.deepEqual(layout.taskChoiceChanges([tags], before, [token("tag", "personal"), token("tag", "work")]), {});
  assert.deepEqual(layout.taskChoiceChanges([tags], before, [token("tag", "work"), token("tag", "urgent")]), {
    tag: ["work", "urgent"],
  });
});
test("property namespaces handle shared tag IDs and delimiter characters without collisions", () => {
  const odd = property('key:["x"]', "Odd");
  const before = { [city.key]: "shared", [odd.key]: 'id:["x"]' };
  const values = layout.taskChoiceValues([city, odd], before);
  assert.equal(values.length, 2);
  assert.deepEqual(layout.taskChoiceChanges([city, odd], before, values), {});
  assert.deepEqual(
    layout.taskChoiceChanges([city, place], { customCity: "shared", customPlace: "shared" }, [
      token(place.key, "shared"),
    ]),
    { customCity: "" },
  );
});
test("editing a compact group writes original API property keys and leaves template defaults alone", () => {
  const config = { spaceId: "s", typeId: "t", typeKey: "task", templateId: "tpl" };
  const type = { id: "t", key: "task", layout: "action", properties: [city, place, tags] };
  const template = {
    properties: [
      { ...city, select: { id: "shanghai" } },
      { ...place, select: { id: "office" } },
      { ...tags, multi_select: [{ id: "work" }] },
    ],
  };
  const draft = task.initialTaskDraft(config, template, undefined, "Capture");
  const changes = layout.taskChoiceChanges([city, place], draft.properties, [
    token(city.key, "beijing"),
    token(place.key, "office"),
  ]);
  draft.properties = { ...draft.properties, ...changes };
  draft.changed = Object.keys(changes);
  assert.deepEqual(task.taskRequest(config, type, draft).properties, [
    { key: city.key, select: "beijing" },
    { key: "done", checkbox: false },
  ]);
  const cleared = layout.taskChoiceChanges([city, place], draft.properties, [token(place.key, "office")]);
  draft.properties = { ...draft.properties, ...cleared };
  draft.changed = Object.keys(cleared);
  assert.deepEqual(task.taskRequest(config, type, draft).properties, [
    { key: city.key, select: null },
    { key: "done", checkbox: false },
  ]);
});
test("saved choices remain present before options load and loading prevents accidental clears", () => {
  const jsx = (type, props) => ({ type, props });
  const { TaskChoiceGroup } = load("src/components/CreateTask/TaskChoiceGroup.tsx", {
    "@raycast/api": { Form: { TagPicker: { Item: "item" } }, Icon: { Tag: "tag" } },
    "react/jsx-runtime": { jsx, jsxs: jsx },
  });
  const changes = [];
  const props = {
    id: "location",
    title: "Location",
    properties: [city, place],
    values: { customCity: "shanghai", customPlace: "office" },
    tagsMap: {},
    valueLabels: { customCity: { shanghai: "Shanghai" } },
    unavailable: true,
    onChange: (c) => changes.push(c),
  };
  const picker = TaskChoiceGroup(props);
  assert.equal(picker.props.children.length, 2);
  assert.equal(picker.props.children[0].props.title, "City: Shanghai");
  picker.props.onChange([]);
  assert.deepEqual(changes, []);
  const ready = TaskChoiceGroup({ ...props, unavailable: false });
  ready.props.onChange([token(place.key, "office")]);
  assert.deepEqual(changes, [{ customCity: "" }]);
});
