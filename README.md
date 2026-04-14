# Lumen

> 学习项目，目前没什么值得看的。

一个基于 LLM 的 AI 对话系统，正在开发中。

## 状态

🚧 **WIP** - 学习项目，代码持续重构中

## 简介

Lumen 是一个个人学习项目，用于探索 LLM 应用的各种模式：
- 对话管理
- 工具调用
- 记忆系统
- Agent 协作（计划中）

## 快速开始

### 启动后端服务

**Windows:**
```bash
pip install -r requirements.txt
启动后端.bat
```

**Linux/Mac:**
```bash
pip install -r requirements.txt
./启动.sh
```

后端将运行在: http://127.0.0.1:8888

### 启动桌面应用

```bash
cd lumen-Front
pnpm install
pnpm tauri dev
```

或使用启动脚本: `lumen-Front\启动并测试.bat`

## 许可

MIT
