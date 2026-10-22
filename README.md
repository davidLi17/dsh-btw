# 原文批注 + BTW 旁问整合版（1.1.0）

安装本 Fork 即包含两项功能：在助手回复选中文字，同一工具栏选择「添加到对话」或「BTW 旁问」。
- 添加到对话：复用 Codex annotations 的编号锚点、可选评论、多条汇总发送和原文回跳。
- BTW 旁问：原独立气泡、上下文继承与宿主工具调用保持不变；不会把批注自动发送到主对话。
- 安装前请关闭独立的 dsh-codex-annotations，避免重复工具栏和重复处理。不要同时启用两份。
- 原批注 localStorage key 和协议未改；同一客户端、同一站点、同一会话的数据可继续读取。不要清除站点存储。跨客户端不自动迁移。
- 安装地址：github:davidLi17/dsh-btw#main

批注功能复用自 [dsh-codex-annotations](https://github.com/deepseek-harness-plugins/dsh-codex-annotations) 提交 9d405b1888ebbef1609e4b2f7ef6166f29012fcb（0.2.14）。源码位于 src/annotations，遵循 MIT，完整版权声明见 ANNOTATIONS-LICENSE；原 BTW 保持 Apache-2.0。

## 使用

选区添加到对话后，可写评论并保存；可继续添加其他批注，随后用主输入框发送。编号与批注胶囊可回跳原文。旁问也可通过 /btw 输入，不中断主对话。工具是否执行仍由宿主权限控制。

## 构建与验证

npm ci
npm run check

GitHub 安装直接读取 lib/index.js 与 lib/client.js，修改源码后必须构建并提交产物。
