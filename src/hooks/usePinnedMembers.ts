import { useCachedPromise } from "@raycast/utils";
import { getMember } from "../api";
import { Member } from "../models";
import { errorConnectionMessage, ErrorWithStatus, getPinned, removePinned } from "../utils";
import { getCacheNamespace } from "../utils/cacheScope";

export function usePinnedMembers(key: string, config?: { execute?: boolean }) {
  const { data, error, isLoading, mutate } = useCachedPromise(
    async (_cacheScope: string, key) => {
      const pinnedMembers = await getPinned(key);
      const members: Member[] = [];

      for (const pinned of pinnedMembers) {
        try {
          const response = await getMember(pinned.spaceId, pinned.objectId);
          members.push(response.member);
        } catch (error) {
          const typedError = error as ErrorWithStatus;
          if (typedError.message === errorConnectionMessage) {
            throw error;
          } else if (typedError.status === 404 || typedError.status === 410) {
            await removePinned(pinned.spaceId, pinned.objectId, key);
          }
        }
      }

      return members;
    },
    [getCacheNamespace(), key],
    {
      keepPreviousData: true,
      execute: config?.execute !== false,
    },
  );

  return {
    pinnedMembers: data,
    pinnedMembersError: error,
    isLoadingPinnedMembers: isLoading,
    mutatePinnedMembers: mutate,
  };
}
