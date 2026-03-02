import React, { useState } from 'react';
import { Button, message } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { downloadAttachment, exportRequestsExcel } from '@/services/api';

interface Props {
  type: 'attachment' | 'excel';
  requestId?: number;
  params?: any; // 用于 Excel 导出时的过滤参数
  fileName: string;
  buttonText?: string;
  buttonType?: 'link' | 'primary' | 'default';
}

const FileDownloadButton: React.FC<Props> = ({ type, requestId, params, fileName, buttonText = '下载', buttonType = 'link' }) => {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    try {
      setLoading(true);
      const blob = type === 'attachment' && requestId
        ? await downloadAttachment(requestId)
        : await exportRequestsExcel(params || {});

      // 创建 Blob URL 并触发浏览器下载
      const url = window.URL.createObjectURL(new Blob([blob as any]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      message.error('文件下载失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button type={buttonType} icon={<DownloadOutlined />} loading={loading} onClick={handleDownload}>
      {buttonText}
    </Button>
  );
};

export default FileDownloadButton;
