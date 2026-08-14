import { useEffect, useState, useCallback } from 'react';
import { Table, Button, Space, Typography, Tag, Popconfirm, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getTemplates, deleteTemplate } from '../api';

export default function Templates() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const nav = useNavigate();

  const fetch = useCallback(async (page = 1, size = 10) => {
    setLoading(true);
    try {
      const res = await getTemplates(page, size);
      setData(res?.data?.records ?? []);
      setPagination(prev => ({ ...prev, current: page, pageSize: size, total: res?.data?.total ?? 0 }));
    } catch (err) {
      message.error('加载失败: ' + (err.message || '网络错误'));
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const onDelete = async (id) => {
    try {
      await deleteTemplate(id);
      message.success('Deleted');
      fetch(pagination.current, pagination.pageSize);
    } catch (err) {
      message.error('加载失败: ' + (err.message || '网络错误'));
    }
  };

  const onTableChange = (pag) => {
    fetch(pag.current, pag.pageSize);
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
        onChange={onTableChange}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total: pagination.total,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条`,
        }}
        style={{ background: '#fff', borderRadius: 12 }} />
    </>
  );
}
