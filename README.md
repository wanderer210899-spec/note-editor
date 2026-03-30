# Note Editor

`Note Editor` is a SillyTavern plugin that puts two workflows into one panel:

- `Notes`: plugin-owned notes for drafting, planning, and organization
- `Lorebook`: a live editor and workspace for SillyTavern lorebooks


## 中文教程

### 这是什么

`Note Editor` 不是单纯的笔记本。
它有两个模式：

- `笔记`：插件自己管理的数据，适合写草稿、整理设定、做临时记录
- `世界书`：直接连接 SillyTavern 的原生世界书，不是复制一份到插件里

理解这一点很重要：

- 笔记由插件保存
- 世界书由 SillyTavern 保存

所以世界书模式更像是“原生世界书的另一种编辑界面”。

### 快速开始

1. 在 SillyTavern 的扩展菜单里打开 `Note Editor`。
2. 面板顶部可以在 `笔记` 和 `世界书` 之间切换。
3. 左侧是侧边栏，右侧是编辑区。
4. 你可以拖动面板、缩放面板，或者切换全屏。

### 教程 1：如何使用笔记模式

#### 1. 新建笔记

1. 把顶部来源切换到 `笔记`。
2. 点击侧边栏顶部的 `新建笔记`。
3. 右侧会打开一篇新笔记。
4. 直接修改标题和正文即可，插件会自动保存。

这里的自动保存意思是：

- 你不需要手动点保存
- 在正常输入时会自动延迟保存
- 切换文档、关闭面板时也会强制刷新当前内容

#### 2. 使用文件夹整理笔记

1. 在笔记模式下点击 `新建文件夹`。
2. 给文件夹命名。
3. 在笔记行的更多操作里把笔记移动到目标文件夹。

这样做的好处是把“长期内容”和“临时草稿”分开。
比如你可以建：

- 角色设定
- 剧情大纲
- 临时灵感
- 待整理

#### 3. 置顶重要笔记

如果一篇笔记需要经常查看：

1. 在笔记行上点击置顶按钮。
2. 它会固定在更显眼的位置。

这适合放：

- 当前任务清单
- 当前角色重点设定
- 正在写的章节提纲

#### 4. 使用标签

笔记模式支持标签。

常见使用方式：

1. 打开一篇笔记。
2. 在工具栏中打开标签菜单。
3. 添加标签。
4. 在侧边栏搜索框里通过文字和标签一起搜索。

标签更适合做横向分类。
文件夹像“目录”，标签像“贴纸”。

#### 5. 搜索和预览

在笔记模式里，你可以：

- 直接搜索标题和正文
- 用标签缩小范围
- 切换 Markdown 预览

这意味着你可以先写纯文本，再随时切换成排版后的视图确认效果。

### 教程 2：如何切换到世界书模式

#### 1. 切换来源

1. 点击顶部来源切换按钮。
2. 从 `笔记` 切到 `世界书`。

切过去后，侧边栏会变成“世界书工作区”。

这个工作区不是把所有世界书都一次性全展开，而是按当前上下文加载：

- 当前角色的主世界书
- SillyTavern 暴露出来的关联世界书
- 你手动添加到工作区的世界书

#### 2. 理解工作区

世界书模式里有两个概念：

- `活动世界书`：右侧编辑器当前实际编辑的目标
- `展开世界书`：左侧侧边栏当前显示词条列表的目标

通常你只需要记住一句话：
“左边看结构，右边改内容。”

### 教程 3：如何把世界书加入工作区

#### 1. 刷新世界书列表

如果你刚刚在 SillyTavern 原生界面里改过世界书：

1. 点击 `刷新世界书`
2. 等工作区重新整理

这样可以把原生变化同步进插件界面。

#### 2. 手动添加世界书

如果你想把某个世界书放进当前工作区：

1. 点击 `添加世界书`
2. 搜索目标世界书
3. 选择它

添加到工作区不会复制文件。
它只是把这个世界书加入当前侧边栏视图。

#### 3. 替换和隐藏

每个世界书行都可以：

- 刷新
- 替换为另一本世界书
- 从工作区隐藏

“从工作区隐藏”不等于删除文件。
它只是不再显示在当前面板里。

### 教程 4：如何创建新词条

