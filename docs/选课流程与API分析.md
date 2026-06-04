# 教务系统选课流程与 API 分析

本文基于 `www.google.com_2026_06_03_11_00_48.har` 的真实流量分析整理，`1.py` 仅作为辅助对照。结论以流量包为准。

## 1. 涉及的三个地址

HAR 中和选课直接相关的三个地址层次如下：

1. `https://webvpn.zjnu.edu.cn`
   用于统一身份认证、VPN 登录、代理校内系统访问。
2. `https://10.1.70.171/jwglxt/...`
   教务系统实际业务地址，HAR 中直接访问时的主业务主机，选课 API 基本都落在这里。
3. `https://jwxt.zjnu.edu.cn/jwglxt/...`
   教务系统公网登录入口，主要用于获取登录页和 RSA 公钥；该次抓包里真正的选课业务并未继续走这个域名，而是切到 `10.1.70.171` / `webvpn` 代理链路。

补充：页面脚本里还暴露了 `_reportPath = "https://10.1.70.150/WebReport"`，但它不是本次选课主流程接口。

## 2. 总体选课流程

按 HAR 的时间顺序，主流程如下：

1. 登录 WebVPN 统一身份认证。
2. WebVPN 通过 `sso/jziotlogin`、`ticketlogin` 等链路，把用户带到教务系统。
3. 进入教务系统首页，加载菜单与个人信息。
4. 打开选课首页 `zzxkyzb_cxZzxkYzbIndex.html`。
5. 页面下发当前选课批次上下文参数：学年学期、校区、学院、专业方向、班级、学生类别等。
6. 调用 `zzxkyzb_cxZzxkYzbDisplay.html`，加载当前课程类别页的配置和隐藏参数。
7. 调用 `zzxkyzb_cxZzxkYzbChoosedDisplay.html` 获取已选课程。
8. 调用 `zzxkyzb_cxZzxkYzbPartDisplay.html` 查询某课程类别下的课程列表。
9. 调用 `zzxkyzbjk_cxJxbWithKchZzxkYzb.html` 查询某门课对应的教学班明细。
10. 可选地调用 `zzxkyzb_cxXkTitleMsg.html` 做选课前校验。
11. 调用 `zzxkyzbjk_xkBcZyZzxkYzb.html` 提交选课。
12. 选课后刷新当前页/已选课程列表。

这和 `1.py` 中的函数映射基本一致：

- `get_big_list()` 对应选课首页上下文提取。
- `get_choosed()` 对应已选课程查询。
- `get_small_list()` 对应课程列表查询。
- `get_class_list()` 对应教学班明细查询。
- `choose_class()` 对应最终选课提交。

## 3. 认证与登录链路

### 3.1 教务系统登录页

- `GET /jwglxt/xtgl/login_slogin.html`
- 作用：返回教务系统登录页 HTML。

页面里能确认的关键字段：

- 表单 action：`/jwglxt/xtgl/login_slogin.html`
- 用户名字段：`yhm`
- 密码字段：`mm`
- CSRF 字段：`csrftoken`
- 语言字段：`language=zh_CN`
- `mmsfjm=1`，说明密码需要加密。

### 3.2 RSA 公钥获取

- `GET /jwglxt/xtgl/login_getPublicKey.html?time=...&_=`
- 返回 JSON：

```json
{
  "modulus": "AJR+mFM/eHILP/ES+mEThHtK+PaZcVvRgyv0xkvD1eEAgnr2pWH04cfeABgFZ91+P53xa+UFgXZrtFkMPv+EzRUIr9QyeXEunQhUF8AdJfY6erU1clcIoLApnGMkO8M8g3tNeE0kXg5QCIm/6luqP1KmHor4/h2adnqghCyCnCA5",
  "exponent": "AQAB"
}
```

用途：前端/脚本使用该公钥对明文密码做 RSA 加密，再 base64 编码后提交。

`1.py` 的这段逻辑和 HAR 一致：

- 先取 `modulus` / `exponent`
- RSA 加密密码
- 再提交 `mm`

### 3.3 登录提交

- `POST /jwglxt/xtgl/login_slogin.html?time=...`
- HAR 里状态码：`302`
- 说明：登录成功后重定向。

常见提交字段：

- `language=zh_CN`
- `yhm=<学号>`
- `mm=<RSA加密后的密码>`
- 可能还有 `csrftoken`

### 3.4 WebVPN / SSO 跳转链

HAR 中还能看到以下认证相关请求：

- `https://webvpn.zjnu.edu.cn/http/.../authserver/login?...`
- `https://webvpn.zjnu.edu.cn/https/.../sso/jziotlogin`
- `https://webvpn.zjnu.edu.cn/https/.../sso/jziotlogin?ticket=...`
- `https://webvpn.zjnu.edu.cn/https/.../jwglxt/ticketlogin?uid=...&timestamp=...&verify=...`

结论：

1. 用户先在 WebVPN 完成统一身份认证。
2. WebVPN 携带票据访问教务系统的 SSO 入口。
3. 教务系统通过 `ticketlogin` 建立自身会话。
4. 后续选课 API 依赖这套 Cookie / Session。

## 4. 选课首页与上下文参数

### 4.1 打开选课首页

- `GET /jwglxt/xsxk/zzxkyzb_cxZzxkYzbIndex.html?gnmkdm=N253512&layout=default&su=xs&gnmkdm=N253512&layout=default`

