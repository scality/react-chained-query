import { useState } from 'react';
import { UseMutationResult } from 'react-query';

export function useMultiMutation<T>(items: T[], expectedTotal?: number) {
  const [mutations, setMutations] = useState<Record<string, UseMutationResult>>(
    {},
  );

  const handleMutationReady = (key: string, mutation: UseMutationResult) => {
    setMutations((prev) => ({
      ...prev,
      [key]: {
        key,
        ...mutation,
      },
    }));
  };

  const targetCount = expectedTotal ?? items.length;
  const isAllMutationsReady =
    targetCount === 0 || Object.keys(mutations).length >= targetCount;

  return {
    mutations,
    handleMutationReady,
    isAllMutationsReady,
  };
}
