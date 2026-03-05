export default function access(initialState: { currentUser?: any } | undefined) {
  const { currentUser } = initialState || {};
  const role = currentUser?.role;

  // admin 同时具备三端权限，可以进入销售端、研究端和管理端
  return {
    sales: role === 'sales' || role === 'admin',
    researcher: role === 'researcher' || role === 'admin',
    admin: role === 'admin',
  };
}
