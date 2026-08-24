# Agent Note: 知我AI个性化提示问题

Status: implemented

[English](2026-08-21-zhiwo-personalized-questions.md) | 中文

## 问题

知我AI的空白会话目前只有问候语，通用 Web Composer 仍然询问用户想要构建什么。这两个界面都没有说明知我AI 是资料所有者面向访客的个人 Agent，也没有说明访客可以询问所有者哪些问题。完成一次回答后，Composer 也没有提供基于当前信息的下一步，访客必须在看不到 `userdata/` 已包含哪些项目与个人主题的情况下自行构造新问题。

提示问题必须兼顾隐私与响应速度。启动时递归读取一个数 GB 的 Workspace 会拖慢应用，并引入知我AI本来不需要的派生 Index Lifecycle。在 Session 尚不存在时调用模型生成问题则会增加成本与故障路径，而且模型可见的输入无法由 Session Log 重建。

## 决策

`packages/zhiwo/product` 在原始 Workspace 之上拥有一份派生问题目录。应用启动时异步安排一次只读且不会阻塞启动的清单扫描，读取符合条件的直接子目录与普通文档，忽略隐藏条目与符号链接。清单只用条目名称、类型、大小和修改时间生成指纹，不读取文档正文；目录名用于识别项目。Product 会把指纹与 `DSH_HOME` 下带版本的私有缓存比较：完全命中时直接发布缓存目录，不重新初始化或重写；未命中时原子发布并缓存 100 个语义问题对。存在项目时包含 50 个全局问题与 50 个项目问题；没有项目时包含 100 个全局问题。每个语义 ID 都有完整的简体中文与英文文本。

随仓库交付的 `zhiwo` Persona 明确区分资料所有者、访客与 Agent。知我AI 面向访客并代表所有者；回答中的第一人称只指所有者，不能指 Agent 或访客，也不能把访客或机器环境信息归到所有者名下。回答只引用相对路径，绝不暴露绝对路径。提示问题采用访客向被代表所有者提问的表达。

Product 在现有 Connection `/api` Channel 上注册一个内部 `zhiwo/questions` 方法。知我AI访问策略允许该方法，并在分发前继续执行已有的 Visitor Session 所有权检查。问候页请求返回四个轮换目录问题，存在项目时通常是两个全局问题与两个具体项目问题。后续请求只受理以 `completed` 结束的 Turn；Product 会把截至该 Turn 的有界对话发送给 Turn 最近一次 Request Header 记录的 Provider 与 Model，要求严格两个双语上下文问题，再与初始化全局问题池中的两个问题组合。自动更新与手动刷新走同一条模型路径。已经展示的上下文 ID 用于识别上一批生成问题，下一次 Prompt 必须避开它们。

辅助请求分发前，Product 会写入 `zhiwo/question-llm-request`，其中包含确切 Route、System Prompt、Message List、已完成 Turn 的 Sequence 与输出 Token 上限。该事件不进入派生 Conversation Surface，因此不会成为以后 Assistant 回答的一部分；Session Log 仍可以重建所有模型可见的提示问题输入。`questionModelMaxInputBytes` 限制完整辅助输入，并保留最近的 Transcript 尾部；`questionModelMaxOutputTokens` 限制响应。请求使用 `GenerateOptions.purpose: 'suggestions'`，DeepSeek Adapter 会为这份有界 JSON 输出禁用思考。

`packages/zhiwo/ui` 使用现有 `conversation.input.dock` List Seat 渲染提示问题面板。空白 Session 请求问候问题，新完成的 Turn 请求后续问题。点击问题只把它写入原生 Composer Draft，是否发送仍由用户明确决定。两个阶段都提供一个刷新按钮及其相邻的显隐控件。问题卡在宽度超过 720 px 时默认展开，在 720 px 及以下时默认收起；用户手动修改的显隐状态会持续到组件再次挂载。刷新会先展开问题卡，再请求下一组。每个 Session 与 Locale 同时最多有一个请求，按钮会显示加载状态；更新失败、取消、中断或响应格式错误时，界面保留原来的四个问题供用户继续使用，并显示可重试提示。浏览器会验证每个响应；后续响应的 Source Tag 不能证明严格二加二时必须拒绝。

知我AI还会拦截原生 Conversation Placeholder 扩展点。中文可见消息输入框使用“问问我的经历、项目、能力或计划”，英文使用“Ask about my experience, projects, strengths, or plans”，其中第一人称指被代表的资料所有者。空白会话问候语同样邀请访客了解所有者，不会把 Agent 介绍成独立主体。其他通用 Web Profile 继续使用原文案。知我AI Patch 按显式 `--port`、`ZHIWO_LISTEN_PORT`、`18000` 的顺序解析 Web 端口，并按显式启动值、`ZHIWO_LISTEN_HOST`、`127.0.0.1` 的顺序解析绑定地址。随仓库交付的 Docker 组合只在容器内部使用 Host 覆盖，并把端口发布到主机回环地址。无效或已占用端口在启动时直接失败，绝不回退到操作系统随机端口。

知我AI 同时拥有浏览器 Document 品牌。Host 在返回页面前替换初始构建标题、通用鱼形 Favicon、安装 Manifest 及其图标；Client 通过 Product Title Waterfall 提供“知我AI”，并通过 Document Title Waterfall 提供“AskmeAI | 知我AI”，让空白会话和已有标题会话在 React 挂载后都只显示这一双语标签页文案。图标使用应用外壳同款圆角“知”标记；展开后的侧边栏还会把产品仓库操作紧接在品牌文字之后。通用 Web Profile 继续保留构建时选择的标题、图标与安装元数据。

