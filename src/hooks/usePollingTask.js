import { useEffect, useRef } from 'react';
import { getLoopTask } from '../api';

const TERMINAL_STATUSES = new Set(['PUBLISHED', 'FAILED', 'ABORTED']);
const DEFAULT_INTERVAL_MS = 1500;
const MAX_CONSECUTIVE_ERRORS = 3;

/**
 * 轮询闭环任务状态 — SSE 移除后的唯一进度来源（任务 D，D1）。
 *
 * - 每 intervalMs 拉取 GET /api/ai/loop/{taskId}
 * - 仅 status 变化时回调 onStatusChange(newStatus, oldStatus, task)，避免重复派发
 * - 终态（PUBLISHED/FAILED/ABORTED）自动停止轮询
 * - 组件卸载清理定时器；请求异常连续 MAX_CONSECUTIVE_ERRORS 次回调一次
 *   onError 后继续轮询（轮询天然自愈，不弹"连接中断"）
 *
 * @param {number|null} taskId 任务 ID（null 时不轮询）
 * @param {object} [options]
 * @param {(newStatus: string, oldStatus: string|null, task: object) => void} [options.onStatusChange]
 * @param {(err: Error) => void} [options.onError]
 * @param {number} [options.intervalMs]
 * @param {boolean} [options.enabled]
 */
export default function usePollingTask(
  taskId,
  { onStatusChange, onError, intervalMs = DEFAULT_INTERVAL_MS, enabled = true } = {},
) {
  // 用 ref 保存最新回调，避免回调变化导致定时器重启
  const callbacksRef = useRef({ onStatusChange, onError });
  callbacksRef.current = { onStatusChange, onError };

  useEffect(() => {
    if (!taskId || !enabled) return undefined;

    let stopped = false;
    let timer = null;
    let lastStatus = null;
    let consecutiveErrors = 0;

    const poll = async () => {
      try {
        const res = await getLoopTask(taskId);
        if (stopped) return;
        consecutiveErrors = 0;

        const task = res?.data;
        const status = task?.status;
        if (status && status !== lastStatus) {
          const prev = lastStatus;
          lastStatus = status;
          callbacksRef.current.onStatusChange?.(status, prev, task);
        }
        if (TERMINAL_STATUSES.has(status)) {
          stopped = true; // 终态 → 停止调度
          return;
        }
      } catch (err) {
        if (stopped) return;
        consecutiveErrors += 1;
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          callbacksRef.current.onError?.(err);
          consecutiveErrors = 0; // 轮询自愈 — 继续拉取
        }
      }
      if (!stopped) timer = setTimeout(poll, intervalMs);
    };

    poll(); // 立即拉一次，不等第一个 interval

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [taskId, enabled, intervalMs]);
}
