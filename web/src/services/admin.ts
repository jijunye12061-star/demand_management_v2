import { request } from '@umijs/max';
import type { RequestListParams } from './typings';

// ─── Stats ───

export async function getStatsOverview(period: string = 'month') {
  return request<{ total: number; pending: number; in_progress: number; completed: number; total_hours: number }>(
    '/api/v1/stats/overview', { params: { period } },
  );
}

export async function getResearcherRanking(period: string = 'month') {
  return request<any[]>('/api/v1/stats/researcher-ranking', { params: { period } });
}

export async function getResearcherMatrix() {
  return request<any[]>('/api/v1/stats/researcher-matrix');
}

export async function getTypeMatrix() {
  return request<any[]>('/api/v1/stats/type-matrix');
}

export async function getOrgMatrix() {
  return request<any[]>('/api/v1/stats/org-matrix');
}

export async function getSalesMatrix() {
  return request<any[]>('/api/v1/stats/sales-matrix');
}

export async function getCharts(period: string = 'month') {
  return request<{
    type_distribution: { name: string; value: number }[];
    org_type_distribution: { name: string; value: number }[];
    researcher_workload: { name: string; completed: number; in_progress: number; pending: number }[];
  }>('/api/v1/stats/charts', { params: { period } });
}

export async function getDownloadStats() {
  return request<{
    top_downloads: { request_id: number; title: string; total_count: number; unique_users: number }[];
    recent_logs: { request_title: string; user_name: string; org_name: string | null; downloaded_at: string }[];
  }>('/api/v1/stats/downloads');
}

// ─── Users CRUD ───

export async function getUsers(role?: string) {
  return request<any[]>('/api/v1/users', { params: { role } });
}

export async function createUser(data: { username: string; password: string; role: string; display_name: string; team_id?: number }) {
  return request('/api/v1/users', { method: 'POST', data });
}

export async function updateUser(id: number, data: { display_name?: string; role?: string; team_id?: number }) {
  return request(`/api/v1/users/${id}`, { method: 'PUT', data });
}

export async function deleteUser(id: number) {
  return request(`/api/v1/users/${id}`, { method: 'DELETE' });
}

export async function resetPassword(id: number, new_password: string) {
  return request(`/api/v1/users/${id}/reset-password`, { method: 'PUT', data: { new_password } });
}

// ─── Organizations CRUD ───

export async function getAllOrganizations() {
  return request<any[]>('/api/v1/organizations');
}

export async function createOrganization(data: { name: string; org_type: string }) {
  return request('/api/v1/organizations', { method: 'POST', data });
}

export async function updateOrganization(id: number, data: { name?: string; org_type?: string }) {
  return request(`/api/v1/organizations/${id}`, { method: 'PUT', data });
}

export async function deleteOrganization(id: number) {
  return request(`/api/v1/organizations/${id}`, { method: 'DELETE' });
}

// ─── Teams CRUD ───

export async function getTeams() {
  return request<any[]>('/api/v1/teams');
}

export async function createTeam(data: { name: string }) {
  return request('/api/v1/teams', { method: 'POST', data });
}

export async function deleteTeam(id: number) {
  return request(`/api/v1/teams/${id}`, { method: 'DELETE' });
}

export async function getTeamOrganizations(teamId: number) {
  return request<any[]>(`/api/v1/teams/${teamId}/organizations`);
}

export async function updateTeamOrganizations(teamId: number, org_ids: number[]) {
  return request(`/api/v1/teams/${teamId}/organizations`, { method: 'PUT', data: { org_ids } });
}

export async function updateTeamMembers(teamId: number, user_ids: number[]) {
  return request(`/api/v1/teams/${teamId}/members`, { method: 'PUT', data: { user_ids } });
}

// ─── Requests (admin scope) ───

export async function deleteRequest(id: number) {
  return request(`/api/v1/requests/${id}`, { method: 'DELETE' });
}

export async function reassignRequest(id: number, researcher_id: number) {
  return request(`/api/v1/requests/${id}/reassign`, { method: 'PUT', data: { researcher_id } });
}

export async function toggleConfidential(id: number, is_confidential: boolean) {
  return request(`/api/v1/requests/${id}/confidential`, { method: 'PUT', data: { is_confidential } });
}

// ─── Export (admin preview) ───

export async function getExportPreview(params: RequestListParams) {
  return request<{ items: any[]; total: number }>('/api/v1/exports/requests/preview', {
    params: { ...params, page: params.current, page_size: params.pageSize },
  });
}

export async function exportFullExcel(params: Record<string, any>) {
  return request('/api/v1/exports/requests', {
    method: 'GET',
    params,
    responseType: 'blob',
  });
}
