<p align="center">
  <picture>
    <source srcset=".github/assets/logo-dark.png" media="(prefers-color-scheme: dark)">
    <source srcset=".github/assets/logo-light.png" media="(prefers-color-scheme: light)">
    <img src=".github/assets/logo-light.png" width="360" alt="OpenScout">
  </picture>
</p>

---

<p align="center">VEX 机器人赛事的侦查与数据分析工具。所有赛事、所有战队，集中在一个地方，覆盖 V5RC、VIQRC、VURC 和 VAIRC。</p>

<p align="center">
  <a href="https://openscout.ing"><img alt="线上地址 openscout.ing" src="https://img.shields.io/badge/live-openscout.ing-0a0a0a?style=flat-square"></a>
  <a href="LICENSE"><img alt="许可证 AGPL-3.0" src="https://img.shields.io/badge/license-AGPL--3.0-blue?style=flat-square"></a>
  <img alt="React 19" src="https://img.shields.io/badge/React-19-149eca?style=flat-square">
  <img alt="TypeScript 5.9" src="https://img.shields.io/badge/TypeScript-5.9-3178c6?style=flat-square">
</p>

<p align="center">
  <a href="README.md">English</a> | <a href="README.zh-CN.md">简体中文</a><br>
  <a href="https://openscout.ing"><img src=".github/assets/events.png" width="840" alt="OpenScout 赛事浏览界面，左侧是赛季、项目、组别、地区和赛事类型筛选器，右侧是排序后的赛事列表"></a>
</p>

---

## 这个项目做什么

数据本来就都在 VEX Events 上，麻烦的是怎么把它捞出来。想看看下个月你附近有哪几场比赛，就得从全世界的赛事列表里一页页翻；想掂量一下对手的实力，又得开两个标签页来回比对。

所以这里就是同一批数据，只不过是按你在赛场上会用到的方式重新组织了一遍。

| | |
| --- | --- |
| **赛事** | 筛选器能把一整个赛季收窄到你看得下去的长度：赛季、项目、组别、地区、赛事类型。世锦赛、Signature 和各级锦标赛都会打上标签，Smart Sort 会把离你近、离现在近的排在前面。|
| **战队** | 排名、技能赛分数、比赛战绩、奖项，以及这支队伍参加过的每一个赛季。还有一张雷达图，把胜率、AWP、稳定性、世界技能赛排名和参赛经验放在同一个形状上，一般扫一眼就知道值不值得再细看。|
| **技能赛** | 世界技能赛排行榜，手动和自动分开列。|
| **Jumper** | 问的人最多的功能。选中某一场比赛，它会找到对应的直播回放并跳到这场比赛开始的那一刻，不用你在六个小时的录像里来回拖进度条。支持 YouTube 和 BoxCast。|
| **我的战队** | 关注自己的队伍之后，它会一路跟着你：即将到来的比赛、最近打过的场次，还有一个趁记忆还新鲜时把观察记下来的地方。|
| **共享战队** | 把队里其他人拉进来。你们一起排的选队清单会随着改动实时同步到每个人的屏幕上，比三个人在维修区里抢着编辑同一张表格强多了。|
| **翻译** | 其他地区的赛事名称会被翻译过来，这样一场中文赛事就不会在列表里只是一行看不懂的字。|

想装到手机上的话它可以作为 PWA 安装，已经加载过的页面在场馆网络掉线时照样能看，配色也跟随系统的浅色/深色设置。

<div align="center">
<img src=".github/assets/team.png" alt="OpenScout 战队页面，展示 10B 的世界技能赛排名、胜率、雷达图，以及整个赛季的胜率和技能赛分数走势" width="840">
</div>

## 本地运行

需要 Node 20 或更高版本。

```bash
git clone https://github.com/axcdeng/webscout.git
cd webscout
npm install
cp .env.example .env
npm run dev
```

就这些；一个进程同时提供前端和 API，跑在 <http://localhost:5175>。

不过在看到内容之前，你还需要 API key。比赛数据都需要 token 才能访问，没有 key 的话你会得到一个功能完好但空空如也的壳子。

| 配置项 | 对应功能 |
| --- | --- |
| `ROBOTEVENTS_API_KEY` 和 `RSE_API_KEY` | 赛事、战队、排名、比赛数据 |
| `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_PUBLISHABLE_KEY` | 账号、笔记、共享战队、选队清单 |
| `VITE_DEFAULT_YOUTUBE_API_KEY` | Jumper |
| `UPSTASH_REDIS_REST_URL` 和 `_TOKEN` | 限流（本地可以不配，留空即不生效）|

`RSE_API_KEY` 是 RoboSTEM DB 的 key，免费。用 Google 或 Discord 登录
<https://robostem-api.org/dashboard> 就能自己生成一个。战队统计数据和 TrueSkill 评分都来自这里，
接口文档在 <https://robostem-api.org/redoc>。

`ROBOTEVENTS_API_KEY` 是 VEX Events 的 v2 token，在 VEX 赛事网站的账号里申请。

除此之外，[.env.example](.env.example) 就是说明文档。每个变量都有注释说明它的用途、是不是密钥，以及留空之后会少掉什么功能。只有 Supabase 那一行跟账号功能直接相关，完全跳过它也能正常浏览，只是所有需要保存状态的功能会失效。

### 其他命令

```bash
npm run build    # 构建生产版本
npm test         # 跑测试
npm run lint     # 检查代码风格
npm run preview  # 启动生产构建
```

## 代码结构

```
src/          前端。React 加 Vite。
  jumper/     比赛视频背后的直播源识别和时间点计算。
server/       API，以及所有跟 VEX Events 打交道的部分。
api/          同一批 handler，以 Vercel functions 的形式。
supabase/     账号、笔记、共享战队、选队清单的数据库结构。
```

数据库变更放在 `supabase/migrations/` 里，需要手动按顺序在 Supabase SQL 编辑器中执行。每个脚本都写成可以重复运行的，所以如果记不清执行到哪了，从头再跑一遍也没问题。

## 参与贡献

欢迎提 issue 和 PR。开之前请先跑一遍：

```bash
npm run lint && npx tsc -b && npm test
```

两点提醒。`src/App.tsx` 非常大，正在逐步拆分，看到的时候不用惊讶。另外数据库改动请新建一个带编号的 migration，而不是去改已有的那些（旧的那些已经在生产库上跑过了）。

## 安全问题

如果你发现了安全漏洞，请发邮件到 [contact@robostem.org](mailto:contact@robostem.org)，不要直接开公开 issue。

## 许可证

[GNU Affero General Public License v3.0](LICENSE)。

使用、fork、自己部署一份，都没问题。唯一实质性的条件是：如果你修改了它并且作为公开服务运行，你的改动必须以同样的许可证公开源码。如果这个条件不适合你的用途，可以发邮件到 [contact@robostem.org](mailto:contact@robostem.org) 聊聊。

Geist 和 Geist Mono 字体版权属于 Vercel，采用
[SIL Open Font License 1.1](public/fonts/OFL.txt) 单独授权。

OpenScout 与 VEX Robotics 没有隶属关系，也未获其背书。比赛数据来自 VEX Events。
