import { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, Switch, Typography, Space, message, Popconfirm, Tag } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, BugOutlined } from '@ant-design/icons';
import { getMockRules, createMockRule, updateMockRule, deleteMockRule, toggleMockRule, debugMock } from '../api';
import Editor from '@monaco-editor/react';

export default function MockRules() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugResult, setDebugResult] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();
  const [debugForm] = Form.useForm();

  const fetch = async () => {
    setLoading(true);
    const res = await getMockRules(1, 50);
    setData(res?.data?.records ?? []);
    setLoading(false);
  };
  useEffect(() => { fetch(); }, []);

  const onSave = async () => {
    const vals = await form.validateFields();
    if (editing) { await updateMockRule(editing.id, vals); message.success('Updated'); }
    else { await createMockRule(vals); message.success('Created'); }
    setOpen(false); setEditing(null); form.resetFields(); fetch();
  };

  const onDelete = async (id) => { await deleteMockRule(id); fetch(); };
  const onToggle = async (id) => { await toggleMockRule(id); fetch(); };

  const onDebug = async () => {
    const vals = await debugForm.validateFields();
    try {
      const res = await debugMock({ sourceCode: vals.sourceCode, requestParams: JSON.parse(vals.requestParams || '{}') });
      setDebugResult(res?.data);
      setDebugOpen(true);
    } catch { message.error('Debug failed'); }
  };

  const columns = [
    { title: 'Name', dataIndex: 'ruleName', key: 'name' },
    { title: 'Source', dataIndex: 'sourceCode', key: 'src', width: 100 },
    {
      title: 'Match', dataIndex: 'matchExpr', key: 'match', ellipsis: true,
      render: (v) => v ? <Tag color="blue">{v}</Tag> : <Tag>Default</Tag>,
    },
    {
      title: 'Status', dataIndex: 'enabled', key: 'st', width: 80,
      render: (v, r) => <Switch size="small" checked={v === 1} onChange={() => onToggle(r.id)} />,
    },
    {
      title: 'Actions', key: 'act', width: 120,
      render: (_, r) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />}
            onClick={() => { setEditing(r); form.setFieldsValue(r); setOpen(true); }} />
          <Popconfirm title="Delete?" onConfirm={() => onDelete(r.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Mock Rules</Typography.Title>
        <Space>
          <Button icon={<BugOutlined />} onClick={onDebug}>Debug</Button>
          <Button type="primary" icon={<PlusOutlined />}
            onClick={() => { setEditing(null); form.resetFields(); setOpen(true); }}>
            Add Rule
          </Button>
        </Space>
      </div>
      <Table rowKey="id" columns={columns} dataSource={data} loading={loading}
        pagination={false} style={{ background: '#fff', borderRadius: 12 }} />

      <Modal title={editing ? 'Edit Rule' : 'New Rule'} open={open} width={600}
        onOk={onSave} onCancel={() => setOpen(false)} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="ruleName" label="Name" rules={[{ required: true }]}>
            <Input placeholder="Risk - Default" />
          </Form.Item>
          <Form.Item name="sourceCode" label="Source Code" rules={[{ required: true }]}>
            <Input placeholder="RISK" />
          </Form.Item>
          <Form.Item name="matchExpr" label="Match Expression (SpEL)">
            <Input placeholder="#root.request.amount > 50000 (leave blank for default)" />
          </Form.Item>
          <Form.Item name="responseJson" label="Response JSON" rules={[{ required: true }]}>
            <Editor height="200px" language="json" theme="vs-light"
              value={form.getFieldValue('responseJson')}
              onChange={(v) => form.setFieldsValue({ responseJson: v })} />
          </Form.Item>
          <Form.Item name="delayMs" label="Delay (ms)">
            <Input type="number" placeholder="0" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="Debug Mock" open={debugOpen} width={600}
        onCancel={() => setDebugOpen(false)} footer={null}>
        <Form form={debugForm} layout="vertical">
          <Form.Item name="sourceCode" label="Source Code" rules={[{ required: true }]}>
            <Input placeholder="RISK" />
          </Form.Item>
          <Form.Item name="requestParams" label="Request Params (JSON)">
            <Input.TextArea rows={3} placeholder='{"amount": 100000}' />
          </Form.Item>
          <Button type="primary" onClick={onDebug}>Run</Button>
        </Form>
        {debugResult && (
          <div style={{ marginTop: 16, padding: 16, background: '#f5f5f5', borderRadius: 8 }}>
            <Typography.Text strong>Matched: </Typography.Text>
            <Tag color="green">{debugResult.matchedRule}</Tag>
            <pre style={{ marginTop: 8 }}>{debugResult.responseJson}</pre>
          </div>
        )}
      </Modal>
    </>
  );
}
