import axios from 'axios';

// 开发环境通过 Vite proxy，生产环境通过反向代理 (nginx/Caddy)
const ADMIN_BASE = import.meta.env.VITE_ADMIN_BASE_URL || '';

const api = axios.create({
  baseURL: ADMIN_BASE,
  timeout: 10000,
});

api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    // 统一错误处理：后端 code != 0 透传，网络错误提示
    return Promise.reject(err);
  }
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
const AI_BASE = import.meta.env.VITE_AI_BASE_URL || '';

const aiApi = axios.create({
  baseURL: AI_BASE,
  timeout: 60000,
});

aiApi.interceptors.response.use(
  (res) => {
    // 检查业务层 code: ApiAiResponse.code != 0 时视为错误
    const body = res.data;
    if (body && typeof body.code === 'number' && body.code !== 0) {
      const err = new Error(body.msg || 'AI 服务返回错误');
      err.response = res;
      err.code = body.code;
      return Promise.reject(err);
    }
    return body;
  },
  (err) => Promise.reject(err)
);

/** 上传接口文档 → AI 解析生成配置 */
export const analyzeDocument = (documentText, providerCode, flowType = 'LOAN') =>
  aiApi.post('/api/ai/analyze', { documentText, providerCode, flowType });

/** 获取 AI 字段映射建议 */
export const suggestMappings = (documentText, providerCode) =>
  aiApi.post('/api/ai/suggest-mappings', { documentText, providerCode });

/** 审核通过后写入 FundLink */
export const applyConfig = (result, providerCode, flowType) =>
  aiApi.post('/api/ai/apply', { result, providerCode, flowType });

// ============================================================
// Auto Loop API — SSE 驱动闭环
// ============================================================

/** 创建自动闭环任务，返回 {taskId, taskNo} */
export const createLoop = (documentText, providerCode, flowType = 'LOAN') =>
  aiApi.post('/api/ai/loop', { documentText, providerCode, flowType });

/** 查询闭环任务状态 */
export const getLoopTask = (taskId) =>
  aiApi.get(`/api/ai/loop/${taskId}`);

/** 发送人工决策: decision = RETRY | SKIP | EDIT_AND_RETRY | ABORT | PUBLISH */
export const sendDecision = (taskId, decision, editedResult, comment) =>
  aiApi.post(`/api/ai/loop/${taskId}/decide`, { taskId, decision, editedResult, comment });

/** 获取任务当前解析结果（用于 EDIT_AND_RETRY 编辑） */
export const getLoopResult = (taskId) =>
  aiApi.get(`/api/ai/loop/${taskId}/result`);
