# react-chained-query

## Feature

react-chained-query provide a `useChainedQuery` hook that consit of a wrapper on top of react-query `useQuery`. This `useChainedQuery` hook allow chaining queries instead of runnning them concurently, it aims to solve problems that may occurs when hitting a slow backend with too many requests.

By managing a queue and executing the request one after another, it could give the capability for an application to display the information sequentially.

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

[A complete example here](https://codesandbox.io/s/use-chained-query-forked-j3mfed?file=/src/App.tsx)

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
