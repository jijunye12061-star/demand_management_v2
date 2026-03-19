import React, { useRef, useState, useEffect } from 'react';
import { PageContainer, ProTable, ProForm, ProFormText, ProFormTextArea, ProFormSelect, ProFormDependency } from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { Tag, Popconfirm, Modal, Form, App } from 'antd';
import {
  getRequests, cancelRequest, updateRequest, resubmitRequest,
  getOrganizations, getResearchers,
} from '@/services/api';
import type { RequestItem, Organization } from '@/services/typings';
import { STATUS_ENUM, REQUEST_TYPE_OPTIONS, RESEARCH_SCOPE_OPTIONS, ORG_DEPARTMENT_MAP } from '@/utils/constants';
import RequestDetailDrawer from '@/components/RequestDetailDrawer';
import FileDownloadButton from '@/components/FileDownloadButton';
import StatsCards from '@/components/StatsCards';

const MyRequests: React.FC = () => {
  const { message } = App.useApp();
  const actionRef = useRef<ActionType>(null);

  const [drawerVisible, setDrawerVisible] = useState(false);
  const [currentRow, setCurrentRow] = useState<RequestItem | null>(null);

  const [allMineRequests, setAllMineRequests] = useState<RequestItem[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  // 编辑/重新提交 Modal
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState<RequestItem | null>(null);
  const [isResubmit, setIsResubmit] = useState(false);
  const [editForm] = Form.useForm();
  const [orgList, setOrgList] = useState<Organization[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const fetchStatsData = async () => {
    try {
      setStatsLoading(true);
      const res = await getRequests({ scope: 'mine', current: 1, pageSize: 9999 });
      if (res?.data) setAllMineRequests(res.data);
    } catch {
      // noop
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => { fetchStatsData(); }, []);

  const openEdit = async (record: RequestItem, resubmit: boolean) => {
    setEditingRecord(record);
    setIsResubmit(resubmit);
    setEditModalVisible(true);
    editForm.setFieldsValue({
      title: record.title,
      description: record.description,
      request_type: record.request_type,
      research_scope: record.research_scope,
      org_name: record.org_name,
      org_type: record.org_type,
      department: record.department,
      researcher_id: record.researcher_id,
      is_confidential: record.is_confidential,
    });
    // 加载机构列表
    try {
      const orgs = await getOrganizations();
      setOrgList(orgs);
    } catch { /* noop */ }
  };

  const handleEditSubmit = async () => {
    try {
      const values = await editForm.validateFields();
      setSubmitting(true);

      if (isResubmit) {
        await resubmitRequest(editingRecord!.id, values);
        message.success('需求已重新提交');
      } else {
        await updateRequest(editingRecord!.id, values);
        message.success('需求已更新');
      }

      setEditModalVisible(false);
      actionRef.current?.reload();
      fetchStatsData();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (id: number) => {
    try {
      await cancelRequest(id);
      message.success('需求已取消');
      actionRef.current?.reload();
      fetchStatsData();
    } catch (err: any) {
      message.error(err?.message || '取消失败');
    }
  };

  const columns: ProColumns<RequestItem>[] = [
    {
      title: '需求标题',
      dataIndex: 'title',
      copyable: true,
      ellipsis: true,
      render: (dom, entity) => (
        <span>
          <a onClick={() => { setCurrentRow(entity); setDrawerVisible(true); }}>{dom}</a>
          {(entity.automation_hours! > 0 || !!entity.parent_request_id) && (
            <Tag color="blue" style={{ marginLeft: 4, fontSize: 11 }}>自动化</Tag>
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
    {
      title: '机构名称',
      dataIndex: 'org_name',
      hideInSearch: true,
    },
    {
      title: '机构类型',
      dataIndex: 'org_type',
      valueType: 'select',
      fieldProps: {
        options: Object.keys(ORG_DEPARTMENT_MAP).map((k) => ({ label: k, value: k })),
      },
    },
    {
      title: '需求类型',
      dataIndex: 'request_type',
      valueType: 'select',
      fieldProps: { options: REQUEST_TYPE_OPTIONS },
    },
    {
      title: '研究员',
      dataIndex: 'researcher_name',
      hideInSearch: true,
    },
    {
      title: '状态',
      dataIndex: 'status',
      valueType: 'select',
      fieldProps: {
        options: Object.entries(STATUS_ENUM).map(([k, v]) => ({ label: v.text, value: k })),
      },
      render: (_, entity) => {
        const cfg = STATUS_ENUM[entity.status];
        return <Tag color={cfg?.status?.toLowerCase()}>{cfg?.text || entity.status}</Tag>;
      },
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      valueType: 'dateTime',
      hideInSearch: true,
      sorter: true,
    },
    {
      title: '日期范围',
      dataIndex: 'dateRange',
      valueType: 'dateRange',
      hideInTable: true,
      search: {
        transform: (value) => ({
          date_from: value[0],
          date_to: value[1],
        }),
      },
    },
    {
      title: '操作',
      valueType: 'option',
      key: 'option',
      width: 200,
      render: (_, entity) => [
        <a key="view" onClick={() => { setCurrentRow(entity); setDrawerVisible(true); }}>
          详情
        </a>,
        // 编辑: pending/withdrawn 可用
        (entity.status === 'pending' || entity.status === 'withdrawn') && (
          <a key="edit" onClick={() => openEdit(entity, false)}>编辑</a>
        ),
        // 重新提交: 仅 withdrawn
        entity.status === 'withdrawn' && (
          <a key="resubmit" style={{ color: '#1890ff' }} onClick={() => openEdit(entity, true)}>
            重新提交
          </a>
        ),
        // 取消: pending/withdrawn 均可
        (entity.status === 'pending' || entity.status === 'withdrawn') && (
          <Popconfirm
            key="cancel"
            title="确定要取消这个需求吗？"
            description="取消后该需求将不再处理"
            onConfirm={() => handleCancel(entity.id)}
          >
            <a style={{ color: '#ff4d4f' }}>取消</a>
          </Popconfirm>
        ),
        // 下载: completed 且有附件
        entity.status === 'completed' && entity.attachment_path && (
          <FileDownloadButton
            key="download"
            mode="mine"
            requestId={entity.id}
            fileName={`${entity.title}-附件`}
            size="small"
          />
        ),
      ],
    },
  ];

  return (
    <PageContainer title="我的需求">
      <StatsCards items={allMineRequests} loading={statsLoading} />

      <ProTable<RequestItem>
        headerTitle="需求列表"
        actionRef={actionRef}
        rowKey="id"
        search={{ labelWidth: 100 }}
        request={async (params) => getRequests({ ...params, scope: 'mine' })}
        columns={columns}
      />

      <RequestDetailDrawer
        open={drawerVisible}
        onClose={() => { setDrawerVisible(false); setCurrentRow(null); }}
        request={currentRow}
        downloadMode="mine"
      />

      {/* 编辑/重新提交 Modal */}
      <Modal
        title={isResubmit ? '修改并重新提交' : '编辑需求'}
        open={editModalVisible}
        onCancel={() => { setEditModalVisible(false); setEditingRecord(null); editForm.resetFields(); }}
        onOk={handleEditSubmit}
        confirmLoading={submitting}
        okText={isResubmit ? '重新提交' : '保存'}
        width={640}
        destroyOnClose
      >
        <ProForm form={editForm} submitter={false} layout="vertical">
          <ProFormText name="title" label="需求标题" rules={[{ required: true }]} />
          <ProFormTextArea name="description" label="需求描述" />
          <ProFormSelect name="request_type" label="需求类型" options={REQUEST_TYPE_OPTIONS} rules={[{ required: true }]} />
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
    </PageContainer>
  );
};

export default MyRequests;
