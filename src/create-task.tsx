import { Action, ActionPanel, Form, LaunchProps, LocalStorage } from "@raycast/api";
import { useCachedPromise, usePromise } from "@raycast/utils";
import { useState } from "react";
import { getRawObject } from "./api";
import { EnsureAuthenticated } from "./components";
import { CreateTaskForm } from "./components/CreateTask/CreateTaskForm";
import { TaskSetup } from "./components/CreateTask/TaskSetup";
import { useSpaces } from "./hooks";
import { BodyFormat, ObjectLayout, RawSpaceObjectWithBody } from "./models";
import { fetchAllTemplatesForSpace, fetchAllTypesForSpace } from "./utils";
import { getCacheNamespace, initializeCacheScope } from "./utils/cacheScope";
import { TaskConfig, TaskDraft } from "./utils/task";

type Props = LaunchProps<{ arguments: { title?: string } }>;
// Serialize local writes so a slow old draft cannot overwrite a successful creation receipt.
let storageQueue: Promise<unknown> = Promise.resolve();
function persistDraft(key: string, draft?: TaskDraft): Promise<void> {
  const write = storageQueue
    .catch(() => {})
    .then(() => (draft ? LocalStorage.setItem(key, JSON.stringify(draft)) : LocalStorage.removeItem(key)));
  storageQueue = write;
  return write;
}
export default function Command(props: Props) {
  return (
    <EnsureAuthenticated viewType="form">
      <LoadTask {...props} />
    </EnsureAuthenticated>
  );
}
function LoadTask(props: Props) {
  const { data, error, isLoading, revalidate } = usePromise(
    async (_scope: string) => {
      void _scope;
      const scope = await initializeCacheScope();
      const configKey = `create-task:${scope}:config`;
      const draftKey = `create-task:${scope}:draft`;
      const [config, draft] = await Promise.all([
        LocalStorage.getItem<string>(configKey),
        LocalStorage.getItem<string>(draftKey),
      ]);
      return {
        configKey,
        draftKey,
        config: config ? (JSON.parse(config) as TaskConfig) : undefined,
        draft: draft ? (JSON.parse(draft) as TaskDraft) : undefined,
      };
    },
    [getCacheNamespace()],
  );
  if (!data || error)
    return (
      <Form
        isLoading={isLoading}
        actions={
          <ActionPanel>
            <Action title="Retry" onAction={() => revalidate()} />
          </ActionPanel>
        }
      >
        <Form.Description text={error ? "Unable to load task settings. Please retry." : "Loading task settings…"} />
      </Form>
    );
  return <TaskCommand stored={data} title={props.arguments?.title} />;
}
interface Stored {
  configKey: string;
  draftKey: string;
  config?: TaskConfig;
  draft?: TaskDraft;
}
function TaskCommand({ stored, title }: { stored: Stored; title?: string }) {
  const [config, setConfig] = useState(stored.config);
  const [saved, setSaved] = useState(stored.draft);
  const [editing, setEditing] = useState(!stored.config);
  const { spaces, spacesError, isLoadingSpaces } = useSpaces(undefined, { all: true });
  const persist = async (draft?: TaskDraft) => {
    await persistDraft(stored.draftKey, draft);
    setSaved(draft);
  };
  if (spacesError || (isLoadingSpaces && !spaces.length))
    return (
      <Form isLoading={isLoadingSpaces}>
        <Form.Description
          text={spacesError ? "Unable to load channels. Open Anytype, then reopen this command." : "Loading channels…"}
        />
      </Form>
    );
  if (editing || !config)
    return (
      <TaskSetup
        spaces={spaces}
        previous={config}
        onCancel={config ? () => setEditing(false) : undefined}
        onSave={async (next) => {
          await LocalStorage.setItem(stored.configKey, JSON.stringify(next));
          setConfig(next);
          setEditing(false);
        }}
      />
    );
  const space = spaces.find((s) => s.id === config.spaceId);
  if (!space)
    return (
      <Form
        actions={
          <ActionPanel>
            <Action title="Select Another Channel" onAction={() => setEditing(true)} />
          </ActionPanel>
        }
      >
        <Form.Description text="The saved channel is unavailable. Select another channel." />
      </Form>
    );
  return (
    <LoadTaskForm
      key={JSON.stringify(config)}
      config={config}
      space={space}
      saved={saved}
      title={title}
      persist={persist}
      onConfigure={() => setEditing(true)}
    />
  );
}
function LoadTaskForm(props: Omit<Parameters<typeof CreateTaskForm>[0], "type" | "template">) {
  const { data, error, isLoading, revalidate } = useCachedPromise(
    async (_scope: string, config: TaskConfig) => {
      const types = await fetchAllTypesForSpace(config.spaceId);
      const type = types.find(
        (t) => t.id === config.typeId && t.key === config.typeKey && !t.archived && t.layout === ObjectLayout.Action,
      );
      if (!type) throw new Error("The saved Task type is unavailable. Update your settings.");
      let template: RawSpaceObjectWithBody | undefined;
      if (config.templateId) {
        const templates = await fetchAllTemplatesForSpace(config.spaceId, type.id);
        if (!templates.some((t) => t.id === config.templateId && !t.archived))
          throw new Error("The saved template is unavailable or is not a Task template. Update your settings.");
        template = (await getRawObject(config.spaceId, config.templateId, BodyFormat.Markdown)).object;
        if (template.archived) throw new Error("The saved template is archived. Update your settings.");
      }
      return { type, template, types };
    },
    [getCacheNamespace(), props.config],
  );
  if (!data || error || isLoading)
    return (
      <Form
        isLoading={isLoading}
        actions={
          <ActionPanel>
            <Action title="Reload" onAction={() => revalidate()} />
            <Action title="Change Channel or Template" onAction={props.onConfigure} />
          </ActionPanel>
        }
      >
        <Form.Description text={error ? String(error.message) : "Loading Task and template defaults…"} />
      </Form>
    );
  return <CreateTaskForm {...props} type={data.type} template={data.template} referenceTypes={data.types} />;
}
