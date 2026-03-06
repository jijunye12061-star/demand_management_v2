import React, { useRef, useState } from 'react';
import {
  PageContainer,
  ProTable,
  ActionType,
  ProColumns,
} from '@ant-design/pro-components';
import {
  Tag,
  Popconfirm,
  Modal,
  Form,
  Input,
  InputNumber,
  Upload,
  Tabs,
  App,
} from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { useModel } from '@umijs/max';
import {
  getRequests,
  acceptRequest,
  completeRequest,
  withdrawRequest,
  reopenRequest,
  revokeAcceptRequest,
} from '@/services/api';
import type { RequestItem } from '@/services/typings';
import { STATUS_ENUM, REQUEST_TYPE_OPTIONS } from '@/utils/constants';
import RequestDetailDrawer from '@/components/RequestDetailDrawer';
import FileDownloadButton from '@/components/FileDownloadButton';

const MyTasks: React.FC = () => {
  const { message } = App.useApp();
  const { initialState } = useModel('@@initialState');
  const currentUserId = initialState?.currentUser?.id;

  const pendingRef = useRef<ActionType>(null);
  const progressRef = useRef<ActionType>(null);
  const completedRef = useRef<ActionType>(null);
  const submittedRef = useRef<ActionType>(null);

  const [drawerVisible, setDrawerVisible] = useState(false);
  const [currentRow, setCurrentRow] = useState<RequestItem | null>(null);

  // 退回 Modal
  const [withdrawModalVisible, setWithdrawModalVisible] = useState(false);
  const [withdrawingId, setWithdrawingId] = useState<number>();
  const [withdrawForm] = Form.useForm();
  const [withdrawing, setWithdrawing] = useState(false);

  // 完成任务 Modal
  const [completeModalVisible, setCompleteModalVisible] = useState(false);
  const [completingId, setCompletingId] = useState<number>();
  const [completeForm] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [fileList, setFileList] = useState<any[]>([]);

  const openDetail = (record: RequestItem) => {
    setCurrentRow(record);
    setDrawerVisible(true);
  };

  // ── 接受任务 ──
  const handleAccept = async (id: number) => {
    try {
      await acceptRequest(id);
      message.success('已接受任务');
      pendingRef.current?.reload();
      progressRef.current?.reload();
    } catch (err: any) {
      message.error(err?.message || '接受任务失败');
    }
  };

  // ── 退回操作 ──
  const openWithdrawModal = (id: number) => {
    setWithdrawingId(id);
    setWithdrawModalVisible(true);
    withdrawForm.resetFields();
  };

  const handleWithdraw = async () => {
    try {
      const values = await withdrawForm.validateFields();
      setWithdrawing(true);
      await withdrawRequest(withdrawingId!, values.reason);
      message.success('已退回需求');
      setWithdrawModalVisible(false);
      pendingRef.current?.reload();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.message || '退回失败');
    } finally {
      setWithdrawing(false);
    }
  };

  // ── 完成任务 ──
  const openCompleteModal = (id: number) => {
    setCompletingId(id);
    setCompleteModalVisible(true);
    setFileList([]);
    completeForm.resetFields();
  };

  const handleComplete = async () => {
    try {
      const values = await completeForm.validateFields();
      setSubmitting(true);
      await completeRequest(completingId!, {
        result_note: values.result_note,
        work_hours: values.work_hours,
        attachment: fileList[0]?.originFileObj,
      });
      message.success('任务已完成');
      setCompleteModalVisible(false);
      progressRef.current?.reload();
      completedRef.current?.reload();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  // ── 撤销完成: completed → in_progress ──
  const handleReopen = async (id: number) => {
    try {
      await reopenRequest(id);
      message.success('已撤销完成，需求回到处理中');
      completedRef.current?.reload();
      progressRef.current?.reload();
    } catch (err: any) {
      message.error(err?.message || '撤销失败');
    }
  };

  // ── 撤销接受: in_progress → pending ──
  const handleRevokeAccept = async (id: number) => {
    try {
      await revokeAcceptRequest(id);
      message.success('已撤销接受，需求回到待处理');
      progressRef.current?.reload();
      pendingRef.current?.reload();
    } catch (err: any) {
      message.error(err?.message || '撤销失败');
    }
  };

  // ── 共享列定义 ──
  const baseColumns: ProColumns<RequestItem>[] = [
    {
      title: '需求标题',
      dataIndex: 'title',
      ellipsis: true,
      render: (dom, entity) => <a onClick={() => openDetail(entity)}>{dom}</a>,
    },
    {
      title: '关键字搜索',
      dataIndex: 'keyword',
      hideInTable: true,
      fieldProps: { placeholder: '支持标题/描述模糊搜索' },
    },
    { title: '机构名称', dataIndex: 'org_name', hideInSearch: true },
    {
      title: '需求类型',
      dataIndex: 'request_type',
      valueType: 'select',
      hideInSearch: true,
      fieldProps: { options: REQUEST_TYPE_OPTIONS },
    },
    { title: '销售', dataIndex: 'sales_name', hideInSearch: true },
    {
      title: '状态',
      dataIndex: 'status',
      hideInSearch: true,
      render: (_, entity) => {
        const cfg = STATUS_ENUM[entity.status];
        return <Tag color={cfg?.status?.toLowerCase()}>{cfg?.text || entity.status}</Tag>;
      },
    },
    { title: '创建时间', dataIndex: 'created_at', valueType: 'dateTime', hideInSearch: true },
  ];

  // ── 待处理: 接受 + 退回 ──
  const pendingColumns: ProColumns<RequestItem>[] = [
    ...baseColumns,
    {
      title: '操作',
      valueType: 'option',
      key: 'option',
      width: 150,
      render: (_, entity) => [
        <Popconfirm
          key="accept"
          title="确定接受此任务？"
          onConfirm={() => handleAccept(entity.id)}
        >
          <a>接受</a>
        </Popconfirm>,
        <a
          key="withdraw"
          style={{ color: '#faad14' }}
          onClick={() => openWithdrawModal(entity.id)}
        >
          退回
        </a>,
      ],
    },
  ];

  // ── 处理中: 完成 + 撤销接受 ──
  const progressColumns: ProColumns<RequestItem>[] = [
    ...baseColumns,
    {
      title: '操作',
      valueType: 'option',
      key: 'option',
      width: 180,
      render: (_, entity) => [
        <a key="complete" onClick={() => openCompleteModal(entity.id)}>完成</a>,
        <Popconfirm
          key="revoke"
          title="确定撤销接受？需求将回到待处理状态"
          onConfirm={() => handleRevokeAccept(entity.id)}
        >
          <a style={{ color: '#faad14' }}>撤销接受</a>
        </Popconfirm>,
      ],
    },
  ];

  // ── 已完成: 下载 + 撤销完成 ──
  const completedColumns: ProColumns<RequestItem>[] = [
    ...baseColumns,
    { title: '工时(h)', dataIndex: 'work_hours', hideInSearch: true, width: 80 },
    { title: '完成时间', dataIndex: 'completed_at', valueType: 'dateTime', hideInSearch: true },
    {
      title: '操作',
      valueType: 'option',
      key: 'option',
      width: 200,
      render: (_, entity) => [
        entity.attachment_path && (
          <FileDownloadButton
            key="download"
            mode="mine"
            requestId={entity.id}
            size="small"
          />
        ),
        <Popconfirm
          key="reopen"
          title="确定撤销完成？将清除处理结果、工时和附件记录，需求回到处理中"
          onConfirm={() => handleReopen(entity.id)}
        >
          <a style={{ color: '#faad14' }}>撤销完成</a>
        </Popconfirm>,
      ],
    },
  ];

  // ── 我提交的: 只读 ──
  const submittedColumns: ProColumns<RequestItem>[] = [
    ...baseColumns,
    {
      title: '操作',
      valueType: 'option',
      key: 'option',
      width: 100,
      render: (_, entity) => [
        <a key="view" onClick={() => openDetail(entity)}>详情</a>,
      ],
    },
  ];

  const makeRequest = (statusFilter: string, isSubmitted = false) => async (params: any) => {
    return getRequests({
      ...params,
      scope: 'mine',
      status: isSubmitted ? undefined : statusFilter,
      // "我提交的" tab 用 created_by 过滤，其他 tab 用 researcher_id
      ...(isSubmitted ? {} : { researcher_id: currentUserId }),
    });
  };

  const tabItems = [
    {
      key: 'pending',
      label: '待处理',
      children: (
        <ProTable<RequestItem>
          actionRef={pendingRef}
          columns={pendingColumns}
          rowKey="id"
          request={makeRequest('pending')}
          search={{ labelWidth: 100 }}
          pagination={{ pageSize: 10 }}
        />
      ),
    },
    {
      key: 'in_progress',
      label: '处理中',
      children: (
        <ProTable<RequestItem>
          actionRef={progressRef}
          columns={progressColumns}
          rowKey="id"
          request={makeRequest('in_progress')}
          search={{ labelWidth: 100 }}
          pagination={{ pageSize: 10 }}
        />
      ),
    },
    {
      key: 'completed',
      label: '已完成',
      children: (
        <ProTable<RequestItem>
          actionRef={completedRef}
          columns={completedColumns}
          rowKey="id"
          request={makeRequest('completed')}
          search={{ labelWidth: 100 }}
          pagination={{ pageSize: 10 }}
        />
      ),
    },
    {
      key: 'submitted',
      label: '我提交的',
      children: (
        <ProTable<RequestItem>
          actionRef={submittedRef}
          columns={submittedColumns}
          rowKey="id"
          request={makeRequest('', true)}
          search={{ labelWidth: 100 }}
          pagination={{ pageSize: 10 }}
        />
      ),
    },
  ];

  return (
    <PageContainer title="我的任务">
      <Tabs items={tabItems} destroyInactiveTabPane />

      <RequestDetailDrawer
        open={drawerVisible}
        onClose={() => { setDrawerVisible(false); setCurrentRow(null); }}
        request={currentRow}
        downloadMode="mine"
      />

      {/* 退回原因 Modal */}
      <Modal
        title="退回需求"
        open={withdrawModalVisible}
        onCancel={() => setWithdrawModalVisible(false)}
        onOk={handleWithdraw}
        confirmLoading={withdrawing}
        okText="确认退回"
        destroyOnClose
      >
        <Form form={withdrawForm} layout="vertical">
          <Form.Item
            name="reason"
            label="退回原因"
            rules={[{ required: true, message: '请填写退回原因' }]}
          >
            <Input.TextArea rows={4} placeholder="请说明退回原因，销售将看到此信息" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 完成任务 Modal */}
      <Modal
        title="完成任务"
        open={completeModalVisible}
        onCancel={() => setCompleteModalVisible(false)}
        onOk={handleComplete}
        confirmLoading={submitting}
        okText="确认完成"
        destroyOnClose
      >
        <Form form={completeForm} layout="vertical">
          <Form.Item name="result_note" label="处理说明">
            <Input.TextArea rows={3} placeholder="请填写处理结果说明" />
          </Form.Item>
          <Form.Item
            name="work_hours"
            label="工时（小时）"
            rules={[{ required: true, message: '请填写工时' }]}
          >
            <InputNumber min={0} step={0.5} precision={1} style={{ width: '100%' }} placeholder="如 2.5" />
          </Form.Item>
          <Form.Item label="上传附件">
            <Upload
              beforeUpload={() => false}
              maxCount={1}
              fileList={fileList}
              onChange={({ fileList: fl }) => setFileList(fl)}
            >
              <a><UploadOutlined /> 选择文件</a>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
};

export default MyTasks;