#### 1. 在当前世界书里新建词条

1. 进入世界书模式
2. 点击 `新建词条`
3. 在弹窗里确认：
   - 要写入哪一本世界书
   - 词条位置
   - 提示词顺序
4. 点击创建

创建完成后，右侧编辑器会切到新词条。

#### 2. 在指定位置直接建词条

如果你已经知道词条应该放在哪个位置：

1. 在某个位置分组标题旁点击“在这里创建词条”
2. 插件会自动带入那个位置
3. 再确认创建

这比先创建再改位置更快，也更不容易出错。

### 教程 5：如何创建新世界书

现在 `新建词条` 弹窗里有两个标签页：

- `新建词条`
- `新建世界书`

#### 创建步骤

1. 在世界书模式点击 `新建词条`
2. 切到 `新建世界书`
3. 输入新的世界书名称
4. 点击 `创建世界书`

创建成功后：

- 新世界书会通过 SillyTavern 原生接口保存
- 世界书列表会刷新
- 新世界书会加入当前工作区

这一步不会只改插件内部状态，而是真的创建 SillyTavern 世界书文件。

### 教程 6：如何编辑世界书词条

#### 1. 编辑标题和正文

世界书词条在编辑器里大致对应为：

- 标题：原生词条的 `comment`
- 正文：原生词条的 `content`

所以你在右侧看到的标题和正文，实际上就是在编辑原生词条本体。

#### 2. 编辑关键词

打开一个词条后，你可以看到关键词区域。

目前支持：

- 主关键词
- 副关键词
- 副关键词逻辑

使用方式：

1. 展开关键词面板
2. 在主关键词输入框里输入关键词并回车
3. 在副关键词输入框里输入副关键词并回车
4. 在逻辑下拉框中选择匹配规则

这部分是世界书模式最重要的元数据之一，因为它直接决定词条的触发方式。

#### 3. 编辑更多词条设置

在高级设置里，目前已经能处理这些内容：

- `Non-recursable`
- `Prevent further recursion`
- `Probability`

它们的意义可以理解为：

- 是否防止递归再次触发
- 是否阻止进一步递归
- 词条按概率参与

如果你不熟这些选项，建议先只改关键词、位置和顺序。

#### 4. 启用、禁用、切换触发方式

在侧边栏词条行里，你可以快速做这些操作：

- 启用或禁用词条
- 在常驻触发和关键词触发之间切换
- 删除词条

这类按钮适合“快速管理”。
右侧编辑器更适合“细调内容”。

### 教程 7：如何理解位置和顺序

侧边栏不是按普通文件夹分组，而是按提示词插入位置分组。

常见分组包括：

- 角色定义前
- 角色定义后
- 作者注释顶部
- 作者注释底部
- 指定深度
- 示例消息顶部
- 示例消息底部
- 提示词出口

你可以把它理解为：
“这个词条最终会被塞到提示词的哪里。”

`提示词顺序` 则是在同一位置里进一步排序。

一个很实用的思路是：

- 结构性设定放前面
- 补充说明放后面
- 深度注入内容只给必须延后出现的词条用

### 教程 8：如何搜索世界书词条

世界书搜索和笔记搜索不完全一样。

它会结合：

- 标题
- 内容摘要
- 主关键词
- 副关键词

为了性能，搜索重点放在当前展开的世界书。

这意味着：

- 搜某一本书时体验会更快
- 大世界书不会一下子把整个面板拖慢

如果你想找不到内容时更准确一点，推荐先：

1. 展开目标世界书
2. 再用搜索框搜索

### 教程 9：如何删除词条或世界书

插件有一个单独的删除面板。

你可以在里面：

- 批量删除当前可见词条
- 永久删除整个世界书文件

要特别注意区别：

- `从工作区隐藏`：只是界面隐藏
- `删除世界书文件`：真的从 SillyTavern 删除文件

如果你不确定，就先用“隐藏”，不要直接删文件。

### 教程 10：设置、语言与移动端

#### 1. 设置

设置面板目前可以调这些内容：

- 插件语言
- 打开时默认进入 `笔记` 或 `世界书`
- 新建世界书词条时的一些默认选项

#### 2. 语言

插件支持：

- 中文
- English

#### 3. 移动端

面板已经支持：

