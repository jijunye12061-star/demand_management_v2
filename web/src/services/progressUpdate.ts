import { request } from '@umijs/max';
import type { ProgressUpdateItem, ProgressUpdateListResponse } from './typings';

export async function createProgressUpdate(
  requestId: number,
  data: { content: string; work_hours: number },
) {
  return request<ProgressUpdateItem>(`/api/v1/requests/${requestId}/updates`, {
    method: 'POST',
    data,
  });
}

export async function getProgressUpdates(requestId: number) {
  return request<ProgressUpdateListResponse>(`/api/v1/requests/${requestId}/updates`, {
    method: 'GET',
  });
}

export async function editProgressUpdate(
  requestId: number,
  updateId: number,
  data: { content?: string; work_hours?: number },
) {
  return request<ProgressUpdateItem>(`/api/v1/requests/${requestId}/updates/${updateId}`, {
    method: 'PUT',
    data,
  });
}

export async function deleteProgressUpdate(requestId: number, updateId: number) {
  return request(`/api/v1/requests/${requestId}/updates/${updateId}`, {
    method: 'DELETE',
  });
}
