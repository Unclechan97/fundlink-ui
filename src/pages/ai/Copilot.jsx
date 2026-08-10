import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Card, Input, Button, Space, Table, Tag, Typography, message, Spin, Descriptions, Collapse, Tooltip, Segmented, Select } from 'antd';
import { RobotOutlined, SendOutlined, CheckCircleOutlined, CloseCircleOutlined, EditOutlined } from '@ant-design/icons';
import ReactFlow, { Controls, Background, Handle, Position, useNodesState, useEdgesState, addEdge } from 'reactflow';
import 'reactflow/dist/style.css';
import { analyzeDocument, applyConfig, detectIntent, splitDocument, askQuestion, troubleshoot } from '../../api';
import AutoLoopPanel from './AutoLoopPanel';
import useSessionState from '../../hooks/useSessionState';

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
  const [mode, setMode] = useSessionState('copilot:mode', 'manual');
  const [docText, setDocText] = useSessionState('copilot:docText', '');
  const [providerCode, setProviderCode] = useSessionState('copilot:providerCode', '');
  const [flowType, setFlowType] = useSessionState('copilot:flowType', ''); // '' = 自动识别
  const [result, setResult] = useSessionState('copilot:result', null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  // ── Phase 4: 意图识别 + 多接口拆分 ──
  const [intent, setIntent] = useState(null);
  const [splitInterfaces, setSplitInterfaces] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [showIntent, setShowIntent] = useState(false);
  const [qaAnswer, setQaAnswer] = useState(null);
  const [troubleshootResult, setTroubleshootResult] = useState(null);
  const [multiResults, setMultiResults] = useState(null); // {totalCount, successCount, failedCount, interfaces: [{...result}]}
  const [activeInterfaceId, setActiveInterfaceId] = useState(null); // 当前查看的接口

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

  // ── 从 result 初始化映射表 + 流程图 ──
  const initFromResult = useCallback((data) => {
    const ms = (data.fieldMappings || []).map(m => ({ ...m, accepted: false }));
    setMappings(ms);

    if (data.flowDsl?.nodes) {
      const ns = data.flowDsl.nodes.map((n, i) => ({
        ...n,
        position: { x: 50 + (i % 4) * 220, y: 50 + Math.floor(i / 4) * 140 },
      }));
      setFlowNodes(ns);
      setFlowEdges(data.flowDsl.edges || []);
    } else {
      setFlowNodes([]);
      setFlowEdges([]);
    }
    setFlowAccepted(false);
    setSelFlowEl(null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 挂载时清除残留的自动闭环快照 ──
  useEffect(() => {
    try { sessionStorage.removeItem('autoloop:snapshot'); } catch(e) {}
  }, []);

  // ── 页面切回时恢复持久化的 result ──
  const hasRestored = useRef(false);
  useEffect(() => {
    if (!hasRestored.current && result) {
      hasRestored.current = true;
      initFromResult(result);
    }
  }, []); // 仅 mount 时执行一次

  // ── Phase 4: 通用发送 — 识别意图 → 拆分 → 自动并行处理 ──
  const handleSend = async () => {
    if (!docText.trim()) { message.warning('请输入内容'); return; }
    if (!providerCode.trim()) { message.warning('请输入资金方编码'); return; }
    setLoading(true);
    setResult(null);
    setQaAnswer(null);
    setTroubleshootResult(null);
    setSplitInterfaces([]);
    setShowIntent(false);

    try {
      // Step 1: 意图识别
      const intentRes = await detectIntent(docText);
      const { intent: intentType, intentDisplay, confidence, reason, needUserConfirm } = intentRes.data;
      const intentObj = { type: intentType, display: intentDisplay, confidence, reason, needUserConfirm };
      setIntent(intentObj);
      setShowIntent(true);

      // Step 2: 按意图路由
      if (intentType === 'INTERFACE_DEV') {
        // Step 2a: 拆分
        const splitRes = await splitDocument(docText, providerCode.trim());
        const interfaces = splitRes.data.interfaces || [];
        setSplitInterfaces(interfaces);
        if (interfaces.length === 0) {
          message.warning('未识别到接口定义');
          setLoading(false);
          return;
        }
        const allIds = interfaces.map(s => s.interfaceId);
        setSelectedIds(allIds);

        // Step 2b: 自动并行处理全部接口（单次请求）
        if (interfaces.length >= 2) {
          message.loading({ content: `正在并行处理 ${interfaces.length} 个接口...`, key: 'multi', duration: 0 });
        }
        const analyzeRes = await analyzeDocument(docText, providerCode.trim(), flowType, allIds);
        const data = analyzeRes.data;

        if (data.interfaces) {
          // 多接口结果 — 全部保存
          setMultiResults(data);
          const firstSuccess = data.interfaces.find(i => i.status === 'SUCCESS');
          if (firstSuccess) {
            setActiveInterfaceId(firstSuccess.interfaceId);
            if (firstSuccess.result) {
              setResult(firstSuccess.result);
              initFromResult(firstSuccess.result);
            }
          }
          // 更新列表显示状态
          setSplitInterfaces(prev => prev.map(s => {
            const ri = data.interfaces.find(i => i.interfaceId === s.interfaceId);
            return ri ? { ...s, status: ri.status, errorMessage: ri.errorMessage, result: ri.result } : s;
          }));
          message.success(`${data.successCount}/${data.totalCount} 成功`);
        } else {
          // 单接口结果（向后兼容）
          setResult(data);
          initFromResult(data);
          if (data.flowType && data.flowType !== flowType) setFlowType(data.flowType);
          message.success('AI 解析完成');
        }
      } else if (intentType === 'KNOWLEDGE_QA') {
        const qaRes = await askQuestion(docText);
        setQaAnswer(qaRes.data.answer);
        message.success('问答完成');
      } else if (intentType === 'TROUBLESHOOTING') {
        const tsRes = await troubleshoot(docText);
        setTroubleshootResult(tsRes.data.analysis);
        message.success('诊断完成');
      }
    } catch (e) {
      message.error('AI 服务暂不可用: ' + (e.message || ''));
    } finally {
      setLoading(false);
    }
  };

  // ── 手动模式：解析选中的接口（多接口并行） ──
  const handleManualAnalyze = async () => {
    if (selectedIds.length === 0) { message.warning('请至少选择一个接口'); return; }
    setLoading(true);
    setResult(null);
    try {
      const res = await analyzeDocument(docText, providerCode.trim(), flowType, selectedIds);
      const data = res.data;
      // 多接口返回聚合结构，单接口返回扁平 RequirementResult
      if (data.interfaces) {
        // 多接口结果 — 取第一个成功的展示（后续可扩展多卡片）
        const firstSuccess = data.interfaces.find(i => i.status === 'SUCCESS');
        if (firstSuccess?.result) {
          setResult(firstSuccess.result);
          initFromResult(firstSuccess.result);
          message.success(`${data.successCount}/${data.totalCount} 个接口解析成功`);
        } else {
          message.warning('所有接口解析失败');
        }
      } else {
        // 单接口结果（向后兼容）
        setResult(data);
        initFromResult(data);
        if (data.flowType && data.flowType !== flowType) {
          setFlowType(data.flowType);
        }
        message.success('AI 解析完成');
      }
    } catch (e) {
      message.error('AI 服务暂不可用: ' + (e.message || ''));
    } finally {
      setLoading(false);
    }
  };

  // ── 保留旧版直接分析（兼容） ──
  const handleAnalyze = async () => {
    if (!docText.trim()) { message.warning('请输入接口文档内容'); return; }
    if (!providerCode.trim()) { message.warning('请输入资金方编码'); return; }
    setLoading(true);
    try {
      const res = await analyzeDocument(docText, providerCode.trim(), flowType);
      const data = res.data;
      setResult(data);
      initFromResult(data);
      if (data.flowType && data.flowType !== flowType) {
        setFlowType(data.flowType);
      }
      message.success('AI 解析完成');
    } catch (e) {
      message.error('AI 服务暂不可用: ' + (e.message || ''));
    } finally {
      setLoading(false);
    }
  };

  // ── 切换查看不同接口的结果 ──
  const handleSwitchInterface = (interfaceId) => {
    setActiveInterfaceId(interfaceId);
    const iface = splitInterfaces.find(s => s.interfaceId === interfaceId);
    if (iface?.result) {
      setResult(iface.result);
      initFromResult(iface.result);
    }
  };

  // ── 意图切换 ──
  const handleSwitchIntent = async (newIntent) => {
    setShowIntent(false);
    setLoading(true);
    try {
      if (newIntent === 'INTERFACE_DEV') {
        if (!providerCode.trim()) { message.warning('请输入资金方编码'); setLoading(false); return; }
        const splitRes = await splitDocument(docText, providerCode.trim());
        const interfaces = splitRes.data.interfaces || [];
        setSplitInterfaces(interfaces);
        setSelectedIds(interfaces.map(s => s.interfaceId));
        setIntent({ ...intent, type: 'INTERFACE_DEV', display: '接口开发' });
        setShowIntent(true);
      } else if (newIntent === 'KNOWLEDGE_QA') {
        const qaRes = await askQuestion(docText);
        setQaAnswer(qaRes.data.answer);
        setIntent({ type: 'KNOWLEDGE_QA', display: '知识问答', confidence: 1, reason: '用户切换' });
      } else if (newIntent === 'TROUBLESHOOTING') {
        const tsRes = await troubleshoot(docText);
        setTroubleshootResult(tsRes.data.analysis);
        setIntent({ type: 'TROUBLESHOOTING', display: '问题排查', confidence: 1, reason: '用户切换' });
      }
    } catch (e) {
      message.error('操作失败: ' + (e.message || ''));
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
    if (!value) { setEditingCell(null); return; }
    setMappings(prev => {
      if (value === prev[idx][field]) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
    setEditingCell(null);
  };


  const allMappingsAccepted = mappings.length > 0 && mappings.every(m => m.accepted);
  const acceptedCount = mappings.filter(m => m.accepted).length;

  // ── 流程图操作 ──
  const onConnect = useCallback((params) => setFlowEdges((eds) => addEdge(params, eds)), []);
  const onNodeClick = useCallback((_, node) => setSelFlowEl({ kind: 'node', ...node }), []);
  const onEdgeClick = useCallback((_, edge) => setSelFlowEl({ kind: 'edge', ...edge }), []);

  const updateFlowEl = (key, val) => {
    if (!selFlowEl) return;
    if (selFlowEl.kind === 'node') {
      setFlowNodes(nds => nds.map(n => n.id === selFlowEl.id
        ? { ...n, data: { ...n.data, config: { ...(n.data?.config || {}), [key]: val } } } : n));
      setSelFlowEl(prev => ({ ...prev, data: { ...prev.data, config: { ...(prev.data?.config || {}), [key]: val } } }));
    } else if (selFlowEl.kind === 'edge') {
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
      const res = await applyConfig(writeResult, providerCode, flowType);
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

      <Space style={{ marginBottom: 16 }}>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { label: '✋ 手动', value: 'manual' },
            { label: '🤖 自动', value: 'auto' },
          ]}
        />
        <Select
          value={flowType}
          onChange={setFlowType}
          style={{ width: 120 }}
          options={[
            { label: '🔍 自动识别', value: '' },
            { label: '放款 (LOAN)', value: 'LOAN' },
            { label: '授信 (CREDIT)', value: 'CREDIT' },
            { label: '还款 (REPAY)', value: 'REPAY' },
          ]}
        />
      </Space>

      <Card style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Input placeholder="资金方编码 (如 CMB)" value={providerCode}
            onChange={e => setProviderCode(e.target.value)} style={{ width: 200 }} />
          <TextArea placeholder="粘贴接口文档 / 输入业务问题 / 贴入报错日志..." rows={6}
            value={docText} onChange={e => setDocText(e.target.value)} />
          <Space>
            <Button type="primary" icon={<SendOutlined />} onClick={handleSend} loading={loading}>
              {loading ? '处理中...' : 'AI 解析'}
            </Button>
          </Space>
        </Space>
      </Card>

      {/* ── Phase 4: 意图识别结果 ── */}
      {showIntent && intent && (
        <Card size="small" style={{ marginBottom: 16, background: '#f6ffed', border: '1px solid #b7eb8f' }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <Tag color="blue">{intent.display}</Tag>
              <Tag color={intent.confidence > 0.8 ? 'green' : 'orange'}>置信度: {Math.round(intent.confidence * 100)}%</Tag>
              {intent.needUserConfirm && <Tag color="red">需确认</Tag>}
            </div>
            {(intent.type === 'KNOWLEDGE_QA' || intent.type === 'TROUBLESHOOTING') && (
              <Space size={4}>
                <Text type="secondary">不是{intent.display}？切换为：</Text>
                <Button size="small" onClick={() => handleSwitchIntent('INTERFACE_DEV')}>接口开发</Button>
                {intent.type !== 'KNOWLEDGE_QA' && <Button size="small" onClick={() => handleSwitchIntent('KNOWLEDGE_QA')}>知识问答</Button>}
                {intent.type !== 'TROUBLESHOOTING' && <Button size="small" onClick={() => handleSwitchIntent('TROUBLESHOOTING')}>问题排查</Button>}
              </Space>
            )}
          </Space>
        </Card>
      )}

      {/* ── Phase 4: 知识问答结果 ── */}
      {qaAnswer && (
        <Card size="small" title="💬 AI 回答" style={{ marginBottom: 16 }}>
          <Paragraph style={{ whiteSpace: 'pre-wrap' }}>{qaAnswer}</Paragraph>
          <Space style={{ marginTop: 8 }}>
            <Text type="secondary">不是知识问答？切换为：</Text>
            <Button size="small" onClick={() => handleSwitchIntent('INTERFACE_DEV')}>接口开发</Button>
            <Button size="small" onClick={() => handleSwitchIntent('TROUBLESHOOTING')}>问题排查</Button>
          </Space>
        </Card>
      )}

      {/* ── Phase 4: 问题排查结果 ── */}
      {troubleshootResult && (
        <Card size="small" title="🔧 诊断分析" style={{ marginBottom: 16 }}>
          <Paragraph style={{ whiteSpace: 'pre-wrap' }}>{troubleshootResult}</Paragraph>
          <Space style={{ marginTop: 8 }}>
            <Text type="secondary">不是问题排查？切换为：</Text>
            <Button size="small" onClick={() => handleSwitchIntent('INTERFACE_DEV')}>接口开发</Button>
            <Button size="small" onClick={() => handleSwitchIntent('KNOWLEDGE_QA')}>知识问答</Button>
          </Space>
        </Card>
      )}

      {/* ── Phase 4: 接口列表（多接口拆分结果） ── */}
      {splitInterfaces.length > 0 && intent?.type === 'INTERFACE_DEV' && (
        <Card size="small" title={
          <Space>
            <span>📋 检测到 {splitInterfaces.length} 个接口</span>
            {multiResults && (
              <Tag color="green">{multiResults.successCount} 成功</Tag>
            )}
            {multiResults && multiResults.failedCount > 0 && (
              <Tag color="red">{multiResults.failedCount} 失败</Tag>
            )}
            {activeInterfaceId && (
              <Tag color="blue">正在查看: {splitInterfaces.find(s => s.interfaceId === activeInterfaceId)?.interfaceName}</Tag>
            )}
          </Space>
        }
          style={{ marginBottom: 16 }}
          extra={
            <Space>
              <Button size="small" onClick={() => setSelectedIds(splitInterfaces.map(s => s.interfaceId))}>全选</Button>
              <Button size="small" onClick={() => setSelectedIds([])}>取消</Button>
            </Space>
          }>
          {splitInterfaces.map((iface, idx) => {
            const isSelected = selectedIds.includes(iface.interfaceId);
            const isActive = activeInterfaceId === iface.interfaceId;
            const hasResult = iface.status === 'SUCCESS' && iface.result;
            const statusColor = iface.status === 'SUCCESS' ? 'green' : iface.status === 'FAILED' ? 'red' : 'default';
            return (
            <div key={iface.interfaceId} style={{
              padding: '8px 12px', margin: '4px 0', borderRadius: 6,
              background: isActive ? '#e6f7ff' : '#fafafa',
              border: `1px solid ${isActive ? '#1890ff' : '#f0f0f0'}`,
            }}>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Space>
                  {/* 勾选框 — 单独点击区域，不触发切换 */}
                  <input type="checkbox" checked={isSelected} style={{ cursor: 'pointer' }}
                    onChange={(e) => {
                      e.stopPropagation();
                      setSelectedIds(prev => prev.includes(iface.interfaceId)
                        ? prev.filter(id => id !== iface.interfaceId)
                        : [...prev, iface.interfaceId]);
                    }} />
                  <Tag>{idx + 1}</Tag>
                  {/* 接口名 — 点击切换到该接口结果 */}
                  <Text strong={isActive} style={{ cursor: hasResult ? 'pointer' : 'default' }}
                    onClick={() => { if (hasResult) handleSwitchInterface(iface.interfaceId); }}>
                    {iface.interfaceName}
                  </Text>
                  {iface.endpoint && <Tag color="blue">{iface.endpoint}</Tag>}
                  {iface.status && <Tag color={statusColor}>{iface.status}</Tag>}
                  {iface.errorMessage && <Text type="danger" style={{ fontSize: 12 }}>{iface.errorMessage}</Text>}
                  {hasResult && isActive && <Tag color="blue">当前查看</Tag>}
                </Space>
                {/* 单个接口写入按钮 — 后续可用 */}
              </Space>
            </div>
            );
          })}
          {splitInterfaces.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <Space>
                <Text type="secondary">不是接口文档？切换为：</Text>
                <Button size="small" onClick={() => handleSwitchIntent('KNOWLEDGE_QA')}>知识问答</Button>
                <Button size="small" onClick={() => handleSwitchIntent('TROUBLESHOOTING')}>问题排查</Button>
              </Space>
            </div>
          )}
        </Card>
      )}

      {/* ── 手动模式 ── */}
      {mode === 'manual' && loading && <Spin tip="AI 正在分析..." style={{ display: 'block', margin: '40px auto' }} />}

      {mode === 'manual' && result && !loading && (
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
                    <div style={{ width: 220, padding: 12, border: '1px solid #f0f0f0', borderRadius: 8, background: '#fafafa' }}>
                      {selFlowEl ? (
                        <div>
                          <Text strong style={{ fontSize: 12 }}>
                            {selFlowEl.kind === 'node' ? `节点: ${selFlowEl.data?.label || selFlowEl.id}` : `连线: ${selFlowEl.id}`}
                          </Text>
                          <div style={{ marginTop: 8 }}>
                            {selFlowEl.kind === 'node' && selFlowEl.type === 'DATA_COLLECT' && <>
                              <Input size="small" placeholder="dataSourceCode" style={{ marginTop: 4 }}
                                value={selFlowEl.data?.config?.dataSourceCode || ''}
                                onChange={e => updateFlowEl('dataSourceCode', e.target.value)} />
                              <Input size="small" placeholder="outputKey" style={{ marginTop: 4 }}
                                value={selFlowEl.data?.config?.outputKey || ''}
                                onChange={e => updateFlowEl('outputKey', e.target.value)} />
                            </>}
                            {selFlowEl.kind === 'node' && selFlowEl.type === 'TEMPLATE_RENDER' && <>
                              <Input size="small" placeholder="templateCode" style={{ marginTop: 4 }}
                                value={selFlowEl.data?.config?.templateCode || ''}
                                onChange={e => updateFlowEl('templateCode', e.target.value)} />
                              <Input size="small" placeholder="outputKey" style={{ marginTop: 4 }}
                                value={selFlowEl.data?.config?.outputKey || ''}
                                onChange={e => updateFlowEl('outputKey', e.target.value)} />
                            </>}
                            {selFlowEl.kind === 'node' && selFlowEl.type === 'SEND_TO_FUND' && <>
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
                            {selFlowEl.kind === 'edge' && <>
                              <Input size="small" placeholder="Label" style={{ marginTop: 4 }}
                                value={selFlowEl.label || ''}
                                onChange={e => updateFlowEl('label', e.target.value)} />
                              <TextArea size="small" rows={2} placeholder="conditionExpr (SpEL)" style={{ marginTop: 4 }}
                                value={selFlowEl.conditionExpr || ''}
                                onChange={e => updateFlowEl('conditionExpr', e.target.value)} />
                            </>}
                            {selFlowEl.kind === 'node' && !['DATA_COLLECT', 'TEMPLATE_RENDER', 'SEND_TO_FUND'].includes(selFlowEl.type) && (
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

      {/* ── 自动模式 ── */}
      {mode === 'auto' && (
        <Card style={{ marginBottom: 16 }}>
          <Typography.Text type="secondary">
            自动闭环模式：先切换到「手动」模式完成接口解析，再切回「自动」启动闭环流程。
          </Typography.Text>
        </Card>
      )}

      {mode === 'auto' && docText.trim() && providerCode.trim() && splitInterfaces.length > 0 && (
        <AutoLoopPanel
          documentText={docText}
          providerCode={providerCode.trim()}
          flowType={flowType}
          selectedInterfaceIds={selectedIds}
        />
      )}

      {mode === 'auto' && docText.trim() && providerCode.trim() && splitInterfaces.length === 0 && (
        <AutoLoopPanel
          documentText={docText}
          providerCode={providerCode.trim()}
          flowType={flowType}
        />
      )}

      {mode === 'auto' && (!docText.trim() || !providerCode.trim()) && (
        <Card style={{ marginBottom: 16 }}>
          <Typography.Text type="secondary">请先输入资金方编码和接口文档。</Typography.Text>
        </Card>
      )}
    </div>
  );
}
