import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

/**
 * We use `any` here intentionally. Full type inference would require:
 * - Recursive tuple types for heterogeneous mutation return types
 * - Dependent typing for variable resolvers based on previous results
 *
 * The complexity (see git history: bbd5c83) wasn't worth the partial safety,
 * since users still need to cast results via getResult<T>().
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MutationInstance = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MutationHook = () => any;

/** A slot with a pre-created mutation (hook already called by consumer) */
export interface StaticSlot {
  id: string;
  label: string;
  mutation: MutationInstance;
}

/** A slot with a hook function (will be called via internal component) */
export interface DynamicSlot {
  id: string;
  label: string;
  hook: MutationHook;
}

export type Slot = StaticSlot | DynamicSlot;

export interface StepStatus {
  id: string;
  label: string;
  step: number;
  status: 'idle' | 'pending' | 'success' | 'error';
  retry: () => void;
}

export interface PreviousResult<T = unknown> {
  data: T;
  id: string;
}

/**
 * Enhanced array that supports both index and key-based access:
 * - prev[0].data - access by index
 * - prev.accountId.data - access by slot id
 *
 * **Note:** Slot ids should not be purely numeric strings (e.g., "0", "1") or
 * array method names (e.g., "length", "push", "map") as they will conflict
 * with array properties. A warning will be logged in development if reserved
 * ids are detected.
 */
export type PreviousResults = PreviousResult[] & Record<string, PreviousResult>;

export type VariablesResolver = (previousResults: PreviousResults) => unknown;
export type VariablesResolvers = Record<string, VariablesResolver>;

/**
 * Creates an enhanced array that supports both index and key-based access.
 * @internal
 */
function createPreviousResults(results: PreviousResult[]): PreviousResults {
  const enhanced = [...results] as PreviousResults;
  results.forEach((r) => {
    (enhanced as Record<string, PreviousResult>)[r.id] = r;
  });
  return enhanced;
}

const isStaticSlot = (slot: Slot): slot is StaticSlot => 'mutation' in slot;

/**
 * Reserved slot ids that would conflict with array properties/methods.
 * Using these as slot ids will cause issues with key-based access in PreviousResults.
 */
const RESERVED_SLOT_IDS = new Set([
  'length',
  'at', 'concat', 'copyWithin', 'entries', 'every', 'fill', 'filter',
  'find', 'findIndex', 'findLast', 'findLastIndex', 'flat', 'flatMap',
  'forEach', 'includes', 'indexOf', 'join', 'keys', 'lastIndexOf',
  'map', 'pop', 'push', 'reduce', 'reduceRight', 'reverse', 'shift',
  'slice', 'some', 'sort', 'splice', 'toLocaleString', 'toReversed',
  'toSorted', 'toSpliced', 'toString', 'unshift', 'values', 'with',
]);

function isReservedSlotId(id: string): boolean {
  return /^\d+$/.test(id) || RESERVED_SLOT_IDS.has(id);
}

interface HookSlotRendererProps {
  slot: DynamicSlot;
  onRegister: (id: string, mutation: MutationInstance) => void;
}

const HookSlotRenderer = React.memo<HookSlotRendererProps>(
  ({ slot, onRegister }) => {
    const mutation = slot.hook();

    useEffect(() => {
      onRegister(slot.id, mutation);
    }, [onRegister, slot.id, mutation]);

    return null;
  },
);
HookSlotRenderer.displayName = 'HookSlotRenderer';

export interface ChainedMutationsConfig {
  slots: Slot[];
  variables: VariablesResolvers;
  autoStart?: boolean;
}

export interface ChainedMutationsResult {
  Slots: React.ReactNode;
  steps: StepStatus[];
  isComplete: boolean;
  hasError: boolean;
  isReady: boolean;
  getResult: <T = unknown>(id: string) => T | undefined;
  start: () => void;
  reset: () => void;
}

