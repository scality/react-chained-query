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

/** A mutation config with a pre-created mutation (hook already called by consumer) */
export interface StaticMutationConfig {
  id: string;
  label: string;
  mutation: MutationInstance;
  optional?: boolean;
}

/** A mutation config with a hook function (will be called via internal component) */
export interface DynamicMutationConfig {
  id: string;
  label: string;
  hook: MutationHook;
  optional?: boolean;
}

export type MutationConfig = StaticMutationConfig | DynamicMutationConfig;

export interface StepStatus {
  id: string;
  label: string;
  step: number;
  status: 'idle' | 'pending' | 'success' | 'error';
  retry: () => void;
  optional?: boolean;
}

export interface PreviousResult<T = unknown> {
  data: T | undefined;
  id: string;
  error?: unknown;
}

/**
 * Enhanced array that supports both index and key-based access:
 * - prev[0].data - access by index
 * - prev.accountId.data - access by mutation id
 *
 * **Note:** Mutation ids should not be purely numeric strings (e.g., "0", "1") or
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

const isStaticMutationConfig = (
  config: MutationConfig,
): config is StaticMutationConfig => 'mutation' in config;

/**
 * Reserved mutation ids that would conflict with array properties/methods.
 * Using these as mutation ids will cause issues with key-based access in PreviousResults.
 */
const RESERVED_MUTATION_IDS = new Set([
  'length',
  'at', 'concat', 'copyWithin', 'entries', 'every', 'fill', 'filter',
  'find', 'findIndex', 'findLast', 'findLastIndex', 'flat', 'flatMap',
  'forEach', 'includes', 'indexOf', 'join', 'keys', 'lastIndexOf',
  'map', 'pop', 'push', 'reduce', 'reduceRight', 'reverse', 'shift',
  'slice', 'some', 'sort', 'splice', 'toLocaleString', 'toReversed',
  'toSorted', 'toSpliced', 'toString', 'unshift', 'values', 'with',
]);

function isReservedMutationId(id: string): boolean {
  return /^\d+$/.test(id) || RESERVED_MUTATION_IDS.has(id);
}

interface HookMutationRendererProps {
  config: DynamicMutationConfig;
  onRegister: (id: string, mutation: MutationInstance) => void;
}

const HookMutationRenderer = React.memo<HookMutationRendererProps>(
  ({ config, onRegister }) => {
    const mutation = config.hook();

    useEffect(() => {
      onRegister(config.id, mutation);
    }, [onRegister, config.id, mutation]);

    return null;
  },
);
HookMutationRenderer.displayName = 'HookMutationRenderer';

