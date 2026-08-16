# DeepHarness 桌面运行与发布手册

> 项目总览、功能与快速开始见 [README.md](README.md)；本文档专注打包、发布、key 机制与分享的详细操作。
> 本文档给「在真实桌面环境（非沙箱）完成剩余步骤」的维护者使用。
> 前提：项目已建好、依赖已装、`tsc` 编译通过（沙箱内已完成）。

## 一、开发模式运行验证（M0 验收）

```powershell
cd D:\DeepHarness-src
npm.cmd start
```

应弹出窗口并加载 Web UI。逐项验收（对应开发文档 6.5）：

- [ ] 窗口加载出 Web UI，能正常聊天（需在设置里配好 `DEEPSEEK_API_KEY`）
- [ ] 日志出现 `ready: http://127.0.0.1:<port>`（就绪行）
- [ ] 关闭窗口后，任务管理器无残留 node 进程
- [ ] 第二次启动不双开（单实例锁聚焦已有窗口）
- [ ] 任务管理器结束 dsh 子进程 node → 弹提示并自动重启

## 二、打包出 exe（M1）—— 已完成 ✅

已打包产出在 `release\`：

- `DeepHarness Setup 0.1.4.exe`（145MB）—— NSIS 安装版（唯一发布形态）
- `latest.yml` + `.blockmap` —— 自动更新元数据

改代码后如需重新打包：`npm.cmd run dist`（下载工具慢时设 `ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/` 与 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`）。

## 三、发布到 GitHub Releases（正式分发 + 自动更新）

```powershell
$env:GH_TOKEN = "<你的 GitHub token>"
npx.cmd electron-builder --publish always
```

## 四、git 提交并推送到 GitHub

```powershell
cd D:\DeepHarness-src
git init
git add .
git commit -m "M0+M1: DeepHarness Electron client"
git branch -M main
git remote add origin https://github.com/yiwanju/DeepHarness.git
git push -u origin main
```

## 五、给其他设备用

- 从 GitHub Releases 下载 `DeepHarness Setup 0.1.4.exe` 安装（正式分发，自动更新生效）

## 注意

- electron 二进制与 sidecar `node.exe` 均已就位，无需再 `npm install` 下载，直接 `npm start` / `npm run dist`。
- 未签名 exe 首次运行有 Windows SmartScreen 提示，点「仍要运行」即可，属预期。

## 七、key 机制与分享（重要）

### key 存在哪、为什么有时不用填

- API key 存在每台设备的 `%USERPROFILE%\.dsh\.credentials.yaml`（或 `.env`），**不在 exe 里**。
- DeepHarness 客户端和 dsh Web GUI 共用同一个 `~/.dsh`，所以在这台电脑配过一次 key，客户端就自动读到，无需再填。
- 全新设备没有这个文件，第一次启动需在设置里填 key。

### 分享给「别人」的电脑（对方用自己的 key）

1. 发 `DeepHarness Setup 0.1.4.exe`（安装版）。
2. 对方装好后，在设置里填自己的 `DEEPSEEK_API_KEY`。

### 分享给「自己」的另一台设备（想用同一个 key）

- 推荐：装好后在设置里手动填同一个 key。
- 或：把本机 `%USERPROFILE%\.dsh\.credentials.yaml` 拷到对方设备的相同路径（⚠️ 明文凭据，仅限自己的可信设备）。

### GitHub Releases 可见性（代码会不会被看到）

| 仓库 | 代码 | 下载 | 自动更新 |
|---|---|---|---|
| public | 公开可见 | 任何人可下载 | 任何人可更新 |
| private | 不可见 | 需授权 | 基本不可用 |

- electron-updater 的公开自动更新依赖 **public** Releases。
- 想「公开软件、不公开代码」：建一个 public 仓库只放二进制（exe/latest.yml），源代码放 private 仓库或留本地。

## 八、自包含说明（其他设备无需装 dsh）

- exe 已内置：sidecar `node.exe`、`@deepseek-ai/dsh` 主程序、前端界面、全部依赖。
- 其他设备只需：**Windows 10/11** + 一个 **API key**（在设置里填一次）。
- **无需**安装 deepseek-harness、dsh、Node.js，也无需任何命令行/环境配置，双击即用。
