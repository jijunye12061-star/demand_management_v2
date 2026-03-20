import React from 'react';
import { Modal, Form, Input, InputNumber, App } from 'antd';
import { createProgressUpdate } from '@/services/progressUpdate';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  requestId: number;
}

const ProgressUpdateModal: React.FC<Props> = ({ open, onClose, onSuccess, requestId }) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = React.useState(false);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      await createProgressUpdate(requestId, {
        content: values.content,
        work_hours: values.work_hours,
      });
      message.success('进度已记录');
      form.resetFields();
      onSuccess();
      onClose();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.message || '记录失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="记录进度"
      open={open}
      onCancel={() => { form.resetFields(); onClose(); }}
      onOk={handleOk}
      confirmLoading={submitting}
      okText="提交"
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="content"
          label="进度描述"
          rules={[{ required: true, message: '请填写进度描述' }]}
        >
          <Input.TextArea rows={4} placeholder="请描述当前阶段进展" />
        </Form.Item>
        <Form.Item
          name="work_hours"
          label="本次工时（小时）"
          rules={[{ required: true, message: '请填写工时' }]}
        >
          <InputNumber min={0} step={0.5} precision={1} style={{ width: '100%' }} placeholder="如 1.5" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default ProgressUpdateModal;
