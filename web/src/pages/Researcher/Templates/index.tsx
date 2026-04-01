import React, { useRef, useState } from 'react';
import {
  PageContainer,
  ProTable,
  ModalForm,
  ProFormText,
  ProFormTextArea,
  ProFormSelect,
  ProFormSwitch,
  ProFormDependency,
  ProFormDigit,
  ProFormDatePicker,
} from '@ant-design/pro-components';
import type { ActionType, ProColumns, ProFormInstance } from '@ant-design/pro-components';
import { Button, Popconfirm, Tag, Space, Typography, App, Tooltip } from 'antd';
import { PlusOutlined, ThunderboltOutlined, PauseCircleOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { useModel } from '@umijs/max';
import {
  getMyTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  toggleTemplateActive,
  createRequestFromTemplate,
} from '@/services/templates';
import type { TemplateItem } from '@/services/templates';
import { getSales, getOrganizations } from '@/services/api';
import type { Organization } from '@/services/typings';
import {
  REQUEST_TYPE_OPTIONS,
  SUB_TYPE_OPTIONS,
  RESEARCH_SCOPE_OPTIONS,
  WORK_MODE_OPTIONS,
  WORK_MODE_RULES,
  ORG_DEPARTMENT_MAP,
} from '@/utils/constants';

const { Text } = Typography;

/** 标题占位符预览 */
const renderTitlePreview = (pattern: string) => {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  const jan1 = new Date(y, 0, 1);
  const days = Math.floor((today.getTime() - jan1.getTime()) / 86400000);
  const week = String(Math.ceil((days + jan1.getDay() + 1) / 7)).padStart(2, '0');

  return pattern
    .replace('{date}', `${y}-${m}-${d}`)
    .replace('{week}', `${y}-W${week}`)
    .replace('{month}', `${y}-${m}`)
    .replace('{year}', String(y));
};

const RECURRENCE_TYPE_OPTIONS = [
  { label: '每周', value: 'weekly' },
  { label: '每两周', value: 'biweekly' },
  { label: '每月', value: 'monthly' },
  { label: '每季度', value: 'quarterly' },
];

const WEEKDAY_OPTIONS = [
  { label: '周一', value: 1 },
  { label: '周二', value: 2 },
  { label: '周三', value: 3 },
  { label: '周四', value: 4 },
  { label: '周五', value: 5 },
  { label: '周六', value: 6 },
  { label: '周日', value: 7 },
];

const SPECIAL_ORGS = [
  { name: '内部需求', org_type: '内部' },
  { name: '全体机构', org_type: '内部' },
];

/** 定期标签展示 */
const RecurringLabel: React.FC<{ record: TemplateItem }> = ({ record }) => {
  if (!record.is_recurring) return <Tag>手动</Tag>;
  const typeMap: Record<string, string> = {
    weekly: '每周', biweekly: '每两周', monthly: '每月', quarterly: '每季度',
  };
  const typeLabel = typeMap[record.recurrence_type || ''] || record.recurrence_type;
  const dayLabel = (record.recurrence_type === 'weekly' || record.recurrence_type === 'biweekly')
    ? WEEKDAY_OPTIONS.find((o) => o.value === record.recurrence_day)?.label
    : record.recurrence_day ? `${record.recurrence_day}号` : '';
  return (
    <Tooltip title={`下次触发: ${record.next_due_date || '-'}`}>
      <Tag color="blue">{typeLabel}{dayLabel}</Tag>
    </Tooltip>
  );
};

const Templates: React.FC = () => {
  const { message } = App.useApp();
  const { initialState } = useModel('@@initialState');
  const actionRef = useRef<ActionType>(null);
  const editFormRef = useRef<ProFormInstance>(null);

  const [editVisible, setEditVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState<TemplateItem | null>(null);

  const [useVisible, setUseVisible] = useState(false);
  const [usingTemplate, setUsingTemplate] = useState<TemplateItem | null>(null);

  const [orgList, setOrgList] = useState<{ name: string; org_type?: string }[]>([]);

  const columns: ProColumns<TemplateItem>[] = [
    {
      title: '模板名称',
      dataIndex: 'template_name',
      ellipsis: true,
      render: (dom, record) => (
        <a onClick={() => { setEditingRecord(record); setEditVisible(true); }}>{dom}</a>
      ),
    },
    {
      title: '标题模式',
      dataIndex: 'title_pattern',
      ellipsis: true,
      search: false,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text code>{record.title_pattern}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            → {renderTitlePreview(record.title_pattern)}
          </Text>
        </Space>
      ),
    },
    { title: '需求类型', dataIndex: 'request_type', valueType: 'select', fieldProps: { options: REQUEST_TYPE_OPTIONS }, width: 120 },
    { title: '研究范围', dataIndex: 'research_scope', search: false, width: 100 },
    { title: '机构', dataIndex: 'org_name', search: false, width: 100, ellipsis: true },
    {
      title: '定期',
      dataIndex: 'is_recurring',
      search: false,
      width: 120,
      render: (_, record) => <RecurringLabel record={record} />,
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      search: false,
      width: 80,
      render: (_, record) => {
        if (!record.is_recurring) return '-';
        return record.is_active
          ? <Tag color="green">激活</Tag>
          : <Tag color="orange">已暂停</Tag>;
      },
    },
    {
      title: '保密',
      dataIndex: 'is_confidential',
      search: false,
      width: 60,
      render: (_, r) => r.is_confidential ? <Tag color="red">是</Tag> : <Tag>否</Tag>,
    },
    {
      title: '使用次数',
      dataIndex: 'usage_count',
      search: false,
      width: 80,
      sorter: (a, b) => a.usage_count - b.usage_count,
    },
    {
      title: '操作',
      valueType: 'option',
      width: 200,
      render: (_, record) => [
        <a
          key="use"
          onClick={() => { setUsingTemplate(record); setUseVisible(true); }}
        >
          <ThunderboltOutlined /> 使用
        </a>,
        record.is_recurring ? (
          <a
            key="toggle"
            onClick={async () => {
              await toggleTemplateActive(record.id);
              message.success(record.is_active ? '已暂停' : '已恢复');
              actionRef.current?.reload();
            }}
          >
            {record.is_active
              ? <><PauseCircleOutlined /> 暂停</>
              : <><PlayCircleOutlined /> 恢复</>}
          </a>
        ) : null,
        <a key="edit" onClick={() => { setEditingRecord(record); setEditVisible(true); }}>
          编辑
        </a>,
        <Popconfirm
          key="del"
          title="确定删除该模板？"
          onConfirm={async () => {
            await deleteTemplate(record.id);
            message.success('已删除');
            actionRef.current?.reload();
          }}
        >
          <a style={{ color: '#ff4d4f' }}>删除</a>
        </Popconfirm>,
      ].filter(Boolean),
    },
  ];

  const handleOrgChange = (val: string) => {
    const special = SPECIAL_ORGS.find((o) => o.name === val);
    if (special) {
      editFormRef.current?.setFieldsValue({ org_type: special.org_type, department: undefined });
    } else {
      const org = orgList.find((o) => o.name === val);
      editFormRef.current?.setFieldsValue({ org_type: org?.org_type || undefined, department: undefined });
    }
  };

  const templateFormFields = (
    <>
      <ProFormText
        name="template_name"
        label="模板名称"
        rules={[{ required: true, message: '请输入模板名称' }]}
        placeholder="如: 周报-量化组"
      />
      <ProFormText
        name="title_pattern"
        label="标题模式"
        rules={[{ required: true, message: '请输入标题模式' }]}
        placeholder="如: {month} 量化组周报"
        tooltip="占位符: {date}=2025-02-06, {week}=2025-W06, {month}=2025-02, {year}=2025"
      />
      <ProFormTextArea name="description" label="默认描述" fieldProps={{ rows: 3 }} />
      <ProFormSelect
        name="request_type"
        label="需求类型"
        options={REQUEST_TYPE_OPTIONS}
        rules={[{ required: true }]}
        fieldProps={{
          onChange: (val: string) => {
            editFormRef.current?.setFieldsValue({ sub_type: undefined });
            const rule = WORK_MODE_RULES[val];
            if (rule?.mode === 'locked') {
              editFormRef.current?.setFieldsValue({ work_mode: rule.value });
            } else {
              editFormRef.current?.setFieldsValue({ work_mode: rule?.default || 'service' });
            }
          },
        }}
      />

      {/* 二级分类（联动） */}
      <ProFormDependency name={['request_type']}>
        {({ request_type }) => {
          const subOpts = SUB_TYPE_OPTIONS[request_type];
          if (!subOpts) return null;
          return (
            <ProFormSelect
              name="sub_type"
              label="二级分类"
              options={subOpts}
              placeholder="请选择二级分类"
            />
          );
        }}
      </ProFormDependency>

      {/* 工作模式（联动） */}
      <ProFormDependency name={['request_type']}>
        {({ request_type }) => {
          const rule = WORK_MODE_RULES[request_type];
          if (!rule) return null;
          if (rule.mode === 'locked') {
            return (
              <ProFormSelect
                name="work_mode"
                label="工作模式"
                options={WORK_MODE_OPTIONS}
                readonly
              />
            );
          }
          return (
            <ProFormSelect
              name="work_mode"
              label="工作模式"
              options={WORK_MODE_OPTIONS}
            />
          );
        }}
      </ProFormDependency>

      <ProFormSelect name="research_scope" label="研究范围" options={RESEARCH_SCOPE_OPTIONS} />

      {/* 机构字段（proactive 时隐藏） */}
      <ProFormDependency name={['work_mode']}>
        {({ work_mode }) => {
          if (work_mode === 'proactive') return null;
          return (
            <>
              <ProFormSelect
                name="org_name"
                label="机构名称"
                fieldProps={{
                  showSearch: true,
                  onChange: handleOrgChange,
                }}
                request={async () => {
                  const orgs = await getOrganizations();
                  setOrgList(orgs);
                  const specialOptions = SPECIAL_ORGS.map((o) => ({ label: o.name, value: o.name }));
                  const orgOptions = orgs.map((o: Organization) => ({ label: o.name, value: o.name }));
                  return [...specialOptions, ...orgOptions];
                }}
              />
              <ProFormText
                name="org_type"
                label="机构类型"
                readonly
                fieldProps={{ placeholder: '选择机构后自动填入' }}
              />
              <ProFormDependency name={['org_type']}>
                {({ org_type }) => {
                  const depts = org_type ? ORG_DEPARTMENT_MAP[org_type] : [];
                  if (!depts?.length) return null;
                  return (
                    <ProFormSelect
                      name="department"
                      label="对接部门"
                      options={depts.map((d: string) => ({ label: d, value: d }))}
                    />
                  );
                }}
              </ProFormDependency>
            </>
          );
        }}
      </ProFormDependency>

      <ProFormSwitch name="is_confidential" label="保密" />

      {/* ── 定期调度 ── */}
      <ProFormSwitch
        name="is_recurring"
        label="启用定期调度"
        tooltip="启用后系统将按周期自动创建需求（每日08:00检查）"
      />
      <ProFormDependency name={['is_recurring']}>
        {({ is_recurring }) => {
          if (!is_recurring) return null;
          return (
            <>
              <ProFormSelect
                name="recurrence_type"
                label="周期类型"
                options={RECURRENCE_TYPE_OPTIONS}
                rules={[{ required: true, message: '请选择周期类型' }]}
              />
              <ProFormDependency name={['recurrence_type']}>
                {({ recurrence_type }) => {
                  if (!recurrence_type) return null;
                  if (recurrence_type === 'weekly' || recurrence_type === 'biweekly') {
                    return (
                      <ProFormSelect
                        name="recurrence_day"
                        label="触发日（周几）"
                        options={WEEKDAY_OPTIONS}
                        rules={[{ required: true, message: '请选择触发日' }]}
                      />
                    );
                  }
                  return (
                    <ProFormDigit
                      name="recurrence_day"
                      label="触发日（几号）"
                      min={1}
                      max={28}
                      rules={[{ required: true, message: '请输入触发日' }]}
                      fieldProps={{ precision: 0 }}
                    />
                  );
                }}
              </ProFormDependency>
              <ProFormDatePicker
                name="next_due_date"
                label="首次触发日期"
                rules={[{ required: true, message: '请选择首次触发日期' }]}
                tooltip="系统将在该日期 08:00 自动创建第一条需求"
              />
            </>
          );
        }}
      </ProFormDependency>
    </>
  );

  return (
    <PageContainer title="需求模板">
      <ProTable<TemplateItem>
        headerTitle="我的模板"
        actionRef={actionRef}
        rowKey="id"
        columns={columns}
        search={{ labelWidth: 'auto', defaultCollapsed: true }}
        request={async () => {
          const data = await getMyTemplates();
          return { data, success: true, total: data.length };
        }}
        pagination={{ defaultPageSize: 10 }}
        toolBarRender={() => [
          <Button
            key="new"
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => { setEditingRecord(null); setEditVisible(true); }}
          >
            新建模板
          </Button>,
        ]}
      />

      {/* ─── 新建/编辑模板 Modal ─── */}
      <ModalForm
        title={editingRecord ? '编辑模板' : '新建模板'}
        open={editVisible}
        formRef={editFormRef}
        onOpenChange={(v) => { if (!v) { setEditVisible(false); setEditingRecord(null); } }}
        initialValues={
          editingRecord
            ? {
                ...editingRecord,
                is_confidential: !!editingRecord.is_confidential,
                is_recurring: !!editingRecord.is_recurring,
              }
            : { is_confidential: false, is_recurring: false, work_mode: 'service' }
        }
        modalProps={{ destroyOnClose: true }}
        onFinish={async (values) => {
          const data = {
            ...values,
            is_confidential: values.is_confidential ? 1 : 0,
            is_recurring: values.is_recurring ? 1 : 0,
          };
          if (editingRecord) {
            await updateTemplate(editingRecord.id, data);
            message.success('模板已更新');
          } else {
            await createTemplate(data);
            message.success('模板已创建');
          }
          actionRef.current?.reload();
          return true;
        }}
      >
        {templateFormFields}
      </ModalForm>

      {/* ─── 从模板创建需求 Modal ─── */}
      <ModalForm
        title={
          usingTemplate
            ? `从模板创建: ${usingTemplate.template_name}`
            : '从模板创建需求'
        }
        open={useVisible}
        onOpenChange={(v) => { if (!v) { setUseVisible(false); setUsingTemplate(null); } }}
        modalProps={{ destroyOnClose: true }}
        onFinish={async (values) => {
          if (!usingTemplate) return false;
          const res = await createRequestFromTemplate(usingTemplate.id, {
            sales_id: values.sales_id,
            description: values.description,
          });
          message.success(`需求 #${res.request_id} 已创建: ${res.title}`);
          actionRef.current?.reload();
          return true;
        }}
      >
        {usingTemplate && (
          <div style={{ marginBottom: 16, padding: '8px 12px', background: '#f5f5f5', borderRadius: 6 }}>
            <Text type="secondary">标题预览：</Text>
            <Text strong>{renderTitlePreview(usingTemplate.title_pattern)}</Text>
          </div>
        )}
        {/* proactive 模式：不需要选销售 */}
        {usingTemplate?.work_mode !== 'proactive' && (
          <ProFormSelect
            name="sales_id"
            label="选择销售"
            rules={[{ required: true, message: '请选择关联的销售' }]}
            request={async () => {
              const data = await getSales();
              return data.map((u) => ({ label: u.display_name, value: u.id }));
            }}
            fieldProps={{ showSearch: true }}
          />
        )}
        {usingTemplate?.work_mode === 'proactive' && (
          <div style={{ marginBottom: 16, padding: '8px 12px', background: '#e6f4ff', borderRadius: 6 }}>
            <Text type="secondary">主动模式：需求将直接进入"处理中"状态，无需关联销售。</Text>
          </div>
        )}
        <ProFormTextArea
          name="description"
          label="补充说明（可选，覆盖模板默认描述）"
          fieldProps={{ rows: 3 }}
          initialValue={usingTemplate?.description}
        />
      </ModalForm>
    </PageContainer>
  );
};

export default Templates;
