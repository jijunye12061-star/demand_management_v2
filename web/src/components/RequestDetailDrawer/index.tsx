import React from 'react';
import { Drawer, Tag, Typography, Alert } from 'antd';
import { ProDescriptions } from '@ant-design/pro-components';
import type { RequestItem } from '@/services/typings';
import { STATUS_ENUM } from '@/utils/constants';
import FileDownloadButton from '../FileDownloadButton';

const { Paragraph } = Typography;

interface RequestDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  request: RequestItem | null;
  /** mine=全字段, feed=隐藏敏感字段, admin=全字段 */
  downloadMode?: 'mine' | 'feed' | 'admin' | 'researcher-feed';
}

const RequestDetailDrawer: React.FC<RequestDetailDrawerProps> = ({
  open,
  onClose,
  request,
  downloadMode = 'mine',
}) => {
  if (!request) return null;

  // feed 模式隐藏: org_name, department, work_hours, sales_name, is_confidential
  const isFeed = downloadMode === 'feed' || downloadMode === 'researcher-feed';
  const statusCfg = STATUS_ENUM[request.status];

  return (
    <Drawer title="需求详情" width={720} open={open} onClose={onClose} destroyOnClose>
      {/* withdrawn 状态：顶部醒目展示退回原因 */}
      {request.status === 'withdrawn' && request.withdraw_reason && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="该需求已被退回"
          description={
            <>
              <div>退回研究员：{request.researcher_name || '-'}</div>
              <div>退回原因：{request.withdraw_reason}</div>
            </>
          }
        />
      )}

      <ProDescriptions<RequestItem> column={2} dataSource={request} bordered>
        <ProDescriptions.Item dataIndex="title" label="需求标题" span={2} />

        <ProDescriptions.Item label="状态">
          <Tag color={statusCfg?.status?.toLowerCase()}>
            {statusCfg?.text || request.status}
          </Tag>
        </ProDescriptions.Item>

        <ProDescriptions.Item dataIndex="request_type" label="需求类型" />
        <ProDescriptions.Item dataIndex="research_scope" label="研究范围" />

        {/* feed 模式隐藏以下敏感字段 */}
        {!isFeed && (
          <ProDescriptions.Item dataIndex="org_name" label="机构名称" />
        )}
        {!isFeed && (
          <ProDescriptions.Item dataIndex="department" label="对接部门" />
        )}
        {/* org_type 在 feed 模式下仍展示 */}
        <ProDescriptions.Item dataIndex="org_type" label="机构类型" />

        {!isFeed && (
          <ProDescriptions.Item label="是否保密">
            {request.is_confidential ? <Tag color="red">保密</Tag> : '公开'}
          </ProDescriptions.Item>
        )}

        {!isFeed && (
          <ProDescriptions.Item dataIndex="sales_name" label="销售姓名" />
        )}
        <ProDescriptions.Item dataIndex="researcher_name" label="对接研究员" />

        <ProDescriptions.Item dataIndex="created_at" label="创建时间" valueType="dateTime" />
        <ProDescriptions.Item dataIndex="completed_at" label="完成时间" valueType="dateTime" />

        {!isFeed && (
          <ProDescriptions.Item dataIndex="work_hours" label="预估工时(小时)" />
        )}

        {!isFeed && request.collaborators && request.collaborators.length > 0 && (
          <ProDescriptions.Item label="协作工时明细" span={2}>
            {request.collaborators.map((c) => (
              <Tag key={c.user_id}>{c.display_name}: {c.work_hours}h</Tag>
            ))}
          </ProDescriptions.Item>
        )}

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
                  mode={downloadMode === 'admin' ? 'mine' : downloadMode}
                />
              </div>
            )}
          </ProDescriptions.Item>
        )}
      </ProDescriptions>
    </Drawer>
  );
};

export default RequestDetailDrawer;