- 拖动
- 缩放
- 全屏
- 侧边栏开合

如果你在手机上使用，建议优先：

1. 打开世界书工作区
2. 先选中词条
3. 再切到全屏编辑

这样视图最稳定，也最省操作。

### 使用时要知道的几个事实

#### 1. 世界书不是“第二份副本”

插件不会把世界书完整复制到自己的设置里。
它编辑的是 SillyTavern 的真实世界书数据。

#### 2. 外部修改是可能发生的

如果你在 SillyTavern 原生世界书界面里改了内容，或者别的地方触发了更新，插件会尝试刷新和同步。

#### 3. 保存是整本世界书级别的

世界书保存不是只打一个小补丁。
它通常是：

1. 读取整本书
2. 修改内存里的数据
3. 再整本保存回去

这样做比较稳，也更接近 SillyTavern 原生逻辑。

### 文档索引

- [CHANGELOG.md](./CHANGELOG.md)
  - 更新记录
- [AGENT.md](./AGENT.md)
  - 当前工程现实、边界和约束
- [PLAN.md](./PLAN.md)
  - 后续计划

### 当前版本

当前 `manifest.json` 版本：`0.1.0`

---

## English Tutorial

### What This Plugin Is

`Note Editor` combines two different workflows inside one panel:

- `Notes`: plugin-owned notes for drafting and organization
- `Lorebook`: a live workspace and editor for SillyTavern lorebooks

That ownership split matters:

- notes are stored by the plugin
- lorebooks are stored by SillyTavern

So lorebook mode is not a second note database.
It is a different interface for real SillyTavern world info.

### Quick Start

1. Open `Note Editor` from the SillyTavern extensions menu.
2. Use the top source switch to move between `Notes` and `Lorebook`.
3. Use the left sidebar to browse items.
4. Use the right editor to change the selected document.
5. Drag, resize, or fullscreen the panel if you need more space.

### Tutorial 1: Using Notes Mode

#### 1. Create a note

1. Switch the source to `Notes`.
2. Click `Create note` in the sidebar.
3. Edit the title and body on the right.

Notes autosave, so you usually do not need a manual save button.

#### 2. Organize notes with folders

1. Click `New folder`.
2. Name the folder.
3. Move notes into it from the note row actions.

Folders work well for broad structure, such as:

- character notes
- plot ideas
- checklists
- temporary drafts

#### 3. Pin important notes

If a note needs to stay easy to reach:

1. Use the pin action on that note row.
2. The note will stay in a more prominent position.

#### 4. Add tags

Notes support tags.

Typical workflow:

1. Open a note.
2. Open the tags menu from the toolbar.
3. Add tags.
4. Search by both text and tags from the sidebar.

Folders are good for hierarchy.
Tags are good for cross-cutting labels.

#### 5. Use search and preview

In notes mode you can:

- search note titles and content
- filter with tags
- switch into Markdown preview

That makes it easy to draft first and preview formatting later.

### Tutorial 2: Switching to Lorebook Mode

#### 1. Change the source

1. Click the source switch in the toolbar.
2. Move from `Notes` to `Lorebook`.

The sidebar becomes a lorebook workspace.

#### 2. Understand the workspace

Lorebook mode has two useful concepts:

- `active lorebook`: the current editing target
- `expanded lorebook`: the lorebook whose entry structure is shown in the sidebar

In practice:

- the left side helps you navigate
- the right side helps you edit

### Tutorial 3: Adding Lorebooks to the Workspace

#### 1. Refresh lorebooks

If something changed in native SillyTavern:

1. Click `Refresh lorebooks`
2. Let the workspace rebuild

This helps pull in recent native changes.

#### 2. Add a lorebook manually

1. Click `Add lorebook`
2. Search for the lorebook you want
3. Select it

This does not duplicate the lorebook.
It only adds that lorebook to the current workspace view.

#### 3. Replace or hide workspace books

Each workspace lorebook row lets you:

- refresh the book
- replace that workspace slot
- hide the book from the workspace

Hide is only a UI action.
It does not delete the lorebook file.

### Tutorial 4: Creating Lore Entries

#### 1. Create a normal lore entry

1. In lorebook mode, click `Create lore entry`
2. Choose:
   - target lorebook
   - position
   - prompt order
