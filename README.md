<details>
  <summary><b>中文文档</b></summary>
  
# Note Editor - 一个酒馆世界书编辑器/备忘录❤️‍🔥
  
在多个文本文件和酒馆界面之间反复横跳？有灵感了却无法快速记录？

**Note Editor** 会解决这个问题。它是一个内置于酒馆的双模式编辑器，让你在同一个界面管理个人笔记和角色世界书。界面采用极简设计，一键适陪各种美化。

让你再也不用从编辑器来回复制条目。完全双端适配！

- **笔记本模式**：是你的私人创作空间。无论是灵感，草稿构思还是人物设定，都将自动保存。
- **世界书模式**：会直接编辑酒馆的世界书文件。每次修改都实时生效。

### 🚀 使用指南

打开侧边栏的魔法棒菜单（扩展菜单）→ 找到 `Note Editor` 

---

## 📚 笔记本模式

#### 核心功能

**新建和整理**
- 点击"新建笔记"创建笔记，输入标题和内容
- 用文件夹分类整理（点击文件夹标题展开）
- 创造主文件夹和子文件夹，方便整理收纳
- 重要笔记可以置顶

**标签系统让你快速筛选**
- 输入 `#标签名` 后按回车，标签就添加好了（手机和电脑都支持）
- 点击任意标签，自动筛选出相关笔记
- 插件会智能建议 `#当前角色名` 标签，方便快速分类

**内容管理**

笔记功能：置顶、移动到其他文件夹、删除。

文件夹功能：可以在文件夹内直接创建笔记、添加子文件夹、重命名或删除整个文件夹。

需要批量清理？使用批量删除功能一次处理多个笔记和文件夹。

**搜索和预览**
- 搜索会检索标题、正文和标签，帮助你快速定位
- 随时切换到 Markdown 预览模式，查看渲染效果
- 支持导入和导出笔记和文件夹

---

## 🌍 世界书模式


#### 自动加载世界书

插件启动时会自动加载当前角色关联的世界书，无需手动添加。

#### 世界书管理

**添加和移除**
- 点击"刷新世界书"同步酒馆世界书
- 添加其他世界书到工作区
- 临时隐藏某本世界书
- 替换工作区中的世界书
- 批量删除多本世界书或多个词条

**创建新内容**

添加新词条？选择目标世界书、词条位置和提示词顺序，点击创建。

在工作区就能直接创造新的世界书。

#### 关键词系统

关键词决定词条何时被 AI 触发。

输入 `#关键词` 后按回车，主关键词就添加好了。你也可以设置副关键词，并定义它们之间的逻辑关系（AND、OR 等）。

#### 词条控制

每个词条有三个快捷开关：
- 激活/禁用词条
- 切换常驻模式或关键词触发模式
- 删除词条

#### 高级选项

需要更精细的控制？编辑器提供了不可重用、防止进一步递归和概率触发等高级选项。

#### 理解位置和顺序

**位置**：决定词条出现在 AI 提示词的哪个部分（例如角色定义之前、对话示例之后）。

**提示词顺序**：在同一位置内，决定词条的先后顺序。

**侧边栏顺序**：侧边栏中世界书的排列顺序，就是它们被 AI 触发时的实际顺序。

#### 搜索和定位

搜索功能会扫描词条标题、正文摘要和所有关键词。

技巧：先在侧边栏展开目标世界书，再输入关键词搜索，结果会更精确。

#### 删除

删除面板提供两个选项：

- **从工作区隐藏**：只是从视图中移除，文件依然完整保存在硬盘上
- **删除世界书文件**：永久删除文件，无法恢复


---

### ⚙️ 设置

根据你的习惯调整编辑器：

- 切换界面语言（中文 / English）
- 调整字体大小，找到最舒适的阅读体验
- 设置启动时默认打开模式（笔记本或世界书）
- 为新词条设置默认模板，提高创建效率
- 显示或隐藏每本世界书的词条数量

### 🎨 界面设计

界面保持极简，让你专注于内容本身：

**主题适配**：自动匹配你在酒馆中自定义的主题风格。

**按需显示**：大部分按钮默认隐藏，保持界面整洁。
- 桌面端：鼠标悬停时显示操作按钮
- 移动端：在列表项上滑动显示按钮

**文件夹**：点击文件夹标题即可展开或折叠笔记。

### 📱 移动端体验

#### 手势操作

- **向右滑动**：打开侧边栏
- **向左滑动**：关闭侧边栏  
- **在列表项上滑动**：显示操作按钮

#### 推荐流程

移动端使用建议：先在侧边栏选择要编辑的内容 → 切换到全屏模式 → 专注编辑。

### 💡 快捷操作

让你的工作更高效：
- Ctrl + 鼠标拖动可以调整窗口大小
- 输入 `#标签` 或 `#关键词` 后按回车快速添加

---

### 📜 使用前必读

重要提示，避免数据丢失：

**不是副本**：你对世界书的每次修改都将直接写入酒馆的世界书源文件。记得定期备份。



</details>

<details>
  <summary><b>English Docs</b></summary>
  
# Note Editor❤️‍🔥