/**
 * Chain mutations sequentially with retry support.
 * Supports static (pre-created) and dynamic (hook-based) mutations.
 *
 * @example
 * ```tsx
 * const createAccount = useCreateAccountMutation();
 *
 * const { Slots, steps, isComplete, getResult } = useChainedMutations({
 *   slots: [
 *     { id: 'account', label: 'Create Account', mutation: createAccount },
 *     ...buckets.map(b => ({
 *       id: `bucket-${b.name}`,
 *       label: `Create ${b.name}`,
 *       hook: useCreateBucket,
 *     })),
 *   ],
 *   variables: {
 *     account: () => ({ name: 'myAccount' }),
 *     // Access via key (recommended) - more readable, no index confusion
 *     'bucket-data': (prev) => ({ Bucket: 'data', accountId: prev.account.data.id }),
 *     // Or access via index - still supported for backwards compatibility
 *     'bucket-logs': (prev) => ({ Bucket: 'logs', accountId: prev[0].data.id }),
 *   },
 * });
 *
 * const accountData = getResult<{ id: string; name: string }>('account');
 *
 * return (
 *   <>
 *     {Slots}
 *     <StatusDisplay steps={steps} isComplete={isComplete} />
 *   </>
 * );
 * ```
 */
export function useChainedMutations(
  config: ChainedMutationsConfig,
): ChainedMutationsResult {
  const { slots, variables, autoStart = true } = config;

  const [dynamicMutations, setDynamicMutations] = useState<
    Record<string, MutationInstance>
  >({});

  const [executionErrors, setExecutionErrors] = useState<Record<string, Error>>(
    {},
  );

  const executionOrder = useMemo(() => slots.map((s) => s.id), [slots]);

  // Warn about reserved slot ids in development
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      const reserved = slots.filter((s) => isReservedSlotId(s.id));
      if (reserved.length > 0) {
        console.warn(
          `[useChainedMutations] Slot ids ${reserved.map((s) => `"${s.id}"`).join(', ')} ` +
            'are reserved (numeric strings or array methods). ' +
            'Key-based access (prev.slotId) may not work correctly. ' +
            'Use index-based access (prev[0]) instead, or rename the slots.',
        );
      }
    }
  }, [slots]);

  const register = useCallback((id: string, mutation: MutationInstance) => {
    setDynamicMutations((prev) => {
      const existing = prev[id];
      if (
        existing?.status === mutation.status &&
        existing?.data === mutation.data &&
        existing?.error === mutation.error
      ) {
        return prev;
      }
      return { ...prev, [id]: mutation };
    });
  }, []);

  // Cleanup removed slots
  useEffect(() => {
    const validIds = new Set(slots.map((s) => s.id));
    setDynamicMutations((prev) => {
      const hasStale = Object.keys(prev).some((id) => !validIds.has(id));
      if (!hasStale) return prev;
      return Object.fromEntries(
        Object.entries(prev).filter(([id]) => validIds.has(id)),
      );
    });
  }, [slots]);

  const slotMap = useMemo(() => new Map(slots.map((s) => [s.id, s])), [slots]);

  const getMutation = useCallback(
    (id: string): MutationInstance | undefined => {
      const slot = slotMap.get(id);
      if (!slot) return undefined;
      return isStaticSlot(slot) ? slot.mutation : dynamicMutations[id];
    },
    [slotMap, dynamicMutations],
  );

  const isReady = useMemo(
    () => executionOrder.every((id) => getMutation(id)),
    [executionOrder, getMutation],
  );

  const orderedMutations = useMemo(() => {
    if (!isReady) return [];
    return executionOrder.map((id) => ({ mutation: getMutation(id), id }));
  }, [isReady, executionOrder, getMutation]);

  // Refs for stable closures
  const mutationsRef = useRef(orderedMutations);
  mutationsRef.current = orderedMutations;

  const variablesRef = useRef(variables);
  variablesRef.current = variables;

  const retryFns = useRef<Array<{ retry: () => void }>>([]);
  const hasStarted = useRef(false);

  // Reset on configuration change
  const orderKey = executionOrder.join('|');
  useEffect(() => {
    retryFns.current = [];
    hasStarted.current = false;
    setExecutionErrors({});
  }, [orderKey]);

  const execute = useCallback((results: PreviousResult[] = []) => {
    const chain = mutationsRef.current;
    const resolvers = variablesRef.current;
    const index = results.length;

    if (index >= chain.length) return;

    const current = chain[index];
    if (!current?.mutation?.mutate) return;

    const enhancedResults = createPreviousResults(results);

    const runMutation = () => {
      // Clear any previous error for this step before attempting (important for retries)
      setExecutionErrors((prev) => {
        if (!(current.id in prev)) return prev;
        const { [current.id]: _, ...rest } = prev;
        return rest;
      });

      // Check resolver inside runMutation so retry can re-evaluate
      const resolver = resolvers[current.id];
      if (!resolver) {
        const error = new Error(`Missing variables resolver for: ${current.id}`);
        console.error(`[useChainedMutations] ${error.message}`);
        setExecutionErrors((prev) => ({ ...prev, [current.id]: error }));
        return;
      }

      let resolvedVariables: unknown;
      try {
        resolvedVariables = resolver(enhancedResults);
      } catch (error) {
        const resolverError =
          error instanceof Error
            ? error
            : new Error(`Variables resolver threw for "${current.id}"`);
        console.error(
          `[useChainedMutations] Variables resolver threw for "${current.id}":`,
          error,
        );
        setExecutionErrors((prev) => ({ ...prev, [current.id]: resolverError }));
        return;
      }

      try {
        current.mutation.mutate(resolvedVariables, {
          onSuccess: (data: unknown) => {
            execute([...results, { data, id: current.id }]);
          },
          onError: (error: unknown) => {
            console.error(
              `[useChainedMutations] Mutation "${current.id}" failed:`,
              error,
            );
          },
        });
      } catch (error) {
        const mutateError =
          error instanceof Error
            ? error
            : new Error(`Mutation "${current.id}" threw synchronously`);
        console.error(
          `[useChainedMutations] Mutation "${current.id}" threw synchronously:`,
          error,
        );
        setExecutionErrors((prev) => ({ ...prev, [current.id]: mutateError }));
      }
    };

    while (retryFns.current.length <= index) {
      retryFns.current.push({ retry: () => {} });
    }
    retryFns.current[index].retry = runMutation;
    runMutation();
  }, []);

  useEffect(() => {
    if (
      autoStart &&
      isReady &&
      !hasStarted.current &&
      orderedMutations.length > 0
    ) {
      hasStarted.current = true;
      execute();
    }
  }, [autoStart, isReady, execute, orderedMutations.length]);

  const getRetryFn = useCallback(
    (index: number) => () => retryFns.current[index]?.retry?.(),
    [],
  );

  const steps: StepStatus[] = useMemo(() => {
    let hasPreviousError = false;
    return executionOrder
      .map((id, index) => {
        const slot = slotMap.get(id);
        if (!slot) return null;

        const mutation = getMutation(id);
        if (!mutation) return null;

        let status: StepStatus['status'] = 'idle';
        if (executionErrors[id]) {
          status = 'error';
          hasPreviousError = true;
        } else if (hasPreviousError) {
          // Keep idle for steps after an error
        } else if (
          mutation.status === 'loading' ||
          mutation.status === 'pending'
        ) {
          status = 'pending';
        } else if (mutation.status === 'error') {
          status = 'error';
          hasPreviousError = true;
        } else if (mutation.status === 'success') {
          status = 'success';
        }

        return {
          id,
          label: slot.label,
          step: index + 1,
          status,
          retry: getRetryFn(index),
        };
      })
      .filter((s): s is StepStatus => s !== null);
  }, [executionOrder, slotMap, getMutation, getRetryFn, executionErrors]);

  const isComplete =
    steps.length > 0 && steps.every((s) => s.status === 'success');
  const hasError = steps.some((s) => s.status === 'error');

  const getResult = useCallback(
    <T = unknown>(id: string): T | undefined => getMutation(id)?.data,
    [getMutation],
  );

  const start = useCallback(() => {
    if (!isReady) {
      console.warn(
        '[useChainedMutations] start() called before isReady. Call ignored.',
      );
      return;
    }
    if (hasStarted.current) {
      return;
    }
    hasStarted.current = true;
    execute();
  }, [isReady, execute]);

  const reset = useCallback(() => {
    retryFns.current = [];
    hasStarted.current = false;
    setExecutionErrors({});
  }, []);

  const dynamicSlots = useMemo(
    () => slots.filter((s): s is DynamicSlot => !isStaticSlot(s)),
    [slots],
  );

  const Slots = useMemo(
    () => (
      <>
        {dynamicSlots.map((slot) => (
          <HookSlotRenderer key={slot.id} slot={slot} onRegister={register} />
        ))}
      </>
    ),
    [dynamicSlots, register],
  );

  return {
    Slots,
    steps,
    isComplete,
    hasError,
    isReady,
    getResult,
    start,
    reset,
  };
}
