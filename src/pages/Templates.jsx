import { useEffect, useState } from 'react';
import { Table, Button, Space, Typography, Tag, Popconfirm, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getTemplates, deleteTemplate } from '../api';

export default function Templates() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const fetch = async () => {
    setLoading(true);
    const res = await getTemplates(1, 50);
    setData(res?.data?.records ?? []);
    setLoading(false);
  };
  useEffect(() => { fetch(); }, []);

  const onDelete = async (id) => {
    await deleteTemplate(id);
    message.success('Deleted');
    fetch();
  };

  const columns = [
    { title: 'Code', dataIndex: 'templateCode', key: 'code' },
    { title: 'Name', dataIndex: 'templateName', key: 'name' },
    {
      title: 'Type', dataIndex: 'templateType', key: 'type', width: 100,
      render: (v) => <Tag color={v === 'REQUEST' ? 'blue' : 'green'}>{v}</Tag>,
    },
    {
      title: 'Actions', key: 'act', width: 120,
      render: (_, r) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => nav(`/templates/${r.id}`)} />
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
        <Typography.Title level={4} style={{ margin: 0 }}>Templates</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => nav('/templates/new')}>
          New Template
        </Button>
      </div>
      <Table rowKey="id" columns={columns} dataSource={data} loading={loading}
        pagination={false} style={{ background: '#fff', borderRadius: 12 }} />
    </>
  );
}
