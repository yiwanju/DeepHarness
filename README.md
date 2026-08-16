# DeepHarness

DeepHarness 是一个 Windows 桌面客户端，把 DeepSeek Harness（dsh）的 Web GUI 包装成独立的 exe —— 双击即用，无需命令行或 Node.js 环境。

> 源码在私有仓库 `yiwanju/DeepHarness`；二进制发布在公开仓库 `yiwanju/DeepHarness-Releases`。

## 它是什么

- **Electron 壳 + dsh sidecar**：启动时自动拉起 dsh Web 服务，就绪后加载其 Web UI。
- **面向非技术用户**：安装后填一次 API key 即可使用，无命令行、无环境配置。
- **不 fork dsh**：dsh 作为 npm 依赖安装，客户端定制通过 `--patch client.patch.yml` 注入，永远不碰 dsh 源码。

## 功能特性

- **启动画面**：双击立即显示 splash（含版本号），后台等待 dsh 就绪。
- **桌面通知**：审批请求、任务完成时弹系统通知，点击可聚焦窗口。
- **单实例锁**：重复双击聚焦已有窗口，不双开。
- **崩溃自动重启**：dsh 异常退出自动拉起（5 分钟内最多 3 次）。
- **自动更新**：基于 GitHub Releases（electron-updater）。
- **应用图标**：蓝紫渐变圆角方块 + 「DH」logo。

## 工作原理

1. 主进程 spawn sidecar 子进程：`node <dsh-bin> web --patch client.patch.yml --port 0`
2. 读取 stdout 就绪行 `dsh web: http://127.0.0.1:<port>`
3. 打开 `BrowserWindow` 加载该 URL
4. 通过 WebSocket 订阅 `/api/events.mux`，把「审批请求」「任务完成」事件转发为系统通知

## 技术栈

| 组件 | 用途 |
|---|---|
| Electron 43 | 桌面壳（主进程 + BrowserWindow） |
| TypeScript 7 | 主进程源码（node16 模块解析） |
| electron-builder | 打包 NSIS 安装包 |
| electron-updater | 自动更新 |
| @deepseek-ai/dsh | dsh 主程序（sidecar 依赖，不 fork） |

## 目录结构

```
src/
  main.ts              主进程：spawn dsh、开窗口、事件流、通知、更新
  log.ts               日志（写到 %APPDATA%\deep-harness\logs\main.log）
resources/
  client.patch.yml     客户端定制层（--patch 注入，不碰 dsh 源码）
  icon.png / icon.svg  应用图标
build/
  node.exe             sidecar 的 Node 运行时
release/               electron-builder 产物（exe / latest.yml / blockmap）
scripts/
  fetch-electron.mjs   预取 Electron 二进制（镜像加速）
  fetch-node.mjs       预取 sidecar node.exe
  smoke.sh             打包产物冒烟测试
```

## 快速开始

### 环境要求

- Windows 10/11
- Node.js ≥ 22.19

### 开发运行

```powershell
npm install --legacy-peer-deps
npm start
```

### 打包

```powershell
npm run dist
```

产物在 `release\DeepHarness Setup <version>.exe`。

## 分发

- 唯一分发形态：**NSIS 安装包**（install-only，无绿色版）。
- 发布到公开仓库 `yiwanju/DeepHarness-Releases`；源码在私有仓库 `yiwanju/DeepHarness`。
- 自动更新元数据 `latest.yml` 与安装包同名资产（连字符命名）一并上传。

## 相关文档

- [RUNBOOK.md](RUNBOOK.md)：运行、打包、发布、key 机制与分享的详细操作手册。
