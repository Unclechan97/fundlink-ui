import { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Space, Typography, message, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { getProviders, createProvider, updateProvider, deleteProvider } from '../api';

export default function Providers() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  const fetch = async () => {
    setLoading(true);
    try {
      const res = await getProviders(1, 50);
      setData(res?.data?.records ?? []);
    } catch (err) {
      message.error('加载失败: ' + (err.message || '网络错误'));
    }
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  const onSave = async () => {
    const vals = await form.validateFields();
    try {
      if (editing) {
        await updateProvider(editing.id, vals);
        message.success('Updated');
      } else {
        await createProvider(vals);
        message.success('Created');
      }
      setOpen(false); setEditing(null); form.resetFields(); fetch();
    } catch (err) {
      message.error('加载失败: ' + (err.message || '网络错误'));
    }
  };

  const onDelete = async (id) => {
    try {
      await deleteProvider(id);
      message.success('Deleted');
      fetch();
    } catch (err) {
      message.error('加载失败: ' + (err.message || '网络错误'));
    }
  };

  const columns = [
    { title: 'Code', dataIndex: 'providerCode', key: 'code' },
    { title: 'Name', dataIndex: 'providerName', key: 'name' },
    { title: 'Base URL', dataIndex: 'baseUrl', key: 'url', ellipsis: true },
    { title: 'Mock URL', dataIndex: 'mockUrl', key: 'mock', ellipsis: true },
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
        <Typography.Title level={4} style={{ margin: 0 }}>Providers</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />}
          onClick={() => { setEditing(null); form.resetFields(); setOpen(true); }}>
          Add Provider
        </Button>
      </div>
      <Table rowKey="id" columns={columns} dataSource={data} loading={loading}
        pagination={false} style={{ background: '#fff', borderRadius: 12 }} />
      <Modal title={editing ? 'Edit Provider' : 'New Provider'} open={open}
        onOk={onSave} onCancel={() => setOpen(false)} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="providerCode" label="Code" rules={[{ required: true }]}>
            <Input placeholder="e.g. FUND_A" />
          </Form.Item>
          <Form.Item name="providerName" label="Name" rules={[{ required: true }]}>
            <Input placeholder="e.g. Fund Provider A" />
          </Form.Item>
          <Form.Item name="baseUrl" label="Base URL">
            <Input placeholder="https://fund-a.com/api" />
          </Form.Item>
          <Form.Item name="mockUrl" label="Mock URL">
            <Input placeholder="http://localhost:8080/api/mock/FUND_A" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
