import { useState, useCallback } from 'react';

/**
 * useState 的 sessionStorage 持久化版本。
 * 切换 tab / 刷新页面后状态仍然保留，关闭浏览器后清除。
 *
 * @param {string} key - sessionStorage 键名
 * @param {*} initialValue - 默认值（sessionStorage 无值时使用）
 * @returns {[*, Function]} 与 useState 相同的 [value, setter] 元组
 */
export default function useSessionState(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = sessionStorage.getItem(key);
      return stored !== null ? JSON.parse(stored) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setPersistedValue = useCallback(
    (newValue) => {
      setValue((prev) => {
        const resolved = typeof newValue === 'function' ? newValue(prev) : newValue;
        try {
          sessionStorage.setItem(key, JSON.stringify(resolved));
        } catch { /* quota exceeded, silently ignore */ }
        return resolved;
      });
    },
    [key],
  );

  return [value, setPersistedValue];
}
