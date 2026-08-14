import { useReducer, useCallback } from 'react';
import { Card, Steps, Collapse, Tag, Button, Space, Alert, Typography } from 'antd';
import { LoadingOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import usePollingTask from '../../hooks/usePollingTask';

const { Text, Paragraph } = Typography;

const STEP_ITEMS = [
  { title: '解析文档', key: 'ANALYZE' },
  { title: '验证模板', key: 'VALIDATE' },
  { title: '干跑测试', key: 'DRYRUN' },
  { title: '发布流程', key: 'PUBLISH' },
];

const STEP_INDEX = { ANALYZE: 0, VALIDATE: 1, DRYRUN: 2, PUBLISH: 3 };
const PHASE_STATUSES = ['ANALYZE', 'VALIDATE', 'DRYRUN'];

const DECISION_CFG = {
  PUBLISH: { color: 'green', text: '确认发布' },
  RETRY: { color: 'blue', text: '重试' },
  SKIP: { color: 'orange', text: '跳过' },
  ABORT: { color: 'red', text: '终止' },
  EDIT_AND_RETRY: { color: 'purple', text: '编辑后重试' },
};

function reducer(state, action) {
  if (state.status === 'completed' || state.status === 'failed') {
    if (!['TASK_COMPLETE', 'TASK_FAILED'].includes(action.type)) return state;
  }
  switch (action.type) {
    case 'INIT':
      return {
        ...state,
        status: 'running',
        currentStep: 0,
        phases: {
          ANALYZE: { status: 'active', messages: [] },
          VALIDATE: { status: 'pending', messages: [] },
          DRYRUN: { status: 'pending', messages: [] },
          PUBLISH: { status: 'pending', messages: [] },
        },
      };
    case 'PHASE_START':
      return {
        ...state,
        phases: {
          ...state.phases,
          [action.phase]: { ...state.phases[action.phase], status: 'active' },
        },
        currentStep: STEP_INDEX[action.phase] || state.currentStep,
      };
    case 'PHASE_PROGRESS':
      return {
        ...state,
        phases: {
          ...state.phases,
          [action.phase]: {
            ...state.phases[action.phase],
            messages: [...state.phases[action.phase].messages, action.message],
          },
        },
      };
    case 'PHASE_COMPLETE':
      return {
        ...state,
        phases: {
          ...state.phases,
          [action.phase]: { ...state.phases[action.phase], status: 'done', summary: action.summary },
        },
        currentStep: (STEP_INDEX[action.phase] || state.currentStep) + 1,
      };
    case 'PHASE_ERROR':
      return {
        ...state,
        phases: {
          ...state.phases,
          [action.phase]: { ...state.phases[action.phase], status: 'error', error: action.message },
        },
      };
    case 'DECISION_REQUIRED':
      return {
        ...state,
        status: 'waiting_decision',
        decision: { type: action.decisionType, summary: action.summary, options: action.options },
      };
    case 'DECISION_SENT':
      return { ...state, status: 'running', decisionSent: true, decision: null };
    case 'TASK_COMPLETE':
      return { ...state, status: 'completed', result: action.summary };
    case 'TASK_FAILED':
      return { ...state, status: 'failed', error: action.error };
    default:
      return state;
  }
}

/**
 * 多接口闭环的子任务卡片（任务 D，D3）。
 * SSE 已移除：每张卡片独立轮询各自 taskId（usePollingTask），
 * 决策上下文（type/summary/options）来自后端 GET /{taskId}（B5.2），
 * 决策提交仍走 onSendDecision 回调。
 */
export default function TaskCard({ taskId, interfaceId, interfaceName, onSendDecision }) {
  const [state, dispatch] = useReducer(reducer, {
    status: 'creating',
    currentStep: 0,
    phases: {
      ANALYZE: { status: 'pending', messages: [] },
      VALIDATE: { status: 'pending', messages: [] },
      DRYRUN: { status: 'pending', messages: [] },
      PUBLISH: { status: 'pending', messages: [] },
    },
    decision: null,
    decisionSent: false,
    result: null,
    error: null,
  });

  // ── 轮询 status → action 映射（与 AutoLoopPanel 同款粗粒度映射） ──
  const handleStatusChange = useCallback((newStatus, oldStatus, task) => {
    if (oldStatus == null) {
      dispatch({ type: 'INIT' });
    }
    if (PHASE_STATUSES.includes(oldStatus)) {
      dispatch({ type: 'PHASE_COMPLETE', phase: oldStatus, summary: '阶段完成' });
    }
    if (PHASE_STATUSES.includes(newStatus)) {
      dispatch({ type: 'PHASE_START', phase: newStatus });
      return;
    }
    switch (newStatus) {
      case 'DECISION_POINT':
        dispatch({
          type: 'DECISION_REQUIRED',
          decisionType: task.decisionType || 'RECOVERY_EXHAUSTED',
          summary: task.decisionSummary || '任务需要你的决策，请选择操作继续。',
          options: task.decisionOptions || [],
        });
        break;
      case 'PUBLISHED':
        dispatch({ type: 'TASK_COMPLETE', summary: `流程已发布 (共 ${(task.currentRound ?? 0) + 1}/${task.maxRounds ?? 3} 轮)` });
        break;
      case 'FAILED':
      case 'ABORTED':
        dispatch({
          type: 'TASK_FAILED',
          error: task.status === 'ABORTED' ? '任务已终止' : '任务失败',
        });
        break;
      default:
        break;
    }
  }, []);

  usePollingTask(taskId, {
    onStatusChange: handleStatusChange,
    onError: () => { /* 轮询自愈，静默重试 */ },
  });

  const handleDecision = (decision) => {
    if (onSendDecision) {
      onSendDecision(taskId, decision);
      dispatch({ type: 'DECISION_SENT' });
    }
  };

  const currentStep = state.currentStep;

  return (
    <Card
      size="small"
      title={
        <Space>
          {state.status === 'running' && <LoadingOutlined spin />}
          {state.status === 'completed' && <CheckCircleOutlined style={{ color: '#52c41a' }} />}
          {state.status === 'failed' && <CloseCircleOutlined style={{ color: '#ff4d4f' }} />}
          <Text strong>{interfaceName || `接口 ${interfaceId}`}</Text>
          <Tag color="blue" style={{ fontSize: 11 }}>{interfaceId}</Tag>
        </Space>
      }
      style={{ width: 340, marginBottom: 12 }}
      bodyStyle={{ padding: '8px 16px' }}
    >
      <Steps
        size="small"
        current={currentStep}
        status={state.status === 'failed' ? 'error' : state.status === 'completed' ? 'finish' : 'process'}
        items={STEP_ITEMS.map(({ title, key }) => ({
          title: (
            <span style={{ fontSize: 12 }}>
              {state.phases[key]?.status === 'error' ? '❌ ' : ''}
              {title}
            </span>
          ),
        }))}
        style={{ marginBottom: 8 }}
      />

      {/* Phase log（粗粒度：阶段完成状态） */}
      {Object.entries(state.phases).map(([phase, p]) => (
        p.messages?.length > 0 && (
          <Collapse key={phase} size="small" ghost items={[{
            key: phase,
            label: <Text style={{ fontSize: 12 }}>{STEP_ITEMS.find(s => s.key === phase)?.title || phase}</Text>,
            children: p.messages.map((msg, i) => (
              <Paragraph key={i} style={{ fontSize: 11, margin: '2px 0', color: '#666' }}>{msg}</Paragraph>
            )),
          }]} />
        )
      ))}

      {/* Decision panel（options 来自后端决策上下文接口） */}
      {state.status === 'waiting_decision' && state.decision && (
        <Alert
          type="warning"
          message={state.decision.summary}
          style={{ marginTop: 8 }}
          action={
            <Space size={4}>
              {(state.decision.options || []).map(opt => (
                <Button
                  key={opt}
                  size="small"
                  type={opt === 'PUBLISH' ? 'primary' : 'default'}
                  danger={opt === 'ABORT'}
                  onClick={() => handleDecision(opt)}
                >
                  {DECISION_CFG[opt]?.text || opt}
                </Button>
              ))}
            </Space>
          }
        />
      )}

      {/* Result */}
      {state.status === 'completed' && (
        <Alert type="success" message={state.result || '闭环完成'} style={{ marginTop: 8 }} showIcon />
      )}
      {state.status === 'failed' && (
        <Alert type="error" message={state.error || '闭环失败'} style={{ marginTop: 8 }} showIcon />
      )}
    </Card>
  );
}
