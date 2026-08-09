import { useState, useCallback, useEffect } from 'react';
import { Button, Space, Tag, Tooltip, message } from 'antd';
import { PlayCircleOutlined, StopOutlined, LoadingOutlined } from '@ant-design/icons';
import { createLoop, cancelLoop } from '../../api';

/**
 * 浮动启停按钮 — 固定在页面右下角，一键启动/中断 Agent Loop。
 * 通过 sessionStorage key 'loop:taskId' 与 AutoLoopPanel 共享任务状态。
 */
export default function LoopTrigger({ documentText, providerCode, flowType, disabled }) {
  const [loading, setLoading] = useState(false);
  const [runningTaskId, setRunningTaskId] = useState(
    () => JSON.parse(sessionStorage.getItem('loop:taskId') || 'null')
  );
  const [phase, setPhase] = useState(null);

  const canStart = !loading && !runningTaskId && documentText?.trim() && providerCode?.trim() && !disabled;

  const handleStart = useCallback(async () => {
    setLoading(true);
    try {
      const res = await createLoop(documentText, providerCode.trim(), flowType);
      const taskId = res.data?.taskId || res.data?.data?.taskId;
      if (taskId) {
        setRunningTaskId(taskId);
        sessionStorage.setItem('loop:taskId', JSON.stringify(taskId));
        sessionStorage.setItem('loop:snapshot', JSON.stringify({
          taskId,
          documentText,
          providerCode: providerCode.trim(),
          flowType,
          createdAt: Date.now(),
        }));
        message.success('闭环已启动');
      }
    } catch (e) {
      message.error('启动失败: ' + (e.response?.data?.msg || e.message));
    } finally {
      setLoading(false);
    }
  }, [documentText, providerCode, flowType]);

  const handleStop = useCallback(async () => {
    if (!runningTaskId) return;
    try {
      await cancelLoop(runningTaskId);
      message.info('正在中断任务...');
    } catch (e) {
      message.warning('中断请求发送失败，任务可能已结束');
    }
    // 清理本地状态 — SSE task:failed 事件会同步清理
    setRunningTaskId(null);
    setPhase(null);
    sessionStorage.removeItem('loop:taskId');
    sessionStorage.removeItem('loop:snapshot');
  }, [runningTaskId]);

  // 监听 SSE 事件更新 phase 显示（通过 window 事件，AutoLoopPanel dispatch 时同步广播）
  const updatePhase = useCallback((e) => {
    if (e.detail?.taskId === runningTaskId) {
      if (e.detail?.phase) setPhase(e.detail.phase);
      if (e.detail?.type === 'done' || e.detail?.type === 'failed') {
        setRunningTaskId(null);
        setPhase(null);
        sessionStorage.removeItem('loop:taskId');
        sessionStorage.removeItem('loop:snapshot');
      }
    }
  }, [runningTaskId]);

  // 注册/注销阶段监听
  useEffect(() => {
    window.addEventListener('loop:phase', updatePhase);
    return () => window.removeEventListener('loop:phase', updatePhase);
  }, [updatePhase]);

  if (runningTaskId) {
    return (
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1000 }}>
        <Space>
          <Tag color="processing" style={{ margin: 0 }}>
            <LoadingOutlined spin style={{ marginRight: 4 }} />
            {phase || '运行中'}
          </Tag>
          <Tooltip title="中断当前任务">
            <Button
              danger
              shape="circle"
              size="large"
              icon={<StopOutlined />}
              onClick={handleStop}
            />
          </Tooltip>
        </Space>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1000 }}>
      <Tooltip title={canStart ? '启动 Agent 闭环' : '请先输入资金方编码和接口文档'}>
        <Button
          type="primary"
          shape="circle"
          size="large"
          icon={loading ? <LoadingOutlined spin /> : <PlayCircleOutlined />}
          disabled={!canStart}
          loading={loading}
          onClick={handleStart}
          style={{ width: 48, height: 48 }}
        />
      </Tooltip>
    </div>
  );
}