Juggling between lots of files and SillyTavern's interface? Inspiration strikes but you can't find the right place to capture it?

**Note Editor** fixes this. It's a dual-mode editor built into SillyTavern, managing both your personal notes and character lorebooks in a single interface. The design is minimalistic and automatically adapts to your SillyTavern theme.

File directory on the left, editor on the right. Supports both desktop and mobile experiences!✮

### ✨ Two Modes

- **Notes Mode**: Your personal creative workspace. Ideas, drafts, character lore—everything auto-saves so nothing gets lost.
- **Lorebook Mode**: Direct editing of SillyTavern's lorebook source files. Every change takes effect immediately. Remember to backup regularly.
  
### 🚀 Getting Started

Open the wand menu in the bottom bar → find `Note Editor` → Start writing

---

## 📚 Notes Mode

Your personal note management hub.

#### Core Features

**Create and Organize**
- Click "Create note" to start a new note with a title and content
- Use folders to organize (click folder headers to expand)
- Pin important notes to keep them visible

**Tag System for Quick Filtering**
- Type `#tagname` and press Enter—tag added (works on mobile and desktop)
- Click any tag to automatically filter related notes
- Smart suggestions: the plugin auto-suggests `#currentcharactername` for easy categorization

**Manage Your Content**

Each note has three actions: pin, move to another folder, or delete.

Folders have more options: create a note inside the folder, add a subfolder, rename, or delete the entire folder.

Need to clean up in bulk? Use batch delete to handle multiple notes and folders at once.

**Search and Preview**
- Search scans titles, body text, and tags to help you find things quickly
- Toggle Markdown preview anytime to see how it renders
- Import and export notes and folders

---

## 🌍 Lorebook Mode

Direct control over your lorebook data. No more complicated/cramped interface! Provides the smoothest writing experience possible.

#### Ready on Startup

The plugin auto-loads the lorebook linked to your current character when it starts—no manual setup needed.

#### Lorebook Management

**Add and Remove**
- Click "Refresh lorebooks" to sync changes made in SillyTavern's interface (that hasn't applied already)
- Add other lorebooks from your library to the workspace (doesn't copy files, just quick access)
- Temporarily hide a lorebook—the file itself stays completely safe
- Replace lorebooks in your workspace
- Batch delete multiple lorebooks or entries

**Create New Content**

Want to add a new entry? Choose the target lorebook, entry position, and prompt order, then create.

Faster way: click "create here" right next to the position group header. 

Need a new lorebook? Create it quickly in the workspace.

#### Keyword System

Keywords determine when an entry gets triggered by the AI.

Type `#keyword` and press Enter—primary keyword added. You can also set secondary keywords and define the logic relationship between them (AND, OR, etc.).

#### Entry Controls

Each entry has three quick toggles:
- Enable/disable the entry
- Switch between constant mode or keyword-triggered mode
- Delete the entry

#### Advanced Options

Need finer control? The editor provides advanced options like non-reusable entries, prevent further recursion, and probability triggers.

#### Understanding Position and Order

**Position**: Determines which section of the AI prompt the entry appears in (like before character definitions or after example dialogue).

**Prompt Order**: Within the same position, determines the sequence of entries.

**Sidebar Order**: The order lorebooks appear in the sidebar is the actual order they trigger in the AI context.

#### Search and Filter

Search scans entry titles and all keywords.

Pro tip: Expand the target lorebook in the sidebar first, then search—results will be more precise.

#### Deleting

The delete panel offers two very different options:

- **Hide from workspace**: Only removes from view. The file stays completely intact.
- **Delete lorebook file**: Permanently deletes the file. Can't be recovered, use cautiously.


---

### ⚙️ Settings
 
Adjust the editor to match your workflow:
 
- Change UI language (中文 / English)
- Adjust font size for a better reading experience
- Set a mode to open at startup (Notes or Lorebook)
- Set default recurrsion for new entries to speed up creation
- Show or hide entry count for each lorebook
 
### 🎨 Interface Design
 
The interface stays minimal so you can focus on writing:
 
**Theme Adaptation**: Automatically matches the colors and style of your customized SillyTavern theme.
 
**Show on Demand**: Most buttons are hidden by default for a minimal UI.
- Desktop: Hover to reveal action buttons
- Mobile: Swipe on list items to reveal buttons
 
**Folder Expansion**: Click folder headers to expand or collapse content.

### 📱 Mobile Experience
 
#### Gesture Controls
 
- **Swipe Right**: Open the sidebar
- **Swipe Left**: Close the sidebar
- **Swipe on List Items**: Reveal action buttons
 
### 💡 Shortcuts
 
- Standard Markdown shortcuts supported (indent, bold, etc.)
- Ctrl + mouse drag to resize the window
- Type `#tag` or `#keyword` and press Enter for quick add


### 📜 Read Before Using

Critical information for avoiding data loss:
 
**This Isn't a Copy**: Every change you make to lorebooks writes directly to SillyTavern's lorebooks. What you see is what you get. Be sure to backup important files.
 
 
 
</details>
 
Current version: `0.1.4`