export interface ChainedMutationsConfig {
  mutations: MutationConfig[];
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
  allRequiredStepsComplete: boolean;
  hasOptionalFailures: boolean;
  optionalFailures: Array<{ id: string; label: string; error: unknown }>;
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
 *   mutations: [
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
  const { mutations, variables, autoStart = true } = config;

  const [dynamicMutations, setDynamicMutations] = useState<
    Record<string, MutationInstance>
  >({});

  const [executionErrors, setExecutionErrors] = useState<Record<string, Error>>(
    {},
  );

  const executionOrder = useMemo(
    () => mutations.map((m) => m.id),
    [mutations],
  );

  // Warn about reserved mutation ids in development
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      const reserved = mutations.filter((m) => isReservedMutationId(m.id));
      if (reserved.length > 0) {
        console.warn(
          `[useChainedMutations] Mutation ids ${reserved.map((m) => `"${m.id}"`).join(', ')} ` +
            'are reserved (numeric strings or array methods). ' +
            'Key-based access (prev.mutationId) may not work correctly. ' +
            'Use index-based access (prev[0]) instead, or rename the mutations.',
        );
      }
    }
  }, [mutations]);

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

  // Cleanup removed mutations
  useEffect(() => {
    const validIds = new Set(mutations.map((m) => m.id));
    setDynamicMutations((prev) => {
      const hasStale = Object.keys(prev).some((id) => !validIds.has(id));
      if (!hasStale) return prev;
      return Object.fromEntries(
        Object.entries(prev).filter(([id]) => validIds.has(id)),
      );
    });
  }, [mutations]);

  const mutationConfigMap = useMemo(
    () => new Map(mutations.map((m) => [m.id, m])),
    [mutations],
  );

  const getMutation = useCallback(
    (id: string): MutationInstance | undefined => {
      const config = mutationConfigMap.get(id);
      if (!config) return undefined;
      return isStaticMutationConfig(config)
        ? config.mutation
        : dynamicMutations[id];
    },
    [mutationConfigMap, dynamicMutations],
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

  const configMapRef = useRef(mutationConfigMap);
  configMapRef.current = mutationConfigMap;

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
      // Get config once at the beginning for all error paths
      const config = configMapRef.current.get(current.id);
      const isOptional = config?.optional ?? false;

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

        // If optional, continue to next step with error
        if (isOptional) {
          execute([...results, { data: undefined, id: current.id, error }]);
        }
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

        // If optional, continue to next step with error
        if (isOptional) {
          execute([...results, { data: undefined, id: current.id, error: resolverError }]);
        }
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

            // If optional, continue to next step with error in result
            if (isOptional) {
              execute([...results, { data: undefined, id: current.id, error }]);
            }
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

        // If optional, continue to next step with error
        if (isOptional) {
          execute([...results, { data: undefined, id: current.id, error: mutateError }]);
        }
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
    let hasPreviousRequiredError = false;
    return executionOrder
      .map((id, index) => {
        const config = mutationConfigMap.get(id);
        if (!config) return null;

        const mutation = getMutation(id);
        if (!mutation) return null;

        const isOptional = config.optional ?? false;

        let status: StepStatus['status'] = 'idle';
        if (executionErrors[id]) {
          status = 'error';
          if (!isOptional) {
            hasPreviousRequiredError = true;
          }
        } else if (hasPreviousRequiredError) {
          // Keep idle for steps after a required error
        } else if (
          mutation.status === 'loading' ||
          mutation.status === 'pending'
        ) {
          status = 'pending';
        } else if (mutation.status === 'error') {
          status = 'error';
          if (!isOptional) {
            hasPreviousRequiredError = true;
          }
        } else if (mutation.status === 'success') {
          status = 'success';
        }

        return {
          id,
          label: config.label,
          step: index + 1,
          status,
          retry: getRetryFn(index),
          ...(isOptional && { optional: true }),
        };
      })
      .filter((s): s is StepStatus => s !== null);
  }, [executionOrder, mutationConfigMap, getMutation, getRetryFn, executionErrors]);

  const isComplete =
    steps.length > 0 && steps.every((s) => s.status === 'success');
  const hasError = steps.some((s) => s.status === 'error');

  const allRequiredStepsComplete =
    steps.length > 0 &&
    steps
      .filter((s) => !s.optional)
      .every((s) => s.status === 'success');

  const optionalFailures = useMemo(() => {
    return steps
      .filter((s) => s.optional && s.status === 'error')
      .map((s) => {
        const mutation = getMutation(s.id);
        return {
          id: s.id,
          label: s.label,
          error: mutation?.error || executionErrors[s.id] || new Error('Unknown error'),
        };
      });
  }, [steps, getMutation, executionErrors]);

  const hasOptionalFailures = optionalFailures.length > 0;

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

  const dynamicConfigs = useMemo(
    () =>
      mutations.filter(
        (m): m is DynamicMutationConfig => !isStaticMutationConfig(m),
      ),
    [mutations],
  );

  const Slots = useMemo(
    () => (
      <>
        {dynamicConfigs.map((config) => (
          <HookMutationRenderer
            key={config.id}
            config={config}
            onRegister={register}
          />
        ))}
      </>
    ),
    [dynamicConfigs, register],
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
    allRequiredStepsComplete,
    hasOptionalFailures,
    optionalFailures,
  };
}
