import React, { useState } from 'react';
import { PageContainer, ProCard, ProForm, ProFormText, ProFormTextArea, ProFormSelect, ProFormSwitch, ProFormDateTimePicker, ProFormDependency } from '@ant-design/pro-components';
import { message, Form, Modal } from 'antd';
import { useNavigate } from '@umijs/max'; // Umi 路由钩子
import { getOrganizations, getResearchers, createRequest } from '@/services/api';
import type { Organization } from '@/services/typings';
import { REQUEST_TYPE_OPTIONS, RESEARCH_SCOPE_OPTIONS, ORG_DEPARTMENT_MAP } from '@/utils/constants';
import dayjs from 'dayjs';

const SubmitRequest: React.FC = () => {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const [orgList, setOrgList] = useState<Organization[]>([]);

  const handleFinish = async (values: any) => {
    try {
      const payload = {
        ...values,
        created_at: values.created_at ? dayjs(values.created_at).format('YYYY-MM-DD HH:mm:ss') : undefined,
      };

      await createRequest(payload);

      // 提单成功后的沉浸式反馈
      Modal.success({
        title: '需求提交成功！',
        content: '您的需求已经发送给研究端，您可以在“我的需求”列表中随时追踪处理进度。',
        okText: '去查看我的需求',
        cancelText: '继续提交',
        okCancel: true,
        onOk: () => {
          navigate('/sales/my-requests'); // 跳转到我的需求
        },
        onCancel: () => {
          form.resetFields(); // 留在此页继续提交并清空表单
        }
      });

      return true;
    } catch (error) {
      console.error('提交失败:', error);
      message.error('提交失败，请重试');
      return false;
    }
  };

  return (
    <PageContainer title="提交需求" subTitle="填写详细信息以便研究员精准对接">
      <ProForm
        form={form}
        onFinish={handleFinish}
        initialValues={{ is_confidential: false, created_at: dayjs() }}
        layout="vertical"
        submitter={{
          searchConfig: { submitText: '立即提交', resetText: '重置表单' },
          render: (props, doms) => {
            return (
              <ProCard style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
                  {doms}
                </div>
              </ProCard>
            );
          },
        }}
      >
        <ProCard title="基础要求" bordered headerBordered tooltip="需求的核心定性属性" style={{ marginBottom: 16 }}>
          <ProForm.Group>
            <ProFormText name="title" label="需求标题" width="md" rules={[{ required: true }]} />
            <ProFormDateTimePicker name="created_at" label="提单时间" width="md" rules={[{ required: true }]} tooltip="默认当前，支持回溯" />
          </ProForm.Group>
          <ProForm.Group>
            <ProFormSelect name="request_type" label="需求类型" width="md" options={REQUEST_TYPE_OPTIONS} rules={[{ required: true }]} />
            <ProFormSelect name="research_scope" label="研究范围" width="md" options={RESEARCH_SCOPE_OPTIONS} placeholder="请选择研究范围" />
          </ProForm.Group>
        </ProCard>

        <ProCard title="对接信息" bordered headerBordered tooltip="机构与研究员匹配" style={{ marginBottom: 16 }}>
          <ProForm.Group>
            <ProFormSelect
              name="org_name"
              label="目标机构"
              width="md"
              rules={[{ required: true }]}
              request={async () => {
                const data = await getOrganizations();
                setOrgList(data);
                return data.map((org) => ({ label: org.name, value: org.name }));
              }}
              fieldProps={{
                onChange: (value) => {
                  const selectedOrg = orgList.find((org) => org.name === value);
                  if (selectedOrg) {
                    form.setFieldsValue({ org_type: selectedOrg.org_type, department: undefined });
                  }
                },
              }}
            />
            <ProFormText name="org_type" label="机构类型" width="md" readonly placeholder="选择机构后自动带入" />
          </ProForm.Group>

          <ProFormDependency name={['org_type']}>
            {({ org_type }) => {
              const departments = org_type ? ORG_DEPARTMENT_MAP[org_type] : [];
              if (departments && departments.length > 0) {
                return (
                  <ProForm.Group>
                    <ProFormSelect name="department" label="对接部门" width="md" options={departments.map((dept) => ({ label: dept, value: dept }))} rules={[{ required: true }]} />
                  </ProForm.Group>
                );
              }
              return null;
            }}
          </ProFormDependency>

          <ProForm.Group>
            <ProFormSelect
              name="researcher_id"
              label="指定研究员"
              width="md"
              rules={[{ required: true }]}
              request={async () => {
                const data = await getResearchers();
                return data.map((user) => ({ label: user.display_name, value: user.id }));
              }}
            />
            <div style={{ width: 328, display: 'flex', alignItems: 'center' }}>
              <ProFormSwitch name="is_confidential" label="严格保密" tooltip="开启后，大厅其他销售不可见" />
            </div>
          </ProForm.Group>
        </ProCard>

        <ProCard title="详情描述" bordered headerBordered>
          <ProFormTextArea name="description" label="补充说明" width="xl" placeholder="请输入需求的详细描述背景等（选填）" fieldProps={{ rows: 4 }} />
        </ProCard>
      </ProForm>
    </PageContainer>
  );
};

export default SubmitRequest;
