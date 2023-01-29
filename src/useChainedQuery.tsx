import {
  QueryKey,
  useQuery,
  useQueryClient,
  UseQueryOptions,
} from 'react-query';
import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { v4 as uuidv4 } from 'uuid';

type QueryQueueItem = {
  queryKey: QueryKey;
  uniqueQueryId: string;
  enableQuery: () => void;
};

const ChainedQueryContext = createContext<{
  queryQueue: QueryQueueItem[];
  push: (queryQueueItem: QueryQueueItem) => void;
  unqueueItem: (uniqueQueryId: string) => void;
  shift: () => void;
} | null>(null);

export function ChainedQueryProvider({ children }: PropsWithChildren<{}>) {
  const [queryQueue, setQueryQueue] = useState<QueryQueueItem[]>([]);
  const queryClient = useQueryClient();

  const push = (queryQueueItem: QueryQueueItem) => {
    setQueryQueue((queries) => {
      return [...queries, queryQueueItem];
    });
  };

  const shift = () => {
    setQueryQueue((queries) => {
      const newQueue = [...queries];
      newQueue.shift();
      return [...newQueue];
    });
  };

  const unqueueItem = (uniqueIdentifier: string) => {
    setQueryQueue((queries) => {
      const newQueue = [...queries].filter(
        (query) => query.uniqueQueryId !== uniqueIdentifier,
      );
      return [...newQueue];
    });
  };

  const firstQueryStatus =
    queryQueue.length > 0
      ? queryClient.getQueryState(queryQueue[0].queryKey)?.status
      : 'none';

  useEffect(() => {
    if (queryQueue.length > 0) {
      if (firstQueryStatus === 'idle') {
        queryQueue[0].enableQuery();
      } else if (
        firstQueryStatus === 'success' ||
        firstQueryStatus === 'error' ||
        firstQueryStatus === 'none'
      ) {
        shift();
      }
    }
  }, [queryQueue.map((q) => q.uniqueQueryId).join(','), firstQueryStatus]);

  return (
    <ChainedQueryContext.Provider
      value={{ queryQueue, unqueueItem, push, shift }}
    >
      {children}
    </ChainedQueryContext.Provider>
  );
}

export function useChainedQuery<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: { queryKey: TQueryKey } & UseQueryOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryKey
  >,
) {
  const context = useContext(ChainedQueryContext);
  if (context === null) {
    throw new Error('Cannot use useChainedQuery outside ChainedQueryProvider');
  }
  const [isQueryEnabled, setIsQueryEnabled] = useState(false);
  const uniqueIdRef = useRef<string>(uuidv4());
  const result = useQuery({
    ...options,
    onSettled: (data, err) => {
      context.shift();
      if (options.onSettled) options.onSettled(data, err);
    },
    enabled: options.enabled
      ? isQueryEnabled && options.enabled
      : isQueryEnabled,
  });
  const queryClient = useQueryClient();
  const queryCache = queryClient.getQueryCache();

  useEffect(() => {
    const query = queryCache.find(options.queryKey);
    if (query?.state.status === 'success' || query?.state.status === 'error') {
      return;
    }
    context.push({
      queryKey: options.queryKey,
      uniqueQueryId: uniqueIdRef.current,
      enableQuery: () => setIsQueryEnabled(true),
    });
    return () => {
      ///on unmount
      context.unqueueItem(uniqueIdRef.current);
    };
  }, []);

  return result;
}
