import React, { useState, useEffect, useCallback } from 'react';
import { Drawer, Tag, Typography, Alert, Table, Button, Space } from 'antd';
import { ProDescriptions } from '@ant-design/pro-components';
import type { RequestItem } from '@/services/typings';
import { STATUS_ENUM, WORK_MODE_OPTIONS } from '@/utils/constants';
import { getRequestDetail } from '@/services/api';
import FileDownloadButton from '../FileDownloadButton';
import ProgressTimeline from '../ProgressTimeline';
import { useModel, history } from '@umijs/max';

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
  const { initialState } = useModel('@@initialState');
  const currentUser = initialState?.currentUser;

  // 内部导航栈：支持点击关联需求/衍生需求跳转
  const [navStack, setNavStack] = useState<RequestItem[]>([]);
  // 完整详情（含 revisions），仅用于初始 request（非导航）
  const [fullDetail, setFullDetail] = useState<RequestItem | null>(null);

  useEffect(() => {
    if (open) setNavStack([]);
  }, [open, request?.id]);

  useEffect(() => {
    if (open && request?.id) {
      getRequestDetail(request.id).then((d) => setFullDetail(d as RequestItem)).catch(() => {});
    }
    if (!open) setFullDetail(null);
  }, [open, request?.id]);

  const navigateTo = useCallback(async (id: number) => {
    try {
      const detail = await getRequestDetail(id);
      setNavStack((prev) => [...prev, detail as RequestItem]);
    } catch { /* noop */ }
  }, []);

  const navigateBack = useCallback(() => {
    setNavStack((prev) => prev.slice(0, -1));
  }, []);

  if (!request) return null;

  const displayRequest = navStack.length > 0 ? navStack[navStack.length - 1] : request;

  // feed 模式隐藏: org_name, department, work_hours, sales_name, is_confidential
  const isFeed = downloadMode === 'feed' || downloadMode === 'researcher-feed';
  const statusCfg = STATUS_ENUM[displayRequest.status];

  // 自动化标签判断（仅 automation_hours，revision 链接不算自动化）
  const isAutomated = displayRequest.automation_hours != null && displayRequest.automation_hours > 0;

  // 当前展示的 revisions / children（导航时从 navStack 顶端取，否则从 fullDetail 取）
  const detailSrc = navStack.length > 0 ? displayRequest : fullDetail;
  const revisions = detailSrc?.revisions;
  const children = detailSrc?.children;

  // 「发起修改」按钮显示条件
  const canRevise =
    displayRequest.status === 'completed' &&
    !displayRequest.parent_request_id &&
    (downloadMode === 'mine' || downloadMode === 'admin') &&
    (currentUser?.role === 'admin' ||
      (currentUser?.role === 'sales' &&
        (currentUser?.id === displayRequest.sales_id ||
          currentUser?.id === displayRequest.created_by)));

  return (
    <Drawer
      title={
        navStack.length > 0 ? (
          <Space>
            <Button size="small" onClick={navigateBack}>← 返回</Button>
            需求详情
          </Space>
        ) : '需求详情'
      }
      width={720}
      open={open}
      onClose={onClose}
      destroyOnClose
    >
      {/* 修改需求：顶部展示关联原始需求 */}
      {displayRequest.parent_request_id && displayRequest.link_type === 'revision' && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={
            <span>
              这是{' '}
              <a onClick={() => navigateTo(displayRequest.parent_request_id!)}>
                {displayRequest.parent_title || `#${displayRequest.parent_request_id}`}
              </a>
              {' '}的修改需求
            </span>
          }
        />
      )}

      {/* withdrawn 状态：顶部醒目展示退回原因 */}
      {displayRequest.status === 'withdrawn' && displayRequest.withdraw_reason && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="该需求已被退回"
          description={
            <>
              <div>退回研究员：{displayRequest.researcher_name || '-'}</div>
              <div>退回原因：{displayRequest.withdraw_reason}</div>
            </>
          }
        />
      )}

      <ProDescriptions<RequestItem> column={2} dataSource={displayRequest} bordered>
        <ProDescriptions.Item dataIndex="title" label="需求标题" span={2} />

        <ProDescriptions.Item label="状态" span={1}>
          <Space size={4}>
            <Tag color={statusCfg?.status?.toLowerCase()}>
              {statusCfg?.text || displayRequest.status}
            </Tag>
            {isAutomated && <Tag color="blue">自动化</Tag>}
          </Space>
        </ProDescriptions.Item>

        <ProDescriptions.Item label="需求类型">
          {displayRequest.request_type}
          {displayRequest.sub_type && (
            <span style={{ color: '#8c8c8c', marginLeft: 4 }}>/ {displayRequest.sub_type}</span>
          )}
        </ProDescriptions.Item>
        <ProDescriptions.Item label="服务模式">
          {WORK_MODE_OPTIONS.find((o) => o.value === displayRequest.work_mode)?.label || displayRequest.work_mode || '-'}
        </ProDescriptions.Item>
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
            {displayRequest.is_confidential ? <Tag color="red">保密</Tag> : '公开'}
          </ProDescriptions.Item>
        )}

        {!isFeed && (
          <ProDescriptions.Item dataIndex="sales_name" label="销售姓名" />
        )}
        <ProDescriptions.Item dataIndex="researcher_name" label="对接研究员" />

        <ProDescriptions.Item dataIndex="created_at" label="创建时间" valueType="dateTime" />
        <ProDescriptions.Item dataIndex="completed_at" label="完成时间" valueType="dateTime" />

        {!isFeed && (
          <ProDescriptions.Item dataIndex="work_hours" label="交付工时(小时)" />
        )}

        {!isFeed && displayRequest.automation_hours != null && displayRequest.automation_hours > 0 && (
          <ProDescriptions.Item label="自动化建设工时(小时)">
            {displayRequest.automation_hours}
          </ProDescriptions.Item>
        )}

        {!isFeed && displayRequest.collaborators && displayRequest.collaborators.length > 0 && (
          <ProDescriptions.Item label="协作工时明细" span={2}>
            {displayRequest.collaborators.map((c) => (
              <Tag key={c.user_id}>{c.display_name}: {c.work_hours}h</Tag>
            ))}
          </ProDescriptions.Item>
        )}

        <ProDescriptions.Item label="需求描述" span={2}>
          <Paragraph ellipsis={{ rows: 3, expandable: true, symbol: '展开' }}>
            {displayRequest.description || '-'}
          </Paragraph>
        </ProDescriptions.Item>

        {displayRequest.status === 'completed' && (
          <ProDescriptions.Item label="处理结果" span={2}>
            <Paragraph>{displayRequest.result_note || '-'}</Paragraph>
            {displayRequest.attachment_path && (
              <div style={{ marginTop: 8 }}>
                <FileDownloadButton
                  requestId={displayRequest.id}
                  fileName={`${displayRequest.title}-附件`}
                  mode={downloadMode === 'admin' ? 'mine' : downloadMode}
                />
              </div>
            )}
          </ProDescriptions.Item>
        )}
      </ProDescriptions>

      {/* 衍生需求列表 */}
      {children && children.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>衍生需求（{children.length}）</div>
          <Table
            size="small"
            rowKey="id"
            dataSource={children}
            pagination={false}
            columns={[
              {
                title: '标题',
                dataIndex: 'title',
                ellipsis: true,
                render: (title: string, row: any) => (
                  <a onClick={() => navigateTo(row.id)}>{title}</a>
                ),
              },
              {
                title: '状态',
                dataIndex: 'status',
                width: 80,
                render: (s: string) => {
                  const cfg = STATUS_ENUM[s];
                  return <Tag color={cfg?.status?.toLowerCase()}>{cfg?.text || s}</Tag>;
                },
              },
              { title: '交付工时(h)', dataIndex: 'work_hours', width: 100 },
              {
                title: '完成时间',
                dataIndex: 'completed_at',
                width: 160,
                render: (v: string) => v ? v.slice(0, 16).replace('T', ' ') : '-',
              },
            ]}
          />
        </div>
      )}

      {/* 修改历史 */}
      {revisions && revisions.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>修改历史（{revisions.length}次修改）</div>
          <Table
            size="small"
            rowKey="id"
            dataSource={revisions}
            pagination={false}
            columns={[
              {
                title: '标题',
                dataIndex: 'title',
                ellipsis: true,
                render: (title: string, row: any) => (
                  <a onClick={() => navigateTo(row.id)}>{title}</a>
                ),
              },
              {
                title: '状态',
                dataIndex: 'status',
                width: 72,
                render: (s: string) => {
                  const cfg = STATUS_ENUM[s];
                  return <Tag color={cfg?.status?.toLowerCase()}>{cfg?.text || s}</Tag>;
                },
              },
              { title: '研究员', dataIndex: 'researcher_name', width: 80 },
              { title: '工时(h)', dataIndex: 'work_hours', width: 72 },
              {
                title: '完成时间',
                dataIndex: 'completed_at',
                width: 148,
                render: (v: string) => v ? v.slice(0, 16).replace('T', ' ') : '-',
              },
            ]}
          />
        </div>
      )}

      {/* 进度记录时间线 */}
      {displayRequest && (
        <ProgressTimeline requestId={displayRequest.id} />
      )}

      {/* 发起修改按钮 */}
      {canRevise && (
        <div style={{ marginTop: 24, textAlign: 'right' }}>
          <Button
            type="primary"
            onClick={() => {
              const id = displayRequest.id;
              const n = (fullDetail?.revision_count ?? displayRequest.revision_count ?? 0) + 1;
              history.push(
                `/sales/submit?parent_id=${id}&link_type=revision&title=${encodeURIComponent(displayRequest.title + ' - 修改' + n)}`
              );
              onClose();
            }}
          >
            发起修改
          </Button>
        </div>
      )}
    </Drawer>
  );
};

export default RequestDetailDrawer;