3. Confirm creation

The editor will switch to the new entry.

#### 2. Create directly inside a position group

If you already know where the entry belongs:

1. Click the create button next to a position section
2. The dialog will prefill that position
3. Confirm and continue editing

This is faster and avoids extra cleanup later.

### Tutorial 5: Creating a New Lorebook

The create dialog now has two tabs:

- `New Entry`
- `New Lorebook`

To create a new lorebook:

1. Open the create dialog from lorebook mode
2. Switch to `New Lorebook`
3. Enter a unique lorebook name
4. Click `Create lorebook`

When this succeeds:

- the lorebook is created through SillyTavern
- the lorebook list refreshes
- the new lorebook is added to the current workspace

### Tutorial 6: Editing Lore Entries

#### 1. Edit title and body

Lore entry editing maps to native SillyTavern fields:

- editor title -> native `comment`
- editor body -> native `content`

So you are editing the real entry, not a plugin-only copy.

#### 2. Edit keywords

Open a lore entry and use the keyword panel to manage:

- primary keywords
- secondary keywords
- secondary keyword logic

Basic workflow:

1. Expand the keyword panel
2. Type a primary keyword and press Enter
3. Type a secondary keyword and press Enter
4. Pick the logic rule from the dropdown

#### 3. Edit advanced lore settings

The advanced panel currently supports:

- `Non-recursable`
- `Prevent further recursion`
- `Probability`

If you are still learning the system, start with:

- keywords
- position
- prompt order

Those are the safest and most immediately useful fields.

#### 4. Use quick row actions

From the sidebar you can quickly:

- enable or disable an entry
- switch constant vs keyword activation
- delete the entry

Think of the sidebar as the fast control surface.
Think of the right editor as the detailed editor.

### Tutorial 7: Understanding Position and Order

Lore entries are grouped by prompt position, not by a simple folder idea.

Common sections include:

- Before Character
- After Character
- Author's Note Top
- Author's Note Bottom
- At Depth
- Example Messages Top
- Example Messages Bottom
- Prompt Outlet

This is really asking:
“Where will this entry be inserted into the prompt?”

`Prompt order` is the next level of ordering inside the same position.

A practical rule of thumb:

- put foundational rules earlier
- put extra detail later
- use depth only for content that truly belongs deeper in the prompt

### Tutorial 8: Searching Lore Entries

Lorebook search looks at:

- title
- summary text
- primary keywords
- secondary keywords

For performance, the search is focused around the expanded lorebook view.

If you want the best results:

1. expand the target lorebook first
2. then search

### Tutorial 9: Deleting Entries or Lorebooks

There is a dedicated delete panel.

You can use it to:

- bulk-delete visible lore entries
- permanently delete lorebook files

Be careful with the difference between:

- `Hide from workspace`: only removes the row from the current UI
- `Delete lorebook file`: removes the real file from SillyTavern

If you are unsure, hide first.

### Tutorial 10: Settings, Language, and Mobile Use

#### 1. Settings

The settings panel currently lets you change:

- plugin language
- default source on open
- default options for newly created lore entries

#### 2. Languages

Current languages:

- Chinese
- English

#### 3. Mobile use

The panel supports:

- drag
- resize
- fullscreen
- collapsible sidebar behavior

On smaller screens, a good workflow is:

1. open the lorebook workspace
2. select the entry you want
3. switch to fullscreen for editing

### Important Behavior to Understand

#### 1. Lorebooks are not mirrored into plugin settings

The plugin keeps lightweight UI state for lorebooks, but the real lorebook data still belongs to SillyTavern.

#### 2. External edits can happen

If something changes outside the plugin, the plugin may refresh or mark state as externally changed instead of silently overwriting it.

#### 3. Saving is full-book oriented

Lorebook saving generally follows this pattern:

1. load the lorebook
2. modify the in-memory book
3. save the full lorebook back through SillyTavern

That is intentional, because it stays closer to native world-info behavior.

### Documentation Map

- [CHANGELOG.md](./CHANGELOG.md)
  - project history
- [AGENT.md](./AGENT.md)
  - codebase reality and engineering constraints
- [PLAN.md](./PLAN.md)
  - future work

### Current Version

Current `manifest.json` version: `0.1.0`
