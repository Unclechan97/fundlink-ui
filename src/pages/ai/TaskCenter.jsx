import { useState } from 'react';
import { Card, Table, Tag, Progress, Typography, Steps } from 'antd';
import { CheckCircleOutlined, SyncOutlined, ClockCircleOutlined } from '@ant-design/icons';

const { Title } = Typography;

const mockTasks = [
  { key:'1', provider:'工银金融 (FUND_A)', flowType:'LOAN', status:'done', phase:'上线完成',
    mappings:38, flowNodes:10, testCases:20, progress:100 },
  { key:'2', provider:'招商资本 (FUND_B)', flowType:'LOAN', status:'testing', phase:'测试中',
    mappings:25, flowNodes:8, testCases:15, progress:75 },
  { key:'3', provider:'新建银行 (FUND_C)', flowType:'CREDIT', status:'config', phase:'配置生成',
    mappings:12, flowNodes:0, testCases:0, progress:30 },
];

const statusMap = {
  done: { color:'green', icon:<CheckCircleOutlined /> },
  testing: { color:'blue', icon:<SyncOutlined spin /> },
  config: { color:'orange', icon:<ClockCircleOutlined /> },
};

export default function TaskCenter() {
  const [tasks] = useState(mockTasks);

  const columns = [
    { title:'资金方', dataIndex:'provider', key:'provider' },
    { title:'业务类型', dataIndex:'flowType', key:'flowType', render:v => <Tag>{v}</Tag> },
    { title:'当前阶段', dataIndex:'phase', key:'phase',
      render:(_,r) => <Tag color={statusMap[r.status].color} icon={statusMap[r.status].icon}>{r.phase}</Tag> },
    { title:'字段映射', dataIndex:'mappings', key:'mappings', render:v => <Tag>{v}条</Tag> },
    { title:'流程节点', dataIndex:'flowNodes', key:'flowNodes', render:v => <Tag>{v}个</Tag> },
    { title:'测试用例', dataIndex:'testCases', key:'testCases', render:v => <Tag>{v}条</Tag> },
    { title:'进度', dataIndex:'progress', key:'progress',
      render:v => <Progress percent={v} size="small" /> },
  ];

  return (
    <div style={{ maxWidth:1100, margin:'0 auto' }}>
      <Title level={3}>接入任务中心</Title>
      <Card style={{ marginBottom:16 }}>
        <Steps current={1} size="small" style={{ marginBottom:24 }}
          items={[
            { title:'需求理解', description:'AI 解析接口文档' },
            { title:'配置生成', description:'字段映射 + 流程DSL' },
            { title:'测试验证', description:'Mock 数据 + 测试用例' },
            { title:'上线运行', description:'发布到生产环境' },
          ]} />
        <Table dataSource={tasks} columns={columns} pagination={false} size="small" />
      </Card>
    </div>
  );
}
