const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.cjs");
const { collectPages, pageOptions } = load("src/utils/pagination.ts");
const page = (offset, has_more) => ({ offset, limit: 2, total: 4, has_more });

test("pagination follows actual page sizes and rejects stalled pagination", async () => {
  const offsets = [];
  const items = await collectPages(async (offset) => {
    offsets.push(offset);
    return { items: offset ? ["b", "c"] : ["a"], pagination: page(offset, offset === 0) };
  }, 2);
  assert.deepEqual(items, ["a", "b", "c"]);
  assert.deepEqual(offsets, [0, 1]);
  await assert.rejects(
    collectPages(async () => ({ items: [], pagination: page(0, true) })),
    /empty page/,
  );
  assert.throws(() => pageOptions(-1, 20));
  assert.throws(() => pageOptions(0, 1001));
  assert.throws(() => pageOptions(0, 1.5));
});

test("name sorting retains existing tags and bookmark source", async () => {
  const { mapObjects } = load("src/mappers/objects.ts", {
    "@raycast/api": { getPreferenceValues: () => ({ sort: "name" }) },
    "../api": {},
    "../models": { SortProperty: { Name: "name", LastModifiedDate: "last_modified_date" } },
    "../utils": {
      bundledPropKeys: { source: "source" },
      propKeys: { tag: "tag" },
      getIconWithFallback: async () => "",
      getNameWithSnippetFallback: (n) => n,
    },
    "./types": { mapType: async (x) => x },
    "./properties": {},
  });
  const [result] = await mapObjects([
    {
      name: "book",
      type: { key: "bookmark" },
      properties: [
        { key: "tag", multi_select: [{ id: "existing" }] },
        { key: "source", url: "https://example.com" },
        { key: "last_modified_date", date: "2026-01-01" },
      ],
    },
  ]);
  assert.equal(result.properties.find((p) => p.key === "tag").multi_select[0].id, "existing");
  assert.equal(result.properties.find((p) => p.key === "source").url, "https://example.com");
});

test("concurrent tag changes read fresh state and preserve every unrelated tag", async () => {
  let ids = ["existing", "remote"];
  let reads = 0;
  const { changeObjectTag } = load("src/utils/tags.ts", {
    "../models": { BodyFormat: { Markdown: "md" } },
    "./constant": { propKeys: { tag: "tag" } },
    "../api": {
      getRawObject: async () => {
        reads++;
        return { object: { properties: [{ key: "tag", multi_select: ids.map((id) => ({ id })) }] } };
      },
      updateObjectRaw: async (_s, _id, body) => {
        await Promise.resolve();
        ids = body.properties[0].multi_select;
      },
    },
  });
  await Promise.all([changeObjectTag("s", "o", "first"), changeObjectTag("s", "o", "second")]);
  assert.deepEqual(ids, ["existing", "remote", "first", "second"]);
  assert.equal(reads, 2);
  await changeObjectTag("s", "o", "first", true);
  assert.deepEqual(ids, ["existing", "remote", "second"]);
});

test("failed fresh tag read never writes a partial tag set", async () => {
  let writes = 0;
  const { changeObjectTag } = load("src/utils/tags.ts", {
    "../models": { BodyFormat: { Markdown: "md" } },
    "./constant": { propKeys: { tag: "tag" } },
    "../api": {
      getRawObject: async () => {
        throw new Error("offline");
      },
      updateObjectRaw: async () => writes++,
    },
  });
  await assert.rejects(changeObjectTag("s", "o", "new"), /offline/);
  assert.equal(writes, 0);
});

function response(status, retryAfter) {
  return { status, headers: { get: () => retryAfter ?? null }, text: async () => "", json: async () => ({ status }) };
}
test("safe read retries transient errors; writes and long Retry-After are not repeated", async () => {
  let count = 0;
  const { request } = load("src/utils/request.ts", {
    "node-fetch": async () => response(++count === 1 ? 503 : 200, "0"),
  });
  assert.equal(await request("http://local", {}, async (r) => r.status, { retry: true }), 200);
  assert.equal(count, 2);
  count = 0;
  assert.equal(await request("http://local", { method: "POST" }, async (r) => r.status), 503);
  assert.equal(count, 1);
  let limitedCalls = 0;
  const limited = load("src/utils/request.ts", {
    "node-fetch": async () => {
      limitedCalls++;
      return response(429, "30");
    },
  }).request;
  assert.equal(await limited("http://local", {}, async (r) => r.status, { retry: true }), 429);
  assert.equal(limitedCalls, 1);
});

