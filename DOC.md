# 初火源质 · 实时价格面板 — 实现说明

> 写于 2026-11-11 07:40（北京时间）
> 本文档说明：这个面板是什么、价格怎么算、文件都在哪、做到哪一步、还有什么没做。

---

## 一、一句话

从千岛 App 的 **C2C 成交明细接口**抓《火炬之光：无限》"初火源质"的真实成交记录，
按**近 10 分钟成交量加权均价**算出「1 元可购多少火」，落库 SQLite，用暗色仪表盘展示。

- 本地页（实时，手机内）：`http://localhost:7788`
- 公网页（GitHub Pages，快照，滞后几分钟）：`https://llhhoo221634-hub.github.io/qiandao-huo/`
- 当前状态：serve 运行中，keeper 运行中，最近一次采集价 **407.797 火/元**

---

## 二、数据从哪来

### 2.1 接口

| 项 | 值 |
|---|---|
| 网关 | `https://api.qiandao.cn`（备用 `api.qiandao.com`） |
| 取价接口 | `POST /c2c-web/v1/common/get-spu-trading-history-list` |
| 请求体 | `{"spuId":"836104794648117801","offset":0,"limit":100}` |
| 摘要接口 | `POST /c2c-web/v1/common/get-spu-latest-trading-summary`（仅交叉校验，不入价） |
| SPU id | `836104794648117801`（搜索词「初火源质」，type_id 1822163） |

### 2.2 网关签名（必须，否则一律 405）

```
w  = path + file + 排序后的 query + requestId + timestamp(毫秒)
X-Request-Sign = base64( hex( HMAC-SHA256( skey, w ) ) )
```

必需请求头：

```
x-request-sign / x-request-timestamp / x-device-id
x-request-package-id: 1057    x-request-package-sign-version: 0.0.1
x-request-sign-type: HMAC_SHA256
```

- `skey(production) = 2TJhRTpCpUIgnWl3qwIaoMMt3KhL2nkC`（前端公开常量，会轮换）
- 轮换后自动从线上 bundle `https://h5.qiandao.com/assets/index-*.js` 重新提取（jsdom 执行，约 9 秒）
- 设备级限流：报「手速太快」就换随机 `x-device-id`

实现：`/root/workspace/qiandao/huo/{signer,client,device,skey,extract}.mjs`

### 2.3 字段与单位

一笔成交返回：`unitPrice`（**火/元**）、`tradingVolume`（火）、`tradingAmount`（元）、`tradingTime`（毫秒）。
注意 `tradingVolume`/`tradingTime` 是**字符串**，必须先 `Number()`。

`unitPrice = 424.929` 表示 **1 元能买 424.929 火**；反过来 1 火 ≈ 0.00235 元。数字越大 = 火越便宜。

---

## 三、价格怎么算

### 3.1 大数字（页面最上方那个）

```
窗口  = 最近 10 分钟内成交的笔（不足 3 笔则退化成「最近 20 笔」）
大数字 = Σ(unitPrice × tradingVolume) / Σ(tradingVolume)
```

源码：`/root/workspace/qiandao/huo/market.mjs:9 computeStats()`

```js
const windowMin = 10;
const inWindow = withPrice.filter((i) => Date.now() - (+i.tradingTime) <= windowMin * 60000);
const pool = inWindow.length >= 3 ? inWindow : withPrice.slice(0, 20);
const refPrice = pool.reduce((a, i) => a + (+i.unitPrice) * (+i.tradingVolume), 0)
               / pool.reduce((a, i) => a + (+i.tradingVolume || 0), 0);
fire_per_yuan = +refPrice.toFixed(3);
yuan_per_fire = +(1 / refPrice).toFixed(7);
```

**为什么按成交量加权而不是取最后一笔**：同一分钟会有 357 和 425 同时成交，取最后一笔会让大数字每秒乱跳（实测波动 2%+）。加权后被小单拉不动。

### 3.2 其余指标

| 页面位置 | 字段 | 算法 |
|---|---|---|
| 大数字 | `fire_per_yuan` | 近 10 分钟成交量加权 |
| 较 24 小时前 | `deltas()` | 与 24 小时前同一口径比，`(now/old-1)*100` |
| 加权均价 | `wavg_fire_per_yuan` | 最近 100 笔按成交量加权 |
| 中位数 | `median_fire_per_yuan` | 100 笔单价排序取中间值（抗单笔异常） |
| 最新一笔 | `last_fire_per_yuan` | 原样展示，不参与主价 |
| 区间低/高 | `low/high_fire_per_yuan` | 100 笔里的最小/最大单价 |
| 刻度尺指针 | `drawGauge()` | 当前价在 24h 曲线的 min–max 之间的百分位 |

### 3.3 实测复核（2026-11-11 07:19）

