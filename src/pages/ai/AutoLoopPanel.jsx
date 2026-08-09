import { useReducer, useEffect, useRef, useCallback, useState } from 'react';
import { Card, Steps, Collapse, Button, Space, Tag, Typography, Alert, message, Spin, Modal, Table, Input } from 'antd';
import {
  LoadingOutlined, CheckCircleFilled, CloseCircleFilled,
  PlayCircleOutlined, StopOutlined, RedoOutlined,
  ForwardOutlined, EditOutlined, ReloadOutlined,
} from '@ant-design/icons';
import { createLoop, getLoopTask, sendDecision, getLoopResult, cancelLoop } from '../../api';

const { Text } = Typography;

// ── sessionStorage key ──
const STORAGE_KEY = 'autoloop:snapshot';

function loadSnapshot() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveSnapshot(snap) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
  } catch { /* ignore */ }
}

function clearSnapshot() {
  sessionStorage.removeItem(STORAGE_KEY);
}

// ── 阶段定义 ──
const PHASES = ['ANALYZE', 'VALIDATE', 'DRYRUN'];
const STEP_ITEMS = [
  { title: '解析文档', description: 'AI 解析接口文档' },
  { title: '验证模板', description: '生成数据并验证' },
  { title: '干跑测试', description: 'Mock 注入真实调用' },
  { title: '发布流程', description: '写入 FundLink' },
];

// ── 初始状态 ──
const initialState = {
  status: 'ready',         // 'ready' | 'creating' | 'running' | 'waiting_decision' | 'completed' | 'failed'
  taskId: null,
  taskNo: null,
  round: 0,
  maxRounds: 3,
  currentStep: -1,         // 当前高亮的步骤索引
  phases: {
    ANALYZE: { status: 'pending', messages: [] },
    VALIDATE: { status: 'pending', messages: [] },
    DRYRUN: { status: 'pending', messages: [] },
  },
  decision: null,
  decisionSent: false,
  result: null,
  sseError: null,
};

// ── Phase → 步骤索引映射 ──
const PHASE_TO_STEP = { ANALYZE: 0, VALIDATE: 1, DRYRUN: 2 };

// ── Reducer ──
function reducer(state, action) {
  switch (action.type) {
    case 'CREATING':
      return { ...initialState, status: 'creating' };

    case 'INIT':
      return {
        ...state,
        status: 'running',
        taskId: action.taskId,
        taskNo: action.taskNo,
        phases: {
          ANALYZE: { status: 'pending', messages: [] },
          VALIDATE: { status: 'pending', messages: [] },
          DRYRUN: { status: 'pending', messages: [] },
        },
        sseError: null,
      };

    case 'PHASE_START': {
      const idx = PHASE_TO_STEP[action.phase];
      return {
        ...state,
        round: action.round,
        maxRounds: action.maxRounds,
        currentStep: idx ?? state.currentStep,
        status: 'running',
        phases: {
          ...state.phases,
          [action.phase]: {
            ...state.phases[action.phase],
            status: 'active',
            messages: [],
          },
        },
      };
    }

    case 'PHASE_PROGRESS':
      return {
        ...state,
        phases: {
          ...state.phases,
          [action.phase]: {
            ...state.phases[action.phase],
            messages: [
              ...state.phases[action.phase].messages,
              { type: 'progress', text: action.message, ts: Date.now() },
            ],
          },
        },
      };

    case 'PHASE_COMPLETE': {
      const ci = PHASE_TO_STEP[action.phase];
      return {
        ...state,
        currentStep: ci != null ? ci + 1 : state.currentStep,
        phases: {
          ...state.phases,
          [action.phase]: {
            ...state.phases[action.phase],
            status: 'done',
            messages: [
              ...state.phases[action.phase].messages,
              { type: 'complete', text: action.summary, ts: Date.now() },
            ],
          },
        },
      };
    }

    case 'PHASE_ERROR': {
      const ei = PHASE_TO_STEP[action.phase];
      return {
        ...state,
        currentStep: ei != null ? ei : state.currentStep,
        phases: {
          ...state.phases,
          [action.phase]: {
            ...state.phases[action.phase],
            status: 'error',
            messages: [
              ...state.phases[action.phase].messages,
              { type: 'error', text: action.message, ts: Date.now() },
            ],
          },
        },
      };
    }

    case 'DECISION_REQUIRED':
      return {
        ...state,
        status: 'waiting_decision',
        decision: { type: action.decisionType, summary: action.summary, options: action.options },
        decisionSent: false,
      };

    case 'DECISION_SENT':
      return { ...state, decisionSent: true };

    case 'TASK_COMPLETE':
      return {
        ...state,
        status: 'completed',
        currentStep: 4,
        result: { type: 'success', summary: action.summary },
      };

    case 'TASK_FAILED':
      return {
        ...state,
        status: 'failed',
        result: { type: 'failed', error: action.error, rounds: action.rounds },
        // 清除所有阶段 active 状态，停止转圈
        phases: Object.fromEntries(
          Object.entries(state.phases).map(([k, v]) => [k, { ...v, status: v.status === 'active' ? 'pending' : v.status }])
        ),
      };

    case 'SSE_ERROR':
      return { ...state, sseError: 'SSE 连接中断，任务在后台继续运行' };

    default:
      return state;
  }
}

