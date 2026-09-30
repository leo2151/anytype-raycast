import { LocalStorage, showToast, Toast } from "@raycast/api";
import { initializeCacheScope } from "./cacheScope";
import { localStorageKeys, maxPinnedObjects } from "./constant";

async function pinKey(suffix: string): Promise<string> {
  return `${await initializeCacheScope()}:${localStorageKeys.pinnedObjectsWith(suffix)}`;
}

export async function getPinned(pinSuffix: string): Promise<{ spaceId: string; objectId: string }[]> {
  const key = await pinKey(pinSuffix);
  let pinnedObjects = await LocalStorage.getItem<string>(key);
  if (pinnedObjects === undefined) {
    const ownerKey = "legacy_pins_owner";
    const owner = await LocalStorage.getItem<string>(ownerKey);
    const scope = await initializeCacheScope();
    if (!owner || owner === scope) {
      await LocalStorage.setItem(ownerKey, scope);
      pinnedObjects = await LocalStorage.getItem<string>(localStorageKeys.pinnedObjectsWith(pinSuffix));
    }
    await LocalStorage.setItem(key, pinnedObjects || "[]");
  }
  try {
    return pinnedObjects ? JSON.parse(pinnedObjects) : [];
  } catch {
    return [];
  }
}

export async function setPinned(
  pinSuffix: string,
  pinnedObjects: { spaceId: string; objectId: string }[],
): Promise<void> {
  await LocalStorage.setItem(await pinKey(pinSuffix), JSON.stringify(pinnedObjects));
}

export async function addPinned(
  spaceId: string,
  objectId: string,
  pinSuffix: string,
  title: string,
  contextLabel: string,
): Promise<void> {
  const pinnedObjects = await getPinned(pinSuffix);
  const isAlreadyPinned = pinnedObjects.some((obj) => obj.spaceId === spaceId && obj.objectId === objectId);

  if (isAlreadyPinned) {
    await showToast({
      style: Toast.Style.Failure,
      title: `${contextLabel} is already pinned`,
    });
    return;
  }

  if (pinnedObjects.length >= maxPinnedObjects) {
    await showToast({
      style: Toast.Style.Failure,
      title: `Can't pin more than ${maxPinnedObjects} items`,
    });
    return;
  }

  pinnedObjects.push({ spaceId, objectId });
  await setPinned(pinSuffix, pinnedObjects);

  await showToast({
    style: Toast.Style.Success,
    title: `${contextLabel} pinned`,
    message: title,
  });
}

export async function removePinned(
  spaceId: string,
  objectId: string,
  pinSuffix: string,
  title?: string,
  contextLabel?: string,
): Promise<void> {
  const pinnedObjects = await getPinned(pinSuffix);
  const updatedPinnedObjects = pinnedObjects.filter(
    (pinned) => pinned.spaceId !== spaceId || pinned.objectId !== objectId,
  );

  if (updatedPinnedObjects.length === pinnedObjects.length) {
    await showToast({
      style: Toast.Style.Failure,
      title: `${contextLabel} is not pinned`,
    });
    return;
  }

  await setPinned(pinSuffix, updatedPinnedObjects);

  if (title && contextLabel) {
    await showToast({
      style: Toast.Style.Success,
      title: `${contextLabel} unpinned`,
      message: title,
    });
  }
}

async function movePinnedItem(spaceId: string, objectId: string, pinSuffix: string, direction: -1 | 1): Promise<void> {
  const pinnedObjects = await getPinned(pinSuffix);
  const index = pinnedObjects.findIndex((pinned) => pinned.spaceId === spaceId && pinned.objectId === objectId);
  const targetIndex = index + direction;
  if (index === -1 || targetIndex < 0 || targetIndex >= pinnedObjects.length) {
    return;
  }
  // Swap the two items using destructuring assignment
  [pinnedObjects[index], pinnedObjects[targetIndex]] = [pinnedObjects[targetIndex], pinnedObjects[index]];
  await setPinned(pinSuffix, pinnedObjects);
}

export async function moveUpInPinned(spaceId: string, objectId: string, pinSuffix: string): Promise<void> {
  await movePinnedItem(spaceId, objectId, pinSuffix, -1);
}

export async function moveDownInPinned(spaceId: string, objectId: string, pinSuffix: string): Promise<void> {
  await movePinnedItem(spaceId, objectId, pinSuffix, 1);
}
