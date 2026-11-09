# 初火源质 · 实时价

《火炬之光：无限》里"初火源质"（1 元能买多少火）的价格看板，数据来自千岛集市成交明细，由手机端（国内 IP）每 10 分钟抓一次，写进 `data.json`，GitHub Pages 直接读它。

- 页面：`index.html`（纯静态，无需服务器）
- 采集：`collector/`（Node，复刻客户端 HMAC-SHA256 签名）
- 数据：`data.json`（当前价 + 历史点）、`history.csv`（追加流水）

## 部署（一次性，5 分钟）

1. **建仓库**：GitHub 新建一个**公开**仓库（比如 `qiandao-huo`），不要勾 README。
2. **推代码**（在手机上或电脑上都行）：
   ```bash
   git remote add origin https://github.com/<你的用户名>/qiandao-huo.git
   git branch -M main
   git push -u origin main
   ```
3. **开 Actions 写权限**：仓库 `Settings → Actions → General → Workflow permissions` 选 **Read and write permissions**，保存。不选这个，定时任务提交数据会失败。
4. **开 Pages**：`Settings → Pages → Build and deployment → Source: Deploy from a branch`，分支选 `main` / `(root)`，保存。
5. 等 1 分钟，访问 `https://<你的用户名>.github.io/qiandao-huo/`。
6. 想立刻看到数据：`Actions → 采集价格 → Run workflow` 手动跑一次。

## 为什么会话费/频率注意

- **公开仓库**：Actions 分钟数免费无限，`*/10` 没问题。
- **私有仓库**：免费额度 2000 分钟/月，10 分钟一次约 4300 次会超额。私有仓库请把 `collect.yml` 的 cron 改成 `*/30`（约 1440 次/月）。
- GitHub 的 cron 在整点高峰会延迟几分钟到十几分钟，页面顶部显示的是**数据实际抓取时间**（"12 秒前"），不是"现在"。

## 数据口径

- 主价 = 最新一笔成交的 `火/元`，按联赛（赛季 / 非赛季）分开算。两套价差 3 倍多，混在一起看会跳。
- 加权均价、中位数、区间、成交额全部由最近 100 笔成交自算。
- 摘要接口返回的是**全站口径**（不分联赛），只做交叉校验，不参与主价。
- 抓取失败时保留上一份并标 `STALE`，不伪装成实时。

## 本地跑

```bash
cd collector
npm install          # 只为密钥自愈（jsdom）
HUO_ROOT=$PWD HUO_CSV=../history.csv node collect.mjs
```
然后 `python3 -m http.server 8899`，浏览器打开 `http://127.0.0.1:8899/`。

## 脆点（迟早会遇到）

| 症状 | 原因 | 处理 |
|---|---|---|
| 一直 `Signature Error` | 前端换了 skey | 采集器会自动从线上 bundle 重新解出并写回 `collector/state/skey.json` |
| `手速太快` 405 | 设备/IP 限流 | 删掉 `collector/state/device.json`，下次自动换 UUID |
| 页面上价突然变 `—` | 仓库里 `data.json` 还没生成 | 手动跑一次 workflow |

`collector/state/skey.json` 里是千岛 H5 前端里的公开常量，不是账号密钥。
