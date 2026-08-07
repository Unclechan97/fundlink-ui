import { useState, useCallback, useMemo } from 'react';
import { Card, Input, Button, Space, Table, Tag, Typography, message, Spin, Descriptions, Collapse, Tooltip } from 'antd';
import { RobotOutlined, SendOutlined, CheckCircleOutlined, CloseCircleOutlined, EditOutlined } from '@ant-design/icons';
import ReactFlow, { Controls, Background, Handle, Position, useNodesState, useEdgesState, addEdge } from 'reactflow';
import 'reactflow/dist/style.css';
import { analyzeDocument, applyConfig } from '../../api';

const { TextArea } = Input;
const { Title, Text, Paragraph } = Typography;

// ── React Flow 节点颜色 ──
const PALETTE = {
  START: { color: '#22c55e', bg: '#f0fdf4' },
  END: { color: '#ef4444', bg: '#fef2f2' },
  CONDITION: { color: '#f59e0b', bg: '#fffbeb' },
  DATA_COLLECT: { color: '#3b82f6', bg: '#eff6ff' },
  TEMPLATE_RENDER: { color: '#8b5cf6', bg: '#f5f3ff' },
  SEND_TO_FUND: { color: '#06b6d4', bg: '#ecfeff' },
};

export default function Copilot() {
  const [docText, setDocText] = useState('');
  const [providerCode, setProviderCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState(null);

  // ── 字段映射状态 ──
  const [mappings, setMappings] = useState([]);
  const [editingCell, setEditingCell] = useState(null); // {index, field}

  // ── 流程状态 ──
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState([]);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState([]);
  const [flowAccepted, setFlowAccepted] = useState(false);
  const [selFlowEl, setSelFlowEl] = useState(null);

  // ── React Flow nodeTypes ──
  const nodeTypes = useMemo(() => {
    const types = {};
    for (const key of Object.keys(PALETTE)) {
      types[key] = (props) => (
        <div style={{ padding: '8px 12px', borderRadius: 8, border: `2px solid ${PALETTE[key].color}`, background: '#fff', fontSize: 11, fontWeight: 600, textAlign: 'center', minWidth: 80 }}>
          <Handle type="target" position={Position.Top} style={{ background: '#bbb' }} />
          {props.data.label || key}
          <Handle type="source" position={Position.Bottom} style={{ background: '#bbb' }} />
        </div>
      );
    }
    return types;
  }, []);

  // ── AI 解析 ──
  const handleAnalyze = async () => {
    if (!docText.trim()) { message.warning('请输入接口文档内容'); return; }
    if (!providerCode.trim()) { message.warning('请输入资金方编码'); return; }
    setLoading(true);
    try {
      const res = await analyzeDocument(docText, providerCode.trim());
      const data = res.data;
      setResult(data);

      // 初始化映射表
      const ms = (data.fieldMappings || []).map(m => ({ ...m, accepted: false }));
      setMappings(ms);

      // 初始化流程图
      if (data.flowDsl?.nodes) {
        const ns = data.flowDsl.nodes.map((n, i) => ({
          ...n,
          position: { x: 50 + (i % 4) * 220, y: 50 + Math.floor(i / 4) * 140 },
        }));
        setFlowNodes(ns);
        setFlowEdges(data.flowDsl.edges || []);
      }
      setFlowAccepted(false);
      setSelFlowEl(null);
      message.success('AI 解析完成');
    } catch (e) {
      message.error('AI 服务暂不可用: ' + (e.message || ''));
    } finally {
      setLoading(false);
    }
  };

  // ── 字段映射操作 ──
  const toggleAccept = (idx) => {
    setMappings(prev => prev.map((m, i) => i === idx ? { ...m, accepted: !m.accepted } : m));
  };

  const acceptAll = () => {
    setMappings(prev => prev.map(m => ({ ...m, accepted: true })));
  };

  const addRow = () => {
    setMappings(prev => [...prev, { fundField: '', sourcePath: '', transform: '', confidence: 1, accepted: false }]);
  };

  const deleteRow = (idx) => {
    setMappings(prev => prev.filter((_, i) => i !== idx));
  };

  const startEdit = (idx, field) => setEditingCell({ index: idx, field });
  const commitEdit = (idx, field, value) => {
    const prev = [...mappings];
    if (!value || value === prev[idx][field]) { setEditingCell(null); return; }
    prev[idx] = { ...prev[idx], [field]: value };
    setMappings(prev);
    setEditingCell(null);
  };


  const allMappingsAccepted = mappings.length > 0 && mappings.every(m => m.accepted);
  const acceptedCount = mappings.filter(m => m.accepted).length;

  // ── 流程图操作 ──
  const onConnect = useCallback((params) => setFlowEdges((eds) => addEdge(params, eds)), []);
  const onNodeClick = useCallback((_, node) => setSelFlowEl({ type: 'node', ...node }), []);
  const onEdgeClick = useCallback((_, edge) => setSelFlowEl({ type: 'edge', ...edge }), []);

  const updateFlowEl = (key, val) => {
    if (!selFlowEl) return;
    if (selFlowEl.type === 'node') {
      setFlowNodes(nds => nds.map(n => n.id === selFlowEl.id
        ? { ...n, data: { ...n.data, config: { ...n.data.config, [key]: val } } } : n));
      setSelFlowEl(prev => ({ ...prev, data: { ...prev.data, config: { ...prev.data.config, [key]: val } } }));
    } else if (selFlowEl.type === 'edge') {
      const isCond = key === 'conditionExpr';
      setFlowEdges(eds => eds.map(e => e.id === selFlowEl.id
        ? { ...e, [key]: val, ...(isCond && val ? { label: e.label || '条件' } : {}) } : e));
      setSelFlowEl(prev => ({
        ...prev, [key]: val,
        ...(isCond && val ? { label: prev.label || '条件' } : {}),
      }));
    }
  };

  // ── 写入 ──
  const canWrite = allMappingsAccepted && flowAccepted;

  const handleApply = async () => {
    if (!canWrite) return;
    setApplying(true);
    try {
      // 组装写入数据
      const writeResult = {
        ...result,
        fieldMappings: mappings.map(({ accepted, ...m }) => m),
        flowDsl: result.flowDsl ? { ...result.flowDsl, nodes: flowNodes, edges: flowEdges } : null,
      };
      const res = await applyConfig(writeResult, providerCode, 'LOAN');
      message.success(`写入成功: Provider=${res.data.providerId} Template=${res.data.templateId} Mappings=${res.data.mappingCount} Flow=${res.data.flowId}`);
    } catch (e) { message.error('写入失败: ' + (e.message || '')); }
    finally { setApplying(false); }
  };

  // ── 表格列 ──
  const editableCell = (idx, field, val) => {
    if (editingCell?.index === idx && editingCell?.field === field) {
      return <Input size="small" autoFocus defaultValue={val || ''}
        onBlur={e => commitEdit(idx, field, e.target.value)}
        onPressEnter={e => commitEdit(idx, field, e.target.value)} />;
    }
    return <span onClick={() => startEdit(idx, field)} style={{ cursor: 'pointer' }}>
      {val || <Text type="secondary">点击编辑</Text>} <EditOutlined style={{ fontSize: 10, color: '#bbb' }} />
    </span>;
  };

  const fieldMappingColumns = [
    { title: '资金方字段', dataIndex: 'fundField', key: 'fundField', width: 130,
      render: (v, _, idx) => editableCell(idx, 'fundField', v) },
    { title: '内部路径', dataIndex: 'sourcePath', key: 'sourcePath', width: 150,
      render: (v, _, idx) => editableCell(idx, 'sourcePath', v) },
    { title: '转换函数', dataIndex: 'transform', key: 'transform', width: 100,
      render: (v, _, idx) => editableCell(idx, 'transform', v) },
    { title: '置信度', dataIndex: 'confidence', key: 'confidence', width: 70,
      render: v => <Tag color={v > 0.8 ? 'green' : 'orange'}>{Math.round(v * 100)}%</Tag> },
    { title: '操作', key: 'actions', width: 140,
      render: (_, r, idx) => (
        <Space size={4}>
          <Button size="small" type={r.accepted ? 'primary' : 'default'}
            icon={r.accepted ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
            onClick={() => toggleAccept(idx)}>
            {r.accepted ? '已采纳' : '待确认'}
          </Button>
          <Button size="small" danger onClick={() => deleteRow(idx)}>删除</Button>
        </Space>
      )},
  ];

  // ── 渲染 ──
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <Title level={3}><RobotOutlined /> AI Copilot</Title>

      <Card style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Input placeholder="资金方编码 (如 CMB)" value={providerCode}
            onChange={e => setProviderCode(e.target.value)} style={{ width: 200 }} />
          <TextArea placeholder="粘贴资金方接口文档..." rows={6}
            value={docText} onChange={e => setDocText(e.target.value)} />
          <Button type="primary" icon={<SendOutlined />} onClick={handleAnalyze} loading={loading}>AI 解析</Button>
        </Space>
      </Card>

      {loading && <Spin tip="AI 正在分析..." style={{ display: 'block', margin: '40px auto' }} />}

      {result && !loading && (
        <>
          {/* ── 字段映射 ── */}
          <Card title={<span>字段映射建议 <Tag>{acceptedCount}/{mappings.length} 已采纳</Tag></span>}
            style={{ marginBottom: 16 }}
            extra={<Space><Button size="small" onClick={addRow}>添加行</Button><Button size="small" type="dashed" onClick={acceptAll}>一键采纳</Button></Space>}>
            <Table dataSource={mappings} columns={fieldMappingColumns}
              rowKey={(_, idx) => idx} pagination={false} size="small"
              components={{ body: { row: (props) => <tr {...props} /> } }} />
          </Card>

          {/* ── 流程图 ── */}
          {flowNodes.length > 0 && (
            <Card title={<span>流程 DSL <Tag color={flowAccepted ? 'green' : 'orange'}>{flowAccepted ? '已采纳' : '待确认'}</Tag></span>}
              style={{ marginBottom: 16 }}
              extra={<Button size="small" type="dashed" onClick={() => { setFlowAccepted(true); message.success('流程已采纳'); }}>采纳流程</Button>}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1, height: 350, border: '1px solid #f0f0f0', borderRadius: 8 }}>
                  <ReactFlow nodes={flowNodes} edges={flowEdges}
                    nodeTypes={nodeTypes}
                    onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
                    onConnect={onConnect} onNodeClick={onNodeClick} onEdgeClick={onEdgeClick}
                    deleteKeyCode={["Backspace","Delete"]} fitView>
                    <Controls /><Background gap={16} color="#f5f5f5" />
                  </ReactFlow>
                </div>
                {/* 右侧配置面板 */}
                <div style={{ width: 220, padding: 12, border: '1px solid #f0f0f0', borderRadius: 8, background: '#fafafa' }}>
                  {selFlowEl ? (
                    <div>
                      <Text strong style={{ fontSize: 12 }}>
                        {selFlowEl.type === 'node' ? `节点: ${selFlowEl.data?.label || selFlowEl.id}` : `连线: ${selFlowEl.id}`}
                      </Text>
                      <div style={{ marginTop: 8 }}>
                        {selFlowEl.type === 'node' && selFlowEl.type === 'DATA_COLLECT' && <>
                          <Input size="small" placeholder="dataSourceCode" style={{ marginTop: 4 }}
                            value={selFlowEl.data?.config?.dataSourceCode || ''}
                            onChange={e => updateFlowEl('dataSourceCode', e.target.value)} />
                          <Input size="small" placeholder="outputKey" style={{ marginTop: 4 }}
                            value={selFlowEl.data?.config?.outputKey || ''}
                            onChange={e => updateFlowEl('outputKey', e.target.value)} />
                        </>}
                        {selFlowEl.type === 'node' && selFlowEl.type === 'TEMPLATE_RENDER' && <>
                          <Input size="small" placeholder="templateCode" style={{ marginTop: 4 }}
                            value={selFlowEl.data?.config?.templateCode || ''}
                            onChange={e => updateFlowEl('templateCode', e.target.value)} />
                          <Input size="small" placeholder="outputKey" style={{ marginTop: 4 }}
                            value={selFlowEl.data?.config?.outputKey || ''}
                            onChange={e => updateFlowEl('outputKey', e.target.value)} />
                        </>}
                        {selFlowEl.type === 'node' && selFlowEl.type === 'SEND_TO_FUND' && <>
                          <Input size="small" placeholder="URL" style={{ marginTop: 4 }}
                            value={selFlowEl.data?.config?.url || ''}
                            onChange={e => updateFlowEl('url', e.target.value)} />
                          <Input size="small" placeholder="requestKey" style={{ marginTop: 4 }}
                            value={selFlowEl.data?.config?.requestKey || ''}
                            onChange={e => updateFlowEl('requestKey', e.target.value)} />
                          <Input size="small" placeholder="responseKey" style={{ marginTop: 4 }}
                            value={selFlowEl.data?.config?.responseKey || ''}
                            onChange={e => updateFlowEl('responseKey', e.target.value)} />
                        </>}
                        {selFlowEl.type === 'edge' && <>
                          <Input size="small" placeholder="Label" style={{ marginTop: 4 }}
                            value={selFlowEl.label || ''}
                            onChange={e => updateFlowEl('label', e.target.value)} />
                          <TextArea size="small" rows={2} placeholder="conditionExpr (SpEL)" style={{ marginTop: 4 }}
                            value={selFlowEl.conditionExpr || ''}
                            onChange={e => updateFlowEl('conditionExpr', e.target.value)} />
                        </>}
                        {selFlowEl.type === 'node' && !['DATA_COLLECT', 'TEMPLATE_RENDER', 'SEND_TO_FUND'].includes(selFlowEl.type) && (
                          <Text type="secondary" style={{ fontSize: 12 }}>此节点无可配置项</Text>
                        )}
                      </div>
                    </div>
                  ) : (
                    <Text type="secondary" style={{ fontSize: 12 }}>点击节点或连线查看配置</Text>
                  )}
                </div>
              </div>
            </Card>
          )}

          {/* ── FreeMarker 参考（AI 骨架，写入时后端用 mappings 重建）─── */}
          {result.freeMarkerTemplate && (
            <Card title="FreeMarker 参考" style={{ marginBottom: 16 }}>
              <pre style={{ fontSize: 12, maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap', margin: 0, color: '#888' }}>{result.freeMarkerTemplate}</pre>
            </Card>
          )}

          {/* ── 写入按钮 ── */}
          <Tooltip title={!canWrite ? '请先采纳所有字段映射和流程' : '写入 FundLink'}>
            <Button type="primary" size="large" disabled={!canWrite} loading={applying}
              onClick={handleApply} style={{ marginTop: 8 }}
              icon={<CheckCircleOutlined />}>
              写入 FundLink 配置
            </Button>
          </Tooltip>
        </>
      )}
    </div>
  );
}
