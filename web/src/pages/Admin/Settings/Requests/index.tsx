import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  PageContainer, ProTable, DrawerForm,
  ProFormText, ProFormTextArea, ProFormSelect, ProFormSwitch, ProFormDependency, ProFormDateTimePicker,
} from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { Tag, Popconfirm, Switch, Descriptions, App, Form, Space, Button, Select, InputNumber } from 'antd';
import { MinusCircleOutlined } from '@ant-design/icons';
import { getRequests, updateRequest, getResearchers, getSales, getOrganizations, getRequestDetail, searchLinkableRequests } from '@/services/api';
import { deleteRequest, toggleConfidential, updateRequestCollaborators } from '@/services/admin';
import type { RequestItem, Organization } from '@/services/typings';
import { STATUS_ENUM, REQUEST_TYPE_OPTIONS, SUB_TYPE_OPTIONS, WORK_MODE_OPTIONS, RESEARCH_SCOPE_OPTIONS, ORG_DEPARTMENT_MAP } from '@/utils/constants';

const Requests: React.FC = () => {
  const { message } = App.useApp();
  const actionRef = useRef<ActionType>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState<RequestItem | null>(null);
  const [orgList, setOrgList] = useState<Organization[]>([]);
  const [researcherOptions, setResearcherOptions] = useState<{ label: string; value: number }[]>([]);
  const [linkableOptions, setLinkableOptions] = useState<{ label: string; value: number }[]>([]);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [editForm] = Form.useForm();

  const handleLinkableSearch = useCallback((keyword: string) => {
    clearTimeout(searchTimerRef.current);
    if (!keyword) { setLinkableOptions([]); return; }
    searchTimerRef.current = setTimeout(async () => {
      try {
        const result = await searchLinkableRequests(keyword);
        setLinkableOptions(result.map((r) => ({
          label: `${r.title} | ${r.researcher_name || ''} | ${r.completed_at ? r.completed_at.slice(0, 10) : '进行中'}`,
          value: r.id,
        })));
      } catch { setLinkableOptions([]); }
    }, 300);
  }, []);

  // 一次性加载研究员选项
  useEffect(() => {
    getResearchers().then((list) =>
      setResearcherOptions(list.map((r) => ({ label: r.display_name, value: r.id })))
    ).catch(() => {});
  }, []);

  const openEdit = async (record: RequestItem) => {
    if (!orgList.length) {
      const orgs = await getOrganizations();
      setOrgList(orgs);
    }
    setEditingRecord(record);
    setDrawerVisible(true);
    // 异步加载协作者和关联需求，加载完后填入表单
    try {
      const full = await getRequestDetail(record.id);
      editForm.setFieldValue('collaborators', (full.collaborators || []).map((c: any) => ({
        user_id: c.user_id,
        work_hours: c.work_hours,
      })));
      // 若有关联需求，预填选项
      if (full.parent_request_id && full.parent_title) {
        setLinkableOptions([{ label: full.parent_title, value: full.parent_request_id }]);
      }
    } catch {}
  };

  const columns: ProColumns<RequestItem>[] = [
    { title: 'ID', dataIndex: 'id', width: 50, hideInSearch: true },
    {
      title: '标题', dataIndex: 'title', ellipsis: true,
      render: (dom, entity) => (
        <span>
          {dom}
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
    { title: '需求描述', dataIndex: 'description', ellipsis: true, width: 200, hideInSearch: true },
    { title: '关键字', dataIndex: 'keyword', hideInTable: true },
    {
      title: '需求类型', dataIndex: 'request_type', width: 110,
      valueType: 'select', fieldProps: { options: REQUEST_TYPE_OPTIONS },
    },
    { title: '二级分类', dataIndex: 'sub_type', hideInTable: true },
    {
      title: '研究范围', dataIndex: 'research_scope', hideInTable: true,
      valueType: 'select', fieldProps: { options: RESEARCH_SCOPE_OPTIONS, allowClear: true },
    },
    {
      title: '销售筛选', dataIndex: 'sales_id', hideInTable: true,
      valueType: 'select',
      fieldProps: {
        showSearch: true,
        optionFilterProp: 'label',
        placeholder: '按销售筛选',
        allowClear: true,
      },
      request: async () => {
        const list = await getSales();
        return list.map((r: any) => ({ label: r.display_name, value: r.id }));
      },
    },
    { title: '机构', dataIndex: 'org_name', ellipsis: true, width: 120, hideInSearch: true },
    {
      title: '机构类型', dataIndex: 'org_type', width: 80,
      valueType: 'select',
      fieldProps: { options: ['银行', '券商', '保险', '理财', 'FOF'].map(t => ({ label: t, value: t })) },
    },
    { title: '销售', dataIndex: 'sales_name', width: 80, hideInSearch: true },
    { title: '研究员', dataIndex: 'researcher_name', width: 80, hideInSearch: true },
    {
      title: '研究员筛选', dataIndex: 'researcher_id', hideInTable: true,
      valueType: 'select',
      fieldProps: {
        showSearch: true,
        optionFilterProp: 'label',
        options: researcherOptions,
        placeholder: '按研究员筛选',
        allowClear: true,
      },
    },
    {
      title: '状态', dataIndex: 'status', width: 80,
      valueType: 'select',
      valueEnum: Object.fromEntries(Object.entries(STATUS_ENUM).map(([k, v]) => [k, { text: v.text }])),
      render: (_, r) => {
        const cfg = STATUS_ENUM[r.status];
        return <Tag color={cfg?.status?.toLowerCase()}>{cfg?.text || r.status}</Tag>;
      },
    },
    {
      title: '保密', dataIndex: 'is_confidential', width: 70, hideInSearch: true,
      render: (_, r) => (
        <Switch
          size="small"
          checked={!!r.is_confidential}
          onChange={async (checked) => {
            try {
              await toggleConfidential(r.id, checked);
              message.success('已更新');
              actionRef.current?.reload();
            } catch { message.error('操作失败'); }
          }}
        />
      ),
    },
    { title: '工时', dataIndex: 'work_hours', width: 60, hideInSearch: true },
    { title: '提单时间', dataIndex: 'submitted_at', valueType: 'dateTime', width: 150, hideInSearch: true, sorter: true, defaultSortOrder: 'descend' },
    { title: '创建时间', dataIndex: 'created_at', valueType: 'dateTime', width: 150, hideInSearch: true, sorter: true },
    { title: '完成时间', dataIndex: 'completed_at', valueType: 'dateTime', width: 150, hideInSearch: true, sorter: true },
    { title: '最后更新', dataIndex: 'updated_at', valueType: 'dateTime', width: 160, hideInSearch: true },
    { title: '研究员备注', dataIndex: 'researcher_note', ellipsis: true, width: 160, hideInSearch: true },
    {
      title: '创建日期', dataIndex: 'dateRange', valueType: 'dateRange', hideInTable: true,
      search: { transform: (v) => ({ date_from: v[0], date_to: v[1] }) },
    },
    {
      title: '完成日期', dataIndex: 'completedRange', valueType: 'dateRange', hideInTable: true,
      search: { transform: (v) => ({ completed_at_from: v[0], completed_at_to: v[1] }) },
    },
    {
      title: '操作', valueType: 'option', width: 150, fixed: 'right',
      render: (_, record) => [
        <a key="edit" onClick={() => openEdit(record)}>编辑</a>,
        <Popconfirm key="del" title="确定删除？此操作不可恢复" onConfirm={async () => {
          try { await deleteRequest(record.id); message.success('已删除'); actionRef.current?.reload(); }
          catch { message.error('删除失败'); }
        }}>
          <a style={{ color: '#ff4d4f' }}>删除</a>
        </Popconfirm>,
      ],
    },
  ];

  return (
    <PageContainer>
      <ProTable<RequestItem>
        actionRef={actionRef}
        columns={columns}
        rowKey="id"
        scroll={{ x: 1600 }}
        request={async (params, sort) => {
          const sortField = Object.keys(sort || {})[0];
          const sortOrder = sortField && sort[sortField] ? (sort[sortField] === 'ascend' ? 'asc' : 'desc') : 'desc';
          return getRequests({
            ...params,
            sort_by: sortField || 'submitted_at',
            sort_order: sortOrder,
          });
        }}
        pagination={{ pageSize: 15 }}
      />

      <DrawerForm
        title="编辑需求"
        form={editForm}
        open={drawerVisible}
        onOpenChange={(vis) => { if (!vis) { setEditingRecord(null); } setDrawerVisible(vis); }}
        initialValues={editingRecord ? { ...editingRecord, is_confidential: !!editingRecord.is_confidential, collaborators: [] } : {}}
        drawerProps={{ destroyOnClose: true, width: 640 }}
        onFinish={async (values) => {
          if (!editingRecord) return false;
          try {
            const { collaborators, ...rest } = values;
            await updateRequest(editingRecord.id, rest);
            await updateRequestCollaborators(editingRecord.id, collaborators || []);
            message.success('更新成功');
            actionRef.current?.reload();
            return true;
          } catch (e: any) {
            message.error(e?.message || '更新失败');
            return false;
          }
        }}
      >
        {/* 只读元信息区 */}
        {editingRecord && (
          <Descriptions size="small" column={2} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="需求 ID">{editingRecord.id}</Descriptions.Item>
            <Descriptions.Item label="当前状态">
              <Tag color={STATUS_ENUM[editingRecord.status]?.status?.toLowerCase()}>
                {STATUS_ENUM[editingRecord.status]?.text || editingRecord.status}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="创建时间">{editingRecord.created_at || '-'}</Descriptions.Item>
            <Descriptions.Item label="提单时间">{editingRecord.submitted_at || '-'}</Descriptions.Item>
            <Descriptions.Item label="最近更新">{editingRecord.updated_at || '-'}</Descriptions.Item>
            {editingRecord.completed_at && <Descriptions.Item label="完成时间">{editingRecord.completed_at}</Descriptions.Item>}
            {editingRecord.withdraw_reason && <Descriptions.Item label="退回原因" span={2}>{editingRecord.withdraw_reason}</Descriptions.Item>}
            {editingRecord.parent_request_id && <Descriptions.Item label="关联原始需求 ID">{editingRecord.parent_request_id}</Descriptions.Item>}
            {editingRecord.link_type && <Descriptions.Item label="关联类型">{editingRecord.link_type === 'revision' ? '修改迭代' : editingRecord.link_type}</Descriptions.Item>}
          </Descriptions>
        )}

        <ProFormText name="title" label="标题" rules={[{ required: true }]} />
        <ProFormTextArea name="description" label="描述" />
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
          name="org_name" label="机构名称"
          options={orgList.map(o => ({ label: o.name, value: o.name }))}
          rules={[{ required: true }]}
        />
        <ProFormSelect
          name="org_type" label="机构类型"
          options={['银行', '券商', '保险', '理财', 'FOF', '信托', '私募', '期货', '其他'].map(t => ({ label: t, value: t }))}
        />
        <ProFormDependency name={['org_type']}>
          {({ org_type }) => {
            const depts = ORG_DEPARTMENT_MAP[org_type];
            if (!depts) return null;
            return <ProFormSelect name="department" label="部门" options={depts.map(d => ({ label: d, value: d }))} />;
          }}
        </ProFormDependency>
        <ProFormSelect
          name="researcher_id" label="研究员 (重新分配)"
          request={async () => { const list = await getResearchers(); return list.map(r => ({ label: r.display_name, value: r.id })); }}
        />
        <ProFormSelect
          name="sales_id" label="销售"
          request={async () => { const list = await getSales(); return list.map(r => ({ label: r.display_name, value: r.id })); }}
        />
        <ProFormSelect
          name="status" label="状态"
          options={Object.entries(STATUS_ENUM).map(([k, v]) => ({ label: v.text, value: k }))}
        />
        <ProFormSwitch name="is_confidential" label="保密" />
        <ProFormSelect name="work_mode" label="工作模式" options={WORK_MODE_OPTIONS} />
        <ProFormText name="work_hours" label="交付工时(h)" />
        <ProFormText name="automation_hours" label="自动化建设工时(h)" />
        <ProFormSelect
          name="parent_request_id"
          label="关联原始需求"
          placeholder="输入关键词搜索（选填）"
          fieldProps={{
            showSearch: true,
            filterOption: false,
            options: linkableOptions,
            onSearch: handleLinkableSearch,
            allowClear: true,
          }}
        />
        <ProFormDateTimePicker
          name="submitted_at"
          label="提单时间"
          fieldProps={{ showTime: true, format: 'YYYY-MM-DD HH:mm:ss' }}
        />
        <ProFormTextArea name="researcher_note" label="研究员备注（仅研究员/管理员可见）" />
        <ProFormTextArea name="result_note" label="完成说明" />

        {/* 协作者编辑 */}
        <Form.Item label="协作研究员">
          <Form.List name="collaborators">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }) => (
                  <Space key={key} align="baseline" style={{ display: 'flex', marginBottom: 8 }}>
                    <Form.Item
                      {...restField}
                      name={[name, 'user_id']}
                      rules={[{ required: true, message: '请选择研究员' }]}
                      style={{ marginBottom: 0 }}
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
                      style={{ marginBottom: 0 }}
                    >
                      <InputNumber min={0} step={0.5} precision={1} placeholder="工时(h)" style={{ width: 110 }} />
                    </Form.Item>
                    <MinusCircleOutlined onClick={() => remove(name)} style={{ color: '#ff4d4f' }} />
                  </Space>
                ))}
                <Button type="dashed" onClick={() => add()} style={{ width: 280 }}>
                  + 添加协作者
                </Button>
              </>
            )}
          </Form.List>
        </Form.Item>
      </DrawerForm>
    </PageContainer>
  );
};

export default Requests;
