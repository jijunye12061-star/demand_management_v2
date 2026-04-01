export interface Organization {
  id: number;
  name: string;
  org_type: string;
}

export interface Researcher {
  id: number;
  username: string;
  display_name: string;
}

export interface SalesUser {
  id: number;
  display_name: string;
  team_id: number;
}

export interface CollaboratorInput {
  user_id: number;
  work_hours: number;
}

export interface CollaboratorDetail {
  user_id: number;
  display_name: string;
  work_hours: number;
}

export interface RequestItem {
  id: number;
  title: string;
  description?: string;
  request_type: string;
  research_scope?: string;
  org_name?: string;
  org_type?: string;
  department?: string;
  sales_id?: number;
  researcher_id: number;
  is_confidential?: boolean;
  created_at?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'withdrawn' | 'canceled';
  result_note?: string;
  attachment_path?: string;
  work_hours?: number;
  created_by?: number;
  updated_at?: string;
  completed_at?: string;
  sales_name?: string;
  researcher_name?: string;
  download_count?: number;
  withdraw_reason?: string;
  sub_type?: string;
  work_mode?: string;
  visibility?: string;
  collaborators?: CollaboratorDetail[];
  automation_hours?: number;
  parent_request_id?: number;
  link_type?: 'revision' | 'sub' | null;
  parent_title?: string;
  revision_count?: number;
  revisions?: {
    id: number;
    title: string;
    description?: string;
    status: string;
    work_hours?: number;
    researcher_name?: string;
    created_at?: string;
    completed_at?: string;
  }[];
  children?: { id: number; title: string; status: string; work_hours?: number; completed_at?: string }[];
}

export interface ProgressUpdateItem {
  id: number;
  request_id: number;
  user_id: number;
  user_name: string;
  content: string;
  work_hours: number;
  created_at?: string;
  updated_at?: string;
  can_edit: boolean;
  can_delete: boolean;
}

export interface ProgressUpdateListResponse {
  items: ProgressUpdateItem[];
  total_work_hours: number;
}

export interface RequestListParams {
  status?: string;
  request_type?: string;
  research_scope?: string;
  org_type?: string;
  researcher_id?: number;
  sales_id?: number;
  keyword?: string;
  date_from?: string;
  date_to?: string;
  scope?: 'mine' | 'feed';
  page?: number;
  page_size?: number;
  [key: string]: any;
}
