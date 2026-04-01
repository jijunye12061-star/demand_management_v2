import React, { useEffect, useRef, useState } from 'react';
import {
  PageContainer,
  ProTable,
  ProForm,
  ProFormText,
  ProFormTextArea,
  ProFormSelect,
  ProFormDependency,
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
  Button,
  Select,
  Space,
  DatePicker,
} from 'antd';
import { MinusCircleOutlined, UploadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useModel, history } from '@umijs/max';
import {
  getRequests,
  getResearchers,
  acceptRequest,
  completeRequest,
  withdrawRequest,
  reopenRequest,
  revokeAcceptRequest,
  cancelRequest,
  updateRequest,
  getOrganizations,
} from '@/services/api';
import { getProgressUpdates } from '@/services/progressUpdate';
import type { RequestItem, Organization } from '@/services/typings';
import { STATUS_ENUM, REQUEST_TYPE_OPTIONS, SUB_TYPE_OPTIONS, RESEARCH_SCOPE_OPTIONS, ORG_DEPARTMENT_MAP } from '@/utils/constants';
import RequestDetailDrawer from '@/components/RequestDetailDrawer';
import FileDownloadButton from '@/components/FileDownloadButton';
import ProgressUpdateModal from '../components/ProgressUpdateModal';

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

  // 编辑 Modal（我提交的 Tab，不含重新提交——重新提交跳转页面）
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState<RequestItem | null>(null);
  const [editForm] = Form.useForm();
  const [orgList, setOrgList] = useState<Organization[]>([]);
  const [editSubmitting, setEditSubmitting] = useState(false);

  // 更新进度 Modal
  const [progressModalVisible, setProgressModalVisible] = useState(false);
  const [progressingId, setProgressingId] = useState<number>();

  // 完成任务 Modal
  const [completeModalVisible, setCompleteModalVisible] = useState(false);
  const [completingId, setCompletingId] = useState<number>();
  const [completeForm] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [fileList, setFileList] = useState<any[]>([]);
  const [researcherOptions, setResearcherOptions] = useState<{ label: string; value: number }[]>([]);

  useEffect(() => {
    if (completeModalVisible) {
      getResearchers().then((list) => {
        setResearcherOptions(
          list
            .filter((u) => u.id !== currentUserId)
            .map((u) => ({ label: u.display_name, value: u.id })),
        );
      });
    }
  }, [completeModalVisible]);

  const openDetail = (record: RequestItem) => {
    setCurrentRow(record);
    setDrawerVisible(true);
  };

  // ── 编辑（我提交的，仅 pending 状态） ──
  const openEdit = async (record: RequestItem) => {
    setEditingRecord(record);
    setEditModalVisible(true);
    editForm.setFieldsValue({
      title: record.title,
      description: record.description,
      request_type: record.request_type,
      sub_type: record.sub_type,
      research_scope: record.research_scope,
      org_name: record.org_name,
      org_type: record.org_type,
      department: record.department,
      researcher_id: record.researcher_id,
      is_confidential: record.is_confidential,
    });
    try {
      const orgs = await getOrganizations();
      setOrgList(orgs);
    } catch { /* noop */ }
  };

  const handleEditSubmit = async () => {
    try {
      const values = await editForm.validateFields();
      setEditSubmitting(true);
      await updateRequest(editingRecord!.id, values);
      message.success('需求已更新');
      setEditModalVisible(false);
      submittedRef.current?.reload();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.message || '操作失败');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleCancelRequest = async (id: number) => {
    try {
      await cancelRequest(id);
      message.success('需求已取消');
      submittedRef.current?.reload();
    } catch (err: any) {
      message.error(err?.message || '取消失败');
    }
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
  const openCompleteModal = async (id: number) => {
    setCompletingId(id);
    setCompleteModalVisible(true);
    setFileList([]);
    completeForm.resetFields();
    try {
      const result = await getProgressUpdates(id);
      if (result.total_work_hours > 0) {
        completeForm.setFieldsValue({ work_hours: result.total_work_hours });
      }
    } catch { /* 预填失败不影响主流程 */ }
  };

  const handleComplete = async () => {
    try {
      const values = await completeForm.validateFields();
      setSubmitting(true);
      await completeRequest(completingId!, {
        result_note: values.result_note,
        work_hours: values.work_hours,
        automation_hours: values.automation_hours,
        attachment: fileList[0]?.originFileObj,
        collaborators: values.collaborators || [],
        completed_at: values.completed_at
          ? dayjs(values.completed_at).format('YYYY-MM-DD') + ' 23:59:59'
          : undefined,
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
      render: (dom, entity) => (
        <span>
          <a onClick={() => openDetail(entity)}>{dom}</a>
          {entity.automation_hours! > 0 && (
            <Tag color="blue" style={{ marginLeft: 4, fontSize: 11 }}>自动化</Tag>
          )}
          {entity.link_type === 'revision' && (
            <Tag color="orange" style={{ marginLeft: 4, fontSize: 11 }}>修改</Tag>
          )}
          {!entity.parent_request_id && (entity.revision_count ?? 0) > 0 && (
            <Tag color="blue" style={{ marginLeft: 4, fontSize: 11 }}>{entity.revision_count}次修改</Tag>
          )}
        </span>
      ),
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

  // ── 处理中: 更新进度 + 完成 + 撤销接受 ──
  const progressColumns: ProColumns<RequestItem>[] = [
    ...baseColumns,
    {
      title: '操作',
      valueType: 'option',
      key: 'option',
      width: 220,
      render: (_, entity) => [
        <a key="progress" onClick={() => { setProgressingId(entity.id); setProgressModalVisible(true); }}>更新进度</a>,
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

  // ── 我提交的: 详情 + 编辑/重提/取消（自己代提的） ──
  const submittedColumns: ProColumns<RequestItem>[] = [
    ...baseColumns,
    {
      title: '操作',
      valueType: 'option',
      key: 'option',
      width: 250,
      render: (_, entity) => [
        <a key="view" onClick={() => openDetail(entity)}>详情</a>,
        entity.created_by === currentUserId && entity.status === 'pending' && (
          <a key="edit" onClick={() => openEdit(entity)}>编辑</a>
        ),
        entity.created_by === currentUserId && entity.status === 'withdrawn' && (
          <a key="resubmit" style={{ color: '#1890ff' }} onClick={() => history.push(`/researcher/submit?mode=resubmit&id=${entity.id}`)}>重新提交</a>
        ),
        entity.created_by === currentUserId && (entity.status === 'pending' || entity.status === 'withdrawn') && (
          <Popconfirm
            key="cancel"
            title="确定要取消这个需求吗？"
            description="取消后该需求将不再处理"
            onConfirm={() => handleCancelRequest(entity.id)}
          >
            <a style={{ color: '#ff4d4f' }}>取消</a>
          </Popconfirm>
        ),
        entity.status === 'completed' && entity.attachment_path && (
          <FileDownloadButton
            key="download"
            mode="mine"
            requestId={entity.id}
            size="small"
          />
        ),
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

      {progressingId && (
        <ProgressUpdateModal
          open={progressModalVisible}
          onClose={() => setProgressModalVisible(false)}
          onSuccess={() => progressRef.current?.reload()}
          requestId={progressingId}
        />
      )}

      {/* 编辑 Modal（我提交的 Tab） */}
      <Modal
        title="编辑需求"
        open={editModalVisible}
        onCancel={() => { setEditModalVisible(false); setEditingRecord(null); editForm.resetFields(); }}
        onOk={handleEditSubmit}
        confirmLoading={editSubmitting}
        okText="保存"
        width={640}
        destroyOnClose
      >
        <ProForm form={editForm} submitter={false} layout="vertical">
          <ProFormText name="title" label="需求标题" rules={[{ required: true }]} />
          <ProFormTextArea name="description" label="需求描述" />
          <ProFormSelect
            name="request_type"
            label="需求类型"
            options={REQUEST_TYPE_OPTIONS}
            rules={[{ required: true }]}
            fieldProps={{ onChange: () => editForm.setFieldValue('sub_type', undefined) }}
          />
          <ProFormDependency name={['request_type']}>
            {({ request_type }) => {
              const subOpts = SUB_TYPE_OPTIONS[request_type];
              if (!subOpts) return null;
              return (
                <ProFormSelect
                  name="sub_type"
                  label="二级分类"
                  options={subOpts}
                  placeholder="请选择二级分类（选填）"
                />
              );
            }}
          </ProFormDependency>
          <ProFormSelect name="research_scope" label="研究范围" options={RESEARCH_SCOPE_OPTIONS} />
          <ProFormSelect
            name="org_name"
            label="机构名称"
            rules={[{ required: true }]}
            options={orgList.map((o) => ({ label: o.name, value: o.name }))}
            fieldProps={{
              onChange: (val: string) => {
                const org = orgList.find((o) => o.name === val);
                editForm.setFieldsValue({ org_type: org?.org_type, department: undefined });
              },
            }}
          />
          <ProFormDependency name={['org_type']}>
            {({ org_type }) => {
              const depts = ORG_DEPARTMENT_MAP[org_type];
              if (!depts) return null;
              return (
                <ProFormSelect
                  name="department"
                  label="对接部门"
                  options={depts.map((d) => ({ label: d, value: d }))}
                />
              );
            }}
          </ProFormDependency>
          <ProFormSelect
            name="researcher_id"
            label="研究员"
            rules={[{ required: true }]}
            request={async () => {
              const list = await getResearchers();
              return list.map((r) => ({ label: r.display_name, value: r.id }));
            }}
          />
        </ProForm>
      </Modal>

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
        width={640}
      >
        <Form form={completeForm} layout="vertical">
          <Form.Item name="result_note" label="处理说明">
            <Input.TextArea rows={3} placeholder="请填写处理结果说明" />
          </Form.Item>
          <Form.Item
            name="work_hours"
            label="交付工时（小时）"
            rules={[{ required: true, message: '请填写工时' }]}
          >
            <InputNumber min={0} step={0.5} precision={1} style={{ width: '100%' }} placeholder="如 2.5" />
          </Form.Item>
          <Form.Item name="automation_hours" label="自动化建设工时（小时）">
            <InputNumber min={0} step={0.5} precision={1} style={{ width: '100%' }}
              placeholder="选填，如本次涉及自动化流程建设" />
          </Form.Item>
          <Form.Item name="completed_at" label="完成时间（可补录历史）">
            <DatePicker
              style={{ width: '100%' }}
              disabledDate={(d) => d.isAfter(dayjs())}
              placeholder="默认为当前时间，可选择历史日期"
            />
          </Form.Item>

          {/* 协作研究员（可选） */}
          <Form.List name="collaborators">
            {(fields, { add, remove }) => (
              <>
                <div style={{ marginBottom: 8 }}>
                  <span style={{ marginRight: 8 }}>协作研究员</span>
                  <Button type="link" size="small" onClick={() => add()}>
                    + 添加协作者
                  </Button>
                </div>
                {fields.map(({ key, name, ...restField }) => (
                  <Space key={key} align="baseline" style={{ display: 'flex', marginBottom: 8 }}>
                    <Form.Item
                      {...restField}
                      name={[name, 'user_id']}
                      rules={[{ required: true, message: '请选择研究员' }]}
                    >
                      <Select
                        placeholder="选择研究员"
                        showSearch
                        optionFilterProp="label"
                        options={researcherOptions}
                        style={{ width: 160 }}
                      />
                    </Form.Item>
                    <Form.Item
                      {...restField}
                      name={[name, 'work_hours']}
                      rules={[{ required: true, message: '请填工时' }]}
                    >
                      <InputNumber min={0} step={0.5} precision={1} placeholder="工时" style={{ width: 100 }} />
                    </Form.Item>
                    <MinusCircleOutlined onClick={() => remove(name)} />
                  </Space>
                ))}
              </>
            )}
          </Form.List>

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