// ── 决策按钮配置 ──
const DECISION_BTN_CFG = {
  PUBLISH:        { color: '#22c55e', icon: <CheckCircleFilled />, label: '发布' },
  RETRY:          { color: '#3b82f6', icon: <RedoOutlined />,     label: '重试' },
  SKIP:           { color: '#f59e0b', icon: <ForwardOutlined />,  label: '跳过' },
  EDIT_AND_RETRY: { color: '#8b5cf6', icon: <EditOutlined />,     label: '编辑后重试' },
  ABORT:          { color: '#ef4444', icon: <StopOutlined />,      label: '放弃' },
};

// ── 阶段状态图标 ──
function PhaseIcon({ status }) {
  if (status === 'active') return <LoadingOutlined style={{ color: '#3b82f6' }} />;
  if (status === 'done')   return <CheckCircleFilled style={{ color: '#22c55e' }} />;
  if (status === 'error')  return <CloseCircleFilled style={{ color: '#ef4444' }} />;
  return <span style={{ color: '#d9d9d9', fontSize: 12 }}>○</span>;
}

// ═══════════════════════════════════════════════════════════
// AutoLoopPanel 组件
// ═══════════════════════════════════════════════════════════
export default function AutoLoopPanel({ documentText, providerCode, flowType = 'LOAN' }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const esRef = useRef(null);

  // ── 编辑弹窗状态 ──
  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editMappings, setEditMappings] = useState([]);

  // ── SSE 连接 ──
  const connectSSE = useCallback((taskId) => {
    if (esRef.current) {
      esRef.current.close();
    }

    const url = `/api/ai/loop/${taskId}/stream`;
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener('phase:start', (e) => {
      const d = JSON.parse(e.data);
      dispatch({ type: 'PHASE_START', phase: d.phase, round: d.round, maxRounds: d.maxRounds });
    });

    es.addEventListener('phase:progress', (e) => {
      const d = JSON.parse(e.data);
      dispatch({ type: 'PHASE_PROGRESS', phase: d.phase, message: d.message });
    });

    es.addEventListener('phase:complete', (e) => {
      const d = JSON.parse(e.data);
      dispatch({ type: 'PHASE_COMPLETE', phase: d.phase, summary: d.summary });
    });

    es.addEventListener('phase:error', (e) => {
      const d = JSON.parse(e.data);
      dispatch({ type: 'PHASE_ERROR', phase: d.phase, message: d.message });
    });

    es.addEventListener('decision_required', (e) => {
      const d = JSON.parse(e.data);
      dispatch({ type: 'DECISION_REQUIRED', decisionType: d.type, summary: d.summary, options: d.options });
    });

    es.addEventListener('task:complete', (e) => {
      const d = JSON.parse(e.data);
      dispatch({ type: 'TASK_COMPLETE', summary: d.summary });
      es.close();
    });

    es.addEventListener('task:failed', (e) => {
      const d = JSON.parse(e.data);
      dispatch({ type: 'TASK_FAILED', error: d.error, rounds: d.rounds });
      es.close();
    });

    es.addEventListener('ping', () => {
      // 心跳帧 — 无需处理，仅保持连接活跃
    });

    es.onerror = () => {
      // 只在非终态时报告连接错误
      dispatch({ type: 'SSE_ERROR' });
    };

    return es;
  }, []);

  // ── 启动闭环 ──

  const handleStop = useCallback(async () => {
    if (!state.taskId) return;
    try {
      await cancelLoop(state.taskId);
      dispatch({ type: 'TASK_FAILED', error: '用户中断', rounds: state.round });
      clearSnapshot();
      message.success('任务已中断');
    } catch (e) {
      message.warning('中断请求发送失败');
    }
  }, [state.taskId, state.round]);

  const handleStart = useCallback(async () => {
    dispatch({ type: 'CREATING' });
    try {
      const res = await createLoop(documentText, providerCode, flowType);
      const { taskId, taskNo } = res.data;
      dispatch({ type: 'INIT', taskId, taskNo });
      connectSSE(taskId);
    } catch (err) {
      const errMsg = err?.response?.data?.msg || err?.message || '未知错误';
      message.error('创建任务失败: ' + errMsg);
      dispatch({ type: 'TASK_FAILED', error: errMsg, rounds: 0 });
    }
  }, [documentText, providerCode, flowType, connectSSE]);

  // ── 持久化：状态变化时保存快照 ──
  useEffect(() => {
    const terminal = state.status === 'completed' || state.status === 'failed';
    if (state.taskId && !terminal) {
      saveSnapshot({
        taskId: state.taskId,
        taskNo: state.taskNo,
        round: state.round,
        maxRounds: state.maxRounds,
        status: state.status,
        documentText,
      });
    }
    if (terminal) {
      clearSnapshot();
    }
  }, [state.taskId, state.taskNo, state.round, state.maxRounds, state.status, documentText]);

  // ── 挂载时检查是否有未完成的任务，自动恢复 ──
  const hasCheckedSnapshot = useRef(false);
  useEffect(() => {
    if (hasCheckedSnapshot.current) return;
    hasCheckedSnapshot.current = true;

    const snap = loadSnapshot();
    if (!snap || !snap.taskId) return;
    // 只恢复非终态的任务（正常情况不会存在，防御性检查）
    if (snap.status === 'completed' || snap.status === 'failed') {
      clearSnapshot();
      return;
    }

    // 检查文档是否一致（不同文档不应该恢复旧任务）
    if (snap.documentText !== documentText) {
      clearSnapshot();
      return;
    }

    // 异步恢复
    (async () => {
      dispatch({ type: 'CREATING' });
      try {
        const res = await getLoopTask(snap.taskId);
        const t = res.data;
        if (t.status === 'PUBLISHED') {
          clearSnapshot();
          dispatch({ type: 'TASK_COMPLETE', summary: `流程已发布 (Round ${t.currentRound || 0 + 1}/${t.maxRounds})` });
          return;
        }
        if (t.status === 'FAILED' || t.status === 'ABORTED') {
          clearSnapshot();
          dispatch({ type: 'TASK_FAILED', error: '任务已' + (t.status === 'ABORTED' ? '终止' : '失败'), rounds: t.currentRound || 0 });
          return;
        }
        // 恢复基本状态
        dispatch({ type: 'INIT', taskId: snap.taskId, taskNo: snap.taskNo });
        const restoredRound = t.currentRound ?? snap.round;
        const restoredMax = t.maxRounds ?? snap.maxRounds;
        dispatch({
          type: 'PHASE_START',
          phase: t.status || 'ANALYZE',
          round: restoredRound,
          maxRounds: restoredMax,
        });
        // 重连 SSE
        connectSSE(snap.taskId);

        // 如果后端在等待决策，重新显示决策面板（原 decision_required 事件已发给旧连接）
        // 无法区分 PUBLISH_CONFIRM 还是 RECOVERY，所以提供完整选项
        if (t.status === 'DECISION_POINT') {
          const allOptions = t.currentRound >= t.maxRounds
            ? ['SKIP', 'EDIT_AND_RETRY', 'ABORT']
            : ['PUBLISH', 'RETRY', 'SKIP', 'EDIT_AND_RETRY', 'ABORT'];
          dispatch({
            type: 'DECISION_REQUIRED',
            decisionType: 'RESTORE',
            summary: '检测到之前的任务正在等待决策，请选择操作继续。',
            options: allOptions,
          });
        }
        message.success('已恢复之前的任务');
      } catch (err) {
        clearSnapshot();
        dispatch({ type: 'TASK_FAILED', error: '恢复任务失败: ' + (err.message || ''), rounds: 0 });
      }
    })();
  }, []); // 只在挂载时执行一次
  useEffect(() => {
    return () => {
      if (esRef.current) {
        esRef.current.close();
      }
    };
  }, []);

  // ── 发送决策 ──
  const handleDecision = async (decision) => {
    if (state.decisionSent || !state.taskId) return;

    // EDIT_AND_RETRY — 打开编辑弹窗
    if (decision === 'EDIT_AND_RETRY') {
      setEditLoading(true);
      setEditOpen(true);
      try {
        const res = await getLoopResult(state.taskId);
        const data = res.data;
        const mappings = (data.fieldMappings || []).map((m, i) => ({ ...m, key: i }));
        setEditMappings(mappings);
      } catch (err) {
        message.error('获取编辑数据失败: ' + (err.message || ''));
        setEditOpen(false);
      } finally {
        setEditLoading(false);
      }
      return;
    }

    // 其他决策 — 直接发送
    dispatch({ type: 'DECISION_SENT' });
    try {
      await sendDecision(state.taskId, decision);
    } catch (err) {
      const errMsg = err?.response?.data?.msg || err?.message || '未知错误';
      message.error('决策发送失败: ' + errMsg);
      dispatch({ type: 'DECISION_REQUIRED', decisionType: state.decision?.type, summary: state.decision?.summary, options: state.decision?.options });
    }
  };

  // ── 提交编辑后的结果 ──
  const handleEditSubmit = async () => {
    dispatch({ type: 'DECISION_SENT' });
    setEditOpen(false);
    try {
      const editedResult = {
        fieldMappings: editMappings.map(({ key, ...m }) => m),
      };
      await sendDecision(state.taskId, 'EDIT_AND_RETRY', editedResult, '人工修正配置');
    } catch (err) {
      const errMsg = err?.response?.data?.msg || err?.message || '未知错误';
      message.error('提交失败: ' + errMsg);
      dispatch({ type: 'DECISION_REQUIRED', decisionType: state.decision?.type, summary: state.decision?.summary, options: state.decision?.options });
    }
  };

  // ── 重新连接 ──
  const handleReconnect = async () => {
    if (!state.taskId) return;
    try {
      const res = await getLoopTask(state.taskId);
      const t = res.data;
      message.info(`任务状态: ${t.status}, 当前轮次: ${t.currentRound}/${t.maxRounds}`);
      dispatch({ type: 'SSE_ERROR', error: null });  // clear error
      connectSSE(state.taskId);
    } catch (err) {
      message.error('重连失败: ' + (err.message || ''));
    }
  };

  // ── 计算 Steps 当前状态 ──
  const stepStatus = (idx) => {
    if (state.status === 'failed') {
      return idx < state.currentStep ? 'finish' : idx === state.currentStep ? 'error' : 'wait';
    }
    if (idx < state.currentStep) return 'finish';
    if (idx === state.currentStep) {
      // 检查是否有阶段出错
      const ph = ['ANALYZE', 'VALIDATE', 'DRYRUN'][idx];
      if (ph && state.phases[ph]?.status === 'error') return 'error';
      return 'process';
    }
    return 'wait';
  };

  // ── 折叠面板内容 ──
  const collapseItems = PHASES.map((phase) => {
    const p = state.phases[phase];
    const labels = { ANALYZE: '解析文档', VALIDATE: '验证模板', DRYRUN: '干跑测试' };
    return {
      key: phase,
      label: (
        <Space>
          <PhaseIcon status={p.status} />
          <span>{labels[phase]}</span>
          {p.messages.length > 0 && <Tag>{p.messages.length}</Tag>}
        </Space>
      ),
      children: p.messages.length === 0
        ? <Text type="secondary">等待中...</Text>
        : (
          <div style={{ maxHeight: 200, overflow: 'auto', fontSize: 13 }}>
            {p.messages.map((m, i) => (
              <div key={i} style={{
                padding: '4px 0',
                color: m.type === 'error' ? '#ef4444' : m.type === 'complete' ? '#22c55e' : '#666',
              }}>
                <span style={{ marginRight: 6 }}>
                  {m.type === 'error' ? '✗' : m.type === 'complete' ? '✓' : '·'}
                </span>
                {m.text}
              </div>
            ))}
          </div>
        ),
    };
  });

  // ── 渲染 ──
  const isTerminal = state.status === 'completed' || state.status === 'failed';
  const isWaiting = state.status === 'waiting_decision';
  const isReady = state.status === 'ready';
  const isCreating = state.status === 'creating';
  const isIdle = isReady || isCreating;

  return (
    <Card
      title={
        <Space>
          <span>🔄 自动闭环</span>
          {state.taskNo && <Tag color="blue">{state.taskNo}</Tag>}
          {state.status === 'running' && (
            <Tag color="processing">Round {state.round}/{state.maxRounds}</Tag>
          )}
        </Space>
      }
      style={{ marginBottom: 16 }}
    >
      {/* ── 就绪 / 创建中 ── */}
      {isIdle && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          {isReady ? (
            <>
              <p style={{ color: '#888', marginBottom: 16 }}>
                已填入 {providerCode} 的接口文档（{documentText.length} 字符），点击下方按钮启动自动闭环流程。
              </p>
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={handleStart}
              >
                开始闭环
              </Button>
            </>
          ) : (
            <>
              <LoadingOutlined style={{ fontSize: 32, color: '#3b82f6' }} />
              <p style={{ marginTop: 12, color: '#888' }}>正在创建任务...</p>
            </>
          )}
        </div>
      )}

      {/* ── 运行中：中断按钮 ── */}
      {state.status === 'running' && (
        <div style={{ textAlign: 'center', padding: '12px 0' }}>
          <Button danger icon={<StopOutlined />} onClick={handleStop}>中断任务</Button>
        </div>
      )}

      {/* ── 进度条 ── */}
      {!isIdle && (
        <Steps
          current={state.currentStep}
          status={state.status === 'failed' ? 'error' : state.status === 'completed' ? 'finish' : 'process'}
          size="small"
          style={{ marginBottom: 24 }}
          items={STEP_ITEMS.map((item, idx) => ({
            ...item,
            status: stepStatus(idx),
          }))}
        />
      )}

      {/* ── 阶段日志 ── */}
      {!isIdle && (
        <Collapse
          accordion
          size="small"
          style={{ marginBottom: 16, background: '#fafafa' }}
          items={collapseItems}
          defaultActiveKey={PHASES.find(p => state.phases[p]?.status === 'active')}
        />
      )}

      {/* ── SSE 连接错误 ── */}
      {state.sseError && !isTerminal && (
        <Alert
          type="warning"
          message={state.sseError}
          action={
            <Button size="small" icon={<ReloadOutlined />} onClick={handleReconnect}>
              重新连接
            </Button>
          }
          style={{ marginBottom: 16 }}
          showIcon
        />
      )}

      {/* ── 决策面板 ── */}
      {isWaiting && state.decision && (
        <Card
          size="small"
          style={{ background: '#fffbe6', border: '1px solid #ffe58f', marginBottom: 16 }}
          title={
            <Space>
              <span>⏸</span>
              <span>需要你的决策</span>
              {state.decision.type === 'PUBLISH_CONFIRM'
                ? <Tag color="green">验证通过</Tag>
                : state.decision.type === 'RESTORE'
                ? <Tag color="blue">任务恢复</Tag>
                : <Tag color="orange">问题恢复</Tag>
              }
            </Space>
          }
        >
          <Alert
            type={state.decision.type === 'PUBLISH_CONFIRM' ? 'success' : state.decision.type === 'RESTORE' ? 'info' : 'warning'}
            message={state.decision.summary}
            style={{ marginBottom: 12 }}
            showIcon
          />
          <Space wrap>
            {(state.decision.options || []).map((opt) => {
              const cfg = DECISION_BTN_CFG[opt] || {};
              return (
                <Button
                  key={opt}
                  type={opt === 'PUBLISH' ? 'primary' : 'default'}
                  danger={opt === 'ABORT'}
                  icon={cfg.icon}
                  disabled={state.decisionSent}
                  loading={state.decisionSent}
                  onClick={() => handleDecision(opt)}
                  style={{ borderColor: cfg.color, color: opt === 'PUBLISH' || opt === 'ABORT' ? undefined : cfg.color }}
                >
                  {cfg.label || opt}
                </Button>
              );
            })}
          </Space>
        </Card>
      )}

      {/* ── 完成状态 ── */}
      {state.status === 'completed' && state.result && (
        <Alert
          type="success"
          message="任务完成"
          description={state.result.summary}
          showIcon
          icon={<CheckCircleFilled />}
        />
      )}

      {/* ── 失败状态 ── */}
      {state.status === 'failed' && state.result && (
        <Alert
          type="error"
          message="任务失败"
          description={
            <span>
              {state.result.error}
              {state.result.rounds > 0 && (
                <Tag style={{ marginLeft: 8 }}>共 {state.result.rounds} 轮</Tag>
              )}
            </span>
          }
          showIcon
          icon={<CloseCircleFilled />}
        />
      )}

      {/* ── 编辑弹窗 (EDIT_AND_RETRY) ── */}
      <Modal
        title="编辑配置后重新提交"
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={handleEditSubmit}
        okText="提交修改"
        cancelText="取消"
        width={800}
        confirmLoading={state.decisionSent}
      >
        <Spin spinning={editLoading}>
          <p style={{ color: '#888', marginBottom: 12 }}>
            修改下方字段映射后提交，系统将使用修改后的配置重新验证和干跑。
          </p>
          <Table
            dataSource={editMappings}
            size="small"
            pagination={false}
            rowKey="key"
            columns={[
              { title: '资金方字段', dataIndex: 'fundField', width: 130,
                render: (v, _, idx) => (
                  <Input size="small" value={v || ''}
                    onChange={e => {
                      const next = [...editMappings];
                      next[idx] = { ...next[idx], fundField: e.target.value };
                      setEditMappings(next);
                    }} />
                )},
              { title: '内部路径', dataIndex: 'sourcePath', width: 150,
                render: (v, _, idx) => (
                  <Input size="small" value={v || ''}
                    onChange={e => {
                      const next = [...editMappings];
                      next[idx] = { ...next[idx], sourcePath: e.target.value };
                      setEditMappings(next);
                    }} />
                )},
              { title: '转换函数', dataIndex: 'transform', width: 100,
                render: (v, _, idx) => (
                  <Input size="small" value={v || ''}
                    onChange={e => {
                      const next = [...editMappings];
                      next[idx] = { ...next[idx], transform: e.target.value };
                      setEditMappings(next);
                    }} />
                )},
              { title: '置信度', dataIndex: 'confidence', width: 70,
                render: v => <Tag color={v > 0.8 ? 'green' : 'orange'}>{Math.round((v || 0) * 100)}%</Tag> },
            ]}
          />
        </Spin>
      </Modal>
    </Card>
  );
}