作用：返回选课首页 HTML，并把后续所有选课 API 需要的核心上下文字段写进页面隐藏域。

### 4.2 首页隐藏字段

HAR 明确抓到以下字段：

| 字段 | 示例值 | 含义推断 |
| --- | --- | --- |
| `xkxnm` | `2026` | 选课学年 |
| `xkxqm` | `3` | 选课学期 |
| `xqh_id` | `BB` | 校区 |
| `jg_id_1` | `45` | 学院/机构 |
| `zyfx_id` | `wfx` | 专业方向 |
| `njdm_id` | `2025` | 年级 |
| `bh_id` | `202521001` | 班级 |
| `xbm` | `1` | 性别代码 |
| `xslbdm` | `01` | 学生类别代码 |
| `mzm` | `01` | 民族代码 |
| `xz` | `4` | 学制 |
| `ccdm` | `3` | 层次代码 |
| `xsbj` | `67108870` | 学生标记 |

这些字段后续几乎会原样参与所有 `xsxk` 接口调用。

### 4.3 课程类别标签

首页中的 `queryCourse(...)` 调用给出了课程类别及对应控制 ID：

| 课程类别 | `kklxdm` | `xkkz_id` | `njdm_id` | `zyh_id` |
| --- | --- | --- | --- | --- |
| 主修课程 | `01` | `532C4928AE17336CE0639E46010A7338` | `2025` | `210` |
| 创新创业MOOC | `37` | `532CCD211DF656DCE0639F46010A82C7` | `2025` | `210` |
| 通识选修课 | `10` | `532D80DF7AD32AF0E0639F46010A0F30` | `2025` | `210` |
| 体育分项 | `05` | `532D7E44D78E2AEEE0639F46010A4ED3` | `2025` | `210` |
| 英语分项 | `07` | `532DCC9F87534C72E0639F46010AC9E6` | `2025` | `210` |
| 特殊课程 | `09` | `532D7E44D8BB2AEEE0639F46010A4ED3` | `2025` | `210` |
| 师范选修课 | `12` | `532E8A7597721FF8E0639F46010A87C4` | `2025` | `210` |

说明：

- `kklxdm` 是课程类别代码。
- `xkkz_id` 是当前类别在当前批次下的选课控制 ID。
- `zyh_id=210` 是当前用户所属专业代码。

## 5. 选课相关 API

以下接口都以 `https://10.1.70.171/jwglxt` 为原始地址；如果走 WebVPN，则会被包一层代理路径，但业务路径本身不变。

### 5.1 加载类别页配置

#### `POST /xsxk/zzxkyzb_cxZzxkYzbDisplay.html?gnmkdm=N253512`

作用：

- 加载当前课程类别对应的页面片段。
- 返回大量隐藏字段，定义这一类课程的选课规则。

示例请求：

```x-www-form-urlencoded
xkkz_id=532C4928AE17336CE0639E46010A7338
&kklxdm=01
&xszxzt=1
&njdm_id=2025
&zyh_id=210
&kspage=0
&jspage=0
```

返回类型：HTML。

返回中能确认的关键隐藏字段：

- `rwlx=1`
- `xklc=1`，`xklcmc=第1轮`
- `sfkxk=1`，当前可选
- `sfktk=1`，当前可退
- `xkkssj=2026-06-03 08:00:00`
- `xkjssj=2026-06-03 23:59:59`
- `rlkz=0`、`rlzlkz=0`、`cdrlkz=0`，容量控制相关
- `sfyxsksjct=0`，是否校验上课时间冲突
- `zdkxms`、`sfkxq`、`kkbk`、`kkbkdj` 等类别级控制位

说明：真正的选课约束不是写死在脚本里，而是由这个接口动态下发。

### 5.2 查询已选课程页面

#### `POST /xsxk/zzxkyzb_cxZzxkYzbChoosed.html?gnmkdm=N253512`

作用：加载已选课程页面框架。

这个接口主要返回 HTML 页面，实际数据通常由下一个接口给出。

### 5.3 查询已选课程数据

#### `POST /xsxk/zzxkyzb_cxZzxkYzbChoosedDisplay.html?gnmkdm=N253512`

作用：返回当前用户已选教学班列表。

示例请求：

```x-www-form-urlencoded
jg_id=45
&zyh_id=210
&njdm_id=2025
&zyfx_id=wfx
&bh_id=202521001
&xz=4
&ccdm=3
&xqh_id=BB
&xkxnm=2026
&xkxqm=3
&xkly=1
```

返回类型：JSON 数组。

典型返回字段：

- `do_jxb_id`：提交选课/退课时使用的教学班密文 ID
- `jxb_id`：教学班 ID
- `jxbmc`：教学班名
- `kch` / `kch_id`：课程号
- `kcmc`：课程名
- `kklxdm` / `kklxmc`：课程类别
- `jsxx`：教师信息
- `jxdd`：上课地点，可能含 `<br/>`
- `sksj`：上课时间，可能含 `<br/>`
- `jxbrs`：教学班容量
- `yxzrs`：已选人数
- `xkkz_id`：该课程所属控制批次

`1.py` 里的 `get_choosed()` 正是在消费这类数据。

### 5.4 查询选课提示信息

#### `POST /xsxk/zzxkyzb_cxXsXktsxx.html?gnmkdm=N253512`

