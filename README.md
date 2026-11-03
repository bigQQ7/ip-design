# IP造型诊断台

教学组用的 IP 造型自查与达标案例库网站：

- **造型自查**：上传一张造型图，按五层方法逐条勾选，网页指出卡在哪一层、怎么改，并推荐相关的达标案例。
- **达标案例库**：按亮点、主特征、风格、物种筛选；管理员可以批量上传、手动分类、移除。
- **推荐案例**：成员上传自己觉得好看的 IP，管理员审核后进入案例库。
- **审核 / 成员**（只有管理员能看到）：逐条或一键通过 / 不通过；输入邮箱发送邀请、停用成员。

网站只有受邀成员能登录。代码里没有任何密码或密钥，所有权限由 Supabase 数据库规则控制；案例图片存在 Supabase 的私有存储里，不在这个仓库中。

---

## 部署步骤（第一次需要约 30 分钟）

需要两个免费服务：**Supabase**（登录、数据、图片）和 **GitHub Pages**（网站托管）。

### 第 1 步：创建 Supabase 项目

1. 打开 <https://supabase.com>，用 GitHub 账号登录。
2. 点 **New project**：名字填 `ip-check`；数据库密码点 Generate 自动生成即可（之后用不到，不用记）；Region 选离你近的（如 Northeast Asia (Tokyo) 或 Southeast Asia (Singapore)）。
3. 等一两分钟，项目创建完成。

### 第 2 步：建数据库

1. 左侧菜单进入 **SQL Editor**，点 **New query**。
2. 打开本仓库的 `supabase/01_setup.sql`，全部复制粘贴进去。
3. **找到写着「请改成你的邮箱」的那一行，改成你自己的邮箱**（这个邮箱会成为管理员，用户名是 `bigqq7`）。
4. 点 **Run**，看到 Success 即可。
5. 再新建一个 query，粘贴 `supabase/02_seed_cases.sql`，点 **Run**。这一步导入了 78 个基础达标案例的分类信息。

### 第 3 步：上传基础案例图片

1. 左侧菜单进入 **Storage**，点开名为 `images` 的存储桶。
2. 新建一个文件夹，名字必须是 `base`。
3. 进入 `base` 文件夹，把老师给你的 `案例图片-base.zip` 解压后的 78 张图片（r01.jpg ～ r78.jpg）全部拖进去上传。

### 第 4 步：设置发送邀请邮件的邮箱

Supabase 自带的邮件服务只能发给项目成员自己，而且每小时只能发几封，所以要换成你自己的邮箱来发。以 QQ 邮箱为例：

1. 在 QQ 邮箱网页版：**设置 → 账号与安全（或「账户」）→ 开启 SMTP 服务**，按提示生成一个 **授权码**（16 位字母，相当于给网站用的专用密码）。
2. 回到 Supabase：**Project Settings → Authentication → SMTP Settings**，打开 **Enable Custom SMTP**，填写：
   - Sender email：你的 QQ 邮箱
   - Sender name：`IP造型诊断台`
   - Host：`smtp.qq.com`
   - Port：`465`
   - Username：你的 QQ 邮箱
   - Password：刚才的授权码
3. 保存。然后在 **Authentication → Rate Limits** 里，把每小时发送邮件的上限调大（比如 100），否则一次邀请一个班会被限制。

（163 邮箱同理：Host 填 `smtp.163.com`，端口 465。）

### 第 5 步：创建你的管理员账号

1. 进入 **Authentication → Users**，点 **Add user → Create new user**。
2. Email 填第 2 步里写的那个邮箱，Password 填**你自己想好的新密码**，勾选 **Auto Confirm User**，点创建。
3. 以后在网站登录时，用户名填 `bigqq7`（或者直接填邮箱），密码填这里设的密码。

> 密码只在 Supabase 后台设置，不要写进任何文件，也不要发给别人。如果之前在聊天里发过密码，这里请设一个新的。

### 第 6 步：把 Supabase 地址填进网站

1. 在 Supabase：**Project Settings → API**（或 **Data API**），复制 **Project URL** 和 **anon public** 这把 key。
2. 在 GitHub 上打开本仓库的 `config.js`，点右上角的铅笔图标编辑，把两个值填进去，点 **Commit changes** 保存。

这两个值本来就是给网页公开使用的，放进公开仓库没有问题。**不要**把 `service_role` 那把 key 放进来。

### 第 7 步：开启 GitHub Pages

1. 在 GitHub 仓库页面：**Settings → Pages**。
2. Source 选 **Deploy from a branch**，Branch 选 `main`，文件夹选 `/ (root)`，点 **Save**。
3. 等一两分钟，页面顶部会显示网址，形如 `https://你的用户名.github.io/ip-check/`。

### 第 8 步：告诉 Supabase 网站地址

1. Supabase：**Authentication → URL Configuration**。
2. **Site URL** 填上一步的网址（例如 `https://你的用户名.github.io/ip-check/`）。
3. **Redirect URLs** 里点 Add URL，也填同一个网址。保存。

这一步决定了邀请邮件、重设密码邮件里的链接会跳到哪里。

### 第 9 步：试一下

1. 打开网站，用 `bigqq7` 和你的密码登录。
2. 进入「成员」页，输入你的另一个邮箱发一封邀请，确认能收到邮件、点链接能进入并设置密码。
3. 一切正常后，就可以邀请学生了。

---

## 日常使用

- **邀请学生**：「成员」页，每行一个邮箱，点发送。学生点邮件里的链接进入，第一次会要求设置密码，之后用邮箱和密码登录。
- **停用成员**：「成员」页点「停用」，对方就无法再看到任何内容；可以随时恢复。
- **审核推荐**：「审核」页可以逐条「收录并分类」，也可以勾选后「一键通过」，通过的案例进入案例库的「未分类」，之后再点开分类。
- **上传案例**：「达标案例库」页点上传或直接粘贴图片，然后在「来源 → 未分类」里逐个分类。

## 常见问题

- **学生收不到邀请邮件**：先看垃圾邮件箱；再检查第 4 步的 SMTP 设置和发送上限；同一个邮箱 1 分钟内不能重复发送。
- **点邮件链接后打不开网站**：检查第 8 步的 Site URL 和 Redirect URLs 是否和网站地址完全一致（包括结尾的 `/`）。
- **案例图片显示「图片还没上传」**：检查第 3 步，文件夹名必须是 `base`，文件名必须是 `r01.jpg` 这样的格式。
- **改了 config.js 网站没变化**：GitHub Pages 更新需要一两分钟，刷新时可以按 Ctrl+F5 强制刷新。

## 文件说明

| 文件 | 作用 |
| --- | --- |
| `index.html` | 页面结构 |
| `style.css` | 样式 |
| `app.js` | 全部功能逻辑 |
| `config.js` | Supabase 地址（第 6 步填写） |
| `supabase/01_setup.sql` | 建表、权限规则、邀请限制、图片存储（第 2 步运行） |
| `supabase/02_seed_cases.sql` | 78 个基础达标案例的分类数据（第 2 步运行） |
