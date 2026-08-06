import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Input, Select, Typography, Space, message, Card, Row, Col, Form } from 'antd';
import { SaveOutlined, ArrowLeftOutlined, PlayCircleOutlined, CaretRightOutlined, StopOutlined, SwapOutlined, CloudUploadOutlined, FileTextOutlined, SendOutlined } from '@ant-design/icons';
import ReactFlow, { Controls, Background, MiniMap, useNodesState, useEdgesState, addEdge } from 'reactflow';
import 'reactflow/dist/style.css';
import { createFlow, updateFlow, getFlows } from '../api';

const nodeTypes = {
  START: { color: '#22c55e', bg: '#f0fdf4', label: 'Start', icon: <CaretRightOutlined /> },
  END: { color: '#ef4444', bg: '#fef2f2', label: 'End', icon: <StopOutlined /> },
  CONDITION: { color: '#f59e0b', bg: '#fffbeb', label: 'Condition', icon: <SwapOutlined />, shape: 'diamond' },
  DATA_COLLECT: { color: '#3b82f6', bg: '#eff6ff', label: 'Collect', icon: <CloudUploadOutlined /> },
  TEMPLATE_RENDER: { color: '#8b5cf6', bg: '#f5f3ff', label: 'Render', icon: <FileTextOutlined /> },
  SEND_TO_FUND: { color: '#06b6d4', bg: '#ecfeff', label: 'Send', icon: <SendOutlined /> },
};

let idCounter = 0;
const createNode = (type) => ({
  id: `n${++idCounter}`,
  type,
  position: { x: 250, y: 100 + idCounter * 100 },
  data: { label: nodeTypes[type].label, config: {} },
});

