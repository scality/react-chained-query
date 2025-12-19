import { render, screen, waitFor, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import React from 'react';
import {
  useChainedMutations,
  ChainedMutationsConfig,
} from '../useChainedMutations';
import { createMockMutation, createMockHook } from './testUtils';

describe('useChainedMutations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Return Structure', () => {
    it('should return correct structure', () => {
      const mutation = createMockMutation();
      const config: ChainedMutationsConfig = {
        slots: [{ id: 'test', label: 'Test', mutation }],
        variables: { test: () => ({}) },
      };

      const { result } = renderHook(() => useChainedMutations(config));

      expect(result.current).toHaveProperty('Slots');
      expect(result.current).toHaveProperty('steps');
      expect(result.current).toHaveProperty('isComplete');
      expect(result.current).toHaveProperty('hasError');
      expect(result.current).toHaveProperty('isReady');
      expect(result.current).toHaveProperty('getResult');
      expect(result.current).toHaveProperty('start');
      expect(typeof result.current.start).toBe('function');
      expect(typeof result.current.getResult).toBe('function');
    });
  });

  describe('Static Slots', () => {
    it('should be ready immediately with static mutations', () => {
      const mutation = createMockMutation();
      const config: ChainedMutationsConfig = {
        slots: [{ id: 'test', label: 'Test', mutation }],
        variables: { test: () => ({}) },
        autoStart: false,
      };

      const { result } = renderHook(() => useChainedMutations(config));

      expect(result.current.isReady).toBe(true);
      expect(result.current.steps).toHaveLength(1);
      expect(result.current.steps[0].id).toBe('test');
      expect(result.current.steps[0].label).toBe('Test');
      expect(result.current.steps[0].step).toBe(1);
    });

    it('should handle multiple static mutations', () => {
      const mutation1 = createMockMutation();
      const mutation2 = createMockMutation();
      const config: ChainedMutationsConfig = {
        slots: [
          { id: 'first', label: 'First', mutation: mutation1 },
          { id: 'second', label: 'Second', mutation: mutation2 },
        ],
        variables: {
          first: () => ({ a: 1 }),
          second: () => ({ b: 2 }),
        },
        autoStart: false,
      };

      const { result } = renderHook(() => useChainedMutations(config));

      expect(result.current.isReady).toBe(true);
      expect(result.current.steps).toHaveLength(2);
      expect(result.current.steps[0].id).toBe('first');
      expect(result.current.steps[1].id).toBe('second');
    });
  });

  describe('Dynamic Slots', () => {
    it('should render dynamic hook components via Slots', async () => {
      const mutation = createMockMutation();
      const mockHook = jest.fn(() => mutation);

      const config: ChainedMutationsConfig = {
        slots: [{ id: 'dynamic', label: 'Dynamic', hook: mockHook }],
        variables: { dynamic: () => ({}) },
        autoStart: false,
      };

      const TestComponent = () => {
        const { Slots, isReady } = useChainedMutations(config);
        return (
          <div>
            {Slots}
            <span data-testid="ready">{isReady ? 'ready' : 'not-ready'}</span>
          </div>
        );
      };

      render(<TestComponent />);

      // Verify the hook was called when Slots rendered
      expect(mockHook).toHaveBeenCalled();

      // After rendering Slots, the hook should be called and registered
      await waitFor(() => {
        expect(screen.getByTestId('ready').textContent).toBe('ready');
      });
    });

    it('should not be ready until dynamic mutations are registered', () => {
      const mutation = createMockMutation();
      const mockHook = createMockHook(mutation);

      const config: ChainedMutationsConfig = {
        slots: [{ id: 'dynamic', label: 'Dynamic', hook: mockHook }],
        variables: { dynamic: () => ({}) },
        autoStart: false,
      };

      // Without rendering Slots, dynamic mutations won't be registered
      const { result } = renderHook(() => useChainedMutations(config));

      // isReady should be false because Slots hasn't rendered
      expect(result.current.isReady).toBe(false);
    });
  });

  describe('Chain Execution', () => {
    it('should execute mutations sequentially', async () => {
      const mutation1 = createMockMutation();
      const mutation2 = createMockMutation();
      const callOrder: string[] = [];

      mutation1.mutate.mockImplementation((vars, opts) => {
        callOrder.push('mutation1');
        opts?.onSuccess?.({ id: 1 });
      });
      mutation2.mutate.mockImplementation((vars, opts) => {
        callOrder.push('mutation2');
        opts?.onSuccess?.({ id: 2 });
      });

      const config: ChainedMutationsConfig = {
        slots: [
          { id: 'first', label: 'First', mutation: mutation1 },
          { id: 'second', label: 'Second', mutation: mutation2 },
        ],
        variables: {
          first: () => ({ a: 1 }),
          second: (prev) => ({ b: 2, prevId: (prev[0]?.data as { id?: number })?.id }),
        },
        autoStart: false,
      };

      const { result } = renderHook(() => useChainedMutations(config));

      act(() => {
        result.current.start();
      });

      expect(callOrder).toEqual(['mutation1', 'mutation2']);
      expect(mutation1.mutate).toHaveBeenCalledWith({ a: 1 }, expect.any(Object));
      expect(mutation2.mutate).toHaveBeenCalledWith(
        { b: 2, prevId: 1 },
        expect.any(Object),
      );
    });

    it('should pass previous results to subsequent variable resolvers', () => {
      const mutation1 = createMockMutation();
      const mutation2 = createMockMutation();
      const mutation3 = createMockMutation();

      mutation1.mutate.mockImplementation((vars, opts) => {
        opts?.onSuccess?.({ accountId: 'acc-123' });
      });
      mutation2.mutate.mockImplementation((vars, opts) => {
        opts?.onSuccess?.({ bucketName: 'my-bucket' });
      });
      mutation3.mutate.mockImplementation((vars, opts) => {
        opts?.onSuccess?.({ policyId: 'pol-456' });
      });

      const variableResolver3 = jest.fn((prev) => ({
        accountId: (prev[0]?.data as { accountId?: string })?.accountId,
        bucketName: (prev[1]?.data as { bucketName?: string })?.bucketName,
      }));

      const config: ChainedMutationsConfig = {
        slots: [
          { id: 'account', label: 'Account', mutation: mutation1 },
          { id: 'bucket', label: 'Bucket', mutation: mutation2 },
          { id: 'policy', label: 'Policy', mutation: mutation3 },
        ],
        variables: {
          account: () => ({}),
          bucket: () => ({}),
          policy: variableResolver3,
        },
        autoStart: false,
      };

      const { result } = renderHook(() => useChainedMutations(config));

      act(() => {
        result.current.start();
      });

      expect(variableResolver3).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ data: { accountId: 'acc-123' }, id: 'account' }),
          expect.objectContaining({ data: { bucketName: 'my-bucket' }, id: 'bucket' }),
        ]),
      );
    });
  });

  describe('Auto-start', () => {
    it('should auto-start when autoStart is true (default)', () => {
      const mutation = createMockMutation();
      mutation.mutate.mockImplementation((vars, opts) => {
        opts?.onSuccess?.({});
      });

      const config: ChainedMutationsConfig = {
        slots: [{ id: 'test', label: 'Test', mutation }],
        variables: { test: () => ({}) },
        // autoStart defaults to true
      };

      renderHook(() => useChainedMutations(config));

      expect(mutation.mutate).toHaveBeenCalled();
    });

    it('should not auto-start when autoStart is false', () => {
      const mutation = createMockMutation();

      const config: ChainedMutationsConfig = {
        slots: [{ id: 'test', label: 'Test', mutation }],
        variables: { test: () => ({}) },
        autoStart: false,
      };

      renderHook(() => useChainedMutations(config));

      expect(mutation.mutate).not.toHaveBeenCalled();
    });

    it('should start manually with start()', () => {
      const mutation = createMockMutation();
      mutation.mutate.mockImplementation((vars, opts) => {
        opts?.onSuccess?.({});
      });

      const config: ChainedMutationsConfig = {
        slots: [{ id: 'test', label: 'Test', mutation }],
        variables: { test: () => ({}) },
        autoStart: false,
      };

      const { result } = renderHook(() => useChainedMutations(config));

      expect(mutation.mutate).not.toHaveBeenCalled();

      act(() => {
        result.current.start();
      });

      expect(mutation.mutate).toHaveBeenCalled();
    });

    it('should not start multiple times', () => {
      const mutation = createMockMutation();
      mutation.mutate.mockImplementation((vars, opts) => {
        opts?.onSuccess?.({});
      });

      const config: ChainedMutationsConfig = {
        slots: [{ id: 'test', label: 'Test', mutation }],
        variables: { test: () => ({}) },
        autoStart: false,
      };

      const { result } = renderHook(() => useChainedMutations(config));

      act(() => {
        result.current.start();
        result.current.start();
        result.current.start();
      });

      expect(mutation.mutate).toHaveBeenCalledTimes(1);
    });

    it('should allow restart after reset()', () => {
      const mutation = createMockMutation();
      mutation.mutate.mockImplementation((vars, opts) => {
        opts?.onSuccess?.({});
      });

      const config: ChainedMutationsConfig = {
        slots: [{ id: 'test', label: 'Test', mutation }],
        variables: { test: () => ({}) },
        autoStart: false,
      };

      const { result } = renderHook(() => useChainedMutations(config));

      act(() => {
        result.current.start();
      });

      expect(mutation.mutate).toHaveBeenCalledTimes(1);

      act(() => {
        result.current.reset();
      });

      act(() => {
        result.current.start();
      });

      expect(mutation.mutate).toHaveBeenCalledTimes(2);
    });

    it('should warn when start() is called before isReady', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const mutation = createMockMutation();
      const mockHook = createMockHook(mutation);

      const config: ChainedMutationsConfig = {
        slots: [{ id: 'dynamic', label: 'Dynamic', hook: mockHook }],
        variables: { dynamic: () => ({}) },
        autoStart: false,
      };

      // Without rendering Slots, dynamic mutations won't be registered
      const { result } = renderHook(() => useChainedMutations(config));

      expect(result.current.isReady).toBe(false);

      act(() => {
        result.current.start();
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('start() called before isReady'),
      );
      expect(mutation.mutate).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('Status Tracking', () => {
    it('should track idle status', () => {
      const mutation = createMockMutation({ status: 'idle' });

      const config: ChainedMutationsConfig = {
        slots: [{ id: 'test', label: 'Test', mutation }],
        variables: { test: () => ({}) },
        autoStart: false,
      };

      const { result } = renderHook(() => useChainedMutations(config));

      expect(result.current.steps[0].status).toBe('idle');
      expect(result.current.isComplete).toBe(false);
      expect(result.current.hasError).toBe(false);
    });

    it('should track loading/pending status', () => {
      const mutation = createMockMutation({ status: 'loading' });

      const config: ChainedMutationsConfig = {
        slots: [{ id: 'test', label: 'Test', mutation }],
        variables: { test: () => ({}) },
        autoStart: false,
      };

      const { result } = renderHook(() => useChainedMutations(config));

      expect(result.current.steps[0].status).toBe('pending');
    });

    it('should track success status', () => {
      const mutation = createMockMutation({ status: 'success', data: { id: 1 } });

      const config: ChainedMutationsConfig = {
        slots: [{ id: 'test', label: 'Test', mutation }],
        variables: { test: () => ({}) },
        autoStart: false,
      };

      const { result } = renderHook(() => useChainedMutations(config));

      expect(result.current.steps[0].status).toBe('success');
      expect(result.current.isComplete).toBe(true);
    });

    it('should track error status', () => {
      const mutation = createMockMutation({ status: 'error' });

      const config: ChainedMutationsConfig = {
        slots: [{ id: 'test', label: 'Test', mutation }],
        variables: { test: () => ({}) },
        autoStart: false,
      };

      const { result } = renderHook(() => useChainedMutations(config));

      expect(result.current.steps[0].status).toBe('error');
      expect(result.current.hasError).toBe(true);
    });

    it('should keep subsequent steps idle after error', () => {
      const mutation1 = createMockMutation({ status: 'error' });
      const mutation2 = createMockMutation({ status: 'idle' });

      const config: ChainedMutationsConfig = {
        slots: [
          { id: 'first', label: 'First', mutation: mutation1 },
          { id: 'second', label: 'Second', mutation: mutation2 },
        ],
        variables: {
          first: () => ({}),
          second: () => ({}),
        },
        autoStart: false,
      };

      const { result } = renderHook(() => useChainedMutations(config));

      expect(result.current.steps[0].status).toBe('error');
      expect(result.current.steps[1].status).toBe('idle');
      expect(result.current.hasError).toBe(true);
      expect(result.current.isComplete).toBe(false);
    });

    it('should be complete only when all steps succeed', () => {
      const mutation1 = createMockMutation({ status: 'success' });
      const mutation2 = createMockMutation({ status: 'success' });
      const mutation3 = createMockMutation({ status: 'success' });

      const config: ChainedMutationsConfig = {
        slots: [
          { id: 'first', label: 'First', mutation: mutation1 },
          { id: 'second', label: 'Second', mutation: mutation2 },
          { id: 'third', label: 'Third', mutation: mutation3 },
        ],
        variables: {
          first: () => ({}),
          second: () => ({}),
          third: () => ({}),
        },
        autoStart: false,
      };

      const { result } = renderHook(() => useChainedMutations(config));

      expect(result.current.isComplete).toBe(true);
    });
  });

  describe('Retry', () => {
    it('should provide retry function for each step', () => {
      const mutation = createMockMutation();
      mutation.mutate.mockImplementation((vars, opts) => {
        opts?.onSuccess?.({});
      });

      const config: ChainedMutationsConfig = {
        slots: [{ id: 'test', label: 'Test', mutation }],
        variables: { test: () => ({}) },
        autoStart: false,
      };

      const { result } = renderHook(() => useChainedMutations(config));

      act(() => {
        result.current.start();
      });

      expect(typeof result.current.steps[0].retry).toBe('function');

      // Clear previous calls
      mutation.mutate.mockClear();

      act(() => {
        result.current.steps[0].retry();
      });

      expect(mutation.mutate).toHaveBeenCalledTimes(1);
    });

    it('should retry with same variables', () => {
      const mutation = createMockMutation();
      const variablesFn = jest.fn(() => ({ key: 'value' }));

      mutation.mutate.mockImplementation((vars, opts) => {
        // Don't call onSuccess to simulate pending/error state
      });

      const config: ChainedMutationsConfig = {
        slots: [{ id: 'test', label: 'Test', mutation }],
        variables: { test: variablesFn },
        autoStart: false,
      };

      const { result } = renderHook(() => useChainedMutations(config));

      act(() => {
        result.current.start();
      });

      const firstCallArgs = mutation.mutate.mock.calls[0][0];

      act(() => {
        result.current.steps[0].retry();
      });

      const retryCallArgs = mutation.mutate.mock.calls[1][0];

      expect(firstCallArgs).toEqual(retryCallArgs);
    });
  });

  describe('getResult', () => {
    it('should return data for completed mutation', () => {
      const mutation = createMockMutation({
        status: 'success',
        data: { userId: 123, name: 'Test User' },
      });

      const config: ChainedMutationsConfig = {
        slots: [{ id: 'user', label: 'User', mutation }],
        variables: { user: () => ({}) },
        autoStart: false,
      };

      const { result } = renderHook(() => useChainedMutations(config));

      const userData = result.current.getResult<{ userId: number; name: string }>('user');

      expect(userData).toEqual({ userId: 123, name: 'Test User' });
    });

    it('should return undefined for non-existent slot', () => {
      const mutation = createMockMutation();

      const config: ChainedMutationsConfig = {
        slots: [{ id: 'test', label: 'Test', mutation }],
        variables: { test: () => ({}) },
        autoStart: false,
      };

      const { result } = renderHook(() => useChainedMutations(config));

      expect(result.current.getResult('nonexistent')).toBeUndefined();
    });

    it('should return undefined for mutation without data', () => {
      const mutation = createMockMutation({ status: 'idle' });

      const config: ChainedMutationsConfig = {
        slots: [{ id: 'test', label: 'Test', mutation }],
        variables: { test: () => ({}) },
        autoStart: false,
      };

      const { result } = renderHook(() => useChainedMutations(config));

      expect(result.current.getResult('test')).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should log error when mutation fails via onError callback', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const mutation = createMockMutation();
      const testError = new Error('Mutation failed');

      mutation.mutate.mockImplementation((vars, opts) => {
        opts?.onError?.(testError);
      });

      const config: ChainedMutationsConfig = {
        slots: [{ id: 'test', label: 'Test', mutation }],
        variables: { test: () => ({}) },
        autoStart: false,
      };

      const { result } = renderHook(() => useChainedMutations(config));

      act(() => {
        result.current.start();
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Mutation "test" failed'),
        testError,
      );

      consoleSpy.mockRestore();
    });

    it('should log error when resolver is missing', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const mutation = createMockMutation();

      const config: ChainedMutationsConfig = {
        slots: [{ id: 'test', label: 'Test', mutation }],
        variables: {}, // Missing resolver
        autoStart: false,
      };

      const { result } = renderHook(() => useChainedMutations(config));

      act(() => {
        result.current.start();
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Missing variables resolver for: test'),
      );

      consoleSpy.mockRestore();
    });

    it('should catch and log when resolver throws', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const mutation = createMockMutation();

      const config: ChainedMutationsConfig = {
        slots: [{ id: 'test', label: 'Test', mutation }],
        variables: {
          test: () => {
            throw new Error('Resolver error');
          },
        },
        autoStart: false,
      };

      const { result } = renderHook(() => useChainedMutations(config));

      // Should not throw - error should be caught and logged
      expect(() => {
        act(() => {
          result.current.start();
        });
      }).not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Variables resolver threw for "test"'),
        expect.any(Error),
      );

      // mutation.mutate should not have been called since resolver threw
      expect(mutation.mutate).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('Configuration Changes', () => {
    it('should reset when slots change', () => {
      const mutation1 = createMockMutation();
      const mutation2 = createMockMutation();

      mutation1.mutate.mockImplementation((vars, opts) => {
        opts?.onSuccess?.({});
      });
      mutation2.mutate.mockImplementation((vars, opts) => {
        opts?.onSuccess?.({});
      });

      const initialConfig: ChainedMutationsConfig = {
        slots: [{ id: 'first', label: 'First', mutation: mutation1 }],
        variables: { first: () => ({}) },
        autoStart: false,
      };

      const { result, rerender } = renderHook(
        (props: ChainedMutationsConfig) => useChainedMutations(props),
        { initialProps: initialConfig },
      );

      act(() => {
        result.current.start();
      });

      expect(mutation1.mutate).toHaveBeenCalledTimes(1);

      // Change slots
      const newConfig: ChainedMutationsConfig = {
        slots: [
          { id: 'first', label: 'First', mutation: mutation1 },
          { id: 'second', label: 'Second', mutation: mutation2 },
        ],
        variables: {
          first: () => ({}),
          second: () => ({}),
        },
        autoStart: false,
      };

      rerender(newConfig);

      // Should be able to start again after reset
      act(() => {
        result.current.start();
      });

      expect(mutation1.mutate).toHaveBeenCalledTimes(2);
    });

    it('should cleanup stale slots', () => {
      const mutation1 = createMockMutation({ status: 'success', data: { a: 1 } });
      const mutation2 = createMockMutation({ status: 'success', data: { b: 2 } });

      const initialConfig: ChainedMutationsConfig = {
        slots: [
          { id: 'first', label: 'First', mutation: mutation1 },
          { id: 'second', label: 'Second', mutation: mutation2 },
        ],
        variables: {
          first: () => ({}),
          second: () => ({}),
        },
        autoStart: false,
      };

      const { result, rerender } = renderHook(
        (props: ChainedMutationsConfig) => useChainedMutations(props),
        { initialProps: initialConfig },
      );

      expect(result.current.steps).toHaveLength(2);

      // Remove second slot
      const newConfig: ChainedMutationsConfig = {
        slots: [{ id: 'first', label: 'First', mutation: mutation1 }],
        variables: { first: () => ({}) },
        autoStart: false,
      };

      rerender(newConfig);

      expect(result.current.steps).toHaveLength(1);
      expect(result.current.getResult('second')).toBeUndefined();
    });
  });

  describe('Mixed Static and Dynamic Slots', () => {
    it('should handle mixed slots correctly', async () => {
      const staticMutation = createMockMutation({ status: 'success', data: { static: true } });
      const dynamicMutation = createMockMutation({ status: 'success', data: { dynamic: true } });
      const mockHook = jest.fn(() => dynamicMutation);

      const config: ChainedMutationsConfig = {
        slots: [
          { id: 'static', label: 'Static', mutation: staticMutation },
          { id: 'dynamic', label: 'Dynamic', hook: mockHook },
        ],
        variables: {
          static: () => ({}),
          dynamic: () => ({}),
        },
        autoStart: false,
      };

      const TestComponent = () => {
        const { Slots, steps, isReady, getResult } = useChainedMutations(config);
        return (
          <div>
            {Slots}
            <span data-testid="ready">{isReady ? 'ready' : 'not-ready'}</span>
            <span data-testid="steps">{steps.length}</span>
            <span data-testid="static-data">
              {JSON.stringify(getResult('static'))}
            </span>
            <span data-testid="dynamic-data">
              {JSON.stringify(getResult('dynamic'))}
            </span>
          </div>
        );
      };

      render(<TestComponent />);

      // Verify hook was called
      expect(mockHook).toHaveBeenCalled();

      // Static slot should have data immediately
      expect(screen.getByTestId('static-data').textContent).toBe('{"static":true}');

      // Wait for dynamic slot to be ready
      await waitFor(() => {
        expect(screen.getByTestId('ready').textContent).toBe('ready');
      });

      // Both slots should have 2 steps
      expect(screen.getByTestId('steps').textContent).toBe('2');

      // Dynamic slot should also have data
      expect(screen.getByTestId('dynamic-data').textContent).toBe('{"dynamic":true}');
    });
  });

  describe('Step Numbering', () => {
    it('should number steps correctly', () => {
      const mutations = [
        createMockMutation(),
        createMockMutation(),
        createMockMutation(),
      ];

      const config: ChainedMutationsConfig = {
        slots: [
          { id: 'a', label: 'Step A', mutation: mutations[0] },
          { id: 'b', label: 'Step B', mutation: mutations[1] },
          { id: 'c', label: 'Step C', mutation: mutations[2] },
        ],
        variables: {
          a: () => ({}),
          b: () => ({}),
          c: () => ({}),
        },
        autoStart: false,
      };

      const { result } = renderHook(() => useChainedMutations(config));

      expect(result.current.steps[0].step).toBe(1);
      expect(result.current.steps[1].step).toBe(2);
      expect(result.current.steps[2].step).toBe(3);
    });
  });

  describe('Empty Slots', () => {
    it('should handle empty slots array', () => {
      const config: ChainedMutationsConfig = {
        slots: [],
        variables: {},
        autoStart: false,
      };

      const { result } = renderHook(() => useChainedMutations(config));

      expect(result.current.steps).toHaveLength(0);
      expect(result.current.isReady).toBe(true);
      expect(result.current.isComplete).toBe(false); // No steps means not complete
    });
  });
});

