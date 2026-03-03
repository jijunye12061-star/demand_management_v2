import { request } from '@umijs/max';
import type { Organization, Researcher, RequestItem, RequestListParams } from './typings';

// --- Organizations ---
export async function getOrganizations(team_id?: number) {
  return request<Organization[]>('/api/v1/organizations/by-team', {
    method: 'GET',
    params: { team_id },
  });
}

// 获取当前销售名下的机构列表（复用 by-team 接口）
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

export async function exportRequestsExcel(params: RequestListParams) {
  return request('/api/v1/exports/requests', {
    method: 'GET',
    params,
    responseType: 'blob',
  });
}

export async function cancelRequest(id: number) {
  return request(`/api/v1/requests/${id}/cancel`, {
    method: 'POST',
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
