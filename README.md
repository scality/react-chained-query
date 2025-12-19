# react-chained-query

## Features

### useChainedQuery

`useChainedQuery` hook consit of a wrapper on top of react-query `useQuery`. This `useChainedQuery` hook allow chaining queries instead of runnning them concurently, it aims to solve problems that may occurs when hitting a slow backend with too many requests.

By managing a queue and executing the request one after another, it could give the capability for an application to display the information sequentially.

### useChainedMutations

`useChainedMutations` hook chains mutations sequentially with retry support. It supports both static (pre-created) and dynamic (hook-based) mutations. Each step receives results from previous mutations to compute its variables.

## Install

```bash
npm install @scality/react-chained-query
```

## Quickstart

### useChainedQuery

```tsx
import { QueryClient, QueryClientProvider } from 'react-query';
import { ChainedQueryProvider, useChainedQuery } from '@scality/react-chained-query';

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

#### Basic Usage (Static Slots)

```tsx
import { useMutation } from 'react-query';
import { useChainedMutations } from '@scality/react-chained-query';

const useUpdatePost = () => {
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`https://jsonplaceholder.typicode.com/posts/${id}`, {
        method: 'PUT',
        headers: { 'Content-type': 'application/json' },
        body: JSON.stringify({ id, title: 'foo', body: 'bar', userId: id }),
      });
      if (!res.ok) throw res.statusText;
      return res.json();
    },
  });
};

export default function App() {
  const updateUser1 = useUpdatePost();
  const updateUser2 = useUpdatePost();

  const { steps, isComplete, hasError, start } = useChainedMutations({
    slots: [
      { id: 'user1', label: 'Update User 1', mutation: updateUser1 },
      { id: 'user2', label: 'Update User 2', mutation: updateUser2 },
    ],
    variables: {
      user1: () => '1',
      user2: (prev) => prev[0].data.userId, // Use result from previous mutation
    },
    autoStart: false,
  });

  return (
    <div>
      <button onClick={start}>Start</button>
      <ul>
        {steps.map((step) => (
          <li key={step.id}>
            {step.label}: {step.status}
            {step.status === 'error' && <button onClick={step.retry}>Retry</button>}
          </li>
        ))}
      </ul>
      {isComplete && <p>Done!</p>}
      {hasError && <p>Error occurred</p>}
    </div>
  );
}
```

#### Dynamic Slots (for dynamic lists)

When you need to create slots from a dynamic array (e.g., user-selected items), use `hook` instead of `mutation`:

```tsx
const userIds = ['1', '2', '3']; // Could come from props or state

const { Slots, steps, start } = useChainedMutations({
  slots: userIds.map((id) => ({
    id: `user-${id}`,
    label: `Update User ${id}`,
    hook: useUpdatePost, // Hook will be called internally for each slot
  })),
  variables: Object.fromEntries(
    userIds.map((id, i) => [`user-${id}`, (prev) => (i === 0 ? id : prev[i - 1].data.userId)])
  ),
});

return (
  <>
    {Slots} {/* Required: renders hidden components that call hooks */}
    <button onClick={start}>Start</button>
  </>
);
```

#### API

| Config | Type | Description |
|--------|------|-------------|
| `slots` | `Slot[]` | Array with `id`, `label`, and either `mutation` (static) or `hook` (dynamic) |
| `variables` | `Record<string, (prev: {data, id}[]) => unknown>` | Functions to compute variables. `prev[i].data` contains mutation result, `prev[i].id` is slot id |
| `autoStart` | `boolean` | Auto-start when ready. Default: `true` |

| Return | Type | Description |
|--------|------|-------------|
| `Slots` | `ReactNode` | Render this for dynamic slots |
| `steps` | `StepStatus[]` | `{ id, label, step, status, retry }` |
| `isReady` | `boolean` | All mutations registered |
| `isComplete` | `boolean` | All succeeded |
| `hasError` | `boolean` | Any failed |
| `start` | `() => void` | Manual start |
| `reset` | `() => void` | Reset chain state, allows `start()` again |
| `getResult` | `<T>(id: string) => T` | Get mutation result |

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
