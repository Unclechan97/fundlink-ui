import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8080',
  timeout: 10000,
});

api.interceptors.response.use(
  (res) => res.data,
  (err) => Promise.reject(err)
);

// ---- Provider ----
export const getProviders = (page = 1, size = 10) =>
  api.get('/api/admin/providers', { params: { page, size } });
export const createProvider = (data) =>
  api.post('/api/admin/providers', data);
export const updateProvider = (id, data) =>
  api.put(`/api/admin/providers/${id}`, data);
export const deleteProvider = (id) =>
  api.delete(`/api/admin/providers/${id}`);

// ---- DataSource ----
export const getDataSources = (page = 1, size = 10) =>
  api.get('/api/admin/data-sources', { params: { page, size } });
export const createDataSource = (data) =>
  api.post('/api/admin/data-sources', data);

// ---- MockRule ----
export const getMockRules = (page = 1, size = 10) =>
  api.get('/api/admin/mock-rules', { params: { page, size } });
export const createMockRule = (data) =>
  api.post('/api/admin/mock-rules', data);
export const updateMockRule = (id, data) =>
  api.put(`/api/admin/mock-rules/${id}`, data);
export const deleteMockRule = (id) =>
  api.delete(`/api/admin/mock-rules/${id}`);
export const toggleMockRule = (id) =>
  api.put(`/api/admin/mock-rules/${id}/toggle`);
export const debugMock = (data) =>
  api.post('/api/mock/debug', data);

// ---- Template ----
export const getTemplates = (page = 1, size = 10) =>
  api.get('/api/admin/templates', { params: { page, size } });
export const createTemplate = (data) =>
  api.post('/api/admin/templates', data);
export const updateTemplate = (id, data) =>
  api.put(`/api/admin/templates/${id}`, data);
export const deleteTemplate = (id) =>
  api.delete(`/api/admin/templates/${id}`);
export const previewTemplate = (id, testData) =>
  api.post(`/api/admin/templates/${id}/preview`, { testData });

// ---- FieldMapping ----
export const getFieldMappings = (templateId) =>
  api.get(`/api/admin/templates/${templateId}/mappings`);
export const createFieldMapping = (templateId, data) =>
  api.post(`/api/admin/templates/${templateId}/mappings`, data);
export const updateFieldMapping = (templateId, id, data) =>
  api.put(`/api/admin/templates/${templateId}/mappings/${id}`, data);
export const deleteFieldMapping = (templateId, id) =>
  api.delete(`/api/admin/templates/${templateId}/mappings/${id}`);

// ---- EnumMapping ----
export const getEnumMappings = (page = 1, size = 50) =>
  api.get('/api/admin/enum-mappings', { params: { page, size } });
export const createEnumMapping = (data) =>
  api.post('/api/admin/enum-mappings', data);
export const deleteEnumMapping = (id) =>
  api.delete(`/api/admin/enum-mappings/${id}`);

// ---- Flow ----
export const getFlows = (page = 1, size = 10) =>
  api.get('/api/admin/flows', { params: { page, size } });
export const createFlow = (data) =>
  api.post('/api/admin/flows', data);
export const updateFlow = (id, data) =>
  api.put(`/api/admin/flows/${id}`, data);
export const deleteFlow = (id) =>
  api.delete(`/api/admin/flows/${id}`);
export const publishFlow = (id) =>
  api.put(`/api/admin/flows/${id}/publish`);

// ---- FlowInstance ----
export const getFlowInstances = (page = 1, size = 10) =>
  api.get('/api/admin/flow-instances', { params: { page, size } });

// ---- ApiLog ----
export const getApiLogs = (page = 1, size = 10) =>
  api.get('/api/admin/api-logs', { params: { page, size } });

// ============================================================
// AI Copilot API (port 8081)
// ============================================================
const aiApi = axios.create({
  baseURL: 'http://localhost:3000',  // Vite proxy → /api/ai → 8081
  timeout: 60000,
});

aiApi.interceptors.response.use(
  (res) => res.data,
  (err) => Promise.reject(err)
);

/** 上传接口文档 → AI 解析生成配置 */
export const analyzeDocument = (documentText, providerCode) =>
  aiApi.post('/api/ai/analyze', { documentText, providerCode });

/** 获取 AI 字段映射建议 */
export const suggestMappings = (documentText, providerCode) =>
  aiApi.post('/api/ai/suggest-mappings', { documentText, providerCode });

/** 审核通过后写入 FundLink */
export const applyConfig = (result, providerCode, flowType) =>
  aiApi.post('/api/ai/apply', { result, providerCode, flowType });
