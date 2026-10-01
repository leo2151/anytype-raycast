import { Action, ActionPanel, Form, Icon, popToRoot, showToast, Toast } from "@raycast/api";
import { showFailureToast, useCachedState } from "@raycast/utils";
import { Fragment as ReactFragment, useRef, useState } from "react";
import { addObjectsToList, createObjectRaw, updateObjectRaw } from "../../api";
import { useSearch, useTagsMap } from "../../hooks";
import { PropertyFormat, RawProperty, RawSpaceObjectWithBody, Space, Type } from "../../models";
import { bundledPropKeys } from "../../utils";
import { getCacheNamespace } from "../../utils/cacheScope";
import { ReferenceTypePreferences, resolveReferenceTypes } from "../../utils/referenceTypes";
import {
  initialTaskDraft,
  nextTaskDraft,
  TaskConfig,
  TaskDraft,
  taskFields,
  taskRequest,
  TaskValue,
} from "../../utils/task";
import { isTaskChoice, TaskLayout, taskPropertyGroups } from "../../utils/taskLayout";
import { ReferenceTypeSettings } from "./ReferenceTypeSettings";
import { TaskChoiceGroup } from "./TaskChoiceGroup";
import { TaskPropertyField } from "./TaskPropertyField";

interface Props {
  config: TaskConfig;
  space: Space;
  type: Type;
  template?: RawSpaceObjectWithBody;
  referenceTypes?: Type[];
  saved?: TaskDraft;
  title?: string;
  persist: (draft: TaskDraft | undefined) => Promise<void>;
  onConfigure: () => void;
}
export function CreateTaskForm({
  config,
  space,
  type,
  template,
  saved,
  title,
  persist,
  onConfigure,
  referenceTypes = [],
}: Props) {
  const [draft, setDraft] = useState(() => initialTaskDraft(config, template, saved, title));
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const titleRef = useRef<Form.TextField>(null);
  const [nameError, setNameError] = useState<string>();
  const [listQuery, setListQuery] = useState("");
  const [layout, setLayout] = useCachedState<TaskLayout>(`create-task-layout:${getCacheNamespace()}`, "compact");
  const [referencePreferences, setReferencePreferences] = useCachedState<ReferenceTypePreferences>(
    `create-task-reference-types:${getCacheNamespace()}:${config.spaceId}`,
    {},
  );
  const [editingReferenceTypes, setEditingReferenceTypes] = useState(false);
  const referenceProperties = type.properties.filter(
    (p) => p.format === PropertyFormat.Objects && !Object.values(bundledPropKeys).includes(p.key),
  );
  const fields = taskFields(type.properties);
  const main = [fields.when, fields.due, fields.projects, fields.flag].filter((p): p is RawProperty => !!p);
  const other = type.properties.filter(
    (p) => !Object.values(bundledPropKeys).includes(p.key) && p.key !== "done" && !main.some((m) => m.key === p.key),
  );
  const { groups, additional } = taskPropertyGroups(other);
  const visibleProperties = [...groups.flatMap((g) => g.properties), ...(draft.expanded ? additional : [])];
  const {
    tagsMap = {},
    tagsError,
    isLoadingTags,
    mutateTags,
  } = useTagsMap(
    config.spaceId,
    visibleProperties.filter(isTaskChoice).map((p) => p.id),
  );
  const valueLabels = Object.fromEntries(
    (template?.properties ?? []).map((p) => [
      p.key,
      Object.fromEntries((p.select ? [p.select] : (p.multi_select ?? [])).map((tag) => [tag.id, tag.name])),
    ]),
  );
  const { objects: collections, isLoadingObjects: loadingLists } = useSearch(
    config.spaceId,
    listQuery,
    ["collection"],
    { execute: draft.expanded },
  );
  function remember(next: TaskDraft) {
    setDraft(next);
    void persist(next).catch((error) =>
      showFailureToast(error, { title: "Draft could not be saved. Keep this form open." }),
    );
  }
  function change(patch: Partial<TaskDraft>, key?: string) {
    if (lock.current || draft.pending) return;
    remember({
      ...draft,
      ...patch,
      changed: key ? [...new Set([...draft.changed, key])] : (patch.changed ?? draft.changed),
    });
  }
  function propertyChange(p: RawProperty, value: TaskValue) {
    if (isTaskChoice(p) && (isLoadingTags || tagsError)) return;
    change({ properties: { ...draft.properties, [p.key]: value } }, p.key);
  }
  function groupChange(changes: Record<string, TaskValue>) {
    if (!Object.keys(changes).length) return;
    change({
      properties: { ...draft.properties, ...changes },
      changed: [...new Set([...draft.changed, ...Object.keys(changes)])],
    });
  }
  function propertyField(p: RawProperty, title?: string) {
    return (
      <TaskPropertyField
        key={p.key}
        spaceId={config.spaceId}
        property={p}
        title={title}
        value={draft.properties[p.key] ?? null}
        onChange={(v) => propertyChange(p, v)}
        tags={tagsMap[p.id]}
        valueLabels={valueLabels[p.key]}
        referenceFilter={
          p.format === PropertyFormat.Objects
            ? resolveReferenceTypes(p, referenceTypes, referencePreferences[p.key])
            : undefined
        }
      />
    );
  }
  async function finish(current: TaskDraft, continueCreating: boolean) {
    if (continueCreating) {
      const next = nextTaskDraft(config, type, template, current);
      await persist(next);
      setDraft(next);
      titleRef.current?.focus();
    } else {
      await persist(undefined);
      await popToRoot();
    }
  }
  async function submit(continueCreating: boolean) {
    if (lock.current || draft.pending) return;
    if (!draft.name.trim()) {
      setNameError("Enter a task name");
      titleRef.current?.focus();
      return;
    }
    lock.current = true;
    setBusy(true);
    let created: TaskDraft | undefined;
    try {
      const request = taskRequest(config, type, draft);
      await showToast({ style: Toast.Style.Animated, title: "Creating task…" });
      const { object } = await createObjectRaw(config.spaceId, request);
      if (!object.id) throw new Error("The response did not include a task ID. Check Anytype before trying again.");
      created = { ...draft, pending: { objectId: object.id, listId: draft.listId, continueCreating } };
      setDraft(created);
      // Persist the receipt before any follow-up so reopening the command cannot create another object.
      await persist(created);
      try {
        await updateObjectRaw(config.spaceId, object.id, { name: object.name });
      } catch {
        /* Optional recency touch. */
      }
      if (draft.listId) await addObjectsToList(config.spaceId, draft.listId, { objects: [object.id] });
      const completed = { ...created, pending: { ...created.pending!, listId: "" } };
      setDraft(completed);
      await persist(completed);
      await showToast(Toast.Style.Success, "Task Created");
      await finish(completed, continueCreating);
    } catch (error) {
      await showFailureToast(error, { title: created ? "Task saved; follow-up incomplete" : "Failed to Create Task" });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function recover(skipCollection: boolean) {
    if (lock.current || !draft.pending) return;
    lock.current = true;
    setBusy(true);
    try {
      if (!skipCollection && draft.pending.listId)
        await addObjectsToList(config.spaceId, draft.pending.listId, { objects: [draft.pending.objectId] });
      const completed = { ...draft, pending: { ...draft.pending, listId: "" } };
      setDraft(completed);
      await persist(completed);
      await finish(completed, skipCollection ? false : draft.pending.continueCreating);
    } catch (error) {
      await showFailureToast(error, { title: "Task saved; retry the remaining step" });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (draft.pending)
    return (
      <Form
        navigationTitle="Task Saved"
        isLoading={busy}
        actions={
          <ActionPanel>
            <Action
              title={draft.pending.listId ? "Retry Adding to Collection" : "Done"}
              icon={Icon.ArrowClockwise}
              onAction={() => recover(false)}
            />
            <Action title="Keep Task and Close" onAction={() => recover(true)} />
          </ActionPanel>
        }
      >
        <Form.Description
          title="Task Created"
          text="This task has been saved. Completing the remaining steps will not create another task."
        />
        <Form.Description title="Task ID" text={draft.pending.objectId} />
      </Form>
    );

  if (editingReferenceTypes)
    return (
      <ReferenceTypeSettings
        properties={referenceProperties}
        types={referenceTypes}
        preferences={referencePreferences}
        onCancel={() => setEditingReferenceTypes(false)}
        onSave={(next) => {
          setReferencePreferences(next);
          setEditingReferenceTypes(false);
        }}
      />
    );

  return (
    <Form
      navigationTitle="Create Task"
      isLoading={busy || isLoadingTags || loadingLists}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Create Task" icon={Icon.Check} onSubmit={() => submit(false)} />
          <Action.SubmitForm
            title="Create and Continue"
            icon={Icon.Plus}
            shortcut={{ modifiers: ["cmd", "shift"], key: "enter" }}
            onSubmit={() => submit(true)}
          />
          <Action
            title={layout === "compact" ? "Use Standard Layout" : "Use Compact Layout"}
            icon={Icon.List}
            shortcut={{ modifiers: ["cmd", "shift"], key: "l" }}
            onAction={() => setLayout(layout === "compact" ? "standard" : "compact")}
          />
          {referenceProperties.length > 0 && (
            <Action
              title="Reference Type Filters"
              icon={Icon.Filter}
              onAction={() => {
                if (!lock.current) setEditingReferenceTypes(true);
              }}
            />
          )}
          <Action
            title={draft.expanded ? "Hide Additional Properties" : "Show Additional Properties"}
            icon={Icon.ChevronDown}
            shortcut={{ modifiers: ["cmd", "shift"], key: "m" }}
            onAction={() => change({ expanded: !draft.expanded })}
          />
          {tagsError && (
            <Action title="Reload Property Options" icon={Icon.ArrowClockwise} onAction={() => mutateTags()} />
          )}
          <Action
            title="Change Channel or Template"
            icon={Icon.Gear}
            onAction={async () => {
              if (lock.current) return;
              await persist(draft);
              onConfigure();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="name"
        title="Task Name"
        placeholder="What needs to be done?"
        value={draft.name}
        onChange={(name) => {
          setNameError(undefined);
          change({ name });
        }}
        autoFocus
        ref={titleRef}
        error={nameError}
      />
      {tagsError && (
        <Form.Description
          title="Unable to Load Options"
          text="Saved selections are preserved. Use Actions → Reload Property Options before editing choices."
        />
      )}
      {fields.projects && propertyField(fields.projects, "Projects")}
      {groups.map((group) => {
        const choices = group.properties.filter(isTaskChoice);
        const combine = layout === "compact" && choices.length > 1 && group.id !== "tags";
        return combine ? (
          <ReactFragment key={group.id}>
            <TaskChoiceGroup
              id={group.id}
              title={group.title}
              properties={choices}
              values={draft.properties}
              tagsMap={tagsMap}
              valueLabels={valueLabels}
              unavailable={Boolean(isLoadingTags || tagsError)}
              onChange={groupChange}
            />
            {group.properties.filter((p) => !isTaskChoice(p)).map((p) => propertyField(p))}
          </ReactFragment>
        ) : (
          <ReactFragment key={group.id}>{group.properties.map((p) => propertyField(p))}</ReactFragment>
        );
      })}
      {fields.when && propertyField(fields.when, "When")}
      {fields.due && propertyField(fields.due, "Due Date")}
      {fields.flag && propertyField(fields.flag, "Flag")}
      <Form.Separator />
      <Form.TextField
        id="notes"
        title="Notes"
        placeholder="Optional, add a short description…"
        value={draft.notes}
        onChange={(notes) => change({ notes }, "description")}
      />
      <Form.Description title="Save To" text={`${space.name} · ${type.name} · ${template?.name ?? "No Template"}`} />
      {draft.expanded && (
        <>
          <Form.Separator />
          <Form.Dropdown
            id="listId"
            title="Collection"
            value={draft.listId}
            onChange={(listId) => change({ listId })}
            onSearchTextChange={setListQuery}
            throttle
          >
            <Form.Dropdown.Item value="" title="No Collection" />
            {draft.listId && !collections.some((c) => c.id === draft.listId) && (
              <Form.Dropdown.Item value={draft.listId} title="Selected collection" />
            )}
            {collections.map((c) => (
              <Form.Dropdown.Item key={c.id} value={c.id} title={c.name} icon={c.icon} />
            ))}
          </Form.Dropdown>
          <Form.TextArea
            id="body"
            title="Body"
            value={draft.body}
            onChange={(body) => change({ body })}
            placeholder="Leave blank to preserve the template body"
            info="Text entered here is sent as the new object body. Leave blank to preserve the template body."
          />
          {additional.map((p) => propertyField(p))}
        </>
      )}
    </Form>
  );
}
