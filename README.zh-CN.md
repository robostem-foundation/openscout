<p align="center">
  <picture>
    <source srcset=".github/assets/logo-dark.png" media="(prefers-color-scheme: dark)">
    <source srcset=".github/assets/logo-light.png" media="(prefers-color-scheme: light)">
    <img src=".github/assets/logo-light.png" width="360" alt="OpenScout">
  </picture>
</p>

---

<p align="center">VEX 机器人赛事的侦查与数据分析工具。在一个地方浏览 V5RC、VIQRC、VURC 和 VAIRC 的所有赛事与战队。</p>

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

## OpenScout 是做什么的

这些信息大多在 VEX Events 上已经有了，问题在于怎么找到它们、怎么互相比较。

想找附近的比赛，往往要在全世界的赛事列表里一页页翻；想侦查另一支队伍，通常得打开好几个页面手动对比成绩。OpenScout 把这些数据按你在赛前和赛中真正需要的方式重新组织了一遍。

| | |
| --- | --- |
| **赛事** | 按赛季、项目、组别、地区和赛事类型筛选。世锦赛、Signature Events 和各级锦标赛会被自动标注。Smart Sort 会根据地点和日期把相关的赛事往前排。|
| **战队** | 每个战队页面都包含排名、技能赛分数、比赛记录、奖项以及往期赛季。雷达图把胜率、AWP、稳定性、世界技能赛排名和参赛经验放在同一个视图里对比。在深入看完整数据之前，它能让你迅速了解一支队伍的大致水平。|
| **技能赛** | 浏览世界技能赛排名，手动和自动分数分开显示。|
| **Jumper** | 选中一场比赛，OpenScout 会找到对应的直播回放，并跳转到这场比赛大致开始的位置。不用再为了找一场比赛而在六个小时的录像里来回拖动。目前支持 YouTube 和 BoxCast。|
| **我的战队** | 关注自己的队伍，相关信息随时可查。你可以查看即将到来的比赛、回顾最近的场次，并在忘记之前把侦查笔记记下来。|
| **共享战队** | 邀请队里的其他成员，共用同一份侦查资料。共享选队清单会在所有人的设备上实时更新，比在维修区里传来传去一张表格方便得多。|
| **翻译** | 其他地区的赛事名称可以自动翻译，让国际赛事（包括中国的 Signature Events）浏览起来轻松得多。|

OpenScout 可以作为渐进式网页应用（PWA）安装到手机或电脑上。已经加载过的页面在场馆 Wi-Fi 掉链子时依然可以查看。界面也会跟随系统的浅色或深色模式设置。

<div align="center">
<img src=".github/assets/team.png" alt="OpenScout 战队页面，展示 10B 的世界技能赛排名、胜率、雷达图，以及整个赛季的胜率和技能赛分数走势" width="840">
</div>

## 本地运行 OpenScout

需要 Node.js 20 或更高版本。

```bash
git clone https://github.com/axcdeng/webscout.git
cd webscout
npm install
cp .env.example .env
npm run dev
```

OpenScout 会运行在：

```text
http://localhost:5175
```

前端和 API 由同一个进程一起提供。

在赛事数据出现之前，你还需要 API key。没有它们应用照样能跑起来，只是大多数页面会是空的。

| 配置项                                                  | 对应功能                                                          |
| ------------------------------------------------------- | ----------------------------------------------------------------- |
| `ROBOTEVENTS_API_KEY` 和 `RSE_API_KEY`                  | 赛事、战队、排名、比赛、战队统计数据，以及 TrueSkill 评分（仍在开发中） |
| `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_PUBLISHABLE_KEY`  | 账号、笔记、共享战队和选队清单                                    |
| `VITE_DEFAULT_YOUTUBE_API_KEY`                          | Jumper                                                            |
| `UPSTASH_REDIS_REST_URL` 和 `UPSTASH_REDIS_REST_TOKEN`  | 限流                                                              |

本地运行时可以跳过 Upstash，限流功能会直接关闭。

### RoboSTEM DB

`RSE_API_KEY` 是免费的 RoboSTEM DB API key。用 Google 或 Discord 登录：

https://robostem-api.org/dashboard

RoboSTEM DB 提供战队统计数据和 TrueSkill 评分（仍在开发中）。接口文档在：

https://robostem-api.org/redoc

### VEX Events

`ROBOTEVENTS_API_KEY` 是 VEX Events 的 API v2 token，可以通过 VEX Events 网站上的账号申请。

### Supabase

Supabase 支撑账号以及所有需要保存数据的功能，包括笔记、共享战队和选队清单。

没有 Supabase 也能正常浏览赛事和战队，只会失去需要账号或保存状态的那部分功能。

`.env.example` 里的注释说明了每一个可用变量的用途、是否需要保密，以及缺失时会有什么功能不可用。

## 其他命令

```bash
npm run build    # 构建生产版本
npm test         # 运行测试
npm run lint     # 检查代码风格
npm run preview  # 启动生产构建
```

## 项目结构

```text
src/          基于 React 和 Vite 的前端
  jumper/     直播源识别与比赛时间点计算
server/       API 以及与 VEX Events 的对接
api/          同一批 API handler，打包为 Vercel functions
supabase/     账号、笔记、共享战队和选队清单的数据库结构
```

数据库变更存放在 `supabase/migrations/`。

Migration 需要在 Supabase SQL 编辑器中按编号顺序手动执行。每个 migration 都写成可以重复运行的，所以如果不确定哪些已经执行过，从头再跑一遍也没问题。

## 参与贡献

欢迎提 issue 和 pull request。

在提交 pull request 之前，请先运行：

```bash
npm run lint && npx tsc -b && npm test
```

开始之前有两点需要知道：

* `src/App.tsx` 目前非常大，正在逐步拆分成更小的文件。
* 已经提交过的 migration 不要再修改，生产数据库可能已经执行过了。请新增一个带编号的 migration。

## 安全问题

请不要通过公开的 GitHub issue 报告安全漏洞。

请私下发邮件到：

[contact@robostem.org](mailto:contact@robostem.org)

## 许可证

OpenScout 采用 [GNU Affero General Public License v3.0](LICENSE) 授权。

你可以使用、fork、修改它，也可以自己部署一份。如果你修改了 OpenScout 并把这个版本作为公开服务提供，就必须以相同的许可证公开你的改动。

如需商业授权或其他形式的合作，请联系：

[contact@robostem.org](mailto:contact@robostem.org)

Geist 和 Geist Mono 由 Vercel 制作，采用
[SIL Open Font License 1.1](public/fonts/OFL.txt) 授权。

OpenScout 与 VEX Robotics 没有隶属关系，也未获其背书。比赛数据通过 VEX Events 提供。