示例请求：

```x-www-form-urlencoded
xkxnm=2026&xkxqm=3&kklxdm=01&njdm_id=2025&zyh_id=210&bh_id=202521001&zyfx_id=wfx
```

示例返回：

```json
"1"
```

作用推断：

- 查询页面顶部的提示状态或开关。
- 返回值非常短，像是状态位，而不是详细数据。

### 5.5 查询某类别下课程列表

#### `POST /xsxk/zzxkyzb_cxZzxkYzbPartDisplay.html?gnmkdm=N253512`

作用：

- 在某个课程类别下，返回课程列表。
- 每条记录是“课程维度”而不是最终可选的具体教学班。

示例请求（创新创业 MOOC）：

```x-www-form-urlencoded
rwlx=2
&xklc=1
&xkly=1
&bklx_id=0
&sfkkjyxdxnxq=0
&kzkcgs=0
&xqh_id=BB
&jg_id=45
&njdm_id_1=2025
&zyh_id_1=210
&gnjkxdnj=0
&zyh_id=210
&zyfx_id=wfx
&njdm_id=2025
&bh_id=202521001
&bjgkczxbbjwcx=0
&xbm=1
&xslbdm=01
&mzm=01
&xz=4
&ccdm=3
&xsbj=67108870
&sfkknj=1
&sfkkzy=1
&kzybkxy=0
&sfznkx=0
&zdkxms=0
&sfkxq=1
&bhbcyxkjxb=0
&sfkcfx=0
&kkbk=0
&kkbkdj=1
&bklbkcj=0
&sfkgbcx=1
&sfrxtgkcxd=1
&tykczgxdcs=0
&xkxnm=2026
&xkxqm=3
&kklxdm=37
&bbhzxjxb=0
&zxgbxkkg=0
&xkkz_id=532CCD211DF656DCE0639F46010A82C7
&rlkz=0
&xkzgbj=0
&kspage=1
&jspage=10
&jxbzb=
```

返回类型：JSON，核心字段为 `tmpList`。

`tmpList` 每项典型字段：

- `jxb_id`：教学班 ID
- `jxbmc`：教学班名称
- `kch_id` / `kch`：课程号
- `kcmc`：课程名
- `kklxdm`：课程类别代码
- `kzmc`：控制组名称/分类标题
- `rwzxs`：任务学时
- `xf` / `jxbxf`：学分
- `yxzrs`：已选人数

注意：这个接口的命名里虽然有 `jxb`，但返回更接近“课程在本类别下的可选项目列表”，真正的上课时间、地点、教师等完整明细仍要再查下一步接口。

### 5.6 查询某门课的教学班明细

#### `POST /xsxk/zzxkyzbjk_cxJxbWithKchZzxkYzb.html?gnmkdm=N253512`

作用：

- 给定 `kch_id` 和类别上下文，查询该课程对应的教学班明细。
- 最终提交选课时，依赖这里返回的 `do_jxb_id`。

`1.py` 中 `get_class_list()` 对应的就是这个接口。

示例请求核心字段：

```x-www-form-urlencoded
rwlx=1
&xkly=1
&bklx_id=0
&sfkkjyxdxnxq=0
&xqh_id=BB
&jg_id=45
&zyh_id=210
&zyfx_id=wfx
&njdm_id=2025
&bh_id=202521001
&xbm=1
&xslbdm=01
&mzm=01
&xz=4
&ccdm=3
&xsbj=67108870
&sfkknj=1
&sfkkzy=1
&kzybkxy=0
&sfznkx=0
&zdkxms=1
&sfkxq=0
&sfkcfx=0
&bbhzxjxb=0
&kkbk=0
&kkbkdj=0
&xkxnm=2026
&xkxqm=3
&xkxskcgskg=0
&rlkz=0
&kklxdm=01
&kch_id=<课程号>
&jxbzcxskg=0
&xkkz_id=<类别控制ID>
&cxbj=0
&fxbj=0
```

返回类型：JSON 数组。

典型返回字段：

- `do_jxb_id`：加密后的教学班提交 ID，最终选课用它
- `jxb_id`：教学班主键
- `jxbmc`：教学班名
- `kch_id` / `kcmc`
- `kklxdm` / `kklxmc`
- `jsxx`：教师工号/姓名/职称
- `jxdd`：上课地点
- `sksj`：上课时间
- `jxbrs`：教学班容量
- `yxzrs`：已选人数
- `sfxkbj`：是否可选
- `sfktk`：是否可退
- `xkgz`：选课规则串
- `xkkz_id`：所属控制 ID
- `qz`：权重/优先级控制位
- `sxbj`：筛选标记

### 5.7 选课前校验接口

#### `POST /xsxk/zzxkyzb_cxXkTitleMsg.html?gnmkdm=N253512`

示例请求：

```x-www-form-urlencoded
jxb_ids=<do_jxb_id>&xkxnm=2026&xkxqm=3&bj=7&kch_id=<课程id>&njdm_id=2025&zyh_id=210&kklxdm=10
```

示例返回：

```json
{"flag":"1"}
```

作用：

- 选课前做轻量校验。
- `flag=1` 表示允许继续提交。

### 5.8 提交选课

#### `POST /xsxk/zzxkyzbjk_xkBcZyZzxkYzb.html?gnmkdm=N253512`

作用：最终提交选课。

