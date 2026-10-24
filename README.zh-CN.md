# DSH-LHG-Utils（v1.2.5）

[English](README.md)

**LHG Utils** 是模块独立的 DeepSeek Harness 工具箱，包含 BTW 独立旁问、Codex 原文批注和原生思考强度快捷键。

## /recap

在主对话输入 `/recap` 并按 Enter，或在原生 `/` 菜单选择它，即会填写并自动发送以下两行。仅打字不会发送；`/recap` 后附其他文字不会作为该命令触发。沿用宿主原生发送和失败处理，不添加全局按键监听或常驻提示词。

```text
1. 对话主线 recap，整理其中信息。
2. 给我对我最重要的信息。
```

## 安装与升级

仓库：[davidLi17/dsh-lhg-utils](https://github.com/davidLi17/dsh-lhg-utils)

GitHub 安装地址：`github:davidLi17/dsh-lhg-utils#main`

包名现为 `@davidli/dsh-lhg-btw`，仓库地址不变。本次改名通过 GitHub 分发，不包含 npm registry 发布；安装源仍使用上面的 GitHub 地址。

### 从旧包名迁移（仅需一次）

不要直接把新包叠加在旧包上：包管理器按 npm 包名区分依赖，两个包会同时存在，而它们刻意共用一个 Cordis 组件 ID。

1. 先备份当前 profile 的 `package.json`、`pnpm-lock.yaml` 和 `cordis.patch.yml`（如存在），记录插件的启用状态与 bundle 顺序，再停止对应的 DSH Host。Desktop 应完全退出。
2. 在**同一个原 profile** 先移除旧包，再添加同一 GitHub 地址。以下以 `tui` 为例；两条命令的 `tui` 都必须替换成你实际使用的 profile，不能省略。Desktop 用户先在应用菜单「Manage dsh Command…」安装其自带 `dsh`，再完全退出应用，并在两条命令中使用 `--profile desktop`；普通 npm CLI 不支持管理 desktop profile。

```sh
dsh plugin --profile tui remove @michengai/dsh-btw
dsh plugin --profile tui add github:davidLi17/dsh-lhg-utils#main
```

3. 检查当前 profile 的 `cordis.patch.yml`，以及 DSH home 和自定义 `--patch` 覆写（包括原生设置页生成的配置）：若条目同时按 `id: michengai-btw` 和旧 `name: '@michengai/dsh-btw'` 匹配，只把该包名改成 `@davidli/dsh-lhg-btw`；`id`、`config` 和 `disabled` 原样保留。只按 ID 匹配的配置不用改。不要全局替换 `michengai-btw` 或批注存储键。
4. 移除/添加会把新包加到 bundle 列表末尾并设为启用；如原来禁用或调整过顺序，按备份恢复对应状态/顺序。确认依赖和 bundle 列表不再含旧包，只有新包，然后重启 Host 并刷新客户端。若添加失败，先修复安装，不要清空 profile、会话或浏览器存储。

DSH `0.2.1-rc.1` / `rc.2` 的上述 CLI 操作不删除 `cordis.patch.yml` 或会话数据。插件继续使用 Cordis ID `michengai-btw`、原配置命名空间、旁问持久记录及批注存储协议，`/btw`、`/recap` 等功能不变。后续已用新包名的安装仍从同一 GitHub 地址更新，无需再移除旧包。

- 使用整合的批注模块前，请关闭独立的 `dsh-codex-annotations`，避免重复工具栏和重复处理。
- 原批注存储 key 和协议未改；同一客户端、同一站点、同一会话的数据可继续读取。不要清除站点存储，跨客户端不自动迁移。
- 隔离包安装/迁移检查不等于真实 Desktop/Web 操作验收；实际客户端验收状态见下文。

支持的宿主：DSH `0.2.1-rc.1` 和 `0.2.1-rc.2`。旧 `0.2.0` 缺少沿用的 v1.1.3 旁问通知隔离所需持久插件记录 API，请先升级 DSH 再安装 v1.2.1；已有批注数据和插件身份保持不变。

## 独立模块

三项模块默认全部开启，支持独立开关。在 **LHG Utils** 的宿主原生插件设置中，可调整「独立旁问」「原文批注」「思考强度快捷键」三个开关。配置字段为 `btw`、`annotations`、`reasoningShortcuts`，归属保留的 `michengai-btw` 组件，无需额外自定义面板。关闭模块会释放对应注册；关闭原文批注不会删除已有批注。原生快捷键或模型目录服务未就绪时，不阻止 BTW 和原文批注运行。

### BTW 独立旁问

在助手回复中选中文字并选择「旁问」，或使用 `/btw`。旁问保持独立气泡、上下文继承和宿主工具权限，不会把批注自动发送到主对话。

v1.2.5 起，气泡右上角的「在侧边栏打开」会打开**这条旁问原来的子会话**，可在回答中查看实时内容，完成后继续追问，不复制问答或重新建立任务。它使用 Better Sidebar 任务页也使用的宿主原生右侧会话，保留原生历史、输入草稿和附件；打开本身不发送消息。重复打开复用已有页签；关闭侧边页签不关闭气泡，气泡的「停止回答」仍明确停止当前回答。宿主没有对应会话视图时显示不可用提示，不退回新建对话。旧版本气泡缺少请求绑定时不猜测匹配，请使用升级后创建的旁问。

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

原文批注复用自 [dsh-codex-annotations](https://github.com/deepseek-harness-plugins/dsh-codex-annotations) 0.2.14 基线，并选取 0.3.0 的实用修复，更新来源截至提交 `ce3866ab877de7f402f1ee121ed858cd4871c3e7`，源码位于 `src/annotations`，遵循 MIT：**Copyright (c) 2026 deepseekharness-plugin contributors**。完整版权、许可与免责声明保留在 [ANNOTATIONS-LICENSE](ANNOTATIONS-LICENSE)。原作者归属和许可证声明全部保留。

## 旁问语音输入（可选）

- 启用官方 `@deepseek-ai/dsh-experimental-voice-input-bundle` 后，旁问弹框自动显示麦克风按钮。首次依赖/模型准备在原生语音插件设置中完成；本插件不自动安装或下载。
- 点击开始，点击停止后转写到旁问当前选区；只更新旁问草稿，不自动发送、不改主输入框。录音期间旁问发送暂不可用，键盘仍可编辑草稿；草稿已变则保留转写供手动插入，不覆盖新文字。
- 使用浏览器默认麦克风，不继承原生插件的自选设备；浏览器需要 HTTPS/loopback 和麦克风权限。取消、关闭弹框或禁用服务会释放录音并丢弃过期结果。
- SenseVoice 在 DSH Host 上运行；远程 Host 不等于浏览器所在电脑，音频会通过 DSH 已认证连接送给 Host。未启用语音服务时旁问照常使用。
- 对接契约核对版本为 `0.2.1-rc.2`。录音前端基于官方 MIT 实现（见 `VOICE-LICENSE`）；未修改官方客户端、未添加全局语音快捷键，批注编辑框不接入语音。

### 批注引用（1.2.1）

发送批注时不再短暂闪出内部协议文本。AI 回复中的“注释 N”链接支持悬停预览原文/评论、点击回跳；编号从持久会话历史解析，清空浏览器缓存后仍能恢复。引用说明只附于包含真实批注载荷的模型侧用户文本，不注册全局批注系统提示段。每个这样的文本块附一份 117 字符引导，随正常历史读取保留，不改写持久消息。
