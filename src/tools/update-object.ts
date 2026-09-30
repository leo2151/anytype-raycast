import { Tool } from "@raycast/api";
import { getRawObject, updateObjectRaw } from "../api";
import { BodyFormat, PropertyLinkWithValue, UpdateObjectRequest } from "../models";

type Input = {
  /** Space ID from get-spaces or search results. */
  spaceId: string;
  /** Existing object ID from search results. */
  objectId: string;
  /** New name. Omit to preserve the current name. */
  name?: string;
  /** New description. An empty string clears it. */
  description?: string;
  /** Full replacement Markdown. Use only when the user explicitly requests replacing content. */
  markdown?: string;
  /** Append Markdown to the current content. Cannot be combined with markdown. */
  appendMarkdown?: string;
  /** Completion checkbox for a task. Omit to preserve it. */
  done?: boolean;
};

export default async function tool(input: Input) {
  if (input.markdown !== undefined && input.appendMarkdown !== undefined)
    throw new Error("Choose replacement or append, not both.");
  const payload: UpdateObjectRequest = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.markdown !== undefined) payload.markdown = input.markdown;
  if (input.appendMarkdown !== undefined) {
    const { object } = await getRawObject(input.spaceId, input.objectId, BodyFormat.Markdown);
    payload.markdown = [object.markdown, input.appendMarkdown].filter(Boolean).join("\n\n");
  }
  const properties: PropertyLinkWithValue[] = [];
  if (input.description !== undefined) properties.push({ key: "description", text: input.description });
  if (input.done !== undefined) properties.push({ key: "done", checkbox: input.done });
  if (properties.length) payload.properties = properties;
  if (!Object.keys(payload).length) throw new Error("Provide at least one field to update.");
  const { object } = await updateObjectRaw(input.spaceId, input.objectId, payload);
  return { id: object.id, spaceId: object.space_id, name: object.name, updated: true };
}

export const confirmation: Tool.Confirmation<Input> = async (input) => {
  const { object } = await getRawObject(input.spaceId, input.objectId, BodyFormat.Markdown);
  return {
    message: `Update “${object.name || object.id}”?`,
    info: [
      { name: "Object ID", value: input.objectId },
      ...(input.name !== undefined ? [{ name: "Name", value: input.name }] : []),
      ...(input.description !== undefined ? [{ name: "Description", value: input.description || "(clear)" }] : []),
      ...(input.markdown !== undefined ? [{ name: "Replace content", value: input.markdown || "(clear)" }] : []),
      ...(input.appendMarkdown !== undefined ? [{ name: "Append content", value: input.appendMarkdown }] : []),
      ...(input.done !== undefined ? [{ name: "Completed", value: String(input.done) }] : []),
    ],
  };
};