示例请求：

```x-www-form-urlencoded
jxb_ids=76c602c5f78d6990ed09d61389b5c003933983bbfc0097d76254db4a4bfc32665cc640c2490163a1e76e05f7c842079e50244ad019a32924b33a0e41dfe5b5e65f37c90fc6895c2a4b41ed3cc524349aaec455d9d6f0bfad333b1b38bba98d85b00afc92b1115249820291fd0a672e55f7c860845e15094358823b9b7f29b079
&kch_id=5131EDE458F252F3E0639F46010A8663
&kcmc=(000000X121C087)人工智能与数字绘画 - 1.0 学分
&rwlx=2
&rlkz=0
&cdrlkz=0
&rlzlkz=0
&sxbj=0
&xxkbj=0
&qz=0
&cxbj=0
&xkkz_id=532D80DF7AD32AF0E0639F46010A0F30
&njdm_id=2025
&zyh_id=210
&kklxdm=10
&xklc=1
&xkxnm=2026
&xkxqm=3
&jcxx_id=
```

关键字段说明：

- `jxb_ids`：最终选课对象，不是明文 `jxb_id`，而是 `do_jxb_id`
- `kch_id`：课程号
- `kcmc`：课程名称，接口看起来会接收展示字符串
- `rwlx`：任务类型，主修课常见为 `1`，公共/其他类常见为 `2`
- `xkkz_id`：当前选课控制 ID
- `njdm_id` / `zyh_id` / `kklxdm`：上下文定位
- `xklc`：选课轮次
- `xkxnm` / `xkxqm`：学年学期

示例失败返回：

```json
{"msg":"超过本学期最高选课学分限制，不可选！","flag":"0"}
```

说明：

- `flag="1"` 表示成功。
- `flag="0"` 表示失败，`msg` 给出原因。

### 5.9 退课接口

虽然本次 HAR 未明确抓到退课提交，但 `1.py` 中存在：

- `POST /xsxk/zzxkyzb_tuikBcZzxkYzb.html?gnmkdm=N253512`

脚本中的请求字段：

```x-www-form-urlencoded
kch_id=<课程号>
&jxb_ids=<do_jxb_id>
&xkxnm=<学年>
&xkxqm=<学期>
&txbsfrl=0
```

这个接口定义来自脚本，不是本次 HAR 主证据，使用时应二次验证。

## 6. 公共筛选与辅助接口

这些接口主要服务于页面上的筛选器，不是“提交选课”主链路，但做自动化时常常有用。

### 6.1 学院列表

#### `POST /xkgl/common_queryKkbmPaged.html?localeKey=zh_CN&gnmkdm=N253512`

示例返回字段：

- `jgmc`：机构名称
- `jgdm` / `jg_id`
- `jgxh`：排序

### 6.2 年级列表

#### `POST /xkgl/common_queryNjPaged.html?njdm_id=w&gnmkdm=N253512`

典型字段：

- `njmc`
- `njdm_id`
- `njxh`

### 6.3 学院分页

#### `POST /xkgl/common_queryXyPaged.html?localeKey=zh_CN&jg_id=w&gnmkdm=N253512`

返回仍然是学院/机构列表。

### 6.4 专业分页

#### `POST /xkgl/common_queryZyPaged.html?localeKey=zh_CN&zyh_id=w&gnmkdm=N253512`

典型字段：

- `zymc1`
- `zyh_id`
- `zyh`
- `zymc`

### 6.5 课程类别列表

#### `POST /xkgl/common_queryKclbListPaged.html?gnmkdm=N253512`

典型字段：

- `kclbdm`
- `kclbmc`

### 6.6 课程性质列表

#### `POST /xkgl/common_queryKcxzPaged.html?gnmkdm=N253512`

典型字段：

- `dm`
- `mc`

样例：

- `01` 必修
- `02` 选修
- `09` 任选课

### 6.7 课程归属列表

#### `POST /xkgl/common_queryKcgsPaged.html?gnmkdm=N253512`

典型字段：

- `kcgsdm`
- `kcgsmc`

样例：

- `01` 通识一
- `02` 通识二
- `03` 行知课程
- `04` 理论课程

### 6.8 基础代码表

#### `POST /xtgl/comm_cxJcsjList.html?lxdm=0032&gnmkdm=N253512`

样例返回：教学语言/开课方式相关代码。

- `dm=2` -> `英语教学`
- `dm=3` -> `中文教学`

#### `POST /xtgl/comm_cxJcsjList.html?lxdm=0036&gnmkdm=N253512`

样例返回：星期代码。

- `1` -> 星期一
- `2` -> 星期二
- `...`
- `7` -> 星期日

### 6.9 节次列表

#### `POST /xkgl/common_querySkjcList.html?gnmkdm=N253512`

返回 `dm=1..13` 的节次代码列表，对应课表节次筛选。

## 7. 关键参数关系

自动化实现时，下面这些参数是最关键的一组：

