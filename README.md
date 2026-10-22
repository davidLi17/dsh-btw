# 原文批注与旁问（1.1.3）

安装本 Fork 即包含两项功能：在助手回复选中文字，同一工具栏选择「添加到对话」或「旁问」。
- 添加到对话：复用 Codex annotations 的编号锚点、可选评论、多条汇总发送和原文回跳。
- 旁问：原独立气泡、上下文继承与宿主工具调用保持不变；不会把批注自动发送到主对话。
- 安装前请关闭独立的 dsh-codex-annotations，避免重复工具栏和重复处理。不要同时启用两份。
- 原批注 localStorage key 和协议未改；同一客户端、同一站点、同一会话的数据可继续读取。不要清除站点存储。跨客户端不自动迁移。
- 安装地址：github:davidLi17/dsh-btw#main

批注功能复用自 [dsh-codex-annotations](https://github.com/deepseek-harness-plugins/dsh-codex-annotations) 提交 9d405b1888ebbef1609e4b2f7ef6166f29012fcb（0.2.14）。源码位于 src/annotations，遵循 MIT，完整版权声明见 ANNOTATIONS-LICENSE；原 BTW 保持 Apache-2.0。

## 维护与来源

由 davidLi17 整合修改。旁问功能前身为 MichengAI 的 BTW 插件，原文批注复用 deepseekharness-plugin contributors 的 Codex annotations；原作者归属与许可证保留。为让现有安装正常更新，技术包名 @michengai/dsh-btw、组件 ID michengai-btw 和 /btw 命令保持兼容，并不代表本整合版的展示名称或维护者。

## 使用

选区添加到对话后，可写评论并保存；点击保存或按回车后，光标自动回到主输入框；可继续添加其他批注，随后用主输入框发送。编号与批注胶囊可回跳原文。旁问也可通过 /btw 输入，不中断主对话。工具是否执行仍由宿主权限控制。

## 旁问完成通知（1.1.3）

更新后请从主会话新建一次旁问。新旁问独立打开后继续聊天，其完成通知只作为带来源的参考上下文排入主会话，不会自动启动主 Agent 新一轮回复；主 Agent 已在运行时可在下一步读取该参考。普通子任务通知和用户消息不受影响，工具能力与子会话清理不变。

旧版已创建的旁问缺少可靠身份标记，不自动按标题迁移，仍保留原历史；请不要在旧旁问中继续测试本修复。插件需保持启用。

## 构建与验证

npm ci
npm run check

GitHub 安装直接读取 lib/index.js 与 lib/client.js，修改源码后必须构建并提交产物。
