import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLocale, localeManager } from '../localeManager';

describe('localeManager', () => {
  it('exposes a singleton instance', () => {
    expect(localeManager).toBeTruthy();
    expect(typeof localeManager.currentLocale).toBe('string');
  });

  // Regression: useLocale used React.useState/useEffect without importing React,
  // so calling the hook threw "React is not defined".
  it('useLocale hook runs without a ReferenceError', () => {
    const { result } = renderHook(() => useLocale());
    expect(result.current).toBeTruthy();
    expect(typeof result.current.locale).toBe('string');
  });
});
