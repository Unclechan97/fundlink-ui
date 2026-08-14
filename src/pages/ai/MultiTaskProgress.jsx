import { Typography, Space, Card } from 'antd';
import { sendDecision as apiSendDecision } from '../../api';
import TaskCard from './TaskCard';

const { Text } = Typography;

/**
 * 多接口闭环进度面板。
 * 父容器，渲染 N 张 TaskCard，每张独立轮询各自 taskId（SSE 已移除）。
 */
export default function MultiTaskProgress({ parentTaskId, subTasks, providerCode }) {
  const handleSendDecision = async (taskId, decision) => {
    try {
      await apiSendDecision(taskId, decision, null, '');
    } catch (e) {
      console.error('Send decision failed:', e);
    }
  };

  if (!subTasks || subTasks.length === 0) {
    return (
      <Card size="small" style={{ marginBottom: 16 }}>
        <Text type="secondary">没有子任务</Text>
      </Card>
    );
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <Card size="small" style={{ marginBottom: 12, background: '#f6ffed' }}>
        <Space>
          <Text strong>多接口闭环执行中</Text>
          <Text type="secondary">父任务: {parentTaskId}</Text>
          <Text type="secondary">共 {subTasks.length} 个接口</Text>
        </Space>
      </Card>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {subTasks.map(task => (
          <TaskCard
            key={task.taskId}
            taskId={task.taskId}
            interfaceId={task.interfaceId}
            interfaceName={task.interfaceName}
            onSendDecision={handleSendDecision}
          />
        ))}
      </div>
    </div>
  );
}