## 隐私与生命周期

问题文本可以包含可见对话中的普通项目名，但不得包含绝对路径、`userdata`、DSH 或 Harness 实现名、System Prompt、Tool Trace 或隐藏条目名。目录缓存使用 Workspace 路径哈希而不是路径本身，并采用私有目录与文件权限；缓存保存派生目录与指纹，不保存文档内容。缓存解析、模型输出、浏览器请求与浏览器响应都是不受信 JSON 入口。模型输出必须是恰好包含两条记录的双语 JSON 数组，不得有额外字段、重复问题、超长文本、禁止的实现术语或绝对路径；浏览器响应仍必须满足有效 Source Tag、唯一 ID 与确切类别数量。

扫描只发布完整目录 Revision，Disposer 会阻止插件销毁后才完成的异步任务替换状态。UI 在 Session、Locale 或组件变化时中止请求，并忽略过期结果。未以 `completed` 结束的 Turn 不得替换上一次成功的后续问题集。Provider 故障、取消或无效生成会返回错误，不会退回确定性上下文模板；UI 因此保留原来的四个问题并提供重试。

## 考虑过的替代方案

**完全通过 LLM 生成问候与后续提示问题。** 启动阶段没有 Session Log 可以承载模型可见的 Workspace 摘要，而且问候问题应在没有 Provider I/O 时仍可用，因此不采用。问候问题和每组后续问题中的全局一半保持确定性，只有回答后的上下文一半实时生成。

**通过固定模板派生回答后的问题。** 词法项目匹配和最近消息片段无法响应回答的实质内容。重复使用同一组模板也会让自动与手动刷新显得像预定义问题，因此不采用。

**递归索引 `userdata/` 中的每个文件。** 项目标识已经可以从直接子目录获得。根清单仍会通过可见文档元数据变化使缓存失效，而递归内容索引会增加启动耗时、二进制格式策略与另一份持久化知识表示，因此不采用。

**修改通用 Conversation 字典。** 面向随仓库交付的 Harness Web Profile 时，Coding 语境仍然正确。使用窄范围的 Placeholder 拦截可以让产品文案留在知我AI插件中。

**构建知我AI专用 BFF 或 Session Store。** 现有 Connection Interceptor、Visitor Access Policy、原生 Session Log 与 Input Slot 已经拥有需要的 Lifecycle 与隔离，因此不采用。

## 测试

- 启动不等待目录清单扫描；扫描器只读取符合条件的直接子目录/文档元数据，绝不读取文档正文。指纹未变化时复用私有缓存，不初始化目录或重写缓存；目录或文档发生变化时缓存失效。完整目录包含 100 个唯一语义问题对，每个 ID 在两种语言中都有一个完整表达。
- 空白 Session 展示四个问题；手动刷新会轮换问题，失败时不替换当前可用集合。存在项目时，这四个问题包含两个全局问题与两个项目问题。桌面视口初始显示问题卡，手机视口初始隐藏问题卡；显隐控件支持双向切换，刷新会展开已收起的集合。
- 每次新完成的 Assistant Turn 都会调用已记录的对话模型，并把面板替换为严格两个生成上下文问题与两个目录全局问题。手动刷新会再次调用相同 Route，并把可见上下文问题列为需要避开的问题。失败、取消、阻塞、达到 Token 上限与中断的 Turn 保留上一次成功集合。
- 分发前 Session Event 记录确切提示问题模型输入与 Route。无效 JSON、额外字段、重复问题、禁止术语、绝对路径、Tool Call 与非正常结束原因都会失败，不会发布替代集合。
- 切换中文或英文会更新问题、控件、错误文案与知我AI Composer Placeholder，但不改变语义 ID。任何可见提示问题不得包含绝对路径或禁止的实现术语。
- 问候语、Placeholder、提示问题与模型 Persona 始终把知我AI定位为资料所有者面向访客的 Agent。第一人称输出只指所有者，访客信息不会被归到所有者名下。
- 默认 Web URL 是 `http://127.0.0.1:18000`；`ZHIWO_LISTEN_PORT` 与显式 `--port` 会绑定到请求的端口；端口被占用时明确失败。
- 空白与已有标题的浏览器标签都只在圆角“知”图标旁显示“AskmeAI | 知我AI”；安装元数据使用“知我AI”，且不含 DSH 产品文案或通用鱼形标记。
- 聚焦单元测试与真实组合测试覆盖目录构建、缓存校验、Visitor 隔离、Turn 完成、轮换、响应验证、刷新失败、Locale 切换与 Placeholder 拦截。无密钥的已组合 Transcript 或浏览器 Fixture 固定用户可见 Lifecycle。
- Computer Use 验收操作真实知我AI Server 和已配置的真实模型 Transport，覆盖初始四题、手动刷新、一次成功回答后的二加二集合、两种语言、Placeholder 文案、浏览器标签品牌、端口行为，以及渲染界面和 Transport 响应中不存在禁止文本。

## 后果

每次完成 Assistant 回答和每次手动刷新后续问题都会增加一次 Provider 请求。该请求可能在回答成功后独立失败，Product 会暴露错误，不会静默替换为固定问题。确定性问候目录仍依赖直接子目录元数据；如果一次编辑同时保留了文件大小与修改时间，不读取正文就无法识别，缓存接受这一项窄范围文件系统限制。
