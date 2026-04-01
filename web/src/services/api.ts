import { request } from '@umijs/max';
import type { Organization, Researcher, SalesUser, RequestItem, RequestListParams, CollaboratorInput } from './typings';

// --- Organizations ---
export async function getOrganizations(team_id?: number, load_all?: boolean) {
  return request<Organization[]>('/api/v1/organizations/by-team', {
    method: 'GET',
    params: { team_id, load_all: load_all || undefined },
  });
}

export async function getMineOrgs() {
  return request<Organization[]>('/api/v1/organizations/by-team', {
    method: 'GET',
  });
}

// --- Users ---
export async function getResearchers() {
  return request<Researcher[]>('/api/v1/users/researchers', {
    method: 'GET',
  });
}

export async function getSales() {
  return request<SalesUser[]>('/api/v1/users/sales', {
    method: 'GET',
  });
}

// --- Requests ---
export async function createRequest(data: Partial<RequestItem>) {
  return request<{ id: number }>('/api/v1/requests', {
    method: 'POST',
    data,
  });
}

export async function getRequests(params: RequestListParams) {
  const res = await request<{ items: RequestItem[]; total: number }>('/api/v1/requests', {
    method: 'GET',
    params: {
      ...params,
      page: params.current,
      page_size: params.pageSize,
    },
  });
  return {
    data: res.items,
    total: res.total,
    success: true,
  };
}

/** 编辑需求 (sales: 仅 pending/withdrawn 自己的; admin: 任意) */
export async function updateRequest(id: number, data: Partial<RequestItem>) {
  return request(`/api/v1/requests/${id}`, {
    method: 'PUT',
    data,
  });
}

/** 重新提交 (withdrawn → pending, 可同时更新字段) */
export async function resubmitRequest(id: number, data: Partial<RequestItem>) {
  return request(`/api/v1/requests/${id}/resubmit`, {
    method: 'POST',
    data,
  });
}

export async function cancelRequest(id: number) {
  return request(`/api/v1/requests/${id}/cancel`, {
    method: 'POST',
  });
}

export async function acceptRequest(id: number) {
  return request(`/api/v1/requests/${id}/accept`, {
    method: 'POST',
  });
}

/** 研究员退回需求 */
export async function withdrawRequest(id: number, reason: string) {
  return request(`/api/v1/requests/${id}/withdraw`, {
    method: 'POST',
    data: { reason },
  });
}

export async function completeRequest(
  id: number,
  data: { result_note?: string; work_hours?: number; automation_hours?: number; attachment?: File; collaborators?: CollaboratorInput[]; completed_at?: string },
) {
  const formData = new FormData();
  if (data.result_note) formData.append('result_note', data.result_note);
  if (data.work_hours !== undefined) formData.append('work_hours', String(data.work_hours));
  if (data.automation_hours !== undefined && data.automation_hours !== null) {
    formData.append('automation_hours', String(data.automation_hours));
  }
  if (data.completed_at) formData.append('completed_at', data.completed_at);
  if (data.attachment) formData.append('attachment', data.attachment);
  if (data.collaborators?.length) {
    formData.append('collaborators', JSON.stringify(data.collaborators));
  }

  return request(`/api/v1/requests/${id}/complete`, {
    method: 'POST',
    data: formData,
    requestType: 'form',
  });
}

export async function searchLinkableRequests(keyword: string, limit = 10) {
  return request<{ id: number; title: string; researcher_name: string; completed_at?: string }[]>(
    '/api/v1/requests/search-linkable',
    { method: 'GET', params: { keyword, limit } },
  );
}

export async function exportRequestsExcel(params: RequestListParams) {
  return request('/api/v1/exports/requests', {
    method: 'GET',
    params,
    responseType: 'blob',
  });
}

// 下载附件，feed 模式下传 org_name 用于追踪
export async function downloadAttachment(requestId: number, org_name?: string) {
  return request(`/api/v1/files/download/${requestId}`, {
    method: 'GET',
    params: org_name ? { org_name } : undefined,
    responseType: 'blob',
  });
}

// ── 新增：研究员撤销完成 (completed → in_progress) ──
export async function reopenRequest(id: number) {
  return request(`/api/v1/requests/${id}/reopen`, {
    method: 'POST',
  });
}

// ── 新增：研究员撤销接受 (in_progress → pending) ──
export async function revokeAcceptRequest(id: number) {
  return request(`/api/v1/requests/${id}/revoke-accept`, {
    method: 'POST',
  });
}

/** 获取单条需求详情（含 collaborators 数组） */
export async function getRequestDetail(id: number) {
  return request<RequestItem>(`/api/v1/requests/${id}`, { method: 'GET' });
}

/** 需求动态图表统计 */
export async function getFeedStats(params?: Record<string, any>) {
  return request<{
    total: number;
    by_org_request: { org_type: string; request_type: string; count: number }[];
    by_org_scope: { org_type: string; research_scope: string; count: number }[];
  }>('/api/v1/requests/feed-stats', {
    method: 'GET',
    params,
  });
}

/** 研究员自身统计概览 */
export async function getMyOverview(period: string) {
  return request<{
    total: number; pending: number; in_progress: number; completed: number; total_hours: number;
  }>('/api/v1/stats/my-overview', { method: 'GET', params: { period } });
}

/** 研究员自身详细统计（周趋势+类型分布） */
export async function getMyDetail() {
  return request<{
    summary: {
      completed: number; in_progress: number; pending: number; total_hours: number;
      collab_count: number; collab_hours: number;
    };
    weekly_trend: { week: string; count: number }[];
    type_distribution: { name: string; value: number }[];
    org_distribution: { name: string; value: number }[];
  }>('/api/v1/stats/my-detail', { method: 'GET' });
}
