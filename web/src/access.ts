export default function access(initialState: { currentUser?: any } | undefined) {
  const { currentUser } = initialState || {};

  // 这里返回的 key 必须和 config/routes.ts 里的 access 字段一模一样
  return {
    sales: currentUser?.role === 'sales',
    researcher: currentUser?.role === 'researcher',
    admin: currentUser?.role === 'admin',
  };
}
