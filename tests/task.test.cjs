const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.cjs");
const task = load("src/utils/task.ts");
const type = {
  id: "task-type",
  key: "task",
  name: "Task",
  layout: "action",
  archived: false,
  properties: [
    { id: "p1", key: "customWhen", name: "When", format: "date" },
    { id: "p2", key: "customDue", name: "Due Date", format: "date" },
    { id: "p3", key: "projects", name: "Projects", format: "objects" },
    { id: "p4", key: "flag", name: "Flag", format: "checkbox" },
    { id: "p5", key: "status", name: "Status", format: "select" },
    { id: "p6", key: "count", name: "Count", format: "number" },
  ],
};
const config = { spaceId: "s", typeId: type.id, typeKey: type.key, templateId: "template" };
const template = {
  id: "template",
  name: "Complex Task",
  markdown: "Do not overwrite this template",
  properties: [
    { key: "customWhen", format: "date", date: "2026-10-05T00:00:00Z" },
    { key: "flag", format: "checkbox", checkbox: true },
    { key: "projects", format: "objects", objects: ["project-a", "project-b"] },
    { key: "status", format: "select", select: { id: "inbox" } },
    { key: "description", format: "text", text: "Default notes" },
    { key: "done", format: "checkbox", checkbox: true },
  ],
};
test("Task resolution uses a real action type, not an unrelated name", () => {
  assert.equal(task.findTaskType([{ ...type, key: "note", layout: "basic" }, type]).id, "task-type");
  assert.equal(task.findTaskType([{ ...type, archived: true }]), undefined);
  assert.equal(
    task.findTaskType([
      { ...type, key: "a" },
      { ...type, key: "b" },
    ]),
    undefined,
  );
});
test("common task fields require matching format and reject ambiguous names", () => {
  const fields = task.taskFields(type.properties);
  assert.equal(fields.when.key, "customWhen");
  assert.equal(fields.due.key, "customDue");
  assert.equal(task.taskFields([...type.properties, { key: "second", name: "When", format: "date" }]).when, undefined);
  assert.equal(task.taskFields([{ key: "when", name: "When", format: "select" }]).when, undefined);
});
test("title-only task preserves template body, icon, status, and properties, but starts incomplete", () => {
  const draft = task.initialTaskDraft(config, template, undefined, "New task");
  assert.deepEqual(draft.properties.projects, ["project-a", "project-b"]);
  assert.equal(draft.notes, "Default notes");
  const request = task.taskRequest(config, type, draft);
  assert.deepEqual(request, {
    name: "New task",
    type_key: "task",
    template_id: "template",
    properties: [{ key: "done", checkbox: false }],
  });
});
test("clearing inherited fields sends explicit null, false, and empty arrays without resetting Status", () => {
  const draft = task.initialTaskDraft(config, template, undefined, "New task");
  draft.changed = ["customWhen", "flag", "projects", "description"];
  draft.properties.customWhen = null;
  draft.properties.flag = false;
  draft.properties.projects = [];
  draft.notes = "";
  const request = task.taskRequest(config, type, draft);
  assert.deepEqual(request.properties, [
    { key: "customWhen", date: null },
    { key: "projects", objects: [] },
    { key: "flag", checkbox: false },
    { key: "description", text: "" },
    { key: "done", checkbox: false },
  ]);
});
test("continuous capture retains project context and resets per-task dates and flag", () => {
  const previous = task.initialTaskDraft(config, template, undefined, "First");
  previous.listId = "collection";
  const next = task.nextTaskDraft(config, type, template, previous);
  assert.equal(next.name, "");
  assert.equal(next.notes, "");
  assert.equal(next.body, "");
  assert.equal(next.properties.customWhen, null);
  assert.equal(next.properties.flag, false);
  assert.deepEqual(next.properties.projects, ["project-a", "project-b"]);
  assert.equal(next.listId, "collection");
  assert.equal(next.properties.status, "inbox");
});
test("changing channel/template does not carry IDs or property values across contexts", () => {
  const old = task.initialTaskDraft(config, template, undefined, "Draft");
  old.changed = ["projects"];
  old.properties.projects = ["other-space"];
  old.listId = "old-list";
  const next = task.initialTaskDraft({ ...config, spaceId: "different" }, undefined, old);
  assert.equal(next.name, "Draft");
  assert.equal(next.listId, "");
  assert.equal(next.properties.projects, undefined);
  assert.equal(next.changed.length, 0);
});
test("unfinished creation receipt survives reopening and cannot become a new title argument", () => {
  const saved = task.initialTaskDraft(config, template, undefined, "Created");
  saved.pending = { objectId: "created-id", listId: "list", continueCreating: false };
  assert.equal(task.initialTaskDraft(config, template, saved, "New argument"), saved);
});
test("empty titles, wrong types, invalid dates and invalid numbers are rejected before a write", () => {
  const draft = task.initialTaskDraft(config, template);
  assert.throws(() => task.taskRequest(config, type, draft), /task name/);
  draft.name = "Valid";
  assert.throws(() => task.taskRequest(config, { ...type, id: "wrong" }, draft), /settings are invalid/);
  draft.changed = ["customWhen"];
  draft.properties.customWhen = "not-a-date";
  assert.throws(() => task.taskRequest(config, type, draft), /has an invalid date/);
  draft.changed = ["count"];
  draft.properties.count = "NaN";
  assert.throws(() => task.taskRequest(config, type, draft), /valid number/);
});

