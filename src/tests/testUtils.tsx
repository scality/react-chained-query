import React, { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ChainedQueryProvider } from '../useChainedQuery';

const client = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

const wrapper = ({ children }: PropsWithChildren<{}>) => {
  return (
    <QueryClientProvider client={client}>
      <ChainedQueryProvider>{children}</ChainedQueryProvider>
    </QueryClientProvider>
  );
};

interface MockMutationOptions {
  status?: 'idle' | 'loading' | 'pending' | 'success' | 'error';
  data?: unknown;
  mutate?: jest.Mock;
}

const createMockMutation = (overrides: MockMutationOptions = {}) => ({
  status: 'idle' as const,
  data: undefined,
  mutate: jest.fn(),
  ...overrides,
});

const createMockHook = (mutation: ReturnType<typeof createMockMutation>) => {
  return () => mutation;
};

export { client, wrapper, createMockMutation, createMockHook };
