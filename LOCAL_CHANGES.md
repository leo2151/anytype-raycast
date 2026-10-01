# Customized Anytype extension

This fork preserves the local workflow changes and selectively adopts upstream improvements. It targets Raycast 2 and the stable Anytype v1 API (`Anytype-Version: 2025-11-08`). It does not require API v2.

## Preserved behavior

- Name fields automatically focus in the five create forms.
- Creating an object (form or AI tool) touches its name after creation so it appears in recently modified views. Failure of this optional step does not report the object as uncreated.
- Default API URL is `http://127.0.0.1:31009`.
- `scripts/ray.cjs` prefers compatible system Node, then the runtime bundled with Raycast on macOS. Raycast 2 needs Node 22.22.2 or later.
- Channel display accepts both current and legacy space/chat identifiers; Quicklinks respect `RAYCAST_SCHEME`.

## Reliability and performance changes (2026-10-01)

- Keep bookmark URLs and tags when sorting by name. Tag actions read the latest object before changing its tags and serialize changes to the same object within one extension process.
- Keep global search matches from indexed content even if the name and snippet do not contain the query. Pinned matches also come from the server's search result while searching.
- If creating an object succeeds but adding it to a collection fails, show the saved object's ID and offer a retry of only the collection operation. Concurrent submit clicks are ignored.
- Load all type definitions before initializing an edit form. Only changed fields are sent; changing a name no longer rewrites unchanged Markdown or properties.
- Apply a 15-second API timeout through response-body reading. Safe reads (including search POSTs) retry transient HTTP failures at most twice. Writes are never automatically retried. Respect bounded `Retry-After` delays.
- Propagate cancellation from global and per-space search. Timeout/offline/rate-limit responses do not discard a valid pairing; an explicit 401 does.
- Partition cached requests and pins by a hash of service URL and API key. Legacy pins migrate to the first account using the update. Raw API keys are not cache keys.
- Fetch only the active channel view. Share type requests for 30 seconds, limit concurrent metadata and object mapping work, and cache/de-duplicate up to 256 icons for one minute. Preserve existing URL query parameters and apply the timeout while reading icon bodies.
- Follow all metadata pages for create/edit selectors and tags. Guard against an empty page that incorrectly reports more results.

## New capabilities

- Global search filters: **Open Tasks**, **Completed Tasks**, **Files**, **Images**. Task filters use the built-in `done` checkbox. “All” retains the API's default behavior; choose Files to explicitly include file types.
- Search indicates when Anytype has not loaded every channel yet and offers refresh.
- AI global/per-space search accepts `offset` and `limit` (1–1000), and returns `next_offset`, `all_stores_loaded` when available, and `complete`.
- AI search/get/create/update uses raw API objects instead of fetching UI icons and linked-object previews.
- AI **Update Object** supports name, description, full Markdown replacement, Markdown append, and task completion. Its confirmation lists the intended fields. Append fetches current content first. Omitted fields are preserved.

## Validation and maintenance

```sh
npm ci
npm run build -- -e dist -o dist --exit-on-error
npm run check
```

`check` runs TypeScript, ESLint and the regression suite. The staged build generates Raycast's ignored TypeScript definitions on a fresh checkout. Regression tests use synthetic objects and mock API responses: they never modify a real Anytype workspace. CI performs the same steps on Node 22.22.2.

To install this checkout into Raycast on the local Mac:

```sh
npm run build -- --exit-on-error
```

Keep local API keys in Raycast preferences or its pairing storage. Do not commit build archives, `.env` files or ad-hoc `test-*` scripts.

## Boundaries

The v1 API does not expose a compare-and-swap operation for tags or Markdown. Reading before a write reduces stale updates, but cannot guarantee atomic changes across simultaneous edits from other apps. A network interruption during a write can leave its outcome unknown; verify the object before manually repeating a create.

Chat messaging, file upload/download management, a general visual filter builder, clipboard capture and migration to prerelease API v2 remain separate enhancements. Files and Images currently support search and the existing object actions.

References used for the compatibility review:

- [Official Anytype Raycast repository](https://github.com/anyproto/anytype-raycast)
- [Anytype API changelog](https://developers.anytype.io/docs/reference/changelog/)
- [Raycast useCachedPromise](https://developers.raycast.com/utilities/react-hooks/usecachedpromise)
- The installed Anytype app's `/v1/docs/openapi.json` (checked locally, not published with private workspace data).

## Create Task command (2026-10-01)

- Independent **Create Task** command with an optional task-name argument and English UI.
- First-run setup selects a channel and a real Task type; a unique Complex Task template is suggested when available. Settings are stored locally per API account/server, separately from Create Object. Personal channel and template IDs are not included in the repository.
- Main fields: Task Name (autofocused), When, Due Date, Projects, Flag, and Notes. Matching custom properties requires the correct name/key and format. Unmatched or ambiguous properties remain in More Options.
- More Options exposes collection membership, body text, tags, and other actual Task properties. Object references support multiple selections. Existing attachment defaults are preserved; attachment management stays in Anytype.
- Template defaults are read before the form initializes. An empty body and icon are omitted from the request, unchanged properties stay inherited, and Done is explicitly false. Status remains independent from Done.
- **Create Task** uses Command-Return. **Create and Continue** uses Command-Shift-Return; it retains the channel, template, projects and collection, while clearing title, notes, dates, body and Flag.
- Local drafts use serialized storage writes. A successful create persists its object ID before follow-up work, so retrying a failed collection association or reopening recovery does not create another task.
- **Actions → Change Channel or Template** updates only this command. Moving to another context drops incompatible property IDs and collection selections.
- Existing Create Object and Quicklinks remain available. Their hotkeys are not reassigned automatically.

Validation includes TypeScript, ESLint, regression tests with mocked writes, a Raycast build and live checks of the English UI, selected template and title focus. No real test tasks are created during automated regression tests.
