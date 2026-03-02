// src/pages/Sales/SubmitRequest/index.tsx
import React, {useRef} from 'react';
import {
    PageContainer,
    ProForm,
    ProFormText,
    ProFormSelect,
    ProFormTextArea,
    ProFormSwitch,
    ProFormDateTimePicker,
    ProFormDependency
} from '@ant-design/pro-components';
import {message, notification, Button} from 'antd';
import type {ProFormInstance} from '@ant-design/pro-components';
import {createRequest, getOrganizations, getResearchers, cancelRequest} from '@/services/api';
import type {Organization} from '@/services/typings';
import dayjs from 'dayjs';

const DEPT_MAP: Record<string, string[]> = {
    '银行': ['金市', '资管', '其他'],
    '券商': ['自营', '资管', '其他'],
    '保险': ['母公司', '资管', '其他'],
};

const SubmitRequest: React.FC = () => {
    const formRef = useRef<ProFormInstance>(null);
    const orgsRef = useRef<Organization[]>([]);

    // 🔴 新增：处理撤回并重新填写的逻辑
    const handleUndo = async (newRequestId: number, previousValues: any) => {
        try {
            await cancelRequest(newRequestId);
            notification.destroy(`submit-success-${newRequestId}`); // 关掉右上角的通知
            message.success('需求已撤回，您可以修改后重新提交');

            // 核心：把刚才填的数据再塞回表单里
            formRef.current?.setFieldsValue(previousValues);
        } catch (error) {
            // 错误由全局拦截处理
        }
    };

    const handleFinish = async (values: any) => {
        try {
            // 核心修复：拦截表单数据，格式化时间戳为 ISO 字符串
            const payload = {
                ...values,
                // 如果有值，转换为类似 "2026-03-01T10:30:00Z" 的字符串；如果没有则传 undefined
                created_at: values.created_at ? dayjs(values.created_at).toISOString() : undefined,
            };

            const res = await createRequest(payload);
            message.success('需求提交成功');
            formRef.current?.resetFields();

            // 🔴 变动：改成弹出一个带有“撤回”按钮的通知框
            notification.success({
                key: `submit-success-${res.id}`,
                message: '需求提交成功',
                description: '您的需求已成功流转至研究端。发现填错了吗？',
                duration: 8, // 提示保留 8 秒
                btn: (
                    <Button
                        type="primary"
                        danger
                        size="small"
                        onClick={() => handleUndo(res.id, values)} // 把 ID 和刚才填的值传进去
                    >
                        撤回并重新填写
                    </Button>
                ),
            });
            return true;
        } catch (error) {
            // 你的 app.tsx 已经拦截了错误（控制台打印了 errorHandler: AxiosError）
            // 这里 return false 是为了告诉 ProForm 停止按钮的 loading 动画
            return false;
        }
    };

    return (
        <PageContainer title="提交新需求">
            <ProForm formRef={formRef} onFinish={handleFinish} layout="vertical">
                <ProFormText name="title" label="需求标题" rules={[{required: true}]}/>

                <ProFormSelect
                    name="request_type"
                    label="需求类型"
                    rules={[{required: true}]}
                    options={['基金筛选', '传统报告定制', '量化策略定制', '系统定制', '综合暂时兜底'].map(i => ({
                        label: i,
                        value: i
                    }))}
                />

                <ProFormSelect
                    name="research_scope"
                    label="研究范围"
                    options={['纯债', '固收+', '权益', '量化', '资产配置', '其他'].map(i => ({label: i, value: i}))}
                />

                <ProFormSelect
                    name="org_name"
                    label="机构名称"
                    rules={[{required: true}]}
                    showSearch
                    request={async () => {
                        const data = await getOrganizations();
                        orgsRef.current = data;
                        return data.map(org => ({label: org.name, value: org.name}));
                    }}
                    fieldProps={{
                        onChange: (val) => {
                            // 匹配机构并自动带入 org_type
                            const targetOrg = orgsRef.current.find(org => org.name === val);
                            if (targetOrg) {
                                formRef.current?.setFieldsValue({
                                    org_type: targetOrg.org_type,
                                    department: null, // 切换机构时清空已选部门
                                });
                            }
                        }
                    }}
                />

                {/* 机构类型：自动带入并设为只读 */}
                <ProFormText name="org_type" label="机构类型" readonly/>

                {/* 级联逻辑核心区 */}
                <ProFormDependency name={['org_type']}>
                    {({org_type}) => {
                        if (!org_type || !DEPT_MAP[org_type]) {
                            return null; // 不在银、券、保范围，直接隐藏
                        }
                        return (
                            <ProFormSelect
                                name="department"
                                label="部门"
                                rules={[{required: true, message: '请选择部门'}]}
                                options={DEPT_MAP[org_type].map(dept => ({label: dept, value: dept}))}
                            />
                        );
                    }}
                </ProFormDependency>

                <ProFormSelect
                    name="researcher_id"
                    label="指派研究员"
                    rules={[{required: true}]}
                    request={async () => {
                        const data = await getResearchers();
                        return data.map(r => ({label: r.display_name, value: r.id}));
                    }}
                />

                <ProFormSwitch name="is_confidential" label="是否保密" initialValue={false}/>

                <ProFormDateTimePicker name="created_at" label="创建时间(支持回溯)" initialValue={Date.now()}/>

                <ProFormTextArea name="description" label="需求详情描述"/>
            </ProForm>
        </PageContainer>
    );
};

export default SubmitRequest;
