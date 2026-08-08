import { useEffect, useState } from 'react';
import { Table, Typography, Tabs, Tag, message } from 'antd';
import { getFlowInstances, getApiLogs } from '../api';

export default function Logs() {
  const [instances, setInstances] = useState([]);
  const [apiLogs, setApiLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetch = async () => {
    setLoading(true);
    try {
      const [ir, ar] = await Promise.all([getFlowInstances(1, 50), getApiLogs(1, 50)]);
      setInstances(ir?.data?.records ?? []);
      setApiLogs(ar?.data?.records ?? []);
    } catch (err) {
      message.error('加载失败: ' + (err.message || '网络错误'));
    }
    setLoading(false);
  };
  useEffect(() => { fetch(); }, []);

  const statusColors = { RUNNING: 'blue', SUCCESS: 'green', FAILED: 'red' };

  const flowCols = [
    { title: 'Instance No', dataIndex: 'instanceNo', key: 'no' },
    { title: 'Business No', dataIndex: 'businessNo', key: 'biz' },
    { title: 'Flow Code', dataIndex: 'flowCode', key: 'code' },
    {
      title: 'Status', dataIndex: 'status', key: 'st', width: 100,
      render: (v) => <Tag color={statusColors[v] || 'default'}>{v}</Tag>,
    },
    { title: 'Start', dataIndex: 'startTime', key: 'start', render: (v) => v?.substring(0, 19) },
    { title: 'End', dataIndex: 'endTime', key: 'end', render: (v) => v?.substring(0, 19) },
  ];

  const logCols = [
    { title: 'Type', dataIndex: 'callType', key: 'type', width: 110 },
    { title: 'URL', dataIndex: 'requestUrl', key: 'url', ellipsis: true },
    { title: 'Status', dataIndex: 'responseCode', key: 'rc', width: 80 },
    { title: 'Duration', dataIndex: 'durationMs', key: 'dur', width: 80, render: (v) => v ? `${v}ms` : '-' },
    { title: 'Success', dataIndex: 'success', key: 'ok', width: 80,
      render: (v) => <Tag color={v === 1 ? 'green' : 'red'}>{v === 1 ? 'Yes' : 'No'}</Tag> },
    { title: 'Time', dataIndex: 'createTime', key: 'time', render: (v) => v?.substring(0, 19) },
  ];

  return (
    <>
      <Typography.Title level={4} style={{ marginBottom: 16 }}>Logs</Typography.Title>
      <Tabs items={[
        {
          key: 'flow', label: `Flow Instances (${instances.length})`,
          children: (
            <Table rowKey="id" columns={flowCols} dataSource={instances}
              loading={loading} pagination={false} size="small"
              expandable={{
                expandedRowRender: (r) => {
                  let ctx = r.contextData;
                  if (ctx) {
                    try { ctx = JSON.stringify(JSON.parse(ctx), null, 2); }
                    catch { ctx = r.contextData; }
                  }
                  return <pre style={{ fontSize: 12, maxHeight: 200, overflow: 'auto' }}>
                    {ctx || '(no data)'}
                  </pre>;
                },
              }}
              style={{ background: '#fff', borderRadius: 12 }} />
          ),
        },
        {
          key: 'api', label: `API Calls (${apiLogs.length})`,
          children: (
            <Table rowKey="id" columns={logCols} dataSource={apiLogs}
              loading={loading} pagination={false} size="small"
              style={{ background: '#fff', borderRadius: 12 }} />
          ),
        },
      ]} />
    </>
  );
}
