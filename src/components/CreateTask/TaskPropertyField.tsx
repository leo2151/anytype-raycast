import { Form, Icon } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";
import { getRawObject } from "../../api";
import { useSearch } from "../../hooks";
import { BodyFormat, PropertyFormat, RawProperty, Tag } from "../../models";
import { getCacheNamespace } from "../../utils/cacheScope";
import { mapConcurrent } from "../../utils/pagination";
import { TaskValue } from "../../utils/task";

function ObjectReferences({ spaceId, property, title, value, onChange }: Props) {
  const [query, setQuery] = useState("");
  const ids = Array.isArray(value) ? value : [];
  const { objects, isLoadingObjects } = useSearch(spaceId, query, []);
  const { data: selected = [] } = useCachedPromise(
    async (_scope: string, spaceId: string, ids: string[]) =>
      mapConcurrent(ids, async (id) => {
        try {
          const { object } = await getRawObject(spaceId, id, BodyFormat.Markdown);
          return { id, name: object.name || id };
        } catch {
          return { id, name: id };
        }
      }),
    [getCacheNamespace(), spaceId, ids],
    { execute: ids.length > 0 },
  );
  const choices = new Map([...selected, ...objects].map((o) => [o.id, o]));
  return (
    <>
      {ids.length > 0 && (
        <Form.TagPicker id={`property:${property.key}`} title={title ?? property.name} value={ids} onChange={onChange}>
          {ids.map((id) => (
            <Form.TagPicker.Item key={id} value={id} title={choices.get(id)?.name ?? id} icon={Icon.Document} />
          ))}
        </Form.TagPicker>
      )}
      <Form.Dropdown
        id={`add:${property.key}`}
        key={ids.join(":")}
        title={ids.length ? "Add Reference" : (title ?? property.name)}
        value=""
        onChange={(id) => {
          if (id) onChange([...new Set([...ids, id])]);
        }}
        placeholder={isLoadingObjects ? "Searching…" : "Search objects…"}
        onSearchTextChange={setQuery}
        throttle
      >
        <Form.Dropdown.Item value="" title="Search and add an object…" />
        {objects
          .filter((o) => !ids.includes(o.id))
          .map((o) => (
            <Form.Dropdown.Item key={o.id} value={o.id} title={o.name} icon={o.icon} />
          ))}
      </Form.Dropdown>
    </>
  );
}
interface Props {
  spaceId: string;
  property: RawProperty;
  title?: string;
  value: TaskValue;
  onChange: (value: TaskValue) => void;
  tags?: Tag[];
}
export function TaskPropertyField(props: Props) {
  const { property, title, value, onChange, tags = [] } = props;
  const common = { id: `property:${property.key}`, title: title ?? property.name };
  switch (property.format) {
    case PropertyFormat.Date:
      return (
        <Form.DatePicker
          {...common}
          value={value ? new Date(String(value)) : null}
          onChange={(date) => onChange(date?.toISOString() ?? null)}
        />
      );
    case PropertyFormat.Checkbox:
      return (
        <Form.Checkbox
          {...common}
          label={title === "Flag" ? "Mark as important" : ""}
          value={Boolean(value)}
          onChange={onChange}
        />
      );
    case PropertyFormat.Select:
      return (
        <Form.Dropdown {...common} value={String(value ?? "")} onChange={onChange}>
          <Form.Dropdown.Item value="" title="Not Set" />
          {value && !tags.some((t) => t.id === value) && (
            <Form.Dropdown.Item value={String(value)} title="Template selection" />
          )}
          {tags.map((t) => (
            <Form.Dropdown.Item
              key={t.id}
              value={t.id}
              title={t.name}
              icon={{ source: Icon.Tag, tintColor: t.color }}
            />
          ))}
        </Form.Dropdown>
      );
    case PropertyFormat.MultiSelect: {
      const ids = Array.isArray(value) ? value : [];
      return (
        <Form.TagPicker {...common} value={ids} onChange={onChange}>
          {ids
            .filter((id) => !tags.some((t) => t.id === id))
            .map((id) => (
              <Form.TagPicker.Item key={id} value={id} title="Template tag" />
            ))}
          {tags.map((t) => (
            <Form.TagPicker.Item
              key={t.id}
              value={t.id}
              title={t.name}
              icon={{ source: Icon.Tag, tintColor: t.color }}
            />
          ))}
        </Form.TagPicker>
      );
    }
    case PropertyFormat.Objects:
      return <ObjectReferences {...props} />;
    case PropertyFormat.Files:
      return (
        <Form.Description
          title={common.title}
          text="Template attachments are preserved. Manage files in Anytype after creation."
        />
      );
    default:
      return (
        <Form.TextField
          {...common}
          value={String(value ?? "")}
          onChange={onChange}
          placeholder={property.format === PropertyFormat.Number ? "Enter a number" : "Optional"}
        />
      );
  }
}
