# Lumen AI 前端项目

## 项目说明

这是 Lumen AI 的桌面应用前端，使用 **Tauri 2 + React + TypeScript + Tailwind CSS** 构建。

## 技术栈

- **桌面框架**: Tauri 2.1.0
- **前端框架**: React 18.3.1
- **语言**: TypeScript 5.6.3
- **样式**: Tailwind CSS 3.4.17
- **构建工具**: Vite 6.0.7
- **包管理**: pnpm 10.0.0

## 项目结构

```
lumen-Front/
├── src/                        # React 源代码
│   ├── api/                    # API 客户端
│   │   └── chat.ts            # 聊天 API
│   ├── hooks/                  # React Hooks
│   │   └── useChat.ts         # 聊天状态管理
│   ├── ChatInterface.tsx      # 聊天界面组件
│   ├── App.tsx                # 应用入口
│   └── main.tsx               # React 入口
├── src-tauri/                  # Rust 后端（Tauri 2）
│   ├── Cargo.toml             # Rust 依赖
│   ├── src/                   # Rust 源代码
│   ├── tauri.conf.json        # Tauri 配置
│   └── icons/                 # 应用图标
├── package.json               # Node.js 依赖
├── vite.config.ts            # Vite 配置
├── tailwind.config.js        # Tailwind 配置
└── tsconfig.json             # TypeScript 配置
```

## 启动步骤

### 1. 安装 Rust（如果未安装）

下载并安装 Rustup: https://rustup.rs/

安装完成后重启终端。

### 2. 安装依赖

```bash
cd lumen-Front
pnpm install
```

### 3. 启动后端服务

在另一个终端窗口：

**Windows:**
```bash
cd F:\AI\tools\VCP\Lumen
启动后端.bat
```

**Linux/Mac:**
```bash
cd F:\AI\tools\VCP\Lumen
./启动.sh
```

后端将运行在: http://127.0.0.1:8888

### 4. 启动前端应用

```bash
cd lumen-Front
pnpm tauri dev
```

或使用启动脚本:

```bash
启动并测试.bat
```

前端将自动启动桌面应用。

## API 连接

前端通过以下方式连接后端:

- **HTTP**: 普通请求（聊天消息）
- **SSE**: 流式推送（LLM 回复）
- **WebSocket**: 实时通信（待实现）

### API 端点

后端地址: **http://127.0.0.1:8888**

| 端点 | 方法 | 说明 |
|------|------|------|
| `/chat/send` | POST | 发送聊天消息 |
| `/chat/stream` | POST | 流式聊天消息 |
| `/session/new` | POST | 创建新会话 |
| `/session/load` | POST | 加载会话 |
| `/session/list` | GET | 会话列表 |
| `/session/delete` | DELETE | 删除会话 |

## 开发说明

### 添加新功能

1. **API 客户端**: 在 `src/api/` 添加新的 API 函数
2. **状态管理**: 在 `src/hooks/` 添加新的 Hook
3. **UI 组件**: 在 `src/` 添加新的组件

### 样式修改

使用 Tailwind CSS 类名，参考: https://tailwindcss.com/docs

### 调试

- **前端**: 打开浏览器开发者工具（F12）
- **后端**: 查看终端日志
- **API**: 访问 http://127.0.0.1:8000/docs 查看 API 文档

## 常见问题

### Rust 找不到

确保 Rust 已安装并在 PATH 中:

```bash
cargo --version
```

### 端口冲突

如果端口 1420 被占用，修改 `vite.config.ts` 中的端口配置。

### 后端连接失败

确保后端服务正在运行:

```bash
curl http://127.0.0.1:8888/docs
```

或者访问 API 文档: http://127.0.0.1:8888/docs

## 下一步开发

- [ ] 语音录制功能（WebSocket）
- [ ] 屏幕截图功能（Tauri API）
- [ ] AI 控制 UI 样式（WebSocket）
- [ ] Framer Motion 动画
- [ ] 会话管理界面
- [ ] 设置界面

## 相关文档

- [Tauri 文档](https://tauri.app/v2/guides/)
- [React 文档](https://react.dev/)
- [Tailwind CSS 文档](https://tailwindcss.com/docs)
- [Vite 文档](https://vitejs.dev/)