test("timeout covers the response body and caller cancellation propagates", async () => {
  const { request } = load("src/utils/request.ts", {
    "node-fetch": async (_u, { signal }) => ({
      status: 200,
      headers: { get: () => null },
      text: () =>
        new Promise((_resolve, reject) => {
          if (signal.aborted) reject(new Error("aborted"));
          else signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        }),
    }),
  });
  await assert.rejects(
    request("http://local", {}, (r) => r.text(), { timeoutMs: 10 }),
    /timed out/,
  );
  const controller = new AbortController();
  const pending = request("http://local", {}, (r) => r.text(), { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, /aborted/);
});

test("AI search exposes next page and partial stores without mapping UI icons", async () => {
  let options;
  const run = load("src/tools/search-anytype.ts", {
    "../api": {
      globalSearchRaw: async (_request, o) => {
        options = o;
        return { data: [{ id: "body-hit", type: null }], pagination: page(20, true), all_stores_loaded: false };
      },
    },
    "../models": { SortProperty: { LastModifiedDate: "last_modified_date" }, SortDirection: { Descending: "desc" } },
  }).default;
  const result = await run({ query: "body only", offset: 20, limit: 2 });
  assert.deepEqual(options, { offset: 20, limit: 2 });
  assert.equal(result.next_offset, 21);
  assert.equal(result.complete, false);
  assert.equal(result.results[0].id, "body-hit");
  await assert.rejects(run({ query: "x", limit: 1001 }), /limit/);
});

test("cache scope changes across accounts and server addresses without exposing tokens", async () => {
  const preferences = { apiKey: "synthetic-one", apiUrl: "http://127.0.0.1:31009" };
  const cache = load("src/utils/cacheScope.ts", {
    "@raycast/api": { getPreferenceValues: () => preferences, LocalStorage: { getItem: async () => undefined } },
  });
  const first = await cache.initializeCacheScope();
  preferences.apiKey = "synthetic-two";
  const second = await cache.initializeCacheScope();
  preferences.apiUrl = "http://127.0.0.1:31010";
  const third = await cache.initializeCacheScope();
  assert.notEqual(first, second);
  assert.notEqual(second, third);
  assert.equal(cache.getCacheNamespace().includes("synthetic"), false);
});

test("AI update sends only requested fields and appends to current content", async () => {
  const writes = [];
  const run = load("src/tools/update-object.ts", {
    "@raycast/api": {},
    "../api": {
      getRawObject: async () => ({ object: { markdown: "existing" } }),
      updateObjectRaw: async (s, id, payload) => {
        writes.push(payload);
        return { object: { id, space_id: s, name: "test" } };
      },
    },
    "../models": { BodyFormat: { Markdown: "md" } },
  }).default;
  await run({ spaceId: "s", objectId: "o", done: false });
  assert.deepEqual(writes[0], { properties: [{ key: "done", checkbox: false }] });
  await run({ spaceId: "s", objectId: "o", appendMarkdown: "addition" });
  assert.deepEqual(writes[1], { markdown: "existing\n\naddition" });
  await assert.rejects(run({ spaceId: "s", objectId: "o", markdown: "a", appendMarkdown: "b" }), /not both/);
  assert.equal(writes.length, 2);
});

test("global search renders body-only server matches, including pinned hits", () => {
  const jsx = (type, props) => ({ type, props });
  const hit = {
    id: "body-hit",
    name: "Unrelated title",
    snippet: "Unrelated preview",
    space_id: "s",
    type: { key: "page" },
  };
  let slot = 0;
  const Command = load("src/search-anytype.tsx", {
    "@raycast/api": { Icon: {}, List: { Dropdown: { Item: "filter", Section: "filters" }, Section: "section" } },
    "@raycast/utils": {},
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: {
      useState: (value) => [slot++ === 0 ? "needle" : value, () => {}],
      useEffect: () => {},
      useMemo: (fn) => fn(),
    },
    "./components": { ObjectListItem: "object-row", ViewType: { objects: "all" } },
    "./hooks": {
      useGlobalSearch: () => ({ objects: [hit] }),
      usePinnedObjects: () => ({ pinnedObjects: [hit] }),
      useSpaces: () => ({ spaces: [{ id: "s", name: "Space" }] }),
    },
    "./utils": {
      bundledTypeKeys: {},
      localStorageKeys: {},
      processObject: (o) => ({ id: o.id, spaceId: o.space_id, title: o.name, accessories: [], object: o }),
      pluralize: () => "",
      getSectionTitle: () => "",
    },
  }).default;
  const search = Command().props.children;
  const list = search.type(search.props);
  assert.equal(list.props.filtering, false);
  const rows = [];
  const visit = (n) => {
    if (Array.isArray(n)) return n.forEach(visit);
    if (!n || typeof n !== "object") return;
    if (n.type === "object-row") rows.push(n);
    visit(n.props?.children);
  };
  visit(list);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].props.objectId, "body-hit");
});

test("type metadata shares in-flight requests and separates account scopes", async () => {
  let calls = 0;
  let scope = "one";
  const metadata = load("src/utils/type.ts", {
    "../api": {
      getTypes: async () => {
        calls++;
        return { types: [{ key: "page" }], pagination: page(0, false) };
      },
    },
    "../models": {},
    "../utils": {},
    "./cacheScope": { getCacheNamespace: () => scope },
  });
  await Promise.all([metadata.fetchAllTypesForSpace("s"), metadata.fetchAllTypesForSpace("s")]);
  assert.equal(calls, 1);
  scope = "two";
  await metadata.fetchAllTypesForSpace("s");
  assert.equal(calls, 2);
});

test("a pre-aborted POST is rejected before node-fetch constructs its body stream", async () => {
  let calls = 0;
  const { request } = load("src/utils/request.ts", {
    "node-fetch": async () => {
      calls++;
      throw new Error("must not send");
    },
  });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    request("http://local", { method: "POST", body: "{}" }, async () => ({}), { signal: controller.signal }),
    { name: "AbortError" },
  );
  assert.equal(calls, 0);
});
