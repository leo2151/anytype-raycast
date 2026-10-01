import { Action, ActionPanel, Form, Icon } from "@raycast/api";
import { useState } from "react";
import { RawProperty, Type } from "../../models";
import { ReferenceTypePreference, ReferenceTypePreferences, resolveReferenceTypes } from "../../utils/referenceTypes";

export function ReferenceTypeSettings({
  properties,
  types,
  preferences,
  onSave,
  onCancel,
}: {
  properties: RawProperty[];
  types: Type[];
  preferences: ReferenceTypePreferences;
  onSave: (preferences: ReferenceTypePreferences) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(preferences);
  const [error, setError] = useState("");
  const active = types.filter((type) => !type.archived);
  function change(property: RawProperty, preference: ReferenceTypePreference) {
    setDraft({ ...draft, [property.key]: preference });
    setError("");
  }
  function save() {
    const invalid = properties.find(
      (p) => draft[p.key]?.mode === "types" && resolveReferenceTypes(p, types, draft[p.key]).mode === "blocked",
    );
    if (invalid) {
      setError(`Select at least one available type for ${invalid.name}.`);
      return;
    }
    onSave(draft);
  }
  return (
    <Form
      navigationTitle="Reference Type Filters"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Filters" icon={Icon.Check} onSubmit={save} />
          <Action title="Cancel" onAction={onCancel} />
        </ActionPanel>
      }
    >
      <Form.Description text="Choose which object types each relation can search. Automatic matches the field to a unique type in this channel. Existing selections and template values are preserved." />
      {properties.map((p) => {
        const preference = draft[p.key] ?? { mode: "auto", typeIds: [] };
        const automatic = resolveReferenceTypes(p, types);
        return (
          <Form.Dropdown
            key={`mode:${p.key}`}
            id={`mode:${p.key}`}
            title={p.name}
            value={preference.mode}
            onChange={(mode) => change(p, { ...preference, mode: mode as ReferenceTypePreference["mode"] })}
          >
            <Form.Dropdown.Item value="auto" title={`Automatic — ${automatic.label}`} />
            <Form.Dropdown.Item value="types" title="Choose Types…" />
            <Form.Dropdown.Item value="all" title="All Types (Unrestricted)" />
          </Form.Dropdown>
        );
      })}
      {properties
        .filter((p) => draft[p.key]?.mode === "types")
        .map((p) => (
          <Form.TagPicker
            key={p.key}
            id={`types:${p.key}`}
            title={`${p.name} Types`}
            value={draft[p.key].typeIds}
            onChange={(typeIds) => change(p, { mode: "types", typeIds })}
          >
            {draft[p.key].typeIds
              .filter((id) => !active.some((type) => type.id === id))
              .map((id) => (
                <Form.TagPicker.Item key={id} value={id} title="Unavailable type — remove or replace" />
              ))}
            {active.map((type) => (
              <Form.TagPicker.Item
                key={type.id}
                value={type.id}
                title={`${type.name} (${type.key})`}
                icon={type.icon}
              />
            ))}
          </Form.TagPicker>
        ))}
      {error && <Form.Description title="Check Filters" text={error} />}
    </Form>
  );
}
