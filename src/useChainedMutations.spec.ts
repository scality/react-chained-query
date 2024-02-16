/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://jestjs.io/"}
 */

import { waitFor } from '@testing-library/react';
import { useChainedMutations } from './useChainedMutations';
import { act, renderHook } from '@testing-library/react-hooks';

const fn1 = jest.fn();
const fn2 = jest.fn();
describe('useChainedMutations', () => {
  it('should call mutate function', async () => {
    const mutations = [
      {
        key: 'mutation1',
        mutate: fn1,
        isSuccess: true,
        data: [1, 2, 3],
        retry: jest.fn(),
      },
      {
        key: 'mutation2',
        mutate: fn2,
        isSucess: true,
        data: [4, 5, 6],
        retry: jest.fn(),
      },
    ];
    const computeVariablesForNext = {
      mutation1: jest.fn(),
      mutation2: jest.fn(),
    };

    const { result } = renderHook(() =>
      useChainedMutations({
        mutations,
        computeVariablesForNext,
      }),
    );

    await act(async () => {
      result.current.mutate();
    });

    expect(fn1).toHaveBeenCalled();
  });

  it('should call retry function', async () => {
    const mutations = [
      {
        key: 'mutation1',
        mutate: fn1,
        isSuccess: true,
        data: [1, 2, 3],
        retry: jest.fn(),
      },
      {
        key: 'mutation2',
        mutate: fn2,
        isSucess: true,
        data: [4, 5, 6],
        retry: jest.fn(),
      },
    ];
    const computeVariablesForNext = {
      mutation1: jest.fn(),
      mutation2: jest.fn(),
    };

    const { result } = renderHook(() =>
      useChainedMutations({
        mutations,
        computeVariablesForNext,
      }),
    );

    await act(async () => {
      result.current.mutationsWithRetry[0].retry();
    });

    expect(fn1).toHaveBeenCalled();
  });
});
