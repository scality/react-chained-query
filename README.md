# react-chained-query

## Features

### useChainedQuery

`useChainedQuery` hook consit of a wrapper on top of react-query `useQuery`. This `useChainedQuery` hook allow chaining queries instead of runnning them concurently, it aims to solve problems that may occurs when hitting a slow backend with too many requests.

By managing a queue and executing the request one after another, it could give the capability for an application to display the information sequentially.

### useChainedMutations

This `useChainedMutations` hook takes an array of mutations and a function to compute the variables for the next mutation in the chain. It returns an object containing a `mutate` function that triggers the chain of mutations, a `computeVariablesForNext` function that computes the variables for the next mutation, and an array of `mutationsWithRetry` that includes a retry function for each mutation.

## Dependencies

```json
{
  "peerDependencies": {
    "react": "^17.0.0",
    "react-query": "^3.0.0"
  }
}
```

## Install

TBD

## Quickstart

### useChainedQuery

```js
import { QueryClient, QueryClientProvider } from 'react-query';
import { ChainedQueryProvider, useChainedQuery } from './useChainedQuery';
import { useEffect, useState } from 'react';

const queryClient = new QueryClient();

function Component1() {
  const { data } = useChainedQuery({
    queryKey: ['key', 'arg'],
    queryFn: async () => {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      return '1';
    },
  });
  return <>{data}</>;
}

function Component2() {
  const { data } = useChainedQuery({
    queryKey: ['key', 'arg1'],
    queryFn: async () => {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      return '2';
    },
  });
  return <>{data}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ChainedQueryProvider>
        <div className="App">
          <h2>Hello, useChainedQuery! </h2>
          <Component1 />
          <Component2 />
        </div>
      </ChainedQueryProvider>
    </QueryClientProvider>
  );
}
```

[A complete example here](https://codesandbox.io/s/use-chained-query-forked-j3mfed?file=/src/App.tsx)

### useChainedMutations

```js
import { useMutation } from 'react-query';
import { useChainedMutations } from './useChainedMutations';

const useUpdatePosts = () => {
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(
        `https://jsonplaceholder.typicode.com/posts/${id}`,
        {
          headers: {
            'Content-type': 'application/json; charset=UTF-8',
          },
          method: 'PUT',
          body: JSON.stringify({
            id: 1,
            title: 'foo',
            body: 'bar',
            userId: id,
          }),
        },
      );

      if (!res.ok) throw res.statusText;

      return await res.json();
    },
  });
};

const mutations = [{ ...useUpdatePosts, 'user1'}, { ...useUpdatePosts, 'user2'}];
const { mutate } = useChainedMutations({
  mutations,
  computeVariablesForNext: {
    user1: () => {
      return 'user1';
    },
    user2: () => {
      return 'user2';
    }
  },
});

export default function App() {
  return (
    <div className="App">
      <h2>Hello, useChainedMutations! </h2>
      <button onClick={() => mutate()}>
    </div>
  );
}
```

## Advanced Documentation

In order to use `useChainedQuery` in your component, it has be below `QueryClientProvider` and `ChainedQueryProvider`.

It's possibile to have several `ChainedQueryProvider` each of them would then holds it's own queue of queries.

```js
<QueryClientProvider>
  <ChainedQueryProvider>
    <YourComponent />
  </ChainedQueryProvider>
</QueryClientProvider>
```

Made with ❤️ by Pod-UI at [Scality](https://github.com/scality/)
