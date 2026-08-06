import { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Input, Select, Typography, message, Card, Row, Col, Form, Spin } from 'antd';
import { SaveOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import ReactFlow, { Controls, Background, useNodesState, useEdgesState, addEdge } from 'reactflow';
import 'reactflow/dist/style.css';
import { createFlow, updateFlow, getFlows } from '../api';

const PALETTE = {
  START: { color: '#22c55e', bg: '#f0fdf4', label: 'Start' },
  END: { color: '#ef4444', bg: '#fef2f2', label: 'End' },
  CONDITION: { color: '#f59e0b', bg: '#fffbeb', label: 'Condition' },
  DATA_COLLECT: { color: '#3b82f6', bg: '#eff6ff', label: 'Collect' },
  TEMPLATE_RENDER: { color: '#8b5cf6', bg: '#f5f3ff', label: 'Render' },
  SEND_TO_FUND: { color: '#06b6d4', bg: '#ecfeff', label: 'Send' },
};

let _id = 0;

export default function FlowEdit() {
  const { id } = useParams();
  const isNew = !id;
  const nav = useNavigate();
  const [form] = Form.useForm();
  const [nodes, setNodes] = useNodesState([]);
  const [edges, setEdges] = useEdgesState([]);
  const [selNode, setSelNode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isNew) {
      getFlows(1, 50).then((res) => {
        const f = (res?.data?.records ?? []).find((r) => r.id === +id);
        if (f) {
          form.setFieldsValue(f);
          try {
            const g = JSON.parse(f.graphData);
            if (g.nodes?.length) {
              _id = Math.max(...g.nodes.map((n) => parseInt(String(n.id).replace(/\D/g, '')) || 0));
              // Ensure each node has a position
              const fixed = g.nodes.map((n, i) => ({
                ...n,
                position: n.position || { x: 100 + (i % 3) * 250, y: 100 + Math.floor(i / 3) * 150 },
              }));
              setNodes(fixed);
            }
            if (g.edges?.length) setEdges(g.edges);
          } catch { /* */ }
        }
        setReady(true);
      });
    } else {
      setReady(true);
    }
  }, [id]);

  const onConnect = useCallback((params) => setEdges((eds) => addEdge(params, eds)), []);
  const onNodeClick = useCallback((_, node) => setSelNode(node), []);

  const onEdgeClick = useCallback((_, edge) => {
    const expr = prompt('SpEL (blank = unconditional):', edge.data?.conditionExpr || '');
    if (expr !== null) {
      setEdges((eds) => eds.map((e) =>
        e.id === edge.id ? { ...e, label: expr || '', data: { ...e.data, conditionExpr: expr } } : e
      ));
    }
  }, []);

  const onDragOver = useCallback((e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('application/reactflow');
    if (!type || !PALETTE[type]) return;
    setNodes((nds) => [
      ...nds,
      { id: `n${++_id}`, type, position: { x: Math.random() * 300 + 100, y: Math.random() * 200 + 100 }, data: { label: PALETTE[type].label, config: {} } },
    ]);
  }, []);

  const updCfg = (k, v) => {
    if (!selNode) return;
    setNodes((nds) => nds.map((n) =>
      n.id === selNode.id ? { ...n, data: { ...n.data, config: { ...n.data.config, [k]: v } } } : n
    ));
  };

  const onSave = async () => {
    const vals = await form.validateFields();
    setLoading(true);
    const graphData = JSON.stringify({ nodes, edges });
    try {
      if (isNew) {
        const res = await createFlow({ ...vals, graphData });
        message.success('Created');
        nav(`/flows/${res.data}`, { replace: true });
      } else {
        await updateFlow(id, { ...vals, graphData });
        message.success('Updated');
      }
    } catch { message.error('Save failed'); }
    setLoading(false);
  };

  if (!ready) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;

  return (
    <div style={{ height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center' }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => nav('/flows')}>Back</Button>
        <Typography.Title level={4} style={{ margin: 0, flex: 1 }}>{isNew ? 'New Flow' : 'Edit Flow'}</Typography.Title>
        <Button type="primary" icon={<SaveOutlined />} onClick={onSave} loading={loading}>Save</Button>
      </div>
      <Row gutter={12} style={{ flex: 1 }}>
        <Col span={3}>
          <Card title="Nodes" size="small" style={{ borderRadius: 12, marginBottom: 12 }}>
            {Object.entries(PALETTE).map(([k, v]) => (
              <div key={k} draggable onDragStart={(e) => { e.dataTransfer.setData('application/reactflow', k); }}
                style={{ padding: '8px 10px', marginBottom: 6, borderRadius: 8, cursor: 'grab',
                  background: v.bg, border: `1px solid ${v.color}30`, color: v.color, fontSize: 13, fontWeight: 500 }}>
                {v.label}
              </div>
            ))}
          </Card>
          <Card title="Settings" size="small" style={{ borderRadius: 12 }}>
            <Form form={form} layout="vertical" size="small">
              <Form.Item name="flowCode" label="Code" rules={[{ required: true }]}><Input placeholder="LOAN_FUND_A" /></Form.Item>
              <Form.Item name="flowName" label="Name" rules={[{ required: true }]}><Input placeholder="Loan - Fund A" /></Form.Item>
              <Form.Item name="flowType" label="Type"><Select options={[{ label: 'CREDIT', value: 'CREDIT' }, { label: 'LOAN', value: 'LOAN' }, { label: 'REPAYMENT', value: 'REPAYMENT' }]} /></Form.Item>
              <Form.Item name="providerId" label="Provider"><Input placeholder="1" /></Form.Item>
            </Form>
          </Card>
        </Col>
        <Col span={17}>
          <Card size="small" style={{ borderRadius: 12, height: '100%' }} styles={{ body: { height: '100%', padding: 0 } }}>
            <ReactFlow nodes={nodes} edges={edges}
              onNodesChange={(e) => setNodes(e)}
              onEdgesChange={(e) => setEdges(e)}
              onConnect={onConnect} onNodeClick={onNodeClick} onEdgeClick={onEdgeClick}
              onDrop={onDrop} onDragOver={onDragOver}
              fitView
            >
              <Controls /><Background gap={16} color="#f5f5f5" />
            </ReactFlow>
          </Card>
        </Col>
        <Col span={4}>
          <Card title="Config" size="small" style={{ borderRadius: 12 }}>
            {selNode ? (
              <div>
                <Typography.Text strong style={{ color: PALETTE[selNode.type]?.color, fontSize: 13 }}>
                  {PALETTE[selNode.type]?.label}
                </Typography.Text>
                {selNode.type === 'DATA_COLLECT' && <>
                  <Input size="small" placeholder="Source code" style={{ marginTop: 6 }}
                    value={selNode.data.config?.dataSourceCode || ''} onChange={(e) => updCfg('dataSourceCode', e.target.value)} />
                  <Input size="small" placeholder="Output key" style={{ marginTop: 6 }}
                    value={selNode.data.config?.outputKey || ''} onChange={(e) => updCfg('outputKey', e.target.value)} />
                </>}
                {selNode.type === 'TEMPLATE_RENDER' && <>
                  <Input size="small" placeholder="Template code" style={{ marginTop: 6 }}
                    value={selNode.data.config?.templateCode || ''} onChange={(e) => updCfg('templateCode', e.target.value)} />
                  <Input size="small" placeholder="Output key" style={{ marginTop: 6 }}
                    value={selNode.data.config?.outputKey || ''} onChange={(e) => updCfg('outputKey', e.target.value)} />
                </>}
                {selNode.type === 'SEND_TO_FUND' && <>
                  <Input size="small" placeholder="URL" style={{ marginTop: 6 }}
                    value={selNode.data.config?.url || ''} onChange={(e) => updCfg('url', e.target.value)} />
                  <Input size="small" placeholder="Req key" style={{ marginTop: 6 }}
                    value={selNode.data.config?.requestKey || ''} onChange={(e) => updCfg('requestKey', e.target.value)} />
                  <Input size="small" placeholder="Resp key" style={{ marginTop: 6 }}
                    value={selNode.data.config?.responseKey || ''} onChange={(e) => updCfg('responseKey', e.target.value)} />
                </>}
                {selNode.type === 'CONDITION' && <>
                  <Input.TextArea size="small" rows={3} placeholder="#root.riskData.score > 60" style={{ marginTop: 6 }}
                    value={selNode.data.config?.expression || ''} onChange={(e) => updCfg('expression', e.target.value)} />
                </>}
              </div>
            ) : (
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>Click a node to edit</Typography.Text>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
