import { Action, ActionPanel, Icon, Image, List } from "@raycast/api";
import { showFailureToast } from "@raycast/utils";
import { useEffect, useMemo, useState } from "react";
import { EmptyViewObject, EnsureAuthenticated, ObjectListItem, ViewType } from "./components";
import { useGlobalSearch, usePinnedObjects, useSpaces } from "./hooks";
import { SearchFilters, SpaceObject } from "./models";
import {
  bundledTypeKeys,
  defaultTintColor,
  fetchSearchTypeKeys,
  getSectionTitle,
  localStorageKeys,
  pluralize,
  processObject,
} from "./utils";

const searchBarPlaceholder = "Globally search objects across channels...";

export default function Command() {
  return (
    <EnsureAuthenticated placeholder={searchBarPlaceholder} viewType="list">
      <Search />
    </EnsureAuthenticated>
  );
}

function Search() {
  const [searchText, setSearchText] = useState("");
  const [spaceIcons, setSpaceIcons] = useState<Map<string, Image.ImageLike>>(new Map());
  const [currentView, setCurrentView] = useState<ViewType>(ViewType.objects);
  const [typeKeysForPages, setTypeKeysForPages] = useState<string[]>([]);
  const [typeKeysForTasks, setTypeKeysForTasks] = useState<string[]>([]);
  const [typeKeysForLists, setTypeKeysForLists] = useState<string[]>([]);

  const types = useMemo(() => {
    const viewToType: Partial<Record<ViewType, string[]>> = {
      [ViewType.objects]: [],
      [ViewType.pages]: typeKeysForPages,
      [ViewType.tasks]: typeKeysForTasks,
      [ViewType.incompleteTasks]: typeKeysForTasks,
      [ViewType.completedTasks]: typeKeysForTasks,
      [ViewType.files]: [bundledTypeKeys.file, bundledTypeKeys.image, bundledTypeKeys.audio, bundledTypeKeys.video],
      [ViewType.images]: [bundledTypeKeys.image],
      [ViewType.lists]: typeKeysForLists,
      [ViewType.bookmarks]: [bundledTypeKeys.bookmark],
    };
    return viewToType[currentView] ?? [];
  }, [currentView, typeKeysForPages, typeKeysForTasks, typeKeysForLists]);

  const filters: SearchFilters | undefined =
    currentView === ViewType.incompleteTasks || currentView === ViewType.completedTasks
      ? {
          operator: "and",
          conditions: [{ property_key: "done", condition: "eq", checkbox: currentView === ViewType.completedTasks }],
        }
      : undefined;
  const { allStoresLoaded, objects, objectsError, isLoadingObjects, mutateObjects, objectsPagination } =
    useGlobalSearch(
      searchText,
      types,
      { execute: currentView === ViewType.objects || types.length > 0, filters }, // only execute search when viewing all objects or when specific types selected
    );
  const { spaces, spacesError, isLoadingSpaces } = useSpaces(undefined, { all: true });
  const { pinnedObjects, pinnedObjectsError, isLoadingPinnedObjects, mutatePinnedObjects } = usePinnedObjects(
    localStorageKeys.suffixForGlobalSearch,
  );

  useEffect(() => {
    if (spaces) {
      const spaceIconMap = new Map(spaces.map((space) => [space.id, space.icon]));
      setSpaceIcons(spaceIconMap);
    }
  }, [spaces]);

  useEffect(() => {
    let cancelled = false;
    fetchSearchTypeKeys(spaces)
      .then((keys) => {
        if (cancelled) return;
        setTypeKeysForPages(keys.pages);
        setTypeKeysForTasks(keys.tasks);
        setTypeKeysForLists(keys.lists);
      })
      .catch((error) => {
        if (!cancelled) showFailureToast(error, { title: "Failed to load types" });
      });
    return () => {
      cancelled = true;
    };
  }, [spaces]);

  useEffect(() => {
    if (objectsError || spacesError || pinnedObjectsError) {
      showFailureToast(objectsError || spacesError || pinnedObjectsError, {
        title: "Failed to fetch latest data",
      });
    }
  }, [objectsError, spacesError, pinnedObjectsError]);

  const spaceById = useMemo(() => {
    if (!spaces) return new Map<string, (typeof spaces)[number]>();
    return new Map(spaces.map((space) => [space.id, space]));
  }, [spaces]);

  const processObjectWithSpaceIcon = (object: SpaceObject, isPinned: boolean) => {
    const spaceIcon = spaceIcons.get(object.space_id) || Icon.BullsEye;
    const processedObject = processObject(object, isPinned, mutateObjects, mutatePinnedObjects);

    return {
      ...processedObject,
      accessories: [
        ...processedObject.accessories,
        {
          icon: spaceIcon,
          tooltip: `${spaces?.find((space) => space.id === object.space_id)?.object === "chat" ? "Chat" : "Space"}: ${spaces?.find((space) => space.id === object.space_id)?.name}`,
        },
      ],
    };
  };

  // Process pinned objects
  const processedPinnedObjects = pinnedObjects?.length
    ? (searchText || filters
        ? objects.filter((object) =>
            pinnedObjects.some((pin) => pin.id === object.id && pin.space_id === object.space_id),
          )
        : pinnedObjects
      )
        .filter((object) => types.length === 0 || types.includes(object.type.key))
        .map((object) => processObjectWithSpaceIcon(object, true))
    : [];

  // Process non-pinned objects
  const processedRegularObjects = objects
    .filter(
      (object) => !pinnedObjects?.some((pinned) => pinned.id === object.id && pinned.space_id === object.space_id),
    )
    .map((object) => processObjectWithSpaceIcon(object, false));

  return (
    <List
      isLoading={isLoadingSpaces || isLoadingPinnedObjects || isLoadingObjects}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder={searchBarPlaceholder}
      pagination={objectsPagination}
      filtering={false}
      throttle={true}
      searchBarAccessory={
        <List.Dropdown
          tooltip="Filter by kind"
          onChange={(value) => setCurrentView(value as ViewType)}
          value={currentView}
        >
          <List.Dropdown.Item
            title="All"
            value={ViewType.objects}
            icon={{ source: "icons/type/search.svg", tintColor: defaultTintColor }}
          />
          <List.Dropdown.Section>
            <List.Dropdown.Item
              title="Pages"
              value={ViewType.pages}
              icon={{ source: "icons/type/document.svg", tintColor: defaultTintColor }}
            />
            <List.Dropdown.Item
              title="Tasks"
              value={ViewType.tasks}
              icon={{ source: "icons/type/checkbox.svg", tintColor: defaultTintColor }}
            />
            <List.Dropdown.Item
              title="Lists"
              value={ViewType.lists}
              icon={{ source: "icons/type/layers.svg", tintColor: defaultTintColor }}
            />
            <List.Dropdown.Item
              title="Bookmarks"
              value={ViewType.bookmarks}
              icon={{ source: "icons/type/bookmark.svg", tintColor: defaultTintColor }}
            />
            <List.Dropdown.Item title="Open Tasks" value={ViewType.incompleteTasks} icon={Icon.Circle} />
            <List.Dropdown.Item title="Completed Tasks" value={ViewType.completedTasks} icon={Icon.CheckCircle} />
            <List.Dropdown.Item title="Files" value={ViewType.files} icon={Icon.Document} />
            <List.Dropdown.Item title="Images" value={ViewType.images} icon={Icon.Image} />
          </List.Dropdown.Section>
        </List.Dropdown>
      }
    >
      {allStoresLoaded === false && (
        <List.Item
          title="Some channels are still loading"
          subtitle="Refresh to include more results"
          icon={Icon.Clock}
          actions={
            <ActionPanel>
              <Action title="Refresh Results" icon={Icon.ArrowClockwise} onAction={() => mutateObjects()} />
            </ActionPanel>
          }
        />
      )}
      {processedPinnedObjects.length > 0 && (
        <List.Section
          title="Pinned"
          subtitle={pluralize(processedPinnedObjects.length, currentView, { withNumber: true })}
        >
          {processedPinnedObjects.map((object, index) => (
            <ObjectListItem
              key={`${object.id}-${index}`}
              space={spaceById.get(object.spaceId)!}
              objectId={object.id}
              icon={object.icon}
              title={object.title}
              subtitle={object.subtitle}
              accessories={object.accessories}
              mutate={[mutateObjects, mutatePinnedObjects]}
              object={object.object}
              layout={object.layout}
              viewType={currentView}
              isGlobalSearch={true}
              isNoPinView={false}
              isPinned={object.isPinned}
              searchText={searchText}
            />
          ))}
        </List.Section>
      )}
      {processedRegularObjects.length > 0 ? (
        <List.Section
          title={getSectionTitle(searchText)}
          subtitle={
            allStoresLoaded === false
              ? "Some channels are still loading — refresh for more results"
              : pluralize(processedRegularObjects.length, currentView, { withNumber: true })
          }
        >
          {processedRegularObjects.map((object, index) => (
            <ObjectListItem
              key={`${object.id}-${index}`}
              space={spaceById.get(object.spaceId)!}
              objectId={object.id}
              icon={object.icon}
              title={object.title}
              subtitle={object.subtitle}
              accessories={object.accessories}
              mutate={[mutateObjects, mutatePinnedObjects]}
              object={object.object}
              layout={object.layout}
              viewType={currentView}
              isGlobalSearch={true}
              isNoPinView={false}
              isPinned={object.isPinned}
              searchText={searchText}
            />
          ))}
        </List.Section>
      ) : (
        <EmptyViewObject
          title="No objects found"
          contextValues={{
            name: searchText,
          }}
        />
      )}
    </List>
  );
}
