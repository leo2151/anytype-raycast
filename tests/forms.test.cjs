const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.cjs");
function harness() {
  const state = [];
  let cursor = 0;
  let form;
  const jsx = (type, props) => ({ type, props });
  const api = {
    Action: { SubmitForm: "submit", CreateQuicklink: "quick" },
    ActionPanel: "panel",
    Form: { Description: "description", Dropdown: { Item: "item" } },
    Icon: {},
    Toast: { Style: {} },
    showToast: async () => {},
    popToRoot: async () => {},
    useNavigation: () => ({ pop: () => {} }),
  };
  const itemProps = new Proxy({}, { get: (_o, key) => ({ id: key, value: undefined }) });
  return {
    api,
    jsx,
    state,
    reset: () => {
      cursor = 0;
    },
    get form() {
      return form;
    },
    stubs: {
      "@raycast/api": api,
      "@raycast/utils": {
        showFailureToast: async () => {},
        useForm: (config) => {
          form = config;
          return { itemProps, handleSubmit: config.onSubmit };
        },
        useCachedPromise: () => ({ data: [{ key: "page", properties: [] }], isLoading: false }),
      },
      "react/jsx-runtime": { jsx, jsxs: jsx },
      react: {
        useState: (init) => {
          const i = cursor++;
          if (!(i in state)) state[i] = init;
          return [
            state[i],
            (v) => {
              state[i] = v;
            },
          ];
        },
        useRef: (init) => {
          const i = cursor++;
          if (!(i in state)) state[i] = { current: init };
          return state[i];
        },
        useMemo: (f) => f(),
        useEffect: () => {},
      },
      "date-fns": {},
      "../../utils": {
        bundledPropKeys: { description: "description", source: "source" },
        getNumberFieldValidations: () => ({}),
      },
      "../../models": { IconFormat: { Emoji: "emoji" }, ObjectLayout: {}, PropertyFormat: {} },
      "../ObjectPropertyDropdown": {},
      "../../utils/cacheScope": { getCacheNamespace: () => "scope" },
      "../../utils/type": { fetchAllTypesForSpace: async () => [] },
    },
  };
}
function walk(node, predicate) {
  if (!node || typeof node !== "object") return;
  if (predicate(node)) return node;
  for (const child of [node.props?.actions, ...[node.props?.children].flat()]) {
    const found = walk(child, predicate);
    if (found) return found;
  }
}
test("collection failure shows recovery; retry does not create a second object", async () => {
  const h = harness();
  let creates = 0;
  let additions = 0;
  const { CreateObjectForm } = load("src/components/CreateForm/CreateObjectForm.tsx", {
    ...h.stubs,
    "../../hooks": {
      useCreateObjectData: () => ({
        spaces: [],
        types: [{ id: "t", key: "page", properties: [] }],
        templates: [],
        lists: [],
        selectedSpaceId: "s",
        selectedTypeId: "t",
        selectedListId: "l",
      }),
      useTagsMap: () => ({}),
    },
    "../../api": {
      createObjectRaw: async () => {
        creates++;
        return { object: { id: "created", name: "test" } };
      },
      updateObjectRaw: async () => {},
      addObjectsToList: async () => {
        additions++;
        if (additions === 1) throw new Error("offline");
      },
    },
  });
  CreateObjectForm({ draftValues: {}, enableDrafts: false });
  await h.form.onSubmit({ name: "test" });
  h.reset();
  const recovery = CreateObjectForm({ draftValues: {}, enableDrafts: false });
  const retry = walk(recovery, (n) => n.props?.title === "Retry Adding to Collection");
  assert.ok(retry);
  await retry.props.onAction();
  assert.equal(creates, 1);
  assert.equal(additions, 2);
});

test("edit form submits a changed name without rewriting body or properties", async () => {
  const h = harness();
  const writes = [];
  const { UpdateObjectForm } = load("src/components/UpdateForm/UpdateObjectForm.tsx", {
    ...h.stubs,
    "../../hooks": { useSpaces: () => ({ spaces: [] }), useTagsMap: () => ({}) },
    "../../api": { updateObjectRaw: async (_s, _o, payload) => writes.push(payload) },
  });
  const object = {
    id: "o",
    name: "before",
    type: { key: "page" },
    markdown: "keep my formatting",
    properties: [],
    icon: null,
  };
  const loaded = UpdateObjectForm({ spaceId: "s", object, mutateObjects: [] });
  loaded.type(loaded.props);
  await h.form.onSubmit({ name: "after", icon: "", typeKey: "page", markdown: object.markdown });
  assert.deepEqual(writes, [{ name: "after" }]);
});
