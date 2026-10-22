# DSH-LHG-Utils（v1.2.0）

[English](README.md)

**LHG Utils** 是模块独立的 DeepSeek Harness 工具箱，包含 BTW 独立旁问、Codex 原文批注和原生思考强度快捷键。

## 安装与升级

仓库：[davidLi17/dsh-lhg-utils](https://github.com/davidLi17/dsh-lhg-utils)

GitHub 安装地址：`github:davidLi17/dsh-lhg-utils#main`

- 请更新已有安装，不要同时通过新旧仓库地址安装两份插件。npm 技术包名 `@michengai/dsh-btw`、Cordis 组件 ID `michengai-btw` 和 `/btw` 命令保持不变，以兼容已有安装。
- 使用整合的批注模块前，请关闭独立的 `dsh-codex-annotations`，避免重复工具栏和重复处理。
- 原批注存储 key 和协议未改；同一客户端、同一站点、同一会话的数据可继续读取。不要清除站点存储，跨客户端不自动迁移。
- 仓库更名、安装和升级的实际验证属于发布验收；本文更新地址不代表这些验收已经通过。

支持的宿主：DSH `0.2.1-rc.1` 和 `0.2.1-rc.2`。旧 `0.2.0` 缺少沿用的 v1.1.3 旁问通知隔离所需持久插件记录 API，请先升级 DSH 再安装 v1.2.0；已有批注数据和插件身份保持不变。

## 独立模块

三项模块默认全部开启，支持独立开关。在 **LHG Utils** 的宿主原生插件设置中，可调整「独立旁问」「原文批注」「思考强度快捷键」三个开关。配置字段为 `btw`、`annotations`、`reasoningShortcuts`，归属保留的 `michengai-btw` 组件，无需额外自定义面板。关闭模块会释放对应注册；关闭原文批注不会删除已有批注。原生快捷键或模型目录服务未就绪时，不阻止 BTW 和原文批注运行。

### BTW 独立旁问

在助手回复中选中文字并选择「旁问」，或使用 `/btw`。旁问保持独立气泡、上下文继承和宿主工具权限，不会把批注自动发送到主对话。

v1.1.3 起新建的旁问带有持久身份标记。完成通知仅作为参考上下文排入主会话，不会唤醒空闲的主 Agent；主 Agent 已运行时可在下一步读取。普通子任务通知、用户消息与清理不变。旧旁问缺少可靠标记，不按标题自动迁移；测试通知隔离时请新建旁问，并保持插件启用。

### 原文批注

选中助手回复并选择「添加到对话」，可填写评论后保存，或按 Enter 保存。光标回到主输入框，不自动发送；可继续收集多条批注，再从主输入框发送。编号引用与批注胶囊支持原文回跳。

### 思考强度快捷键

主会话输入框聚焦时：

- **Shift + ↑**：提高一个支持的思考等级。
- **Shift + ↓**：降低一个支持的思考等级。

档位完全取自当前模型的原生 `reasoning.efforts`，按数组顺序移动并提交原始 ID，不维护固定通用列表。`Major`、`Ultra`、`Off`、`Minimal` 等仅在模型实际声明时参与。当前档位优先采用会话 `reasoningEffort`；未显式选择时才回退到模型 `defaultEffort`。无法确定有效当前档位时不操作。

最高档和最低档不循环，不提交冗余请求。有效切换保留输入框焦点、草稿和光标位置，并通过原生模型选择器同步显示。连续按键按会话串行处理，等待选择状态确认；模型或选择被外部修改、请求失败或模块释放后，丢弃过期队列，避免旧模型档位作用于新选择。

只影响当前聚焦的主输入框及其所属会话。BTW 输入框、批注输入框、搜索、设置、终端、菜单展开和输入法组合输入期间均不触发；模型缺少有效档位时保留原生按键行为。实现复用 DSH 固定快捷键注册与会话模型目录，不添加全局自定义键盘监听器，也不替换原生模型选择器。

### Codex 订阅兼容

复用 `dsh-codex-subscription` 接入的 DSH 共享模型目录，包括 `openai-codex` 动态声明的思考档位；无需修改订阅插件源码，也不额外请求 ChatGPT API。切换保留 provider/model，仅调整思考强度，不修改 OAuth 状态、订阅额度、目录刷新、自定义输出详细程度或 Fast/Ultrafast 速度设置。注意宿主行为：DSH 原生 selectModel RPC 还会将所选 provider/model/effort 保存为后续会话的默认选择，且未提供仅当前会话的开关。本快捷键沿用这一原生行为；若不修改宿主，无法保证全局默认不变。发布前仍须使用实际安装的订阅插件完成验收。

## 构建与验证

```sh
npm ci
npm run check
npm run test:compat
```

`npm run check` 包含自动化测试与构建。GitHub 安装直接读取 `lib/index.js` 和 `lib/client.js`，修改源码后必须重新生成并提交 `lib` 产物。

**DSH Desktop 真机与 DSH Web 浏览器实际验收仍待完成。** 自动化测试不能代替原生事件顺序、真实输入法和实际安装升级验证。发布前请核对：上下调与边界、连续按键、模型和会话切换、焦点/草稿/光标保留、菜单与输入法排除、各模块独立开关与释放、BTW 工具和通知隔离、批注保存与回跳、DeepSeek/Codex 动态档位、Codex Fast/Ultrafast 不变；并确认新仓库地址可访问、升级不产生重复实例且原数据保留。未实际操作的项目不得标记为通过。

## 维护、来源与许可证

由 [davidLi17](https://github.com/davidLi17) 整合修改。原 BTW 插件作者为 [MichengAI](https://github.com/MichengAI/dsh-btw)，遵循 [Apache-2.0](LICENSE)。保留的技术身份用于安装升级兼容，不代表工具箱展示名称或当前整合维护者。

原文批注复用自 [dsh-codex-annotations](https://github.com/deepseek-harness-plugins/dsh-codex-annotations) 0.2.14，提交 `9d405b1888ebbef1609e4b2f7ef6166f29012fcb`，源码位于 `src/annotations`，遵循 MIT：**Copyright (c) 2026 deepseekharness-plugin contributors**。完整版权、许可与免责声明保留在 [ANNOTATIONS-LICENSE](ANNOTATIONS-LICENSE)。原作者归属和许可证声明全部保留。

## 旁问语音输入（可选）

- 启用官方 `@deepseek-ai/dsh-experimental-voice-input-bundle` 后，旁问弹框自动显示麦克风按钮。首次依赖/模型准备在原生语音插件设置中完成；本插件不自动安装或下载。
- 点击开始，点击停止后转写到旁问当前选区；只更新旁问草稿，不自动发送、不改主输入框。录音期间旁问发送暂不可用，键盘仍可编辑草稿；草稿已变则保留转写供手动插入，不覆盖新文字。
- 使用浏览器默认麦克风，不继承原生插件的自选设备；浏览器需要 HTTPS/loopback 和麦克风权限。取消、关闭弹框或禁用服务会释放录音并丢弃过期结果。
- SenseVoice 在 DSH Host 上运行；远程 Host 不等于浏览器所在电脑，音频会通过 DSH 已认证连接送给 Host。未启用语音服务时旁问照常使用。
- 对接契约核对版本为 `0.2.1-rc.2`。录音前端基于官方 MIT 实现（见 `VOICE-LICENSE`）；未修改官方客户端、未添加全局语音快捷键，批注编辑框不接入语音。
