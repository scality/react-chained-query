import {
  render,
  screen,
  waitFor,
  waitForElementToBeRemoved,
} from '@testing-library/react';
import { renderHook, act } from '@testing-library/react-hooks';
import { PropsWithChildren, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ChainedQueryProvider, useChainedQuery } from './useChainedQuery';

const client = new QueryClient();
const wrapper = ({ children }: PropsWithChildren<{}>) => {
  return (
    <QueryClientProvider client={client}>
      <ChainedQueryProvider>{children}</ChainedQueryProvider>
    </QueryClientProvider>
  );
};

describe('useChainedQuery', () => {
  beforeEach(() => {
    client.clear();
  });
  it('should execute 2 queries one after the other one', async () => {
    //S
    const fn1 = jest
      .fn()
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 500)),
      );
    const fn2 = jest
      .fn()
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 500)),
      );
    const { result, waitFor } = renderHook(
      () => {
        const queryResult1 = useChainedQuery({
          queryKey: ['test', 1],
          queryFn: fn1,
        });
        const queryResult2 = useChainedQuery({
          queryKey: ['test', 2],
          queryFn: fn2,
        });
        return { queryResult1, queryResult2 };
      },
      { wrapper },
    );

    //E
    await act(async () => {
      await waitFor(() => result.current.queryResult1.status === 'loading');
    });

    //V
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(0);
    expect(result.current.queryResult2.status).toBe('idle');

    //E
    await act(async () => {
      await waitFor(() => result.current.queryResult1.status === 'success');
      await waitFor(() => result.current.queryResult2.status === 'loading');
    });

    //V
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(1);
  });

  it('should be able to execute a query when used mutliple times', async () => {
    //S
    const fn1 = jest
      .fn()
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 500)),
      );
    const { result, waitFor } = renderHook(
      () => {
        const queryResult1 = useChainedQuery({
          queryKey: ['test', 1],
          queryFn: fn1,
        });
        const queryResult2 = useChainedQuery({
          queryKey: ['test', 1],
          queryFn: fn1,
        });
        return { queryResult1, queryResult2 };
      },
      { wrapper },
    );
    //E
    await act(async () => {
      await waitFor(() => result.current.queryResult1.status === 'loading');
    });
    //V
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(result.current.queryResult2.status).toBe('loading');
    //E
    await act(async () => {
      await waitFor(() => result.current.queryResult1.status === 'success');
    });
    //V
    expect(result.current.queryResult2.status).toBe('success');
  });

  it('should chain the 3rd query despite the second one is unmounted', async () => {
    //S
    const fn1 = jest
      .fn()
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 1000)),
      );
    const fn2 = jest
      .fn()
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 500)),
      );
    const fn3 = jest
      .fn()
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 500)),
      );

    const Component1 = () => {
      const res = useChainedQuery({ queryKey: ['test', 1], queryFn: fn1 });
      return <p>component1 {res.status}</p>;
    };

    const Component2 = () => {
      const res = useChainedQuery({ queryKey: ['test', 2], queryFn: fn2 });
      return <p>component2 {res.status}</p>;
    };

    const Component3 = () => {
      const res = useChainedQuery({ queryKey: ['test', 3], queryFn: fn3 });
      return <p>component3 {res.status}</p>;
    };

    const Component = () => {
      const [mounted, setMounted] = useState(true);

      useEffect(() => {
        const timer = setTimeout(() => {
          setMounted(false);
        }, 400);
        return () => clearTimeout(timer);
      }, []);
      return (
        <>
          <Component1 />
          {mounted && <Component2 />}
          <Component3 />
        </>
      );
    };

    render(<Component />, { wrapper });
    //E

    await waitFor(() =>
      expect(screen.getByText('component1 loading')).toBeInTheDocument(),
    );
    //V
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(0);
    expect(fn3).toHaveBeenCalledTimes(0);
    expect(screen.getByText('component2 idle')).toBeInTheDocument();
    expect(screen.getByText('component3 idle')).toBeInTheDocument();
    //E
    await waitForElementToBeRemoved(() => screen.getByText(/component2/));
    await waitFor(() =>
      expect(screen.getByText('component3 loading')).toBeInTheDocument(),
    );
    //V
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(0);
    expect(fn3).toHaveBeenCalledTimes(1);
  });

  it('should raise an error when using the hook outside the ChainedQueryProvider', () => {
    //S
    const fn1 = jest
      .fn()
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 500)),
      );
    //E
    const { result } = renderHook(() => {
      const res = useChainedQuery({ queryKey: ['test', 1], queryFn: fn1 });
      return { res };
    });
    //V
    //@ts-ignore
    expect(result.error.message).toBe(
      'Cannot use useChainedQuery outside ChainedQueryProvider',
    );
  });

  it('should return a successful query when the query is already resloved and successful', () => {
    //S
    client.setQueryData(['test', 1], 'hello');
    const fn1 = jest
      .fn()
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 500)),
      );
    const { result } = renderHook(
      () => {
        const queryResult = useChainedQuery({
          queryKey: ['test', 1],
          queryFn: fn1,
        });
        return { queryResult };
      },
      { wrapper },
    );

    expect(result.current.queryResult.status).toBe('success');
  });
});
