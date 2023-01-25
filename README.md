# react-chained-query

## Feature

useChainedQuery hook is a wrapper of useQuery allowing chained queries, aiming to solve the problem that too many concurrent requests that hit the limitation of an API.

By managing a queque and executing the request one after another, it could give the capability to UI displaying the information gradually.

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

```js
import { QueryClient, QueryClientProvider } from "react-query";
import { ChainedQueryProvider, useChainedQuery } from "./useChainedQuery";
import { useEffect, useState } from "react";

const queryClient = new QueryClient();

function Component1() {
  const { data } = useChainedQuery({
    queryKey: ["key", "arg"],
    queryFn: async () => {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      return "1";
    },
  });
  return <>{data}</>;
}

function Component2() {
  const { data } = useChainedQuery({
    queryKey: ["key", "arg1"],
    queryFn: async () => {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      return "2";
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

[A complete example here](https://codesandbox.io/s/use-chained-query-forked-j3mfed?file=/src/useChainedQuery.tsx)

## Advanced Documentation

In order to use `useChainedQuery` in your component, it has be below `QueryClientProvider` and `ChainedQueryProvider`.

It's possibile to have several `ChainedQueryProvider` which means to manage several queues.

```js
<QueryClientProvider>
  <ChainedQueryProvider>
    <YourComponent />
  </ChainedQueryProvider>
</QueryClientProvider>
```

Made with ❤️ by [Scality](https://github.com/scality/)