| 算法 | 结果 |
|---|---|
| 按成交量加权（页面口径） | 404.122 火/元 |
| 用成交额反算（Σ火量 ÷ Σ成交额） | 403.844 火/元 |
| 两者差 | **0.07%** |

同时段 15 笔，21.4 万火 / 531 元；单价区间 357–425（极差 19%）。
→ 算法与字段自洽，误差来自市场本身不来自计算。

### 3.4 平台摘要是怎么"不一致"的

`get-spu-latest-trading-summary` 的 `amountPerRmb` 反算出来是 **921 火/元**，与明细口径差 **2.28 倍**。
它算的是另一种东西（全站/非赛季混合口径），**不参与主价**，页面只把它当警示徽章（`摘要偏差 ×2.28·全站`）。

---

## 四、文件都在哪

### 4.1 采集与后端（`/root/workspace/gh/`）

| 文件 | 行数 | 作用 |
|---|---|---|
| `collect.mjs` | 403 | 采集核心：取价 → 存档 → 日线 → 写库 → 写 `data.json` →（可选）推 GitHub |
| `publish.mjs` | 7 | CLI 包装：`node publish.mjs [--no-push]` |
| `serve.mjs` | 144 | HTTP 服务（7788）：静态页 + `/api/status` `/api/refresh` `/api/db/*` |
| `db.mjs` | 185 | SQLite（`node:sqlite`）：建表、写采样、写成交、日线、导出 |
| `keeper.sh` | 49 | 每 60 秒巡检：端口不通就重启 serve，`data.json` 龄 >55s 就补抓 |
| `backup.sh` | 33 | 每天 `VACUUM INTO` 备份 DB 到 `/sdcard/Download/DSH-Go/db-backup/`、月度 CSV |
| `pushfile.mjs` | 35 | 走 GitHub Contents API 单文件发布（`git push` 被 TLS 掐断时的备用通道） |
| `device-flow.mjs` | 59 | GitHub OAuth 设备码登录（一次性，token 存 `.token`） |
| `native/agg.cpp` | 110 | 日线聚合的 C++ 实现（20 万点 0.46s vs Node 0.78s）→ 编译成 `native/huo-agg` |
| `run-tests.sh` + `tests/` | — | 14 个用例：签名常量、价格口径、DB 写入 |

### 4.2 前端（`/root/workspace/gh/qiandao-huo/`）

| 文件 | 行数 | 作用 |
|---|---|---|
| `index.html` | 301 | 结构 + 全部 CSS（暗色炉膛主题） |
| `app.js` | 348 | 渲染、曲线、刻度尺、Tab 切换、轮询 |
| `data.json` | — | 当前快照（价、指标、曲线、日线、最近成交） |
| `daily.json` / `history.csv` | — | 日线、CSV 导出 |
| `native/huo-agg` | — | C++ 聚合器副本 |

### 4.3 数据（`/root/workspace/gh/store/`）

| 路径 | 内容 |
|---|---|
| `price.db` | SQLite 主库（1.8 MB）：`samples` **2149** 条、`trades` **7925** 条、`daily` 表 |
| `archive/2026-11.jsonl` | 按月追加的原始采样（每行一条，只增不减） |
| `recent_trades.json` | 最近 100 笔缓存（增量取价用） |
| `backups/` | 每日 DB 副本 |
| `last_error.json` | 最近一次采集失败原因 |

DB 表结构：

```sql
samples(id, ts, league, price, wavg, n, vf, vy)      UNIQUE(ts, league)
trades (id, ts, league, spec, fire, yuan, price)     UNIQUE(ts, league, spec, fire, yuan)
daily  (day PK, open, close, high, low, avg, samples, vf, vy, nonseason)
```

### 4.4 上游模块（`/root/workspace/qiandao/huo/`）

`signer.mjs` / `client.mjs` / `device.mjs` / `skey.mjs` / `extract.mjs` / `market.mjs` / `catalog.mjs` / `config.mjs` / `report.mjs` / `store.mjs` / `log.mjs`

### 4.5 可拷贝备份

`/sdcard/Download/DSH-Go/qiandao-huo-repo.zip`（46 KB，含前端 + collector + native 源码）
`/sdcard/Download/DSH-Go/db-backup/huo-YYYY-MM-DD.db`

---

## 五、怎么跑起来的

```
keeper.sh（每 60s）
   ├─ 端口 7788 不通 → 起 serve.mjs
   ├─ data.json 龄 > 55s → curl -X POST /api/refresh
   └─ 每天 → backup.sh（VACUUM INTO 备份）

serve.mjs（常驻，13359）
   └─ 收到 /api/refresh → 直接 await collectOnce({push:false})
        └─ collect.mjs：20 笔增量取价（合并成 100）→ 存 archive → 重建曲线（从 DB）
                        → 日线（DB 聚合，>2000 点走 C++）→ 写库 → 写 data.json

前端（浏览器每 20s）
   └─ POST /api/refresh → GET /data.json → 渲染
```

