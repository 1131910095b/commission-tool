# ACE SIGN 提成查询 — GitHub 部署说明

这套文件让你把提成查询网页托管到 **GitHub Pages**,并用 **GitHub Action** 每小时自动从 monday 拉数据(monday 密钥安全地存在 GitHub Secrets,不出现在网页里)。

## 文件清单
- `commission_tool.html` — 网页(重命名为 `index.html` 后上传)
- `fetch_monday.js` — 抓取脚本(Action 调用)
- `.github/workflows/update-data.yml` — 定时/手动刷新数据的 Action
- `data.json` — 由 Action 自动生成(第一次部署后出现)

---

## 一、创建仓库并上传文件
1. 在 GitHub 新建一个仓库(例如 `commission-tool`)。
2. 上传这些文件,**把 `commission_tool.html` 改名为 `index.html`**。
   目录结构应为:
   ```
   index.html
   fetch_monday.js
   .github/workflows/update-data.yml
   ```

## 二、放入 monday API 密钥(关键,保证安全)
1. monday → 右上角头像 → **Developers** → **My Access Tokens** → 复制你的 API Token。
2. GitHub 仓库 → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**
   - Name: `MONDAY_TOKEN`
   - Secret: 粘贴 monday token
3. 保存。密钥只存在这里(服务器端),不会进入网页。

## 三、首次生成数据
- 仓库 → **Actions** → 选 “Update commission data from monday” → **Run workflow**(手动跑一次)。
- 跑完后仓库里会出现 `data.json`。

## 四、开启 GitHub Pages
1. 仓库 → **Settings** → **Pages**
2. Source 选 **Deploy from a branch**,Branch 选 `main` / 根目录 `/ (root)`,Save。
3. 几分钟后得到网址,例如:`https://你的用户名.github.io/commission-tool/`
4. 把这个网址发给外部人员即可。网页会自动读取最新的 `data.json`。

## 五、设置访问密码
- 打开 `index.html`,找到 `const ACCESS_PASSWORD = "acesign2026";`,改成你的密码。

## 自动更新频率
- 默认每小时(`.github/workflows/update-data.yml` 里的 cron)。可改成每 6 小时:`cron: "0 */6 * * *"`。
- 也可随时在 **Actions** 页手动点击运行。
- 网页上的「从 monday 更新」按钮 = 重新读取最新 `data.json`(数据新鲜度取决于 Action 最近一次运行)。

---

## ⚠️ 安全 / 隐私重要提醒
- **GitHub Pages 免费版是公开的**:任何拿到网址的人都能打开网页,也能直接下载 `data.json`。
- 网页里的密码(`ACCESS_PASSWORD`)只是“软门”,挡不住懂技术的人(源代码可见)。
- 如果提成数据**必须保密**,不要用公开的 GitHub Pages。改用带**服务器端密码保护**的托管:
  - **Cloudflare Pages + Cloudflare Access**(可设邮箱/密码访问,有免费额度)
  - **Netlify**(站点级密码保护,付费功能)
  - **Vercel**(密码保护,付费功能)
  这些都能托管同一套文件,Action 抓数据的方式不变。
- 如果“外部人员”是可信对象(自家销售、会计),公开 URL + 软门可以接受,但请知悉数据技术上可被下载。

## 数据格式(data.json)
Action 生成的数组,每行:
```json
{ "inv": "INV-45925", "ref": "je-sa-em-17", "total": 264.0,
  "fpd": "2026-05-20", "status": "Full Paid", "customer": "dxt family trust ..." }
```
网页会自动按销售/报价员拆分、去 GST、扣安装费、判断订金尾款结清、按财年汇总。