| 参数 | 来源 | 用途 |
| --- | --- | --- |
| `xkxnm` / `xkxqm` | 选课首页隐藏域 | 学年学期 |
| `bh_id` | 选课首页隐藏域 | 班级 |
| `njdm_id` | 选课首页隐藏域/类别参数 | 年级 |
| `jg_id` | 选课首页隐藏域 | 学院 |
| `zyh_id` | `queryCourse(...)` | 专业 |
| `zyfx_id` | 选课首页隐藏域 | 专业方向 |
| `xqh_id` | 选课首页隐藏域 | 校区 |
| `kklxdm` | 课程标签 | 课程类别 |
| `xkkz_id` | 课程标签 | 该类别当前批次控制 ID |
| `rwlx` | 类别页或业务规则 | 主修/非主修任务类型 |
| `kch_id` | 课程列表或教学班列表 | 课程号 |
| `do_jxb_id` | 教学班明细接口 | 最终选课提交 ID |

其中：

- `xkkz_id` 是选课链路里最重要的上下文字段之一。
- `do_jxb_id` 是最终操作对象，不能直接用普通 `jxb_id` 替代。

## 8. 与 `1.py` 的对照结论

`1.py` 中多数接口路径和 HAR 一致，说明脚本整体思路是对的，但要注意以下几点：

1. `1.py` 默认 `base_url = "https://10.1.70.150"`，但 HAR 主流量实际用的是 `https://10.1.70.171`。
2. HAR 显示真实访问通常先走 WebVPN，再进入教务系统；脚本直接打内网地址仅在网络可达时才成立。
3. `1.py` 用正则从首页 HTML 解析隐藏字段，这和 HAR 页面结构吻合。
4. `1.py` 对 `rwlx` 的判断规则比较简化：`主修课程 -> 1`，其他 -> `2`。从 HAR 看，这个推断在当前抓包样本里成立，但不保证所有学校配置都如此。
5. `1.py` 中退课接口来自经验推断，HAR 未直接覆盖，建议单独抓包确认。

## 9. 最小可复现选课链路

如果只保留“最小必须链路”，顺序可以简化为：

1. 建立登录态：WebVPN / SSO / 教务会话。
2. `GET /xsxk/zzxkyzb_cxZzxkYzbIndex.html`
   提取：`xkxnm`、`xkxqm`、`bh_id`、`njdm_id`、`jg_id`、`zyfx_id`、`xqh_id`、`xbm`、`xslbdm`、`mzm`、`xz`、`ccdm`、`xsbj`。
3. 从页面里的 `queryCourse(...)` 提取目标类别的：`kklxdm`、`xkkz_id`、`zyh_id`。
4. `POST /xsxk/zzxkyzb_cxZzxkYzbPartDisplay.html`
   查课程列表，拿到目标 `kch_id`。
5. `POST /xsxk/zzxkyzbjk_cxJxbWithKchZzxkYzb.html`
   查目标课程的教学班，拿到 `do_jxb_id`。
6. 可选：`POST /xsxk/zzxkyzb_cxXkTitleMsg.html`
   做前置校验。
7. `POST /xsxk/zzxkyzbjk_xkBcZyZzxkYzb.html`
   提交选课。
8. `POST /xsxk/zzxkyzb_cxZzxkYzbChoosedDisplay.html`
   验证是否选课成功。

## 10. 风险与注意事项

1. 该系统大量依赖 Cookie / Session，不能只复制接口参数。
2. WebVPN 代理访问时，URL 形式会变化，但代理层外壳不影响业务路径本身。
3. 页面动态下发了大量控制位，自动化不能只抄固定参数，最好每次从首页和类别页重新提取。
4. `do_jxb_id` 很像一次性的加密/签名 ID，应该以实时查询结果为准。
5. 失败提示由后端明确返回，例如学分上限、时间冲突、容量限制等，不要只用 HTTP 状态码判断结果。

## 11. 前端逻辑分析

本节基于 HAR 中抽出的前端脚本分析，核心文件如下：

- `zzxkYzb.js`：选课主页面逻辑
- `zzxkYzbZy.js`：当前课程类别页初始化逻辑
- `zzxkYzbChoosedZy.js`：右侧“已选课程”区域、选课提交、退课、权重等逻辑

整体上，这个前端是典型的 jQuery 页面：

1. 页面先加载 HTML 片段。
2. HTML 片段里塞满隐藏域，保存业务上下文和控制开关。
3. JS 从隐藏域取值，组装 `$.post()` / `$.load()` 请求。
4. 返回 JSON 后，前端手工拼接 HTML 字符串，再插入 DOM。

### 11.1 前端状态从哪里来

前端几乎不自己计算业务上下文，而是依赖以下几类来源：

1. 首页隐藏域
   例如：`#xkxnm`、`#xkxqm`、`#xqh_id`、`#jg_id_1`、`#zyh_id`、`#zyfx_id`、`#njdm_id`、`#bh_id`、`#xbm`、`#xslbdm`、`#mzm`、`#xz`、`#ccdm`、`#xsbj`。
2. 类别页隐藏域
   例如：`#rwlx`、`#xklc`、`#xkly`、`#bklx_id`、`#sfkkjyxdxnxq`、`#rlkz`、`#rlzlkz`、`#cdrlkz`、`#sfkxq`、`#sfyxsksjct`、`#sfktk`、`#sfkxk` 等。
3. 搜索框组件 `searchBox`
   高级筛选条件通过 `$("#searchBox").searchBox("getConditions")` 收集。
4. DOM 上临时写入的隐藏节点
   例如每一门课程、每一个教学班节点里都塞了 `kch_id`、`cxbj`、`fxbj`、`do_jxb_id`、`jxbzls` 等值，供后续点击事件复用。

结论：

