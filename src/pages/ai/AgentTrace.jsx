import { useState } from 'react';
import { Card, Table, Tag, Typography, Timeline, Descriptions } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, SyncOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

const mockTraces = [
  { key:'1', traceId:'req-a1b2c3', agent:'RequirementAgent', step:'文档解析', status:'SUCCESS',
    latencyMs:1250, tokenInput:450, tokenOutput:320, model:'deepseek-chat', time:'2026-08-07 10:30' },
  { key:'2', traceId:'req-a1b2c3', agent:'RequirementAgent', step:'字段映射生成', status:'SUCCESS',
    latencyMs:2100, tokenInput:520, tokenOutput:480, model:'deepseek-chat', time:'2026-08-07 10:30' },
  { key:'3', traceId:'req-a1b2c3', agent:'RequirementAgent', step:'流程DSL生成', status:'SUCCESS',
    latencyMs:1800, tokenInput:380, tokenOutput:260, model:'deepseek-chat', time:'2026-08-07 10:31' },
  { key:'4', traceId:'diag-x1y2z3', agent:'DiagnosisAgent', step:'规则诊断', status:'SUCCESS',
    latencyMs:15, tokenInput:0, tokenOutput:0, model:'rule-engine', time:'2026-08-07 11:00' },
];

export default function AgentTrace() {
  const [traces] = useState(mockTraces);
  const [selected, setSelected] = useState(null);

  const columns = [
    { title:'Trace ID', dataIndex:'traceId', key:'traceId', render:v => <Text code>{v}</Text> },
    { title:'Agent', dataIndex:'agent', key:'agent', render:v => <Tag color="purple">{v}</Tag> },
    { title:'步骤', dataIndex:'step', key:'step' },
    { title:'状态', dataIndex:'status', key:'status',
      render:v => <Tag color={v==='SUCCESS'?'green':'red'} icon={v==='SUCCESS'?<CheckCircleOutlined />:<CloseCircleOutlined />}>{v}</Tag> },
    { title:'延迟(ms)', dataIndex:'latencyMs', key:'latencyMs' },
    { title:'Token(入/出)', key:'tokens',
      render:(_,r) => `${r.tokenInput}/${r.tokenOutput}` },
    { title:'时间', dataIndex:'time', key:'time' },
  ];

  return (
    <div style={{ maxWidth:1100, margin:'0 auto' }}>
      <Title level={3}><SyncOutlined /> Agent 追踪中心</Title>

      <Card style={{ marginBottom:16 }}>
        <Table dataSource={traces} columns={columns} pagination={false} size="small"
          onRow={r => ({ onClick:() => setSelected(r), style:{ cursor:'pointer' } })} />
      </Card>

      {selected && (
        <Card title={`Trace: ${selected.traceId}`} size="small">
          <Descriptions column={3} size="small">
            <Descriptions.Item label="Agent">{selected.agent}</Descriptions.Item>
            <Descriptions.Item label="步骤">{selected.step}</Descriptions.Item>
            <Descriptions.Item label="模型">{selected.model}</Descriptions.Item>
            <Descriptions.Item label="延迟">{selected.latencyMs}ms</Descriptions.Item>
            <Descriptions.Item label="Token输入">{selected.tokenInput}</Descriptions.Item>
            <Descriptions.Item label="Token输出">{selected.tokenOutput}</Descriptions.Item>
          </Descriptions>
          <Timeline style={{ marginTop:16 }}
            items={[
              { color:'green', children:'Agent 接收任务' },
              { color:'blue', children:`调用 LLM: ${selected.model}` },
              { color:'green', children:'解析响应成功' },
            ]} />
        </Card>
      )}
    </div>
  );
}
