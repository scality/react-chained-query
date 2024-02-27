import React, { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ChainedQueryProvider } from '../useChainedQuery';

const client = new QueryClient();

const wrapper = ({ children }: PropsWithChildren<{}>) => {
  return (
    <QueryClientProvider client={client}>
      <ChainedQueryProvider>{children}</ChainedQueryProvider>
    </QueryClientProvider>
  );
};

export { client, wrapper };
