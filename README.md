# VOA Level 2 Player

一个为 [VOA Learning English — Let's Learn English Level 2](https://learningenglish.voanews.com/p/6765.html) 增加细粒度倍速、整课循环、睡眠定时、全文对话和进度记忆的轻量网页播放器。

项目优先解决真实使用问题，而不是重新制作 VOA 网站。运行时只有原生 HTML、CSS、JavaScript 和静态 JSON，没有框架、后台、数据库或构建步骤。

## 当前状态

MVP 已放入 Lesson 1–3，用于先验证 iPhone Safari 的媒体链路和锁屏行为：

- 视频与 128 kbps 音频；
- 完整 Conversation 字幕/文本；
- 首次打开默认 0.80，并提供 0.70 / 0.80 / 0.90 / 1.00 快捷速度；
- 0.05 步进，范围 0.50–1.50；
- 整课循环；
- 15 / 30 / 45 / 60 分钟与自定义睡眠定时；
- 上次课程、播放位置、速度、循环和已学状态记忆；
- 上一课 / 下一课；
- Media Session 渐进增强。

前三课真机验收通过后，再导入剩余 27 课。完整范围和验收清单见 [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md)。

## 本地运行

不要直接双击 `index.html`，因为浏览器通常不允许本地文件通过 `fetch` 读取 JSON。

```bash
python -m http.server 8000
```

然后打开：

```text
http://localhost:8000
```

也可以直接访问某一课：

```text
http://localhost:8000/?lesson=2
```

## 校验

```bash
node --check js/app.js
node --check js/core.js
npm test
python -m pytest -q
python -m json.tool data/lessons.json > /dev/null
```

## 更新课程数据

安装仅供导入脚本使用的依赖：

```bash
python -m pip install -r scripts/requirements.txt
```

先用三课验证页面结构：

```bash
python scripts/import_voa.py --limit 3
```

默认输出到：

```text
data/lessons.generated.json
```

检查生成内容和媒体链接后，再替换正式数据。全部课程：

```bash
python scripts/import_voa.py
```

导入器会：

1. 从 VOA Level 2 索引发现编号课程；
2. 忽略 Review 页面；
3. 为每课优先选择 360p MP4 和 128 kbps MP3；
4. 提取 Conversation 文本；
5. 生成静态 JSON。

VOA 改版后脚本可能需要调整，所以生成结果必须人工检查，不能自动覆盖线上数据。

## 部署到 GitHub Pages

仓库保持纯静态结构，可以直接使用 GitHub Pages：

1. 打开仓库 **Settings → Pages**；
2. Source 选择 **Deploy from a branch**；
3. Branch 选择 `main`，目录选择 `/ (root)`；
4. 保存并等待 Pages 发布。

部署后应使用真实 iPhone 完成 [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) 中的锁屏、倍速、循环和定时测试。

## 重要限制

睡眠定时器使用绝对结束时间，并通过多种浏览器事件反复校验。但 iOS 锁屏后可能挂起网页 JavaScript，所以到点停止的精度必须由真机验证。页面恢复运行后会立即校正；在测试证明 Web 方案不够可靠之前，不引入原生 App 或重型架构。

## 内容来源

课程标题、文本和远程媒体来自 VOA Learning English。每课保留原始页面链接。本项目是非官方学习工具，与 VOA 无隶属关系；项目代码采用 MIT License，课程内容不因该代码许可证而改变其原有来源和适用条款。
