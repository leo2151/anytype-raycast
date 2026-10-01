import { Form, Icon } from "@raycast/api";
import { RawProperty, Tag } from "../../models";
import { TaskValue } from "../../utils/task";
import { taskChoiceChanges, taskChoiceIds, taskChoiceToken, taskChoiceValues } from "../../utils/taskLayout";

export function TaskChoiceGroup({
  id,
  title,
  properties,
  values,
  tagsMap,
  valueLabels,
  unavailable,
  onChange,
}: {
  id: string;
  title: string;
  properties: RawProperty[];
  values: Record<string, TaskValue>;
  tagsMap: Record<string, Tag[]>;
  valueLabels: Record<string, Record<string, string>>;
  unavailable: boolean;
  onChange: (changes: Record<string, TaskValue>) => void;
}) {
  return (
    <Form.TagPicker
      id={`task-group:${id}`}
      title={title}
      value={taskChoiceValues(properties, values)}
      placeholder={unavailable ? "Loading options…" : `Select ${properties.map((p) => p.name).join(" / ")}…`}
      info="Choose a new value to replace a single-choice field. Remove a chip to clear that field. Multiple-choice fields keep all selected values."
      onChange={(selection) => {
        if (!unavailable) onChange(taskChoiceChanges(properties, values, selection));
      }}
    >
      {properties.flatMap((p) => {
        const choices = new Map((tagsMap[p.id] ?? []).map((tag) => [tag.id, tag]));
        for (const id of taskChoiceIds(p, values[p.key])) {
          if (!choices.has(id))
            choices.set(id, { id, key: id, name: valueLabels[p.key]?.[id] ?? `Saved selection (${id})`, color: "" });
        }
        return [...choices.values()].map((tag) => (
          <Form.TagPicker.Item
            key={taskChoiceToken(p.key, tag.id)}
            value={taskChoiceToken(p.key, tag.id)}
            title={`${p.name}: ${tag.name}`}
            icon={tag.color ? { source: Icon.Tag, tintColor: tag.color } : Icon.Tag}
          />
        ));
      })}
    </Form.TagPicker>
  );
}
