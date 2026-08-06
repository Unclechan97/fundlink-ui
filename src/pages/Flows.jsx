import { useEffect, useState } from 'react';
import { Table, Button, Space, Typography, Tag, Popconfirm, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SendOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getFlows, deleteFlow, publishFlow } from '../api';

export default function Flows() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const fetch = async () => {
    setLoading(true);
    const res = await getFlows(1, 50);
    setData(res?.data?.records ?? []);
    setLoading(false);
  };
  useEffect(() => { fetch(); }, []);

  const onDelete = async (id) => { await deleteFlow(id); message.success('Deleted'); fetch(); };
  const onPublish = async (id) => { await publishFlow(id); message.success('Published'); fetch(); };

  const columns = [
    { title: 'Code', dataIndex: 'flowCode', key: 'code' },
    { title: 'Name', dataIndex: 'flowName', key: 'name' },
    { title: 'Type', dataIndex: 'flowType', key: 'type', width: 100,
      render: (v) => {
        const colors = { CREDIT: 'purple', LOAN: 'blue', REPAYMENT: 'orange' };
        return <Tag color={colors[v] || 'default'}>{v}</Tag>;
      },
    },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 100,
      render: (v) => <Tag color={v === 1 ? 'green' : 'gold'}>{v === 1 ? 'Published' : 'Draft'}</Tag>,
    },
    {
      title: 'Actions', key: 'act', width: 170,
      render: (_, r) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => nav(`/flows/${r.id}`)} />
          {r.status !== 1 && (
            <Button type="link" size="small" icon={<SendOutlined />} onClick={() => onPublish(r.id)} />
          )}
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
        <Typography.Title level={4} style={{ margin: 0 }}>Flows</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => nav('/flows/new')}>
          New Flow
        </Button>
      </div>
      <Table rowKey="id" columns={columns} dataSource={data} loading={loading}
        pagination={false} style={{ background: '#fff', borderRadius: 12 }} />
    </>
  );
}
