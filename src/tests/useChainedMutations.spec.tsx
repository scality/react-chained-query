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

  describe('Basic Functionality', () => {
    it('should be able to start and complete a mutation chain', () => {
      const mutation = createMockMutation();
      mutation.mutate.mockImplementation((vars, opts) => {
        opts?.onSuccess?.({ result: 'success' });
      });

      const config: ChainedMutationsConfig = {
        mutations: [{ id: 'test', label: 'Test', mutation }],
        variables: { test: () => ({ input: 'value' }) },
        autoStart: false,
      };

      const { result } = renderHook(() => useChainedMutations(config));

      expect(result.current.isReady).toBe(true);

      act(() => {
        result.current.start();
      });

      expect(mutation.mutate).toHaveBeenCalledWith(
        { input: 'value' },
        expect.any(Object),
      );
    });
  });

  describe('Static Mutations', () => {
    it('should be ready immediately with static mutations', () => {
      const mutation = createMockMutation();
      const config: ChainedMutationsConfig = {
        mutations: [{ id: 'test', label: 'Test', mutation }],
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
        mutations: [
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

  describe('Dynamic Mutations', () => {
    it('should render dynamic hook components via Slots', async () => {
      const mutation = createMockMutation();
      const mockHook = jest.fn(() => mutation);

      const config: ChainedMutationsConfig = {
        mutations: [{ id: 'dynamic', label: 'Dynamic', hook: mockHook }],
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
        mutations: [{ id: 'dynamic', label: 'Dynamic', hook: mockHook }],
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
        mutations: [
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
        mutations: [
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

    it('should support key-based access to previous results (prev.mutationId.data)', () => {
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
        // Using key-based access instead of index
        accountId: (prev.account?.data as { accountId?: string })?.accountId,
        bucketName: (prev.bucket?.data as { bucketName?: string })?.bucketName,
      }));

      const config: ChainedMutationsConfig = {
        mutations: [
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

      expect(mutation3.mutate).toHaveBeenCalledWith(
        { accountId: 'acc-123', bucketName: 'my-bucket' },
        expect.any(Object),
      );
    });

    it('should support mixed index and key-based access', () => {
      const mutation1 = createMockMutation();
      const mutation2 = createMockMutation();
      const mutation3 = createMockMutation();

      mutation1.mutate.mockImplementation((vars, opts) => {
        opts?.onSuccess?.({ id: 'first-id' });
      });
      mutation2.mutate.mockImplementation((vars, opts) => {
        opts?.onSuccess?.({ id: 'second-id' });
      });
      mutation3.mutate.mockImplementation((vars, opts) => {
        opts?.onSuccess?.({});
      });

      const variableResolver3 = jest.fn((prev) => ({
        // Mix of index and key-based access
        firstById: (prev.first?.data as { id?: string })?.id,
        secondByIndex: (prev[1]?.data as { id?: string })?.id,
      }));

      const config: ChainedMutationsConfig = {
        mutations: [
          { id: 'first', label: 'First', mutation: mutation1 },
          { id: 'second', label: 'Second', mutation: mutation2 },
          { id: 'third', label: 'Third', mutation: mutation3 },
        ],
        variables: {
          first: () => ({}),
          second: () => ({}),
          third: variableResolver3,
        },
        autoStart: false,
      };

      const { result } = renderHook(() => useChainedMutations(config));

      act(() => {
        result.current.start();
      });

      expect(mutation3.mutate).toHaveBeenCalledWith(
        { firstById: 'first-id', secondByIndex: 'second-id' },
        expect.any(Object),
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
        mutations: [{ id: 'test', label: 'Test', mutation }],
        variables: { test: () => ({}) },
        // autoStart defaults to true
      };

      renderHook(() => useChainedMutations(config));

      expect(mutation.mutate).toHaveBeenCalled();
    });

    it('should not auto-start when autoStart is false', () => {
      const mutation = createMockMutation();

      const config: ChainedMutationsConfig = {
        mutations: [{ id: 'test', label: 'Test', mutation }],
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
        mutations: [{ id: 'test', label: 'Test', mutation }],
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
        mutations: [{ id: 'test', label: 'Test', mutation }],
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
        mutations: [{ id: 'test', label: 'Test', mutation }],
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
        mutations: [{ id: 'dynamic', label: 'Dynamic', hook: mockHook }],
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
        mutations: [{ id: 'test', label: 'Test', mutation }],
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
        mutations: [{ id: 'test', label: 'Test', mutation }],
        variables: { test: () => ({}) },
        autoStart: false,
      };

      const { result } = renderHook(() => useChainedMutations(config));

      expect(result.current.steps[0].status).toBe('pending');
    });

    it('should track success status', () => {
      const mutation = createMockMutation({ status: 'success', data: { id: 1 } });

      const config: ChainedMutationsConfig = {
        mutations: [{ id: 'test', label: 'Test', mutation }],
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
        mutations: [{ id: 'test', label: 'Test', mutation }],
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
        mutations: [
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
        mutations: [
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
        mutations: [{ id: 'test', label: 'Test', mutation }],
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
        mutations: [{ id: 'test', label: 'Test', mutation }],
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
        mutations: [{ id: 'user', label: 'User', mutation }],
        variables: { user: () => ({}) },
        autoStart: false,
      };

      const { result } = renderHook(() => useChainedMutations(config));

      const userData = result.current.getResult<{ userId: number; name: string }>('user');

      expect(userData).toEqual({ userId: 123, name: 'Test User' });
    });

    it('should return undefined for non-existent mutation', () => {
      const mutation = createMockMutation();

      const config: ChainedMutationsConfig = {
        mutations: [{ id: 'test', label: 'Test', mutation }],
        variables: { test: () => ({}) },
        autoStart: false,
      };

      const { result } = renderHook(() => useChainedMutations(config));

      expect(result.current.getResult('nonexistent')).toBeUndefined();
    });

    it('should return undefined for mutation without data', () => {
      const mutation = createMockMutation({ status: 'idle' });

      const config: ChainedMutationsConfig = {
        mutations: [{ id: 'test', label: 'Test', mutation }],
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
        mutations: [{ id: 'test', label: 'Test', mutation }],
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

    it('should set error status when resolver is missing', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const mutation = createMockMutation();

      const config: ChainedMutationsConfig = {
        mutations: [{ id: 'test', label: 'Test', mutation }],
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
      expect(result.current.steps[0].status).toBe('error');
      expect(result.current.hasError).toBe(true);

      consoleSpy.mockRestore();
    });

    it('should allow retry after missing resolver is fixed', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const mutation = createMockMutation({ status: 'success' });
      mutation.mutate.mockImplementation((vars, opts) => {
        opts?.onSuccess?.({});
      });

      // Use a mutable object so we can add the resolver later
      const variables: Record<string, () => unknown> = {};

      const config: ChainedMutationsConfig = {
        mutations: [{ id: 'test', label: 'Test', mutation }],
        variables,
        autoStart: false,
      };

      const { result } = renderHook(() => useChainedMutations(config));

      // First attempt - resolver missing
      act(() => {
        result.current.start();
      });

      expect(result.current.steps[0].status).toBe('error');
      expect(mutation.mutate).not.toHaveBeenCalled();

      // Add the resolver
      variables.test = () => ({ key: 'value' });

      // Retry should work now
      act(() => {
        result.current.steps[0].retry();
      });

      expect(mutation.mutate).toHaveBeenCalledWith({ key: 'value' }, expect.any(Object));
      expect(result.current.hasError).toBe(false);

      consoleSpy.mockRestore();
    });

    it('should set error status when resolver throws', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const mutation = createMockMutation();

      const config: ChainedMutationsConfig = {
        mutations: [{ id: 'test', label: 'Test', mutation }],
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

      // Step should show error status
      expect(result.current.steps[0].status).toBe('error');
      expect(result.current.hasError).toBe(true);

      consoleSpy.mockRestore();
    });

    it('should handle invalid mutation instance (missing mutate)', () => {
      const invalidMutation = { status: 'idle' }; // Missing mutate function

      const config: ChainedMutationsConfig = {
        mutations: [{ id: 'test', label: 'Test', mutation: invalidMutation }],
        variables: { test: () => ({}) },
        autoStart: false,
      };

      const { result } = renderHook(() => useChainedMutations(config));

      // Should not throw when starting
      expect(() => {
        act(() => {
          result.current.start();
        });
      }).not.toThrow();

      // Mutation should not have been called (since mutate doesn't exist)
      expect(result.current.steps[0].status).toBe('idle');
    });

    it('should handle synchronous error thrown by mutate call', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const mutation = createMockMutation();
      mutation.mutate.mockImplementation(() => {
        throw new Error('Sync error in mutate');
      });

      const config: ChainedMutationsConfig = {
        mutations: [{ id: 'test', label: 'Test', mutation }],
        variables: { test: () => ({}) },
        autoStart: false,
      };

      const { result } = renderHook(() => useChainedMutations(config));

      // Should not throw - error should be caught
      expect(() => {
        act(() => {
          result.current.start();
        });
      }).not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('threw synchronously'),
        expect.any(Error),
      );

      // Step should show error status
      expect(result.current.steps[0].status).toBe('error');
      expect(result.current.hasError).toBe(true);

      consoleSpy.mockRestore();
    });

    it('should keep subsequent steps idle after resolver error', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const mutation1 = createMockMutation();
      const mutation2 = createMockMutation();

      const config: ChainedMutationsConfig = {
        mutations: [
          { id: 'first', label: 'First', mutation: mutation1 },
          { id: 'second', label: 'Second', mutation: mutation2 },
        ],
        variables: {
          first: () => {
            throw new Error('First resolver failed');
          },
          second: () => ({}),
        },
        autoStart: false,
      };

      const { result } = renderHook(() => useChainedMutations(config));

      act(() => {
        result.current.start();
      });

      expect(result.current.steps[0].status).toBe('error');
      expect(result.current.steps[1].status).toBe('idle');
      expect(result.current.hasError).toBe(true);
      expect(mutation2.mutate).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should clear resolver error after reset and successful retry', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const mutation = createMockMutation({ status: 'success' });
      let shouldThrow = true;

      mutation.mutate.mockImplementation((vars, opts) => {
        opts?.onSuccess?.({});
      });

      const config: ChainedMutationsConfig = {
        mutations: [{ id: 'test', label: 'Test', mutation }],
        variables: {
          test: () => {
            if (shouldThrow) {
              throw new Error('Resolver error');
            }
            return {};
          },
        },
        autoStart: false,
      };

      const { result } = renderHook(() => useChainedMutations(config));

      // First attempt - should error
      act(() => {
        result.current.start();
      });

      expect(result.current.steps[0].status).toBe('error');
      expect(result.current.hasError).toBe(true);

      // Reset and try again with working resolver
      shouldThrow = false;
      act(() => {
        result.current.reset();
      });

      act(() => {
        result.current.start();
      });

      expect(mutation.mutate).toHaveBeenCalled();
      expect(result.current.steps[0].status).toBe('success');
      expect(result.current.hasError).toBe(false);

      consoleSpy.mockRestore();
    });

    it('should clear error on retry without reset', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const mutation = createMockMutation();
      let callCount = 0;

      mutation.mutate.mockImplementation((vars, opts) => {
        opts?.onSuccess?.({});
      });

      const config: ChainedMutationsConfig = {
        mutations: [{ id: 'test', label: 'Test', mutation }],
        variables: {
          test: () => {
            callCount++;
            if (callCount === 1) {
              throw new Error('First call fails');
            }
            return {};
          },
        },
        autoStart: false,
      };

      const { result } = renderHook(() => useChainedMutations(config));

      // First attempt - should error
      act(() => {
        result.current.start();
      });

      expect(result.current.steps[0].status).toBe('error');

      // Retry without reset - should clear error and succeed
      act(() => {
        result.current.steps[0].retry();
      });

      expect(mutation.mutate).toHaveBeenCalled();
      expect(result.current.hasError).toBe(false);

      consoleSpy.mockRestore();
    });
  });

  describe('Configuration Changes', () => {
    it('should reset when mutations change', () => {
      const mutation1 = createMockMutation();
      const mutation2 = createMockMutation();

      mutation1.mutate.mockImplementation((vars, opts) => {
        opts?.onSuccess?.({});
      });
      mutation2.mutate.mockImplementation((vars, opts) => {
        opts?.onSuccess?.({});
      });

      const initialConfig: ChainedMutationsConfig = {
        mutations: [{ id: 'first', label: 'First', mutation: mutation1 }],
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

      // Change mutations
      const newConfig: ChainedMutationsConfig = {
        mutations: [
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

    it('should cleanup stale mutations', () => {
      const mutation1 = createMockMutation({ status: 'success', data: { a: 1 } });
      const mutation2 = createMockMutation({ status: 'success', data: { b: 2 } });

      const initialConfig: ChainedMutationsConfig = {
        mutations: [
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

      // Remove second mutation
      const newConfig: ChainedMutationsConfig = {
        mutations: [{ id: 'first', label: 'First', mutation: mutation1 }],
        variables: { first: () => ({}) },
        autoStart: false,
      };

      rerender(newConfig);

      expect(result.current.steps).toHaveLength(1);
      expect(result.current.getResult('second')).toBeUndefined();
    });
  });

  describe('Mixed Static and Dynamic Mutations', () => {
    it('should handle mixed mutations correctly', async () => {
      const staticMutation = createMockMutation({ status: 'success', data: { static: true } });
      const dynamicMutation = createMockMutation({ status: 'success', data: { dynamic: true } });
      const mockHook = jest.fn(() => dynamicMutation);

      const config: ChainedMutationsConfig = {
        mutations: [
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

      // Static mutation should have data immediately
      expect(screen.getByTestId('static-data').textContent).toBe('{"static":true}');

      // Wait for dynamic mutation to be ready
      await waitFor(() => {
        expect(screen.getByTestId('ready').textContent).toBe('ready');
      });

      // Both mutations should have 2 steps
      expect(screen.getByTestId('steps').textContent).toBe('2');

      // Dynamic mutation should also have data
      expect(screen.getByTestId('dynamic-data').textContent).toBe('{"dynamic":true}');
    });
  });

  describe('Empty Mutations', () => {
    it('should handle empty mutations array', () => {
      const config: ChainedMutationsConfig = {
        mutations: [],
        variables: {},
        autoStart: false,
      };

      const { result } = renderHook(() => useChainedMutations(config));

      expect(result.current.steps).toHaveLength(0);
      expect(result.current.isReady).toBe(true);
      expect(result.current.isComplete).toBe(false); // No steps means not complete
    });
  });

  describe('Reserved Mutation Ids', () => {
    it('should warn when using numeric mutation id', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const mutation = createMockMutation();

      const config: ChainedMutationsConfig = {
        mutations: [{ id: '0', label: 'Numeric', mutation }],
        variables: { '0': () => ({}) },
        autoStart: false,
      };

      renderHook(() => useChainedMutations(config));

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Mutation ids "0" are reserved'),
      );

      consoleSpy.mockRestore();
    });

    it('should warn when using array method name as mutation id', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const mutation = createMockMutation();

      const config: ChainedMutationsConfig = {
        mutations: [
          { id: 'length', label: 'Length', mutation },
          { id: 'push', label: 'Push', mutation },
        ],
        variables: {
          length: () => ({}),
          push: () => ({}),
        },
        autoStart: false,
      };

      renderHook(() => useChainedMutations(config));

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"length"'),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"push"'),
      );

      consoleSpy.mockRestore();
    });

    it('should not warn for valid mutation ids', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const mutation = createMockMutation();

      const config: ChainedMutationsConfig = {
        mutations: [
          { id: 'account', label: 'Account', mutation },
          { id: 'bucket-data', label: 'Bucket', mutation },
        ],
        variables: {
          account: () => ({}),
          'bucket-data': () => ({}),
        },
        autoStart: false,
      };

      renderHook(() => useChainedMutations(config));

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});

