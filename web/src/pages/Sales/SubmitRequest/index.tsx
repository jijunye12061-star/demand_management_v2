import React, { useEffect, useRef, useState } from 'react';
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
import { Form, Card, App, Alert } from 'antd';
import { useNavigate, useLocation } from '@umijs/max';
import { getOrganizations, getResearchers, createRequest, searchLinkableRequests, getRequestDetail } from '@/services/api';
import type { Organization, RequestItem } from '@/services/typings';
import { SALES_REQUEST_TYPE_OPTIONS, SUB_TYPE_OPTIONS, RESEARCH_SCOPE_OPTIONS, ORG_DEPARTMENT_MAP } from '@/utils/constants';
import dayjs from 'dayjs';

const SubmitRequest: React.FC = () => {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const location = useLocation();
  const [orgList, setOrgList] = useState<Organization[]>([]);
  const { modal, message } = App.useApp();
  const [linkableOptions, setLinkableOptions] = useState<{ label: string; value: number }[]>([]);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [parentRequest, setParentRequest] = useState<RequestItem | null>(null);
  const [linkType, setLinkType] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const parentId = params.get('parent_id');
    const lt = params.get('link_type');
    if (!parentId || !lt) return;
    getRequestDetail(Number(parentId)).then((data) => {
      if (!data) return;
      setParentRequest(data);
      const revisionN = (data.revision_count ?? 0) + 1;
      form.setFieldsValue({
        parent_request_id: data.id,
        title: `${data.title} - 修改${revisionN}`,
        request_type: data.request_type,
        sub_type: data.sub_type,
        research_scope: data.research_scope,
        org_name: data.org_name,
        org_type: data.org_type,
        department: data.department,
        researcher_id: data.researcher_id,
        is_confidential: data.is_confidential,
      });
      setLinkableOptions([{
        label: `${data.title} | ${data.researcher_name || ''} | ${data.completed_at ? data.completed_at.slice(0, 10) : ''}`,
        value: data.id,
      }]);
    });
  }, []);

  const handleLinkableSearch = (keyword: string) => {
    clearTimeout(searchTimerRef.current);
    if (!keyword) return; // 不清空，避免选中后 label 消失
    searchTimerRef.current = setTimeout(async () => {
      try {
        const result = await searchLinkableRequests(keyword);
        setLinkableOptions(result.map((r) => ({
          label: `${r.title} | ${r.researcher_name || ''} | ${r.completed_at ? r.completed_at.slice(0, 10) : '进行中'}`,
          value: r.id,
        })));
      } catch { setLinkableOptions([]); }
    }, 300);
  };

  const handleFinish = async (values: any) => {
    // 从 URL 来的是 revision，手动选了 parent 的是 sub，否则无关联
    // linkType state 由 useEffect(URL params) 和 onChange 维护，比 values 更可靠
    let resolvedLinkType: string | undefined;
    if (parentRequest) resolvedLinkType = 'revision';
    else if (values.parent_request_id) resolvedLinkType = linkType || 'sub';

    const payload = {
      ...values,
      link_type: resolvedLinkType,
      created_at: values.created_at
        ? dayjs(values.created_at).format('YYYY-MM-DD HH:mm:ss')
        : undefined,
    };

    const res = await createRequest(payload);

    if (res?.id) {
      modal.success({
        title: '需求提交成功！',
        content: '您的需求已发送给研究端，可在「我的需求」中随时追踪进度。',
        okText: '查看我的需求',
        cancelText: '继续提交',
        okCancel: true,
        onOk: () => navigate('/sales/mine'),
        onCancel: () => form.resetFields(),
      });
      return true;
    }

    message.error('提交失败，请重试');
    return false;
  };

  return (
    <PageContainer title={parentRequest ? '发起修改需求' : '提交需求'}>
      {parentRequest && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={`正在为「${parentRequest.title}」(#${parentRequest.id}) 发起修改`}
        />
      )}
      <Card>
        <ProForm
          form={form}
          onFinish={handleFinish}
          initialValues={{ is_confidential: false, created_at: dayjs() }}
          layout="vertical"
          grid
          rowProps={{ gutter: [24, 0] }}
          submitter={{
            searchConfig: { submitText: '立即提交', resetText: '重置' },
            resetButtonProps: { style: { marginLeft: 8 } },
          }}
        >
          {/* 第一行：标题 + 提单时间 */}
          <ProFormText
            name="title"
            label="需求标题"
            rules={[{ required: true, message: '请输入需求标题' }]}
            placeholder="为方便动态共享,请做脱敏处理:不包含机构名,仅说明需求事项概要即可"
            colProps={{ span: 16 }}
          />
          <ProFormDateTimePicker
            name="created_at"
            label="提单时间"
            colProps={{ span: 8 }}
            fieldProps={{ style: { width: '100%' } }}
          />

          {/* 第二行：需求类型 + 二级分类 */}
          <ProFormSelect
            name="request_type"
            label="需求类型"
            options={SALES_REQUEST_TYPE_OPTIONS}
            rules={[{ required: true, message: '请选择需求类型' }]}
            colProps={{ span: 12 }}
            fieldProps={{
              onChange: () => {
                form.setFieldValue('sub_type', undefined);
              },
            }}
          />
          <ProFormDependency name={['request_type']}>
            {({ request_type }) => {
              const subOpts = SUB_TYPE_OPTIONS[request_type];
              if (!subOpts) return <div style={{ display: 'none' }} />;
              return (
                <ProFormSelect
                  name="sub_type"
                  label="二级分类"
                  options={subOpts}
                  colProps={{ span: 12 }}
                  placeholder="请选择二级分类（选填）"
                />
              );
            }}
          </ProFormDependency>

          {/* 研究范围 */}
          <ProFormSelect
            name="research_scope"
            label="研究范围"
            options={RESEARCH_SCOPE_OPTIONS}
            colProps={{ span: 12 }}
          />

          {/* 第三行：机构 + 机构类型(自动) + 部门(级联) */}
          <ProFormSelect
            name="org_name"
            label="机构名称"
            rules={[{ required: true, message: '请选择机构' }]}
            colProps={{ span: 8 }}
            fieldProps={{
              showSearch: true,
              onChange: (val: string) => {
                const org = orgList.find((o) => o.name === val);
                form.setFieldsValue({
                  org_type: org?.org_type || undefined,
                  department: undefined,
                });
              },
            }}
            request={async () => {
              const orgs = await getOrganizations();
              setOrgList(orgs);
              return orgs.map((o) => ({ label: o.name, value: o.name }));
            }}
          />
          <ProFormText
            name="org_type"
            label="机构类型"
            colProps={{ span: 8 }}
            disabled
            fieldProps={{ placeholder: '选择机构后自动填入' }}
          />
          <ProFormDependency name={['org_type']}>
            {({ org_type }) => {
              const depts = ORG_DEPARTMENT_MAP[org_type];
              if (!depts) return <ProFormText name="department" label="对接部门" colProps={{ span: 8 }} disabled fieldProps={{ placeholder: '该机构类型无部门选项' }} />;
              return (
                <ProFormSelect
                  name="department"
                  label="对接部门"
                  colProps={{ span: 8 }}
                  options={depts.map((d) => ({ label: d, value: d }))}
                />
              );
            }}
          </ProFormDependency>

          {/* 第四行：研究员 + 保密 */}
          <ProFormSelect
            name="researcher_id"
            label="对接研究员"
            rules={[{ required: true, message: '请选择研究员' }]}
            colProps={{ span: 16 }}
            request={async () => {
              const list = await getResearchers();
              return list.map((r) => ({ label: r.display_name, value: r.id }));
            }}
          />
          <ProFormSwitch
            name="is_confidential"
            label="保密需求"
            colProps={{ span: 8 }}
            tooltip="如使用到了机构的信息资料或机构明确提出保密需求请务必勾选"
          />

          {/* 第五行：关联需求（选填，revision 模式下锁定） */}
          <ProFormSelect
            name="parent_request_id"
            label="关联原始需求"
            colProps={{ span: 24 }}
            placeholder="输入关键词搜索需求标题（选填）"
            disabled={!!parentRequest}
            fieldProps={{
              showSearch: true,
              filterOption: false,
              options: linkableOptions,
              onSearch: handleLinkableSearch,
              allowClear: true,
              onChange: (val: number | undefined) => {
                if (!parentRequest) {
                  setLinkType(val ? 'sub' : null);
                }
              },
            }}
          />

          {/* 第六行：描述 */}
          <ProFormTextArea
            name="description"
            label={parentRequest ? '修改说明' : '需求描述'}
            colProps={{ span: 24 }}
            fieldProps={{ rows: 4, placeholder: parentRequest ? '请描述本次需要修改的内容' : '请详细描述您的需求...' }}
          />
        </ProForm>
      </Card>
    </PageContainer>
  );
};

export default SubmitRequest;