- 前端是“隐藏域驱动”的，不是“接口 schema 驱动”的。
- 只要隐藏域取值变化，同一段 JS 就能适配不同学校配置。

### 11.2 首页初始化逻辑

`zzxkYzb.js` 页面初始化时先把首页首个页签参数写入当前上下文：

- `#kklxdm = #firstKklxdm`
- `#kklxmc = #firstKklxmc`
- `#xkkz_id = #firstXkkzId`
- `#njdm_id = #firstNjdmId`
- `#zyh_id = #firstZyhId`

然后如果 `#iskxk == 1`，立即做两次加载：

1. `#displayBox.load("/xsxk/zzxkyzb_cxZzxkYzbDisplay.html", ...)`
2. 回调里 `#choosedBox.load("/xsxk/zzxkyzb_cxZzxkYzbChoosed.html")`

也就是说：

- 左侧当前类别配置和课程区是先加载的。
- 右侧已选课程区随后加载。

### 11.3 页签切换如何构造请求

页签切换由 `queryCourse(a_element, kklxdm, xkkz_id, njdm_id, zyh_id)` 驱动。

它的处理顺序是：

1. 防抖/限流
   通过 `tabChangeTime`、`tabChangeFlag` 控制，防止频繁切页签。
2. 更新当前上下文隐藏域
   写入 `#kklxdm`、`#kklxmc`、`#xkkz_id`、`#njdm_id`、`#zyh_id`。
3. 初始化默认筛选条件
   调用 `initCxtj(kklxdm)`。
4. 重新加载当前类别配置页
   请求 `zzxkyzb_cxZzxkYzbDisplay.html`。
5. 触发高级查询组件搜索
   `setTimeout("$('#searchBox').trigger('searchResult')", 100)`。

其中，`initCxtj(kklxdm)` 会根据课程类别自动塞默认条件：

- `01`、`04`、`09`：默认 `tjbj_list=1`，即优先推荐课表
- `05` 体育分项：默认 `yl_list=1`，有余量；购物车关闭时还默认 `sksjct_list=0`，即不冲突
- `12` 师范选修课：默认也是推荐课表

说明：前端不是把所有课都无差别查出来，而是会根据类别提前加筛选。

### 11.4 高级查询如何构造参数

高级查询条件由 `getConditionCols()` 动态生成。

它会根据一系列开关隐藏域决定是否显示哪些筛选器，例如：

- 开课学院：`/xkgl/common_queryKkbmPaged.html`
- 年级：`/xkgl/common_queryNjPaged.html`
- 学院：`/xkgl/common_queryXyPaged.html`
- 专业：`/xkgl/common_queryZyPaged.html`
- 课程类别：`/xkgl/common_queryKclbListPaged.html`
- 课程性质：`/xkgl/common_queryKcxzPaged.html`
- 课程归属：`/xkgl/common_queryKcgsPaged.html`
- 教学模式：`/xtgl/comm_cxJcsjList.html?lxdm=0032`
- 上课星期：`/xtgl/comm_cxJcsjList.html?lxdm=0036`
- 上课节次：`/xkgl/common_querySkjcList.html`

因此，筛选器的下拉项不是写死的，而是通过这些分页接口实时加载。

### 11.5 课程列表请求是如何构造的

课程列表加载函数是 `loadCoursesByPaged()`。

它先执行：

```js
var requestMap = $("#searchBox").searchBox("getConditions");
```

然后把当前上下文参数扩展进去，包括：

- 当前类别参数：`rwlx`、`xklc`、`xkly`、`bklx_id`、`kklxdm`、`xkkz_id`
- 学生上下文：`xqh_id`、`jg_id`、`njdm_id_1`、`zyh_id_1`、`zyh_id`、`zyfx_id`、`njdm_id`、`bh_id`、`xbm`、`xslbdm`、`mzm`、`xz`、`ccdm`、`xsbj`
- 规则控制位：`sfkknj`、`sfkkzy`、`kzybkxy`、`sfznkx`、`zdkxms`、`sfkxq`、`bhbcyxkjxb`、`sfkcfx`、`kkbk`、`kkbkdj`、`bklbkcj`、`sfkgbcx`、`sfrxtgkcxd`、`tykczgxdcs`、`bbhzxjxb`、`zxgbxkkg`、`rlkz`、`xkzgbj`
- 学年学期：`xkxnm`、`xkxqm`
- 分页参数：`kspage`、`jspage`

最终调用：

- `POST /xsxk/zzxkyzb_cxZzxkYzbPartDisplay.html`

返回后前端按 `rst.tmpList` 渲染课程卡片。

### 11.6 课程列表返回后如何解析

前端把 `tmpList` 当作“课程分组列表”处理：

1. 按 `kch_id` 分组。
2. 每个课程生成一个 `panel`。
3. `panel-heading` 展示课程名、课程号、学分、状态等。
4. `panel-heading` 内写入多个隐藏字段：
   `kch_id`、`cxbj`、`fxbj`、`xxkbj`、`czzt` 等。
5. 每个课程面板下暂时只渲染“空表格骨架”。
6. 真正的教学班明细要等用户点击课程标题后再单独请求。

所以这里采用的是两级懒加载：

1. 先查“课程级列表”
2. 再查“教学班级列表”

### 11.7 教学班详情如何构造请求

点击课程面板时，触发 `loadJxbxxZzxk(obj)`。

