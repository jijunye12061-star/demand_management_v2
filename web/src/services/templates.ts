import { request } from '@umijs/max';

export interface TemplateItem {
  id: number;
  researcher_id: number;
  template_name: string;
  title_pattern: string;
  description?: string;
  request_type: string;
  research_scope?: string;
  org_name?: string;
  org_type?: string;
  department?: string;
  is_confidential: number;
  usage_count: number;
  created_at?: string;
  updated_at?: string;
}

export async function getMyTemplates() {
  return request<TemplateItem[]>('/api/v1/templates');
}

export async function createTemplate(data: Partial<TemplateItem>) {
  return request<TemplateItem>('/api/v1/templates', { method: 'POST', data });
}

export async function updateTemplate(id: number, data: Partial<TemplateItem>) {
  return request<TemplateItem>(`/api/v1/templates/${id}`, { method: 'PUT', data });
}

export async function deleteTemplate(id: number) {
  return request(`/api/v1/templates/${id}`, { method: 'DELETE' });
}

export async function createRequestFromTemplate(
  templateId: number,
  data: { sales_id: number; description?: string },
) {
  return request<{ request_id: number; title: string }>(
    `/api/v1/templates/${templateId}/create-request`,
    { method: 'POST', data },
  );
}

export async function saveRequestAsTemplate(requestId: number, templateName: string) {
  return request<{ template_id: number; template_name: string }>(
    `/api/v1/templates/save-from-request/${requestId}`,
    { method: 'POST', data: { template_name: templateName } },
  );
}