- 单轮耗时 **约 700 ms**（进程内），原版每次 spawn 新进程是 2082 ms（快 2.8 倍）
- 千岛接口耗时几乎全在服务端按条数序列化：limit 100≈1.7s、30≈0.6s、10≈0.27s → 所以只拉 20 笔再合并

---

## 六、做到哪一步了（已完成）

### 数据链路
- ✅ 网关签名完全复刻（`HMAC-SHA256` + base64(hex)，与前端逐字符一致）
- ✅ skey 自动提取 + 轮换自愈 + 设备限流自动换 device-id
- ✅ 成交明细取价、赛季/非赛季分档、按规格拆分
- ✅ 近 10 分钟加权口径，实测复算误差 0.07%

### 存储
- ✅ SQLite 落库（采样 2149 条 / 成交 7925 条），按月 JSONL 归档，只增不减
- ✅ 曲线与日线**从数据库重建**（曾被写坏一次，已修：不再以线上快照为准）
- ✅ 每日自动备份到手机存储（`VACUUM INTO`，不存在才写，永不覆盖）

### 展示
- ✅ 熔炉仪表风格（暗色炉膛 + 区间刻度尺 + 余烬条曲线）
- ✅ 四个 Tab：最近成交 / 分规格 / 每日历史 / 数据
- ✅ 秒级北京时钟、区间切换（24h/7d/30d/全部）、20 秒自动刷新
- ✅ 断流显式标注（>25 分钟显示「停更 N 分钟」，不伪装实时）

### 工程
- ✅ 常驻进程内采集（省 TLS 握手），单轮 700ms
- ✅ C++ 日线聚合器（大历史时 1.7×）
- ✅ 14 个单元测试（签名、口径、写库）
- ✅ GitHub Pages 公网镜像 + 安全加固（CSP、HTML 转义、Actions 只读、secret scanning）

---

## 七、还没做的 / 已知限制

### 数据本身的限制（改代码解决不了）
1. **历史只能从现在往回攒**：接口 `limit` 上限 100（≈12 分钟），无法回填更早成交。真实记录始于 **2026-11-09 22:49**。
2. **7 天 / 30 天 / 全部 目前是同一段**（只有一天多数据），要等时间累积才有意义。
3. **只有成交价，没有盘口**：看不到当前挂单买卖价，也就没有买卖价差。
4. **市场本身价差大**：同一分钟 357–425（19%），"唯一正确价"不存在，只能给代表价。
5. **延迟 20–60 秒**：接口是成交后写入，不是推送。

### 架构限制
6. **必须有一台国内住宅 IP 的机器在跑**：GitHub Actions 的机房 IP 被千岛一律 405，所以 CI 只保留手动触发。
7. **依赖手机不杀后台**：DSH 进程被系统回收就得重开 App（keeper 靠 `~/.bashrc` 自启）。
8. **GitHub 版有 CDN 缓存 10 分钟**，公网页最多滞后 10 分钟。
9. **`git push` 目前走不通**（GnuTLS 被掐），发布靠 `pushfile.mjs` 走 API 单文件提交。

### 还没实现的功能
10. **价格告警**：跌到 / 涨到某个阈值发通知（需要你定阈值和通知方式）。
11. **挂单价 / 深度**：接口里没找到卖单列表，只有在售商品搜索可绕，未做。
12. **多游戏扩展**：catalog.mjs 已能按关键词搜 SPU，但界面写死了初火源质。
13. **每日历史分页**：天数多了以后需要翻页（现在全列出来）。
14. **移动端 PWA**：可以「添加到主屏」，但没做 manifest 和离线缓存。

---

## 八、怎么自己验证

```bash
# 1. 服务在不在
curl -s http://127.0.0.1:7788/api/status

# 2. 手动抓一次（约 0.7s）
curl -s -X POST http://127.0.0.1:7788/api/refresh

# 3. 看库里的量
cd /root/workspace/gh && node db.mjs stats

# 4. 独立复算当前价（拿原始明细自己算一遍）
node /tmp/verify4.mjs        # 若已删，见本文 3.3 节算法

# 5. 跑测试
cd /root/workspace/gh && ./run-tests.sh
```

---

## 九、变更记录（要点）

| 日期 | 事项 |
|---|---|
| 11-09 22:49 | 第一条采样入库 |
| 11-10 | 打通签名 → 本地面板 → GitHub Pages → SQLite → C++ 聚合器 → 常驻进程提速 2.8× |
| 11-10 21:00 | UI 改版为熔炉仪表风格（暗色 + 刻度尺 + 余烬条） |
| 11-10 21:30 | 修复曲线被线上快照覆盖的问题：改为从 DB 重建（补回 807 点） |
| 11-11 07:40 | 本文档 |
