import { request } from '@umijs/max';
import type { Organization, Researcher, SalesUser, RequestItem, RequestListParams } from './typings';

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
  data: { result_note?: string; work_hours?: number; attachment?: File },
) {
  const formData = new FormData();
  if (data.result_note) formData.append('result_note', data.result_note);
  if (data.work_hours !== undefined) formData.append('work_hours', String(data.work_hours));
  if (data.attachment) formData.append('attachment', data.attachment);

  return request(`/api/v1/requests/${id}/complete`, {
    method: 'POST',
    data: formData,
    requestType: 'form',
  });
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