function taskFormHarness(api) {
  const state = [];
  let layout = "compact";
  let cursor = 0;
  const receipts = [];
  const jsx = (type, props) => ({ type, props });
  const { CreateTaskForm } = load("src/components/CreateTask/CreateTaskForm.tsx", {
    "@raycast/api": {
      Action: { SubmitForm: "submit" },
      ActionPanel: "actions",
      Form: { Dropdown: { Item: "item" }, TextField: "text" },
      Icon: {},
      Toast: { Style: {} },
      showToast: async () => {},
      popToRoot: async () => {},
    },
    "@raycast/utils": {
      showFailureToast: async () => {},
      useCachedState: () => [layout, (next) => (layout = next)],
    },
    react: {
      useState: (initial) => {
        const i = cursor++;
        if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial;
        return [state[i], (value) => (state[i] = value)];
      },
      useRef: (initial) => {
        const i = cursor++;
        if (!(i in state)) state[i] = { current: initial };
        return state[i];
      },
    },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "../../api": api,
    "../../hooks": { useSearch: () => ({ objects: [] }), useTagsMap: () => ({}) },
    "../../utils": { bundledPropKeys: { description: "description" } },
    "../../utils/cacheScope": { getCacheNamespace: () => "test-account" },
    "./TaskPropertyField": { TaskPropertyField: "property" },
  });
  const props = {
    config,
    space: { name: "Test space" },
    type,
    template,
    title: "Capture task",
    persist: async (draft) => receipts.push(draft),
    onConfigure: () => {},
  };
  const render = () => {
    cursor = 0;
    return CreateTaskForm(props);
  };
  function find(node, title) {
    if (Array.isArray(node)) return node.map((child) => find(child, title)).find(Boolean);
    if (!node || typeof node !== "object") return;
    if (node.props?.title === title) return node;
    for (const child of [node.props?.actions, ...[node.props?.children].flat()]) {
      const found = find(child, title);
      if (found) return found;
    }
  }
  return { render, find, receipts, props };
}
test("task form blocks repeated submit and keeps a saved receipt when collection association fails", async () => {
  let creates = 0,
    adds = 0;
  const h = taskFormHarness({
    createObjectRaw: async () => {
      creates++;
      return { object: { id: "saved", name: "task" } };
    },
    updateObjectRaw: async () => {},
    addObjectsToList: async () => {
      if (++adds === 1) throw new Error("offline");
    },
  });
  h.props.saved = { ...task.initialTaskDraft(config, template, undefined, "Task"), listId: "collection" };
  const form = h.render();
  const submit = h.find(form, "Create Task").props.onSubmit;
  await Promise.all([submit(), submit()]);
  assert.equal(creates, 1);
  assert.equal(adds, 1);
  assert.equal(h.receipts.at(-1).pending.objectId, "saved");
  const recovery = h.render();
  await h.find(recovery, "Retry Adding to Collection").props.onAction();
  assert.equal(creates, 1);
  assert.equal(adds, 2);
  assert.equal(h.receipts.at(-1), undefined);
});
test("create-and-continue resets the form only after successful creation", async () => {
  const h = taskFormHarness({
    createObjectRaw: async () => ({ object: { id: "saved", name: "task" } }),
    updateObjectRaw: async () => {},
  });
  await h.find(h.render(), "Create and Continue").props.onSubmit();
  const form = h.render();
  assert.equal(h.find(form, "Task Name").props.value, "");
  assert.equal(h.receipts.at(-1).properties.done, false);
  assert.equal(h.receipts.at(-1).pending, undefined);
});
test("failed task creation preserves the unsaved title and does not enter recovery", async () => {
  const h = taskFormHarness({
    createObjectRaw: async () => {
      throw new Error("offline");
    },
  });
  await h.find(h.render(), "Create Task").props.onSubmit();
  const form = h.render();
  assert.equal(h.find(form, "Task Name").props.value, "Capture task");
  assert.equal(h.find(form, "Retry Adding to Collection"), undefined);
});

test("compact and standard layouts share the draft and keep City and Tag visible without More Options", async () => {
  const h = taskFormHarness({});
  h.props.title = undefined;
  const city = { id: "city", key: "customCity", name: "City", format: "select" };
  const location = { id: "location", key: "location", name: "Location", format: "select" };
  const tag = { id: "tag", key: "tag", name: "Tag", format: "multi_select" };
  h.props.type = { ...type, properties: [...type.properties, city, location, tag] };
  h.props.saved = {
    ...task.initialTaskDraft(config, template, undefined, "Keep my title"),
    properties: { customCity: "shanghai", location: "office", tag: ["work"] },
  };
  let form = h.render();
  const group = h.find(form, "Location");
  assert.deepEqual(
    group.props.properties.map((p) => p.key),
    ["customCity", "location"],
  );
  group.props.onChange({ customCity: "beijing" });
  form = h.render();
  h.find(form, "Use Standard Layout").props.onAction();
  form = h.render();
  const fields = [];
  const visit = (n) => {
    if (Array.isArray(n)) return n.forEach(visit);
    if (!n || !n.props) return;
    if (n.props.property) fields.push(n);
    visit(n.props.children);
  };
  visit(form);
  assert.equal(fields.find((n) => n.props.property.key === "customCity").props.value, "beijing");
  assert.deepEqual(fields.find((n) => n.props.property.key === "tag").props.value, ["work"]);
  assert.equal(h.find(form, "Task Name").props.value, "Keep my title");
  assert.deepEqual(h.receipts.at(-1).changed, ["customCity"]);
  assert.equal(h.receipts.at(-1).properties.location, "office");
});
