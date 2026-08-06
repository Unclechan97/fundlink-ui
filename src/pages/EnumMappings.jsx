import { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Typography, Space, message, Tabs } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { getEnumMappings, createEnumMapping, deleteEnumMapping } from '../api';

export default function EnumMappings() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const fetch = async () => {
    setLoading(true);
    const res = await getEnumMappings();
    setData(res?.data?.records ?? []);
    setLoading(false);
  };
  useEffect(() => { fetch(); }, []);

  const onSave = async () => {
    const vals = await form.validateFields();
    await createEnumMapping(vals);
    message.success('Created');
    setOpen(false); form.resetFields(); fetch();
  };

  const onDelete = async (id) => { await deleteEnumMapping(id); fetch(); };

  // Group by enumType
  const grouped = {};
  data.forEach((d) => {
    if (!grouped[d.enumType]) grouped[d.enumType] = [];
    grouped[d.enumType].push(d);
  });

  const columns = [
    { title: 'Internal', dataIndex: 'internalValue', key: 'iv' },
    { title: 'External', dataIndex: 'externalValue', key: 'ev' },
    { title: 'Provider', dataIndex: 'providerId', key: 'pid', render: (v) => v ?? 'All' },
    {
      title: '', key: 'act', width: 50,
      render: (_, r) => (
        <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => onDelete(r.id)} />
      ),
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Enum Mappings</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />}
          onClick={() => { form.resetFields(); setOpen(true); }}>
          Add Mapping
        </Button>
      </div>
      {Object.keys(grouped).length === 0 ? (
        <Typography.Text type="secondary">No enum mappings defined yet.</Typography.Text>
      ) : (
        <Tabs items={Object.entries(grouped).map(([type, items]) => ({
          key: type, label: type,
          children: (
            <Table rowKey="id" columns={columns} dataSource={items}
              pagination={false} size="small" />
          ),
        }))} />
      )}
      <Modal title="New Enum Mapping" open={open} onOk={onSave}
        onCancel={() => setOpen(false)} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="enumType" label="Type" rules={[{ required: true }]}>
            <Input placeholder="ID_TYPE" />
          </Form.Item>
          <Form.Item name="internalValue" label="Internal Value" rules={[{ required: true }]}>
            <Input placeholder="01" />
          </Form.Item>
          <Form.Item name="externalValue" label="External Value" rules={[{ required: true }]}>
            <Input placeholder="ID_CARD" />
          </Form.Item>
          <Form.Item name="providerId" label="Provider ID (optional)">
            <Input placeholder="Leave blank for all providers" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
