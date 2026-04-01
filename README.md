<details>
  <summary><b>中文文档</b></summary>
  
# Note Editor❤️‍🔥
  
厌倦了在笔记本和酒馆之间反复横跳？灵感来了找不到地方记，世界观设定散落一地？

**Note Editor** 就是你的解决方案。它是一个内置于酒馆的双模式编辑器，让你在一个清爽的界面里，同时管理你的灵感笔记和角色的世界书。

左侧是你的文件目录，右侧是你的笔记本。尽情创作吧。
双端适配！再也不用羡慕电脑端的宽屏了...

- **笔记本模式 (Your Private Journal)**：一个完全属于你的创作空间。随手记下的灵感、剧情草稿、人物小传……都会在这里自动保存，安全又私密。
- **世界书模式 (The World's Architect)**：这不是副本，也不是演习！你将直接编辑 SillyTavern 的“世界书”源文件。每一次修改，都在实时雕琢你的世界……记得备份。

### 🚀 十秒上手，即刻启程

打开侧边栏的魔法棒菜单 → 找到 `Note Editor` → 开始你的创作之旅！

---

## 📚 模式一：笔记本 - 你的灵感世界

这里是你思维的延伸，一个充满创造力的小天地。

- **闪念捕捉 (新建笔记)**：点击“新建笔记”，把脑海中一闪而过的念头落实在屏幕上。
- **构建知识体系 (文件夹)**：灵感太多？用文件夹把它们归类整理。比如“角色设定”、“剧情大纲”、“废弃脑洞”，让一切井井有条。
- **设为焦点 (置顶)**：最重要的笔记，值得一个专属位置。把它置顶，随时都能看到。
- **贴上便利贴 (标签)**：比文件夹更自由的分类。你可以给一篇笔记贴上多个标签，比如一篇角色设定，可以同时拥有 #主角 #人类 #黑魔法师 的标签。
- **全局检索与预览 (搜索 + 预览)**：不仅能搜标题和正文，还能按标签筛选。写作时，随时可以切换到 Markdown 预览，看看排版效果。

---

## 🌍 模式二：世界书 

#### 召唤你的世界书

工作区默认只加载和当前角色关联的书。想添加更多？
- **刷新同步**：在 SillyTavern 原生界面改了东西？点一下“刷新世界书”，让两个世界同步。
- **手动入驻**：点击“添加世界书”，从你的图书馆里把它“请”进当前工作区。这只是个快捷键，不是会复制文件。
- **暂时退场 (隐藏)**：某本书暂时不想看？先“隐藏”它，让工作区更清爽。

#### 为世界添砖加瓦

- **创造新词条**：点击“新建词条”，为它选择一个家（目标世界书）、一个舞台（位置）、以及登场顺序（提示词顺序）。如果你已经想好了它该出现在哪，可以直接在那个分组旁边点“在此创建”，一步到位。
- **铸造新世界**：还是在“新建词条”里，切换到“新建世界书”标签页，给你的新世界命名，然后见证它的诞生。

#### 精雕细琢每个词条

- **关键词**：这是词条能否被AI“想起来”的关键。在关键词面板里，敲下主、副关键词，然后选择它们之间的逻辑关系。
- **侧边栏的遥控器**：启用/禁用、切换常驻/关键词触发、删除……这些快捷操作让你能像将军一样，快速调兵遣将，批量管理词条。

#### “位置”和“顺序”

- 菜单里的世界书排序，就是ai提示词里的真实的顺序！

#### 跨越时空的搜索

搜索功能会同时扫描词条的标题、正文摘要和所有关键词。
**小贴士**：为了更精确的结果，先在左侧展开你想要搜索的那本书，再输入关键词。

#### 毁灭的抉择

删除面板里有两个选项，请务必分清：
- **从工作区隐藏**：像把一本书放回书架。它只是暂时离开你的视线，安然无恙。
- **删除世界书文件**：像把书丢进壁炉。**它会永远消失**。

---

### ⚙️ 设置 - 你的专属工作室

- 切换语言（中文 / English）
- 定制默认模式：每次打开，是先进入笔记本，还是世界书控制室？
- 预设新词条模板：为你未来的创作铺好第一块砖。
- 隐藏/显示世界书词条数量统计

### 📱 移动端体验指南

在手机的小屏幕上，建议采用“两步走”策略：
1. 在侧边栏导航，选好你要编辑的词条。
2. 点击进入**全屏模式**，然后心无旁骛地开始编辑。


### 📜 三条黄金法则

请在开始前阅读，这很重要。

1.  **这里没有副本**：你对世界书的每一次改动，都是在直接操作酒馆的源文件。所见即所得，所改即存档。
2.  **尊重外部修改**：如果你在插件之外修改了世界书，插件会智能检测到变动并尝试同步，而不是粗暴地覆盖掉你的心血。
3.  **保存是“整本书”的行为**：修改一个词条的任何地方，保存时都会是对整本世界书的完整写入。这是为了和 SillyTavern 的原生逻辑保持一致。

当前版本：`0.1.2`
</details>

<details>
  <summary><b> English Docs</b></summary>
  
# Note Editor❤️‍🔥

Tired of juggling a dozen text files and SillyTavern's UI? 

**Note Editor** is your new command center. It's a dual-mode editor living right inside SillyTavern, designed to manage both your private creative notes and your character's active lorebooks in one clean, powerful interface.

Browse on the left, create on the right. Let's build some worlds.

### ✨ One Panel, Two Modes

-   **Notes Mode (Your Private Journal)**: A personal scratchpad just for you. Plot bunnies, character sketches, random dialogue—it all lives here, autosaved and managed by the plugin.
-   **Lorebook Mode (The World's Architect)**: This is the real deal. You're editing live SillyTavern lorebook files directly. Every change you make is a change to the lorebooks itself.
  
### 🚀 Quick Start in 10 Seconds

Open the extensions menu (the magic wand) → find `Note Editor` → Let the writing begin!

---

## 📚 Mode One: Notes 

This is your space to be messy, to experiment, to create.

-   **Capture Ideas Instantly**: Click "Create note", give it a title, and let your thoughts flow.
-   **Build Your System (Folders)**: Perfect for separating "Character Bios," "Plot Outlines," and "Random Thoughts"
-   **Keep It Front and Center (Pin)**: Pin your most important notes to the top. No more digging for that one important file.
-   **Tagsss (Tags)**: More flexible than folders. Think of them as sticky notes. A character bio could be tagged with #Protagonist, #Mage, and #Grumpy. Filter by any tag in the sidebar.
-   **Find Anything, Fast (Search + Preview)**: Search titles and content, layer on tag filters, and flip to the Markdown preview anytime to see your formatting come to life.

---

## 🌍 Mode Two: Lorebook - The Control Room

Welcome, Architect. Here, you directly shape the information that defines your world and characters.

#### Summoning Your Lorebooks

The workspace intelligently loads lorebooks linked to your current character. To bring in more:

-   **Refresh & Sync**: Made changes in the native SillyTavern UI? Hit "Refresh lorebooks" to get everything in sync.
-   **Add Manually**: Click "Add lorebook" to pull any lorebook from your library into the current view. It’s a shortcut, not a copy.
-   **Declutter (Hide)**: Workspace getting crowded? Hide a book. The file is safe, it's just temporarily invisible.

#### Breathing Life into Your World

-   **Create a New Lore Entry**: Click "Create lore entry," choose its home (the lorebook), its stage (position), and its cue (prompt order). Know where it should go already? Use the "create" button right on the group header to skip a step.
-   **Forge a New Lorebook**: On the "Create" panel, switch to the "New Lorebook" tab, give your new world a name, and hit create. A real file is born.

-   **Keywords**: This is how an entry gets triggered. Expand the keyword panel, type your keys, and choose the logic. You can also type in #keyword, hit enter, to quickly add to main keywords.
-   **Sidebar Remote Control**: Enable/disable, toggle constant vs. keyword activation, delete. The sidebar is for quick actions. The editor is for thoughtful composition.

#### The Art of Prompt Weaving (Positions & Order)

Think of every entry as a card you're inserting into the final prompt sent to the AI.

-   **Position**: This determines *which section* of the prompt the card goes into (e.g., before the character's definition, after the example dialogue).
-   **Prompt Order**: This sorts the cards *within* the same section.
-   **Sidebar Order** : The order entries appears in sidebar is the order they will be sent to ai when triggered. 

#### Search

Search hits titles, body summaries, and all keywords.
Expand the lorebook you're targeting in the sidebar before you search. Useful for hundreds of entries.

#### To Banish, or to Destroy?

The delete panel offers a critical choice:

-   **Hide from workspace**: The book is removed from your view, but the file is 100% safe on your drive.
-   **Delete lorebook file**: The book and its file are **permanently erased**.

**When in doubt, always choose "Hide."**

---

### ⚙️ Settings - Your Workshop, Your Rules

-   Language (中文 / English)
-   Default mode on open (start in Notes or Lorebook?)
-   Default settings for new lore entries to streamline your workflow.
-   Display number of entries in each lorebook

### 📱 On The Go (Mobile Usage)

For the best mobile experience, we recommend this flow:
1.  Select the entry you want to edit from the sidebar.
2.  Switch to **fullscreen mode**.
3.  Edit with a clean, focused view.

---

### 📜 The Three Laws of the Editor

Know these before you begin.

1.  **This Is Not a Drill.** The plugin edits your real SillyTavern lorebook data directly. What you see is what you get.
2.  **External Changes Are Respected.** If you edit a file outside the plugin, it will detect the change and prompt you to sync, not silently overwrite your work.
3.  **Saving is a Whole-Book Affair.** Modifying a single entry saves the *entire lorebook*. This is intentional and matches SillyTavern's native behavior, ensuring data integrity.


Current version: `0.1.2`
</details>
