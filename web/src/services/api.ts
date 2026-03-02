import { request } from '@umijs/max';
import type { Organization, Researcher, RequestItem, RequestListParams } from './typings';

// --- Organizations ---
export async function getOrganizations(team_id?: number) {
  return request<Organization[]>('/api/v1/organizations/by-team', {
    method: 'GET',
    params: { team_id },
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
  // 注意：后端返回 { items, total }，而 ProTable 期望 { data, total, success }
  // 我们在 Service 层做一层适配转换
  const res = await request<{ items: RequestItem[]; total: number }>('/api/v1/requests', {
    method: 'GET',
    params: {
      ...params,
      // 适配 ProTable 默认的分页参数名 (current -> page)
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

// 补充：获取当前销售名下的机构列表 (用于下载附件时选择)
export async function getMineOrgs() {
  return request<{ orgs: { id: number; name: string }[] }>('/api/v1/orgs/mine', {
    method: 'GET',
  });
}

// 修改：下载附件接口支持传入 org_name
export async function downloadAttachment(requestId: number, org_name?: string) {
  return request(`/api/v1/files/download/${requestId}`, {
    method: 'GET',
    params: { org_name }, // 动态传参
    responseType: 'blob',
  });
}