这一步再次从 `searchBox` 取筛选条件，然后拼接更完整的一组参数：

- 类别控制参数：`rwlx`、`xkly`、`bklx_id`、`sfkkjyxdxnxq`、`kzkcgs`
- 学生信息：`xqh_id`、`jg_id`、`zyh_id`、`zyfx_id`、`njdm_id`、`bh_id`、`xbm`、`xslbdm`、`mzm`、`xz`、`ccdm`、`xsbj`
- 开关位：`sfkknj`、`gnjkxdnj`、`sfkkzy`、`kzybkxy`、`sfznkx`、`zdkxms`、`sfkxq`、`bhbcyxkjxb`、`sfkcfx`、`bbhzxjxb`、`kkbk`、`kkbkdj`、`bklbkcj`
- 学年学期：`xkxnm`、`xkxqm`
- 容量控制：`rlkz`、`cdrlkz`、`rlzlkz`
- 当前课程：`kklxdm`、`kch_id`、`xklc`、`xkkz_id`
- 当前卡片附带值：`cxbj`、`fxbj`

最终调用：

- `POST /xsxk/zzxkyzbjk_cxJxbWithKchZzxkYzb.html`

### 11.8 教学班详情返回后如何解析

教学班接口返回后，前端不是重建整块 DOM，而是回填之前生成好的空表格行：

- `.jxbrs` <- `yxzrs`
- `.jxbrl` <- `jxbrl`
- `.sksj` <- `sksj`
- `.jxdd` <- `jxdd`
- `.jxms` <- `jxms`
- `.kcgs` <- `kcgsmc`
- `.kclb` <- `kclbmc`
- `.kcxz` <- `kcxzmc`
- `.kkxymc` <- `kkxymc`
- `.xqumc` <- `xqumc`
- `.yqumc` <- `yqmc`
- `.do_jxb_id` <- `do_jxb_id`

教师字段 `jsxx` 的解析方式：

1. 先按 `;` 分割多个教师。
2. 每个教师再按 `/` 分割出 工号 / 姓名 / 职称。
3. 组合成 `jsxmString` 和 `jszcString`。
4. 再根据展示模式决定只展示姓名还是姓名+职称。

这也是 `1.py` 为什么直接把 `jsxx` 原样输出也能用，但如果想和页面一样展示，就必须按这个规则拆分。

### 11.9 已选课程区如何构造和解析

`zzxkYzbChoosedZy.js` 初始化时会直接请求：

- `POST /xsxk/zzxkyzb_cxZzxkYzbChoosedDisplay.html`

请求参数来自当前隐藏域：

- `jg_id`、`zyh_id`、`njdm_id`、`zyfx_id`、`bh_id`、`xz`、`ccdm`、`xqh_id`、`xkxnm`、`xkxqm`、`xkly`

返回后前端按 `t_kch_id` 和 `jxb_id` 分组，渲染右侧已选课程区。

每个右侧教学班节点会写入隐藏值：

- `right_jxb_id`
- `right_do_jxb_id`
- `right_xkkz_id`
- `right_jxbzls`
- `right_kklxdm`
- `right_qz`

这些值会被后续权重修改、退课、排序等功能复用。

### 11.10 选课按钮触发后的前端校验链

点击“选课”按钮后，真正入口是：

- `chooseCourseZzxk(jxb_id, do_jxb_id, kch_id, jxbzls)`

这一步先做纯前端校验：

1. 禁用按钮，避免重复点击。
2. 检查一门课最多可选几个志愿。
3. 检查本类别、本学期的最高学分 / 门次数限制。
4. 如果是权重选课，检查剩余权重是否足够。
5. 某些学校场景下检查是否已经有间听申请等。

通过后进入一串后端校验函数：

1. `checkCourse_2`
   调 `cxXkTitleMsg`，`bj=2`
   处理“先行课未修仍继续选”的提示。
2. `checkCourse_5`
   调 `cxXkTitleMsg`，`bj=5`
   某些学校/类别下的特殊提示。
3. `checkCourse_7`
   调 `cxXkTitleMsg`，`bj=7`
   处理不可选原因或需要确认的提示。
4. `checkCourse_9`
   调 `cxXkTitleMsg`，`bj=9`
   处理排考时间冲突类提示。
5. `checkCourse_10`
   处理跨校区提示、权重选课分支、子教学班分支。
6. `checkCourse_20`
   调 `cxCtKcZyZzxkYzb`
   检查上课时间冲突 / 半天跨校区冲突。
7. `checkCourse_22`
   调 `cxCheckJckg`
   检查是否需要先选教材。
8. `saveCourse`
   最终提交选课。

结论：

- 前端不是直接点一下就调提交接口。
- 它会串行调用多个校验接口。
- `cxXkTitleMsg` 被同一个页面在多个阶段复用，通过 `bj` 参数区分语义。

### 11.11 `cxXkTitleMsg` 在前端里的真实角色

从 JS 看，`cxXkTitleMsg` 不是单一用途接口，而是一个“选课前置规则检查器”。

前端给它传：

- `jxb_ids=do_jxb_id`
- `xkxnm`、`xkxqm`
- `kch_id`
- `njdm_id`、`zyh_id`
- `kklxdm`
- `bj=<阶段号>`

不同 `bj` 阶段含义：

