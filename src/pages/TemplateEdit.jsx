import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Form, Input, Select, Button, Table, Modal, Typography, Space, message, Card, Row, Col } from 'antd';
import { PlusOutlined, PlayCircleOutlined, DeleteOutlined, SaveOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import Editor from '@monaco-editor/react';
import { createTemplate, updateTemplate, getTemplates,
  getFieldMappings, createFieldMapping, deleteFieldMapping, previewTemplate } from '../api';

export default function TemplateEdit() {
  const { id } = useParams();
  const isNew = !id;
  const nav = useNavigate();
  const [form] = Form.useForm();
  const [mappings, setMappings] = useState([]);
  const [fmForm] = Form.useForm();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState('{}');
  const [previewResult, setPreviewResult] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isNew) {
      getTemplates(1, 50).then((res) => {
        const t = (res?.data?.records ?? []).find((r) => r.id === +id);
        if (t) form.setFieldsValue(t);
      }).catch((err) => message.error('加载失败: ' + (err.message || '网络错误')));
      getFieldMappings(id).then((res) => setMappings(res?.data ?? []))
        .catch((err) => message.error('加载失败: ' + (err.message || '网络错误')));
    }
  }, [id]);

  const onSave = async () => {
    const vals = await form.validateFields();
    setLoading(true);
    try {
      if (isNew) {
        const res = await createTemplate(vals);
        message.success('Created');
        nav(`/templates/${res.data}`, { replace: true });
      } else {
        await updateTemplate(id, vals);
        message.success('Updated');
      }
    } catch (err) {
      message.error('加载失败: ' + (err.message || '网络错误'));
    }
    setLoading(false);
  };

  const addMapping = async () => {
    const v = await fmForm.validateFields();
    try {
      await createFieldMapping(id, v);
      const res = await getFieldMappings(id);
      setMappings(res?.data ?? []);
      fmForm.resetFields();
    } catch (err) {
      message.error('加载失败: ' + (err.message || '网络错误'));
    }
  };

  const removeMapping = async (mid) => {
    try {
      await deleteFieldMapping(id, mid);
      const res = await getFieldMappings(id);
      setMappings(res?.data ?? []);
    } catch (err) {
      message.error('加载失败: ' + (err.message || '网络错误'));
    }
  };

  const onPreview = async () => {
    try {
      const res = await previewTemplate(id, previewData);
      setPreviewResult(res?.data?.renderResult ?? 'Error');
      setPreviewOpen(true);
    } catch { message.error('Preview failed'); }
  };

  return (
    <>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => nav('/templates')}>Back</Button>
        <Typography.Title level={4} style={{ margin: 0, flex: 1 }}>
          {isNew ? 'New Template' : 'Edit Template'}
        </Typography.Title>
        <Button icon={<PlayCircleOutlined />} onClick={onPreview} disabled={isNew}>Preview</Button>
        <Button type="primary" icon={<SaveOutlined />} onClick={onSave} loading={loading}>Save</Button>
      </div>
      <Row gutter={16}>
        <Col span={14}>
          <Card title="Template Content" size="small" style={{ borderRadius: 12 }}>
            <Form form={form} layout="vertical">
              <Form.Item name="templateCode" label="Code" rules={[{ required: true }]}>
                <Input placeholder="e.g. LOAN_REQ" />
              </Form.Item>
              <Form.Item name="templateName" label="Name" rules={[{ required: true }]}>
                <Input placeholder="e.g. Loan Request Template" />
              </Form.Item>
              <Form.Item name="templateType" label="Type" rules={[{ required: true }]}>
                <Select options={[{ label: 'REQUEST', value: 'REQUEST' }, { label: 'RESPONSE', value: 'RESPONSE' }]} />
              </Form.Item>
              <Form.Item name="providerId" label="Provider ID">
                <Input type="number" placeholder="1" />
              </Form.Item>
              <Form.Item name="content" label="FreeMarker Template" rules={[{ required: true }]}>
                <Editor height="320px" language="json" theme="vs-light"
                  value={form.getFieldValue('content')}
                  onChange={(v) => form.setFieldsValue({ content: v })} />
              </Form.Item>
            </Form>
          </Card>
        </Col>
        <Col span={10}>
          <Card title="Field Mappings" size="small" style={{ borderRadius: 12, marginBottom: 16 }}>
            <Form form={fmForm} layout="inline" style={{ marginBottom: 12 }}>
              <Form.Item name="fundField" rules={[{ required: true }]}>
                <Input placeholder="Fund field" style={{ width: 110 }} />
              </Form.Item>
              <Form.Item name="sourcePath" rules={[{ required: true }]}>
                <Input placeholder="Source path" style={{ width: 130 }} />
              </Form.Item>
              <Form.Item name="sortOrder">
                <Input placeholder="#" type="number" style={{ width: 50 }} />
              </Form.Item>
              <Button icon={<PlusOutlined />} onClick={addMapping}>Add</Button>
            </Form>
            <Table rowKey="id" dataSource={mappings} pagination={false} size="small"
              columns={[
                { title: 'Fund', dataIndex: 'fundField' },
                { title: 'Source', dataIndex: 'sourcePath', ellipsis: true },
                { title: 'Transform', dataIndex: 'transform', width: 90 },
                {
                  title: '', width: 40,
                  render: (_, r) => (
                    <Button type="link" size="small" danger icon={<DeleteOutlined />}
                      onClick={() => removeMapping(r.id)} />
                  ),
                },
              ]}
              locale={{ emptyText: 'No mappings yet' }} />
          </Card>
        </Col>
      </Row>
      <Modal title="Preview Result" open={previewOpen} width={600}
        onCancel={() => setPreviewOpen(false)} footer={null}>
        <Input.TextArea rows={6} value={previewData}
          onChange={(e) => setPreviewData(e.target.value)}
          placeholder='{"custName":"Alice","idType":"01",...}' />
        <div style={{ marginTop: 12 }}>
          <Typography.Text type="secondary">Output:</Typography.Text>
          <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 8, marginTop: 4, maxHeight: 300, overflow: 'auto' }}>
            {previewResult}
          </pre>
        </div>
      </Modal>
    </>
  );
}
