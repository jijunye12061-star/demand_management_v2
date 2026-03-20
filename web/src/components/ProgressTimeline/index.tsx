import React, { useEffect, useState, useCallback } from 'react';
import { Collapse, Timeline, Typography, Tag, Popconfirm, Input, InputNumber, Space, App } from 'antd';
import { useModel } from '@umijs/max';
import { getProgressUpdates, editProgressUpdate, deleteProgressUpdate } from '@/services/progressUpdate';
import type { ProgressUpdateItem } from '@/services/typings';

const { Text } = Typography;

interface Props {
  requestId: number;
  onTotalHoursChange?: (hours: number) => void;
}

const ProgressTimeline: React.FC<Props> = ({ requestId, onTotalHoursChange }) => {
  const { message } = App.useApp();
  const { initialState } = useModel('@@initialState');
  const currentUserId = initialState?.currentUser?.id;

  const [items, setItems] = useState<ProgressUpdateItem[]>([]);
  const [totalHours, setTotalHours] = useState(0);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editHours, setEditHours] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await getProgressUpdates(requestId);
      setItems(result.items);
      setTotalHours(result.total_work_hours);
      onTotalHoursChange?.(result.total_work_hours);
    } catch { /* 静默失败 */ }
  }, [requestId, onTotalHoursChange]);

  useEffect(() => { load(); }, [load]);

  if (items.length === 0) return null;

  const startEdit = (item: ProgressUpdateItem) => {
    setEditingId(item.id);
    setEditContent(item.content);
    setEditHours(item.work_hours);
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = async (item: ProgressUpdateItem) => {
    if (!editContent.trim()) { message.error('内容不能为空'); return; }
    setSaving(true);
    try {
      await editProgressUpdate(requestId, item.id, { content: editContent, work_hours: editHours });
      message.success('已更新');
      setEditingId(null);
      await load();
    } catch (err: any) {
      message.error(err?.message || '更新失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteProgressUpdate(requestId, id);
      message.success('已删除');
      await load();
    } catch (err: any) {
      message.error(err?.message || '删除失败');
    }
  };

  const timelineItems = items.map((item) => ({
    key: item.id,
    children: (
      <div>
        <div style={{ marginBottom: 4 }}>
          <Text strong>{item.user_name}</Text>
          <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
            {item.created_at?.slice(0, 16)}
          </Text>
          {item.updated_at && item.updated_at !== item.created_at && (
            <Tag style={{ marginLeft: 4, fontSize: 11 }}>已编辑</Tag>
          )}
        </div>

        {editingId === item.id ? (
          <div>
            <Input.TextArea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={3}
              style={{ marginBottom: 8 }}
            />
            <Space>
              <InputNumber
                value={editHours}
                onChange={(v) => setEditHours(v ?? 0)}
                min={0}
                step={0.5}
                precision={1}
                addonAfter="h"
                style={{ width: 100 }}
              />
              <a onClick={() => saveEdit(item)}>{saving ? '保存中...' : '保存'}</a>
              <a onClick={cancelEdit} style={{ color: '#999' }}>取消</a>
            </Space>
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: 4 }}>{item.content}</div>
            <Space>
              <Text type="secondary" style={{ fontSize: 12 }}>工时 {item.work_hours}h</Text>
              {item.can_edit && (
                <a style={{ fontSize: 12 }} onClick={() => startEdit(item)}>编辑</a>
              )}
              {item.can_delete && (
                <Popconfirm title="确定删除此进度记录？" onConfirm={() => handleDelete(item.id)}>
                  <a style={{ fontSize: 12, color: '#ff4d4f' }}>删除</a>
                </Popconfirm>
              )}
            </Space>
          </div>
        )}
      </div>
    ),
  }));

  return (
    <div style={{ marginTop: 24 }}>
      <Collapse
        defaultActiveKey={['updates']}
        items={[{
          key: 'updates',
          label: `进度记录（${items.length}条，累计 ${totalHours}h）`,
          children: <Timeline items={timelineItems} />,
        }]}
      />
    </div>
  );
};

export default ProgressTimeline;
