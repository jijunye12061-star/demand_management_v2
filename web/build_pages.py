import os

# 这是我们所有需要创建的页面路径
pages = [
  "Sales/SubmitRequest", "Sales/MyRequests", "Sales/RequestFeed",
  "Researcher/SubmitRequest", "Researcher/MyTasks", "Researcher/RequestFeed",
  "Admin/Dashboard", "Admin/Analytics", "Admin/Export",
  "Admin/Settings/Users", "Admin/Settings/Requests", "Admin/Settings/Orgs", "Admin/Settings/Teams"
]

# 遍历列表，自动建文件夹和写入基础代码
for p in pages:
  # 拼接完整路径，比如 src/pages/Sales/SubmitRequest/index.tsx
  file_path = f"src/pages/{p}/index.tsx"

  # 自动创建多层文件夹 (相当于 mkdir -p)
  os.makedirs(os.path.dirname(file_path), exist_ok=True)

  # 提取最后的名字作为组件名，比如 SubmitRequest
  name = p.split('/')[-1]

  # 写入最基础的 React 组件代码
  with open(file_path, "w", encoding="utf-8") as f:
    f.write(f"export default function {name}() {{\n  return <h2>{name} 页面正在建设中...</h2>;\n}}\n")

print("✨ 太棒了！所有占位页面都已经自动生成完毕！")
