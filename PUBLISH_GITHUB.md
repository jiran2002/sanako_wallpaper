# 发布到 GitHub 操作步骤

本指南帮助你把这个项目发布到 GitHub。开始前请确认已安装 [Git](https://git-scm.com/download/win) 且已登录 GitHub。

> 所有命令都在项目根目录 `f:\chajian\wap` 下执行（Windows 建议用 PowerShell）。

---

## 步骤 0：发布前检查（很重要）

`.gitignore` 已经排除了敏感与运行数据，发布前**确认不要**手动 `git add` 以下内容：

- `server/data/` —— SQLite 数据库 + 本地上传的图片（不公开）
- `.env` / `.env.local` —— 所有密钥（JWT_SECRET、R2 密钥等）
- `node_modules/`、`dist/` —— 依赖与构建产物

> 首次在**新环境**部署时，复制 `.env.example` 为 `.env` 并填写真实配置，再执行 `npm install` 与迁移即可，无需这些文件入库。

---

## 步骤 1：初始化本地仓库

```powershell
git init
git add .
git status          # 检查一下暂存内容，确认没有 .env / server/data 被加入
```

## 步骤 2：本地提交

```powershell
git commit -m "Initial commit: 开源壁纸分享站"
```

## 步骤 3：新建 GitHub 仓库

在 GitHub 网页端：

1. 点击右上角「+」→ **New repository**
2. 填仓库名（如 `wallpaper-hub`），选 **Public** 或 **Private**
3. **不要勾选** Initialize this repository with a README（本地已有 README，避免冲突）
4. 点击 **Create repository**

## 步骤 4：关联远程并推送

把仓库地址换成你在步骤 3 拿到的地址（HTTPS 或 SSH 形式均可）：

```powershell
git remote add origin https://github.com/你的用户名/wallpaper-hub.git
git branch -M main
git push -u origin main
```

> 若提示登录，HTTPS 方式会弹出浏览器授权窗口；也可改用 SSH 方式：
> `git remote add origin git@github.com:你的用户名/wallpaper-hub.git`

## 步骤 5：验证推送结果

```powershell
git remote -v         # 应显示 origin 指向你的仓库
git status            # 应显示 working tree clean
```

到 GitHub 仓库页面确认：

- `README.md` 正常显示
- `.env`、`server/data/` 没有被上传
- 代码文件（`server/`、`web/`）都在

---

## 后续：更新到 GitHub

之后每次改完代码，按需执行：

```powershell
git add .
git commit -m "你的修改说明"
git push
```

## 常见问题

- **忘记排除文件已被提交？** 从仓库移除（保留本地）：
  ```powershell
  git rm -r --cached server/data
  git rm --cached .env
  git commit -m "Remove sensitive files"
  git push
  ```
- **推送冲突（remote contains work）**：说明远程已有历史，先拉取合并再推：
  ```powershell
  git pull --rebase origin main
  git push
  ```
- **推送后凭据失效**：Windows 可用 `git credential-manager` 重新登录（通常在下次 push 时自动弹出）。