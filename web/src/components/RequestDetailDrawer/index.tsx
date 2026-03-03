import React from 'react';
import { Drawer, Tag, Typography } from 'antd';
import { ProDescriptions } from '@ant-design/pro-components';
import type { RequestItem } from '@/services/typings';
import { STATUS_ENUM } from '@/utils/constants';
import FileDownloadButton from '../FileDownloadButton';

const { Paragraph } = Typography;

interface RequestDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  request: RequestItem | null;
  /** 控制附件下载按钮行为：mine=直接下载，feed=弹窗选机构 */
  downloadMode?: 'mine' | 'feed';
}

const RequestDetailDrawer: React.FC<RequestDetailDrawerProps> = ({
  open,
  onClose,
  request,
  downloadMode = 'mine',
}) => {
  return (
    <Drawer title="需求详情" width={720} open={open} onClose={onClose} destroyOnClose>
      {request && (
        <ProDescriptions<RequestItem> column={2} dataSource={request} bordered>
          <ProDescriptions.Item dataIndex="title" label="需求标题" span={2} />

          <ProDescriptions.Item label="状态">
            <Tag color={STATUS_ENUM[request.status]?.status?.toLowerCase()}>
              {STATUS_ENUM[request.status]?.text || request.status}
            </Tag>
          </ProDescriptions.Item>

          <ProDescriptions.Item dataIndex="request_type" label="需求类型" />
          <ProDescriptions.Item dataIndex="research_scope" label="研究范围" />

          <ProDescriptions.Item dataIndex="org_name" label="机构名称" />
          <ProDescriptions.Item dataIndex="org_type" label="机构类型" />
          <ProDescriptions.Item dataIndex="department" label="对接部门" />

          <ProDescriptions.Item label="是否保密">
            {request.is_confidential ? <Tag color="red">保密</Tag> : '公开'}
          </ProDescriptions.Item>

          <ProDescriptions.Item dataIndex="sales_name" label="销售姓名" />
          <ProDescriptions.Item dataIndex="researcher_name" label="对接研究员" />

          <ProDescriptions.Item dataIndex="created_at" label="创建时间" valueType="dateTime" />
          <ProDescriptions.Item dataIndex="completed_at" label="完成时间" valueType="dateTime" />

          <ProDescriptions.Item dataIndex="work_hours" label="预估工时(小时)" />

          <ProDescriptions.Item label="需求描述" span={2}>
            <Paragraph ellipsis={{ rows: 3, expandable: true, symbol: '展开' }}>
              {request.description || '-'}
            </Paragraph>
          </ProDescriptions.Item>

          {request.status === 'completed' && (
            <ProDescriptions.Item label="处理结果" span={2}>
              <Paragraph>{request.result_note || '-'}</Paragraph>
              {request.attachment_path && (
                <div style={{ marginTop: 8 }}>
                  <FileDownloadButton
                    requestId={request.id}
                    fileName={`${request.title}-附件`}
                    mode={downloadMode}
                  />
                </div>
              )}
            </ProDescriptions.Item>
          )}
        </ProDescriptions>
      )}
    </Drawer>
  );
};

export default RequestDetailDrawer;
