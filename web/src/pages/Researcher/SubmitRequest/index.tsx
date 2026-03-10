import React, { useState } from 'react';
import {
  PageContainer,
  ProForm,
  ProFormText,
  ProFormTextArea,
  ProFormSelect,
  ProFormSwitch,
  ProFormDateTimePicker,
  ProFormDependency,
} from '@ant-design/pro-components';
import { App, Form, Card } from 'antd';
import { useModel, useNavigate } from '@umijs/max';
import { getOrganizations, getResearchers, getSales, createRequest } from '@/services/api';
import type { Organization, SalesUser } from '@/services/typings';
import { REQUEST_TYPE_OPTIONS, RESEARCH_SCOPE_OPTIONS, ORG_DEPARTMENT_MAP } from '@/utils/constants';
import dayjs from 'dayjs';

const SubmitRequest: React.FC = () => {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { modal, message } = App.useApp();
  const { initialState } = useModel('@@initialState');
  const currentUser = initialState?.currentUser;

  const [orgList, setOrgList] = useState<Organization[]>([]);
  const [salesList, setSalesList] = useState<SalesUser[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [isAdminSales, setIsAdminSales] = useState(false);

  const handleFinish = async (values: any) => {
    const payload = {
      ...values,
      created_at: values.created_at
        ? dayjs(values.created_at).format('YYYY-MM-DD HH:mm:ss')
        : undefined,
    };

    const res = await createRequest(payload);

    if (res?.id) {
      modal.success({
        title: '需求提交成功！',
        content: '需求已代为提交，可在「我的任务」中追踪进度。',
        okText: '查看我的任务',
        cancelText: '继续提交',
        okCancel: true,
        onOk: () => navigate('/researcher/tasks'),
        onCancel: () => {
          form.resetFields();
          form.setFieldsValue({
            researcher_id: currentUser?.id,
            is_confidential: false,
            created_at: dayjs(),
          });
          setOrgList([]);
          setSelectedTeamId(null);
          setIsAdminSales(false);
        },
      });
    }

    return true;
  };

  const handleSalesChange = async (salesId: number) => {
    const sales = salesList.find((s) => s.id === salesId);
    if (!sales) return;

    form.setFieldsValue({ org_name: undefined, org_type: undefined, department: undefined });

    try {
      if (sales.team_id) {
        // 普通销售：按团队加载
        setSelectedTeamId(sales.team_id);
        setIsAdminSales(false);
        const orgs = await getOrganizations(sales.team_id);
        setOrgList(orgs);
      } else {
        // 管理员无 team_id：用 load_all 加载全部机构
        setSelectedTeamId(null);
        setIsAdminSales(true);
        const orgs = await getOrganizations(undefined, true);
        setOrgList(orgs);
      }
    } catch {
      message.error('加载机构列表失败');
      setOrgList([]);
    }
  };

  // admin 时追加"内部需求"选项
  const orgOptions = [
    ...(isAdminSales ? [{ label: '📋 内部需求', value: '内部需求' }] : []),
    ...orgList.map((org) => ({ label: org.name, value: org.name })),
  ];

  return (
    <PageContainer title="代提需求">
      <Card>
        <ProForm
          form={form}
          onFinish={handleFinish}
          initialValues={{
            is_confidential: false,
            created_at: dayjs(),
            researcher_id: currentUser?.id,
          }}
          layout="vertical"
          grid
          rowProps={{ gutter: [24, 0] }}
          submitter={{
            searchConfig: { submitText: '立即提交', resetText: '重置' },
            resetButtonProps: { style: { marginLeft: 8 } },
          }}
        >
          <ProFormText
            name="title"
            label="需求标题"
            colProps={{ span: 16 }}
            rules={[{ required: true, message: '请输入需求标题' }]}
            placeholder="为方便动态共享,请做脱敏处理:不包含机构名,仅说明需求事项概要即可"
          />
          <ProFormDateTimePicker
            name="created_at"
            label="提单时间"
            colProps={{ span: 8 }}
            rules={[{ required: true }]}
            tooltip="默认当前，支持回溯"
          />

          <ProFormTextArea
            name="description"
            label="需求描述"
            colProps={{ span: 24 }}
            rules={[{ required: true, message: '请输入需求描述' }]}
            placeholder="请输入需求的详细背景、目标和要求"
            fieldProps={{ rows: 3 }}
          />

          <ProFormSelect
            name="request_type"
            label="需求类型"
            colProps={{ span: 12 }}
            options={REQUEST_TYPE_OPTIONS}
            rules={[{ required: true, message: '请选择需求类型' }]}
          />
          <ProFormSelect
            name="research_scope"
            label="研究范围"
            colProps={{ span: 12 }}
            options={RESEARCH_SCOPE_OPTIONS}
            placeholder="请选择研究范围"
          />

          <ProFormSelect
            name="sales_id"
            label="代提销售"
            colProps={{ span: 12 }}
            rules={[{ required: true, message: '请选择代提的销售' }]}
            request={async () => {
              const data = await getSales();
              setSalesList(data);
              return data.map((u) => ({ label: u.display_name, value: u.id }));
            }}
            fieldProps={{
              showSearch: true,
              onChange: (value: number) => handleSalesChange(value),
            }}
            tooltip="选择为哪位销售代提需求，机构列表将根据该销售所在团队加载"
          />
          <ProFormSelect
            name="researcher_id"
            label="指定研究员"
            colProps={{ span: 12 }}
            rules={[{ required: true, message: '请选择研究员' }]}
            request={async () => {
              const data = await getResearchers();
              return data.map((u) => ({ label: u.display_name, value: u.id }));
            }}
            fieldProps={{ showSearch: true }}
          />

          <ProFormSelect
            name="org_name"
            label="目标机构"
            colProps={{ span: 12 }}
            rules={[{ required: true, message: '请选择目标机构' }]}
            options={orgOptions}
            fieldProps={{
              showSearch: true,
              disabled: !isAdminSales && !selectedTeamId,
              placeholder: (isAdminSales || selectedTeamId)
                ? '请选择目标机构'
                : '请先选择代提销售',
              onChange: (value: string) => {
                if (value === '内部需求') {
                  form.setFieldsValue({ org_type: '内部', department: undefined });
                } else {
                  const selected = orgList.find((org) => org.name === value);
                  if (selected) {
                    form.setFieldsValue({ org_type: selected.org_type, department: undefined });
                  }
                }
              },
            }}
          />
          <ProFormText
            name="org_type"
            label="机构类型"
            colProps={{ span: 12 }}
            readonly
            placeholder="选择机构后自动带入"
          />

          <ProFormDependency name={['org_type']}>
            {({ org_type }) => {
              const departments = org_type ? ORG_DEPARTMENT_MAP[org_type] : [];
              if (!departments?.length) return null;
              return (
                <ProFormSelect
                  name="department"
                  label="对接部门"
                  colProps={{ span: 12 }}
                  options={departments.map((d: string) => ({ label: d, value: d }))}
                  rules={[{ required: true, message: '请选择对接部门' }]}
                />
              );
            }}
          </ProFormDependency>

          <ProFormSwitch
            name="is_confidential"
            label="严格保密"
            colProps={{ span: 12 }}
            tooltip="如使用到了机构的信息资料或机构明确提出保密需求请务必勾选"
          />
        </ProForm>
      </Card>
    </PageContainer>
  );
};

export default SubmitRequest;