- `2`：先行课提示
- `5`：特定类别/学校补充提示
- `7`：一般选课前可选性校验
- `9`：排考时间冲突提示

接口返回后，前端按 `flag` 处理：

- `1`：继续下一步
- `2`：弹确认框，用户确认后继续
- `3`：直接提示不可选
- `-1`、`-2`：非法访问或页面过期

### 11.12 冲突检查如何构造请求

冲突检查走：

- `POST /xsxk/zzxkyzb_cxCtKcZyZzxkYzb.html`

前端传参：

- `jxb_ids=do_jxb_id` 或者多子班 `jxb_arr`
- `xkxnm`
- `xkxqm`
- `kch_id`
- `sfyxsksjct`

返回后前端按 `flag` 解释：

- `1`：无冲突，继续
- `2`：上课时间冲突，允许确认后继续
- `3`：同半天跨校区冲突，允许确认后继续
- `4`：二者同时存在，允许确认后继续
- `5`：转入间听申请等特殊流程

### 11.13 教材选择如何插入主流程

如果 `xksdxjckg == 1` 且 `xkydjc == 1`，前端会先调用：

- `POST /xsxk/zzxkyzb_cxCheckJckg.html`

若返回 `1`，则打开教材选择弹窗：

- `/xsxk/zzxkyzb_cxXsxzjcView.html`

用户确认后，把选中的教材 ID 收集成：

- `jcxx_arr.join(',')`

最终作为 `jcxx_id` 传给选课提交接口。

### 11.14 最终提交请求如何构造

无子教学班时走 `saveCourse()`，有子教学班时走 `saveDjxbCourseBc()`。

两者最终都调用：

- `POST /xsxk/zzxkyzbjk_xkBcZyZzxkYzb.html`

无子班 `saveCourse()` 的核心请求参数：

- `jxb_ids=do_jxb_id`
- `kch_id`
- `kcmc`：从 `#kcmc_<kch_id>` 文本取出
- `rwlx`
- `rlkz`、`cdrlkz`、`rlzlkz`
- `sxbj`：前端根据容量控制位计算，若任一容量控制开启则置 `1`
- `xxkbj`
- `qz`
- `cxbj`
- `xkkz_id`
- `njdm_id`
- `zyh_id`
- `kklxdm`
- `xklc`
- `xkxnm`
- `xkxqm`
- `jcxx_id`

有子班 `saveDjxbCourseBc()` 的差异：

- `jxb_ids` 不是单个 `do_jxb_id`，而是子教学班 `do_jxb_id` 拼成的逗号串。
- 同样会带 `jcxx_id`。

### 11.15 提交结果如何解析和回填页面

提交成功后，前端不会整页刷新，而是做局部更新：

1. 读取当前表格里的容量数字。
2. 把已选人数 `+1`。
3. 根据容量调用 `setRlxxAddZzxk()`，切换“已满”显示。
4. 调 `refreshDataAddZzxk()` 同步右侧已选课程区。
5. 如果是多子班，还会把子班教师/时间/地点快照写入右侧隐藏结构。

对返回 `flag` 的处理大致是：

- `1`：成功
- `3`：成功，但伴随免费学分上限之类提示
- `6`：该教学班已选中，提示刷新页面查看
- `-1`：容量变化导致失败，前端会用后端返回的新人数覆盖页面上的旧值
- `2`：失败，但可进一步查看冲突详情
- 其他：弹 `data.msg`

所以页面上的人数、状态并不完全依赖下一次刷新，而是前端直接做增量同步。

### 11.16 退课前端逻辑

退课由 `cancelCourseZzxk()` 和 `delCourse()` 驱动。

流程是：

1. 某些学校先调：
   `POST /xsxk/zzxkyzb_cxTkTitleMsg.html`
   做退课前提示校验。
2. 然后调：
   `POST /xsxk/zzxkyzb_tuikBcZzxkYzb.html`

退课提交参数：

- `kch_id`
- `jxb_ids`：单个或多个 `do_jxb_id` 逗号串
- `xkxnm`
- `xkxqm`
- `txbsfrl`

成功后前端也会做局部刷新，而不是全页重载。

### 11.17 前端实现特征总结

可以把这个页面的前端实现概括成下面几条：

1. 隐藏域就是前端的“状态容器”。
2. `searchBox` 是查询条件聚合器。
3. 课程列表和教学班列表是两段式懒加载。
4. `cxXkTitleMsg` 是一个多阶段复用的规则校验接口。
5. `do_jxb_id` 是最终提交和退课的真实操作 ID。
6. 成功后主要靠前端局部回填人数、状态和右侧已选区。
7. 这套前端大量依赖同步 `$.ajaxSetup({async:false})` 串行请求，因此脚本流程顺序非常强。

### 11.18 对自动化脚本的启发

如果要复刻网页前端行为，最接近真实页面的顺序应该是：

1. 先请求类别配置页，拿最新隐藏控制位。
2. 再请求课程列表。
3. 再请求教学班详情，拿 `do_jxb_id`。
4. 按需要依次跑：
   `cxXkTitleMsg(bj=2/5/7/9)` -> `cxCtKcZyZzxkYzb` -> `cxCheckJckg`
5. 最后提交 `xkBcZyZzxkYzb`。

如果跳过中间校验接口，某些学校配置下也许仍能提交成功，但会失去和网页一致的提示链，而且更容易踩到未显式暴露的前置规则。