export default function FlowEdit() {
  const { id } = useParams();
  const isNew = !id;
  const nav = useNavigate();
  const [form] = Form.useForm();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selNode, setSelNode] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isNew) {
      getFlows(1, 50).then((res) => {
        const f = (res?.data?.records ?? []).find((r) => r.id === +id);
        if (f) {
          form.setFieldsValue(f);
          try {
            const g = JSON.parse(f.graphData);
            if (g.nodes) { idCounter = g.nodes.length; setNodes(g.nodes); }
            if (g.edges) setEdges(g.edges);
          } catch { /* empty */ }
        }
      });
    }
  }, [id]);

  const onConnect = useCallback((params) => setEdges((eds) => addEdge(params, eds)), []);

  const onNodeClick = (_, node) => setSelNode(node);

  const updateNodeConfig = (key, value) => {
    if (!selNode) return;
    setNodes((nds) =>
      nds.map((n) =>
        n.id === selNode.id
          ? { ...n, data: { ...n.data, config: { ...n.data.config, [key]: value } } }
          : n
      )
    );
    setSelNode((n) => ({ ...n, data: { ...n.data, config: { ...n.data.config, [key]: value } } }));
  };

  const onEdgeClick = (_, edge) => {
    const expr = prompt('Condition expression (SpEL, leave blank for unconditional):', edge.data?.conditionExpr || '');
    if (expr !== null) {
      setEdges((eds) =>
        eds.map((e) =>
          e.id === edge.id
            ? { ...e, data: { ...e.data, conditionExpr: expr }, label: expr ? 'true' : '' }
            : e
        )
      );
    }
  };

  const onDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };

  const onDrop = (e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('application/reactflow');
    if (!type || !nodeTypes[type]) return;
    const bounds = document.querySelector('.react-flow__renderer')?.getBoundingClientRect();
    const pos = bounds ? { x: e.clientX - bounds.left - 75, y: e.clientY - bounds.top - 20 } : { x: 250, y: 200 };
    const node = createNode(type);
    node.position = pos;
    setNodes((nds) => [...nds, node]);
  };

  const onSave = async () => {
    const vals = await form.validateFields();
    const graphData = JSON.stringify({ nodes, edges });
    setLoading(true);
    if (isNew) {
      const res = await createFlow({ ...vals, graphData });
      message.success('Created');
      nav(`/flows/${res.data}`, { replace: true });
    } else {
      await updateFlow(id, { ...vals, graphData });
      message.success('Updated');
    }
    setLoading(false);
  };

  const renderConfig = () => {
    if (!selNode) return <Typography.Text type="secondary">Click a node to configure</Typography.Text>;
    const t = selNode.type;
    return (
      <div>
        <Typography.Text strong style={{ color: nodeTypes[t]?.color }}>
          {nodeTypes[t]?.label} — {selNode.id}
        </Typography.Text>
        {t === 'DATA_COLLECT' && (
          <>
            <Input placeholder="Data source code (e.g. RISK)" style={{ marginTop: 8 }}
              value={selNode.data.config?.dataSourceCode || ''}
              onChange={(e) => updateNodeConfig('dataSourceCode', e.target.value)} />
            <Input placeholder="Output key (e.g. riskData)" style={{ marginTop: 8 }}
              value={selNode.data.config?.outputKey || ''}
              onChange={(e) => updateNodeConfig('outputKey', e.target.value)} />
          </>
        )}
        {t === 'TEMPLATE_RENDER' && (
          <>
            <Input placeholder="Template code (e.g. LOAN_REQ)" style={{ marginTop: 8 }}
              value={selNode.data.config?.templateCode || ''}
              onChange={(e) => updateNodeConfig('templateCode', e.target.value)} />
            <Input placeholder="Output key (e.g. reqMsg)" style={{ marginTop: 8 }}
              value={selNode.data.config?.outputKey || ''}
              onChange={(e) => updateNodeConfig('outputKey', e.target.value)} />
          </>
        )}
        {t === 'SEND_TO_FUND' && (
          <>
            <Input placeholder="URL" style={{ marginTop: 8 }}
              value={selNode.data.config?.url || ''}
              onChange={(e) => updateNodeConfig('url', e.target.value)} />
            <Input placeholder="Request key" style={{ marginTop: 8 }}
              value={selNode.data.config?.requestKey || ''}
              onChange={(e) => updateNodeConfig('requestKey', e.target.value)} />
            <Input placeholder="Response key" style={{ marginTop: 8 }}
              value={selNode.data.config?.responseKey || ''}
              onChange={(e) => updateNodeConfig('responseKey', e.target.value)} />
          </>
        )}
        {t === 'CONDITION' && (
          <Input placeholder="SpEL expression (e.g. #root.riskData.score > 60)" style={{ marginTop: 8 }}
            value={selNode.data.config?.expression || ''}
            onChange={(e) => updateNodeConfig('expression', e.target.value)} />
        )}
      </div>
    );
  };

  return (
    <>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => nav('/flows')}>Back</Button>
        <Typography.Title level={4} style={{ margin: 0, flex: 1 }}>
          {isNew ? 'New Flow' : 'Edit Flow'}
        </Typography.Title>
        <Button type="primary" icon={<SaveOutlined />} onClick={onSave} loading={loading}>Save</Button>
      </div>
      <Row gutter={16}>
        <Col span={4}>
          <Card title="Nodes" size="small" style={{ borderRadius: 12, marginBottom: 16 }}>
            {Object.entries(nodeTypes).map(([key, val]) => (
              <div key={key} draggable
                onDragStart={(e) => { e.dataTransfer.setData('application/reactflow', key); e.dataTransfer.effectAllowed = 'move'; }}
                style={{
                  padding: '8px 12px', marginBottom: 8, borderRadius: 8, cursor: 'grab',
                  background: val.bg, border: `1px solid ${val.color}20`, color: val.color,
                  fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8,
                }}>
                {val.icon} {val.label}
              </div>
            ))}
          </Card>
          <Card title="Settings" size="small" style={{ borderRadius: 12 }}>
            <Form form={form} layout="vertical">
              <Form.Item name="flowCode" label="Code" rules={[{ required: true }]}>
                <Input placeholder="LOAN_FUND_A" />
              </Form.Item>
              <Form.Item name="flowName" label="Name" rules={[{ required: true }]}>
                <Input placeholder="Loan - Fund A" />
              </Form.Item>
              <Form.Item name="flowType" label="Type" rules={[{ required: true }]}>
                <Select options={[
                  { label: 'CREDIT', value: 'CREDIT' },
                  { label: 'LOAN', value: 'LOAN' },
                  { label: 'REPAYMENT', value: 'REPAYMENT' },
                ]} />
              </Form.Item>
              <Form.Item name="providerId" label="Provider ID">
                <Input placeholder="1" />
              </Form.Item>
            </Form>
          </Card>
        </Col>
        <Col span={16}>
          <Card size="small" style={{ borderRadius: 12, height: 'calc(100vh - 200px)' }}
            bodyStyle={{ height: '100%', padding: 0 }}>
            <ReactFlow nodes={nodes} edges={edges}
              onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
              onConnect={onConnect} onNodeClick={onNodeClick} onEdgeClick={onEdgeClick}
              onDrop={onDrop} onDragOver={onDragOver}
              fitView nodeTypes={{}}>
              <Controls /><MiniMap /><Background gap={16} color="#f0f0f0" />
            </ReactFlow>
            <Typography.Text type="secondary" style={{ position: 'absolute', bottom: 8, left: 12, fontSize: 11 }}>
              Tip: Drag nodes from the left panel. Click a node to configure. Click an edge to add a condition.
            </Typography.Text>
          </Card>
        </Col>
        <Col span={4}>
          <Card title="Node Config" size="small" style={{ borderRadius: 12 }}>
            {renderConfig()}
          </Card>
        </Col>
      </Row>
    </>
  );
}
