import { Action, ActionPanel, Form, Icon } from "@raycast/api";
import { showFailureToast, useCachedPromise } from "@raycast/utils";
import { useEffect, useState } from "react";
import { Space } from "../../models";
import { fetchAllTemplatesForSpace, fetchAllTypesForSpace } from "../../utils";
import { getCacheNamespace } from "../../utils/cacheScope";
import { findTaskType, TaskConfig } from "../../utils/task";

export function TaskSetup({
  spaces,
  previous,
  onSave,
  onCancel,
}: {
  spaces: Space[];
  previous?: TaskConfig;
  onSave: (config: TaskConfig) => Promise<void>;
  onCancel?: () => void;
}) {
  const [spaceId, setSpaceId] = useState(
    spaces.some((s) => s.id === previous?.spaceId) ? previous!.spaceId : spaces.length === 1 ? spaces[0].id : "",
  );
  const [templateId, setTemplateId] = useState<string | undefined>(previous?.templateId);
  const [saving, setSaving] = useState(false);
  const {
    data: types = [],
    isLoading: loadingTypes,
    error: typesError,
  } = useCachedPromise((_scope: string, id: string) => fetchAllTypesForSpace(id), [getCacheNamespace(), spaceId], {
    execute: !!spaceId,
  });
  const task = findTaskType(types);
  const {
    data: templates,
    isLoading: loadingTemplates,
    error: templatesError,
  } = useCachedPromise(
    (_scope: string, id: string, typeId: string) => fetchAllTemplatesForSpace(id, typeId),
    [getCacheNamespace(), spaceId, task?.id ?? ""],
    { execute: !!task },
  );
  useEffect(() => {
    if (templateId === undefined && templates && !loadingTemplates && task) {
      const complex = templates.filter((t) => t.name === "Complex Task" && !t.archived);
      setTemplateId(complex.length === 1 ? complex[0].id : "");
    }
  }, [templates, loadingTemplates, task, templateId]);
  const error = typesError || templatesError;
  const validTemplate = templateId === "" || (templates ?? []).some((t) => t.id === templateId && !t.archived);
  async function save() {
    if (saving || loadingTypes || loadingTemplates || !task || !validTemplate || error) return;
    setSaving(true);
    try {
      await onSave({ spaceId, typeId: task.id, typeKey: task.key, templateId: templateId ?? "" });
    } catch (error) {
      await showFailureToast(error, { title: "Failed to Save Task Settings" });
    } finally {
      setSaving(false);
    }
  }
  return (
    <Form
      navigationTitle="Set Up Create Task"
      isLoading={loadingTypes || loadingTemplates || saving}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Use These Settings" icon={Icon.Check} onSubmit={save} />
          {onCancel && <Action title="Back to Task" onAction={onCancel} />}
        </ActionPanel>
      }
    >
      <Form.Description text="Choose the default channel and template for Create Task. These settings are stored locally, separately from Create Object." />
      <Form.Dropdown
        id="channel"
        title="Channel"
        value={spaceId}
        onChange={(id) => {
          setSpaceId(id);
          setTemplateId(undefined);
        }}
      >
        <Form.Dropdown.Item value="" title="Select a channel…" />
        {spaces.map((s) => (
          <Form.Dropdown.Item key={s.id} value={s.id} title={s.name} icon={s.icon} />
        ))}
      </Form.Dropdown>
      <Form.Description
        title="Object Type"
        text={
          task
            ? `${task.name} · Task`
            : loadingTypes
              ? "Finding Task…"
              : "No Task type found in this channel. Choose another channel."
        }
      />
      {task && (
        <Form.Dropdown id="template" title="Template" value={templateId ?? ""} onChange={setTemplateId}>
          <Form.Dropdown.Item value="" title="No Template" />
          {templateId && !validTemplate && (
            <Form.Dropdown.Item value={templateId} title="Saved template unavailable — choose another" />
          )}
          {(templates ?? [])
            .filter((t) => !t.archived)
            .map((t) => (
              <Form.Dropdown.Item key={t.id} value={t.id} title={t.name} icon={t.icon} />
            ))}
        </Form.Dropdown>
      )}
      {error && (
        <Form.Description title="Loading Failed" text="Make sure Anytype is running, then reopen this command." />
      )}
    </Form>
  );
}
