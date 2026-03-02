import React, { useState } from 'react';
import { Button, message, Modal, Select } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { downloadAttachment, getMineOrgs } from '@/services/api';

interface FileDownloadButtonProps {
  requestId: number;
  fileName?: string;
  size?: 'large' | 'middle' | 'small';
  type?: 'primary' | 'default' | 'dashed' | 'link' | 'text';
  // 新增模式区分：mine(我的需求，直接下) | feed(动态大厅，需选机构)
  mode?: 'mine' | 'feed';
}

const FileDownloadButton: React.FC<FileDownloadButtonProps> = ({
  requestId,
  fileName = '附件.pdf',
  size = 'middle',
  type = 'link',
  mode = 'mine'
}) => {
  const [loading, setLoading] = useState(false);

  // 弹窗相关状态
  const [modalVisible, setModalVisible] = useState(false);
  const [orgs, setOrgs] = useState<{ id: number; name: string }[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<string>();
  const [fetchingOrgs, setFetchingOrgs] = useState(false);

  // 核心下载逻辑 (复用)
  const triggerDownload = async (targetOrgName?: string) => {
    try {
      setLoading(true);
      const blob = await downloadAttachment(requestId, targetOrgName);

      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();

      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);

      message.success('下载成功');
      setModalVisible(false); // 成功后关闭弹窗
    } catch (error: any) {
      console.error('下载失败:', error);
      if (error.response?.status === 403 || error.data?.code === 40300) {
        message.error('权限不足：您无法下载该需求附件');
      } else {
        message.error('文件下载失败，请稍后重试');
      }
    } finally {
      setLoading(false);
    }
  };

  // 按钮点击事件
  const handleClick = async () => {
    if (mode === 'mine') {
      // 我的需求：直接下载
      triggerDownload();
    } else {
      // 需求动态：弹出机构选择框
      setModalVisible(true);
      setFetchingOrgs(true);
      try {
        const res = await getMineOrgs();
        setOrgs(res.orgs || []);
      } catch (error) {
        message.error('获取名下机构失败');
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
        onCancel={() => {
          setModalVisible(false);
          setSelectedOrg(undefined);
        }}
        onOk={() => {
          if (!selectedOrg) {
            message.warning('请先选择一个机构');
            return;
          }
          triggerDownload(selectedOrg);
        }}
        confirmLoading={loading}
        okText="确认并下载"
        destroyOnClose
      >
        <div style={{ padding: '20px 0' }}>
          <p style={{ marginBottom: 12, color: '#666' }}>
            下载该公开研究报告需要关联您名下的一家机构，以便记录服务转化：
          </p>
          <Select
            style={{ width: '100%' }}
            placeholder="请选择您名下的机构"
            loading={fetchingOrgs}
            options={orgs.map(org => ({ label: org.name, value: org.name }))}
            onChange={(val) => setSelectedOrg(val)}
          />
        </div>
      </Modal>
    </>
  );
};

export default FileDownloadButton;
