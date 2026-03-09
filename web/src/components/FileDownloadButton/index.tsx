import React, { useState } from 'react';
import { Button, message, Modal, Select } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { getMineOrgs } from '@/services/api';
import { request } from '@umijs/max';
declare const API_BASE_URL: string;

interface FileDownloadButtonProps {
  requestId: number;
  /** 仅作兜底，优先取后端返回的真实文件名 */
  fileName?: string;
  size?: 'large' | 'middle' | 'small';
  type?: 'primary' | 'default' | 'dashed' | 'link' | 'text';
  mode?: 'mine' | 'feed' | 'researcher-feed';
}

/** 从 Content-Disposition 提取文件名 */
function extractFilename(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback;
  // 优先 filename*=UTF-8''xxx 编码格式
  const utf8Match = disposition.match(/filename\*=UTF-8''(.+)/i);
  if (utf8Match) return decodeURIComponent(utf8Match[1]);
  // 次选 filename="xxx"
  const quoted = disposition.match(/filename="(.+?)"/i);
  if (quoted) return quoted[1];
  // 无引号
  const plain = disposition.match(/filename=([^\s;]+)/i);
  if (plain) return plain[1];
  return fallback;
}

const FileDownloadButton: React.FC<FileDownloadButtonProps> = ({
  requestId,
  fileName = '附件',
  size = 'middle',
  type = 'link',
  mode = 'mine',
}) => {
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [orgs, setOrgs] = useState<{ id: number; name: string }[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<string>();
  const [fetchingOrgs, setFetchingOrgs] = useState(false);

  const triggerDownload = async (targetOrgName?: string) => {
    try {
      setLoading(true);

      // 用原生 fetch 以访问 response headers
      const params = new URLSearchParams();
      if (targetOrgName) params.set('org_name', targetOrgName);
      const token = localStorage.getItem('access_token');
      const resp = await fetch(
        `${API_BASE_URL}/api/v1/files/download/${requestId}${params.toString() ? '?' + params.toString() : ''}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );

      if (!resp.ok) {
        if (resp.status === 403) {
          message.error('权限不足：您无法下载该需求附件');
        } else {
          message.error('文件下载失败，请稍后重试');
        }
        return;
      }

      const blob = await resp.blob();
      // 从 header 提取真实文件名
      const realName = extractFilename(
        resp.headers.get('Content-Disposition'),
        fileName,
      );

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', realName);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);

      message.success('下载成功');
      setModalVisible(false);
    } catch {
      message.error('文件下载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleClick = async () => {
    if (mode === 'mine') {
      triggerDownload();
    } else if (mode === 'researcher-feed') {
      triggerDownload('内部学习');
    } else {
      // 销售端 feed：弹窗选机构
      setModalVisible(true);
      setFetchingOrgs(true);
      try {
        const data = await getMineOrgs();
        setOrgs(Array.isArray(data) ? data : []);
      } catch {
        message.error('加载机构列表失败');
      } finally {
        setFetchingOrgs(false);
      }
    }
  };

  return (
    <>
      <Button
        type={type}
        size={size}
        icon={<DownloadOutlined />}
        loading={loading}
        onClick={handleClick}
      >
        下载附件
      </Button>

      <Modal
        title="选择关联机构"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => {
          if (!selectedOrg) {
            message.warning('请选择关联机构');
            return;
          }
          triggerDownload(selectedOrg);
        }}
        confirmLoading={loading}
        destroyOnClose
      >
        <p style={{ marginBottom: 12 }}>请选择此次下载关联的机构（用于追踪）：</p>
        <Select
          style={{ width: '100%' }}
          placeholder="请选择机构"
          loading={fetchingOrgs}
          value={selectedOrg}
          onChange={setSelectedOrg}
          showSearch
          optionFilterProp="label"
          options={orgs.map((o) => ({ label: o.name, value: o.name }))}
        />
      </Modal>
    </>
  );
};

export default FileDownloadButton;
