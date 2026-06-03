import requests
from fake_useragent import UserAgent
import re
import textwrap
from Crypto.Util.number import bytes_to_long
import rsa, base64, time, json
import urllib3
from pathlib import Path
from textual.app import App, ComposeResult
from textual.widgets import (
    Footer,
    RichLog,
    Static,
    Tree,
    TabbedContent,
    TabPane,
    DataTable,
    Button,
)
from textual.containers import Container, Horizontal, Vertical, VerticalScroll
from textual.coordinate import Coordinate
from textual.screen import ModalScreen
from textual import work
from rich.table import Table
from rich.text import Text
from rich.panel import Panel
from rich.console import Console
from rich.prompt import Prompt, Confirm
from rich import box

urllib3.disable_warnings()

# --- 核心业务配置 ---
STUDENT_NUMBER = ""  # 在此填入学号
PASSWORD = ""  # 在此填入密码
CREDENTIALS_FILE = Path(__file__).with_name(".jwxt_credentials.json")
ADDRESS_CHOICES = [
    ("1", "http://10.1.70.171", "内网地址 10.1.70.171"),
    ("2", "http://10.1.70.170", "内网地址 10.1.70.170"),
    ("3", "https://jwxt.zjnu.edu.cn", "校外统一地址 jwxt.zjnu.edu.cn"),
    ("4", "https://webvpn.zjnu.edu.cn", "WebVPN 外层地址"),
]

# --- 全局变量 ---
sess = requests.Session()
header = {
    "User-Agent": UserAgent().random,
    "Accept": "application/json, text/javascript, */*; q=0.01",
}
sess.headers = header
sess.verify = False

base_url = "http://10.1.70.171"
# base_url = "https://jwxt.zjnu.edu.cn"
console = Console()
bh_id = ""
xsbj = ""
njdm_id = ""
xkxnm = ""
xkxqm = ""
xqh_id = ""
jg_id = ""
zyfx_id = ""
xbm = ""
xslbdm = ""
mzm = ""
xz = ""
ccdm = ""
max_credit_limit = 0.0
current_credit_display = 0.0

num_map = {"一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5, "六": 6, "日": 7}
kb = {}
is_authenticated = False
request_logger = None


# --- 业务逻辑函数 ---
def rsa_encryption(n, e, msg):
    N = bytes_to_long(base64.b64decode(n))
    E = bytes_to_long(base64.b64decode(e))
    key = rsa.PublicKey(N, E)
    return rsa.encrypt(msg.encode("UTF-8"), key)


def reset_runtime_state():
    global \
        bh_id, \
        xsbj, \
        njdm_id, \
        xkxnm, \
        xkxqm, \
        xqh_id, \
        jg_id, \
        zyfx_id, \
        xbm, \
        xslbdm, \
        mzm, \
        xz, \
        ccdm, \
        max_credit_limit, \
        current_credit_display
    bh_id = ""
    xsbj = ""
    njdm_id = ""
    xkxnm = ""
    xkxqm = ""
    xqh_id = ""
    jg_id = ""
    zyfx_id = ""
    xbm = ""
    xslbdm = ""
    mzm = ""
    xz = ""
    ccdm = ""
    max_credit_limit = 0.0
    current_credit_display = 0.0


def load_saved_credentials():
    if not CREDENTIALS_FILE.exists():
        return None
    try:
        data = json.loads(CREDENTIALS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return None
    if not isinstance(data, dict):
        return None
    student_number = str(data.get("student_number", "")).strip()
    password = str(data.get("password", ""))
    if not student_number or not password:
        return None
    return {"student_number": student_number, "password": password}


def save_credentials(student_number: str, password: str):
    data = {"student_number": student_number, "password": password}
    CREDENTIALS_FILE.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def mask_student_number(student_number: str):
    if len(student_number) <= 4:
        return "*" * len(student_number)
    return f"{student_number[:2]}{'*' * (len(student_number) - 4)}{student_number[-2:]}"


def make_simple_table(title: str, *, show_header: bool = True):
    return Table(
        title=title,
        box=box.SIMPLE,
        show_lines=False,
        show_header=show_header,
        expand=True,
    )


def set_request_logger(logger):
    global request_logger
    request_logger = logger


def _format_request_path(url: str) -> str:
    try:
        from urllib.parse import urlsplit

        split = urlsplit(url)
        return f"{split.path}{('?' + split.query) if split.query else ''}"
    except Exception:
        return url


def _log_request_start(method: str, url: str):
    if request_logger is None:
        return
    request_logger(Text(f"{method.upper()} {_format_request_path(url)}", style="dim"))


def http_get(url: str, **kwargs):
    _log_request_start("GET", url)
    return sess.get(url, **kwargs)


def http_post(url: str, **kwargs):
    _log_request_start("POST", url)
    return sess.post(url, **kwargs)


def format_log_with_prefix(prefix: str, message: str, width: int) -> str:
    content_width = max(20, width - len(prefix))
    lines = []
    for raw_line in str(message).splitlines() or [""]:
        wrapped = textwrap.wrap(
            raw_line,
            width=content_width,
            replace_whitespace=False,
            drop_whitespace=False,
        )
        if not wrapped:
            lines.append(prefix)
            continue
        lines.append(f"{prefix}{wrapped[0]}")
        indent = " " * len(prefix)
        for part in wrapped[1:]:
            lines.append(f"{indent}{part}")
    return "\n".join(lines)


def style_category_label(label: str) -> str:
    return f"[yellow]{label}[/]"


def style_course_label(label: str, selected: bool) -> str:
    color = "green" if selected else "blue"
    suffix = " (已选)" if selected else ""
    return f"[{color}]{label}{suffix}[/]"


def get_course_credit_text(course_info_list) -> str:
    if not course_info_list:
        return ""
    first = course_info_list[0]
    return format_credit_text(first.get("xf") or first.get("jxbxf"))


def build_course_node_label(
    course_name: str, kch_id: str, course_info_list, class_count: int, selected: bool
) -> str:
    return style_course_label(
        build_course_tree_label(
            course_name, kch_id, get_course_credit_text(course_info_list), class_count
        ),
        selected,
    )


def is_selected_class_pair(
    clz: dict, detail: dict, selected_class_ids, selected_do_jxb_ids
) -> bool:
    jxb_id = str(clz.get("jxb_id", detail.get("jxb_id", "")))
    do_jxb_id = str(clz.get("do_jxb_id", detail.get("do_jxb_id", "")))
    return jxb_id in selected_class_ids or do_jxb_id in selected_do_jxb_ids


def format_week_ranges(weeks: list[int]) -> str:
    if not weeks:
        return ""
    ordered = sorted(set(weeks))
    ranges = []
    start = ordered[0]
    end = ordered[0]
    for week in ordered[1:]:
        if week == end + 1:
            end = week
            continue
        ranges.append((start, end))
        start = end = week
    ranges.append((start, end))
    parts = []
    for start, end in ranges:
        if start == end:
            parts.append(f"第{start}周")
        else:
            parts.append(f"第{start}-{end}周")
    return ", ".join(parts)


def parse_teacher_display(jsxx: str) -> tuple[str, str]:
    if not jsxx:
        return "", ""
    names = []
    titles = []
    for teacher in jsxx.split(";"):
        teacher = teacher.strip()
        if not teacher:
            continue
        parts = [part.strip() for part in teacher.split("/")]
        if len(parts) >= 2 and parts[1]:
            names.append(parts[1])
        elif parts and parts[0]:
            names.append(parts[0])
        if len(parts) >= 3 and parts[2]:
            titles.append(parts[2])
    return "、".join(names), "、".join(titles)


def format_teacher_summary_dim_title(jsxx: str) -> str:
    if not jsxx:
        return "未标注教师"
    parts_out = []
    for teacher in jsxx.split(";"):
        teacher = teacher.strip()
        if not teacher:
            continue
        parts = [part.strip() for part in teacher.split("/")]
        name = parts[1] if len(parts) >= 2 and parts[1] else (parts[0] if parts else "")
        title = parts[2] if len(parts) >= 3 and parts[2] else ""
        if name and title:
            parts_out.append(f"{name}/[dim]{title}[/dim]")
        elif name:
            parts_out.append(name)
        elif title:
            parts_out.append(f"[dim]{title}[/dim]")
    return "、".join(parts_out) or "未标注教师"


def format_course_name_cell(course_name: str, kch_id: str, class_no: str) -> str:
    ids = "/".join(part for part in [kch_id, class_no] if part)
    if not ids:
        return course_name
    return f"{course_name}\n[dim]{ids}[/dim]"


def format_teacher_cell(teacher_name: str, teacher_title: str) -> str:
    if teacher_name and teacher_title:
        return f"{teacher_name}\n[dim]{teacher_title}[/dim]"
    if teacher_name:
        return teacher_name
    if teacher_title:
        return f"[dim]{teacher_title}[/dim]"
    return ""


def extract_class_no(jxbmc: str) -> str:
    if not jxbmc:
        return ""
    match = re.search(r"-(\d{5})\s*$", jxbmc)
    if match:
        return match.group(1)
    return ""


def format_credit_text(credit_value) -> str:
    if credit_value in (None, ""):
        return ""
    try:
        return f"{float(str(credit_value).strip()):.1f}"
    except Exception:
        return str(credit_value).strip()


def first_non_empty(*values) -> str:
    for value in values:
        if value not in (None, ""):
            text = str(value).strip()
            if text:
                return text
    return ""


def build_course_tree_label(
    course_name: str, kch_id: str, credit_text: str, class_count: int
) -> str:
    credit_suffix = f" {credit_text}学分" if credit_text else ""
    return f"{course_name} [dim][{kch_id}][/dim]{credit_suffix} {class_count}教学班"


def build_class_tree_label(
    index: int, course_name: str, clz: dict, detail: dict
) -> str:
    class_no = extract_class_no(
        first_non_empty(clz.get("jxbmc"), detail.get("jxbmc"), course_name)
    ) or first_non_empty(
        clz.get("jxbh"), detail.get("jxbh"), clz.get("jxb_id"), detail.get("jxb_id")
    )
    teacher = format_teacher_summary_dim_title(
        first_non_empty(clz.get("jsxx"), detail.get("jsxx"))
    )
    sksj = first_non_empty(clz.get("sksj"), detail.get("sksj"))
    location = first_non_empty(clz.get("jxdd"), detail.get("jxdd"))
    time_loc = f"{sksj} @ {location}" if sksj and location else (sksj or location)
    course_property = (
        first_non_empty(
            clz.get("kcxzmc"),
            detail.get("kcxzmc"),
            clz.get("kclbmc"),
            detail.get("kclbmc"),
            clz.get("kcxz"),
            detail.get("kcxz"),
        )
        or "未标注性质"
    )
    selected = first_non_empty(detail.get("yxzrs"), clz.get("yxzrs")) or "?"
    total = (
        first_non_empty(
            clz.get("jxbrl"), detail.get("jxbrl"), clz.get("jxbrs"), detail.get("jxbrs")
        )
        or "?"
    )
    count_text = f"{selected}/{total}"
    try:
        if int(selected) < int(total):
            count_text = f"[spring_green3]{count_text}[/]"
    except Exception:
        pass
    return f"{index}. {class_no} | {teacher} | {time_loc} | {course_property} | {count_text}"


def make_detail_table(title: str):
    table = make_simple_table(title)
    table.add_column("字段", style="cyan", width=12)
    table.add_column("内容", overflow="fold")
    return table


def add_detail_row(table: Table, label: str, *values):
    value = first_non_empty(*values) or "-"
    table.add_row(label, value)


def build_class_detail_table(course_name: str, clz: dict, detail: dict) -> Table:
    jxbmc = first_non_empty(clz.get("jxbmc"), detail.get("jxbmc"), course_name)
    class_no = extract_class_no(jxbmc) or first_non_empty(
        clz.get("jxbh"), detail.get("jxbh"), clz.get("jxb_id"), detail.get("jxb_id")
    )
    selected = first_non_empty(detail.get("yxzrs"), clz.get("yxzrs")) or "?"
    total = (
        first_non_empty(
            clz.get("jxbrl"), detail.get("jxbrl"), clz.get("jxbrs"), detail.get("jxbrs")
        )
        or "?"
    )
    table = make_detail_table(course_name)
    add_detail_row(table, "教学班", class_no)
    add_detail_row(
        table,
        "上课教师",
        format_teacher_summary_dim_title(
            first_non_empty(clz.get("jsxx"), detail.get("jsxx"))
        ),
    )
    add_detail_row(table, "上课时间", clz.get("sksj"), detail.get("sksj"))
    add_detail_row(table, "教学地点", clz.get("jxdd"), detail.get("jxdd"))
    add_detail_row(
        table,
        "开课学院",
        clz.get("kkxymc"),
        detail.get("kkxymc"),
        clz.get("kkxy"),
        detail.get("kkxy"),
        clz.get("yxmc"),
        detail.get("yxmc"),
    )
    add_detail_row(
        table,
        "选课备注",
        clz.get("xkbz"),
        detail.get("xkbz"),
        clz.get("bz"),
        detail.get("bz"),
    )
    add_detail_row(
        table,
        "课程类别",
        clz.get("kklxmc"),
        detail.get("kklxmc"),
        clz.get("kclbmc"),
        detail.get("kclbmc"),
    )
    add_detail_row(
        table,
        "课程性质",
        clz.get("kcxzmc"),
        detail.get("kcxzmc"),
        clz.get("kcxz"),
        detail.get("kcxz"),
    )
    add_detail_row(
        table,
        "教学模式",
        clz.get("jxms"),
        detail.get("jxms"),
        clz.get("jxfs"),
        detail.get("jxfs"),
    )
    add_detail_row(table, "已选/容量", f"{selected}/{total}")
    return table


def build_node_detail_renderable(node_data) -> object:
    node_type = node_data.get("type")
    if node_type == "class":
        clz, detail = node_data.get("class_pair", ({}, {}))
        return build_class_detail_table(
            node_data.get("course_name", "教学班详情"), clz, detail
        )
    if node_type == "course":
        return Panel("[dim]暂未定义课程节点操作，仅可关闭。[/]", title="课程")
    if node_type == "category":
        return Panel("[dim]暂未定义分类节点操作，仅可关闭。[/]", title="分类")
    return Panel("[dim]暂无可用信息。[/]", title="详情")


def node_is_selected_class(node_data, selected_class_ids, selected_do_jxb_ids) -> bool:
    if node_data.get("type") != "class":
        return False
    clz, detail = node_data.get("class_pair", ({}, {}))
    jxb_id = str(clz.get("jxb_id", detail.get("jxb_id", "")))
    do_jxb_id = str(clz.get("do_jxb_id", detail.get("do_jxb_id", "")))
    return jxb_id in selected_class_ids or do_jxb_id in selected_do_jxb_ids


def test_base_url(target_base_url: str):
    public_key = target_base_url.rstrip("/") + "/jwglxt/xtgl/login_getPublicKey.html"
    start = time.perf_counter()
    try:
        res = http_get(public_key, headers=header, timeout=5)
        duration = time.perf_counter() - start
        if res.status_code != 200:
            return False, f"HTTP {res.status_code} ({duration:.2f}s)"
        data = json.loads(res.text.lstrip("\ufeff"))
        if "modulus" in data and "exponent" in data:
            return True, f"公钥接口正常 ({duration:.2f}s)"
        return False, f"响应缺少公钥字段 ({duration:.2f}s)"
    except Exception as e:
        duration = time.perf_counter() - start
        return False, f"{e} ({duration:.2f}s)"


def select_base_url():
    global base_url
    while True:
        table = make_simple_table("选择教务系统地址")
        table.expand = False
        table.add_column("编号", style="cyan", width=6)
        table.add_column("地址", style="green")
        table.add_column("说明", style="white")
        for idx, url, description in ADDRESS_CHOICES:
            table.add_row(idx, url, description)
        table.add_row("5", "自定义输入", "手动输入完整地址")
        table.add_row("t", "测试地址", "测试内置地址连通性")
        console.print(table)
        choice = Prompt.ask("请输入编号", default="1").strip().lower()
        if choice == "t":
            test_table = make_simple_table("地址测试结果")
            test_table.expand = False
            test_table.add_column("地址", style="green")
            test_table.add_column("结果", style="bold")
            test_table.add_column("详情", style="white")
            for _, url, _ in ADDRESS_CHOICES:
                ok, detail = test_base_url(url)
                test_table.add_row(url, "可用" if ok else "失败", detail)
            console.print(test_table)
            continue
        if choice == "5":
            custom_url = (
                Prompt.ask("请输入完整 base_url", default=base_url).strip().rstrip("/")
            )
            if not custom_url:
                console.print("[bold red]地址不能为空[/]")
                continue
            base_url = custom_url
        else:
            selected = next(
                (item for item in ADDRESS_CHOICES if item[0] == choice), None
            )
            if not selected:
                console.print("[bold red]无效编号，请重试[/]")
                continue
            base_url = selected[1]
        return


def choose_credentials():
    saved = load_saved_credentials()
    if saved and Confirm.ask(
        f"使用已保存的凭据登录？({mask_student_number(saved['student_number'])})",
        default=True,
    ):
        return saved, False
    student_number = Prompt.ask("请输入学号", default=STUDENT_NUMBER).strip()
    password = Prompt.ask("请输入密码", password=True, default=PASSWORD)
    return {"student_number": student_number, "password": password}, True


def bootstrap_login():
    global STUDENT_NUMBER, PASSWORD, is_authenticated
    select_base_url()
    while True:
        creds, is_new_input = choose_credentials()
        STUDENT_NUMBER = creds["student_number"]
        PASSWORD = creds["password"]
        reset_runtime_state()
        sess.cookies.clear()
        console.print(
            Panel.fit(
                f"正在使用 {base_url} 登录 {mask_student_number(STUDENT_NUMBER)}",
                title="登录中",
                border_style="cyan",
            )
        )
        if do_login(
            lambda renderable: console.print(renderable),
            lambda msg: console.print(f"[dim]{msg}[/]"),
        ):
            is_authenticated = True
            if is_new_input and Confirm.ask(
                "登录成功，是否保存这组账号密码？", default=False
            ):
                try:
                    save_credentials(STUDENT_NUMBER, PASSWORD)
                    console.print("[bold green]凭据已保存[/]")
                except Exception as e:
                    console.print(f"[bold red]保存凭据失败: {e}[/]")
            return True
        console.print("[bold red]登录失败，请重新选择凭据[/]")
        if not Confirm.ask("是否重试登录？", default=True):
            return False


def do_login(log_func, debug_func):
    public_key = base_url + "/jwglxt/xtgl/login_getPublicKey.html"
    login_url = base_url + "/jwglxt/xtgl/login_slogin.html"
    try:
        debug_func("正在获取公钥...")
        res = http_get(public_key, headers=header, timeout=5)
        if res.status_code != 200:
            res = http_get(public_key, headers=header, timeout=5)
        key = res.json()
        mm = base64.b64encode(
            rsa_encryption(key["modulus"], key["exponent"], PASSWORD)
        ).decode()
        data = {"language": "zh_CN", "yhm": STUDENT_NUMBER, "mm": mm}
        debug_func("正在提交登录表单...")
        req = http_post(
            url=login_url, headers=header, data=data, allow_redirects=False, timeout=5
        )
        if req.status_code == 302:
            log_func(Text("登录成功！", style="bold green"))
            debug_func("登录成功 (302 Redirect)")
            return True
        else:
            log_func(Text(f"登录失败 状态码: {req.status_code}", style="bold red"))
            debug_func(f"登录失败: {req.text}")
            return False
    except Exception as e:
        log_func(Text(f"登录异常: {e}", style="bold red"))
        debug_func(f"Exception: {e}[/]")
        return False


def fetch_big_list(log_func, debug_func):
    global \
        bh_id, \
        xsbj, \
        njdm_id, \
        xkxnm, \
        xkxqm, \
        xqh_id, \
        jg_id, \
        zyfx_id, \
        xbm, \
        xslbdm, \
        mzm, \
        xz, \
        ccdm, \
        max_credit_limit, \
        current_credit_display
    try:
        debug_func("GET zzxkyzb_cxZzxkYzbIndex.html")
        text = http_get(
            base_url + "/jwglxt/xsxk/zzxkyzb_cxZzxkYzbIndex.html?gnmkdm=N253512",
            timeout=8,
        ).text
        if "您不在可选课名单中" in text:
            log_func(Text("错误：当前不在选课名单中", style="bold red"))
            return []
        if bh_id == "":
            try:
                bh_id = re.findall(r'id="bh_id" value="(.*)"', text)[0]
                xsbj = re.findall(r'id="xsbj" value="(.*)"', text)[0]
                njdm_id = re.findall(r'id="njdm_id" value="(.*)"', text)[0]
                xkxnm = re.findall(r'id="xkxnm" value="(.*)"', text)[0]
                xkxqm = re.findall(r'id="xkxqm" value="(.*)"', text)[0]
                xqh_id = re.findall(r'id="xqh_id" value="(.*)"', text)[0]
                jg_id = re.findall(r'id="jg_id_1" value="(.*)"', text)[0]
                zyfx_id = re.findall(r'id="zyfx_id" value="(.*)"', text)[0]
                xbm = re.findall(r'id="xbm" value="(.*)"', text)[0]
                xslbdm = re.findall(r'id="xslbdm" value="(.*)"', text)[0]
                mzm = re.findall(r'id="mzm" value="(.*)"', text)[0]
                xz = re.findall(r'id="xz" value="(.*)"', text)[0]
                ccdm = re.findall(r'id="ccdm" value="(.*)"', text)[0]
                max_credit_match = re.findall(r'id="xkzgxf" value="(.*?)"', text)
                current_credit_match = re.findall(r'id="zxfs" value="(.*?)"', text)
                if max_credit_match:
                    try:
                        max_credit_limit = float(max_credit_match[0] or 0)
                    except Exception:
                        max_credit_limit = 0.0
                if current_credit_match:
                    try:
                        current_credit_display = float(current_credit_match[0] or 0)
                    except Exception:
                        current_credit_display = 0.0
                debug_func("页面参数解析成功")
            except:
                log_func(Text("解析页面参数失败，请检查是否登录", style="bold red"))
                debug_func("参数解析失败[/]")
                return []
        lst = re.findall(r'onclick="queryCourse\((.*)\)', text)
        lst = [_.replace("'", "").split(",")[1:] for _ in lst]
        idx = 0
        final_list = []
        for c in re.findall(r'role="tab" data-toggle="tab">(.*)</a>', text):
            final_list.append([c] + lst[idx])
            idx += 1
        return final_list
    except Exception as e:
        log_func(Text(f"获取列表异常: {e}", style="bold red"))
        debug_func(f"获取大类异常: {e}[/]")
        return []


def fetch_small_list(target, log_func, debug_func, page=1):
    rwlx = "1" if target[0] == "主修课程" else "2"
    zyh_id = target[4]
    kklxdm = target[1]
    grade = target[3]
    xkkz_id = target[2]
    start = (page - 1) * COURSE_PAGE_SIZE + 1
    end = page * COURSE_PAGE_SIZE
    url = base_url + "/jwglxt/xsxk/zzxkyzb_cxZzxkYzbPartDisplay.html?gnmkdm=N253512"
    data = {
        "xklc": "3",
        "rwlx": rwlx,
        "xkly": "1",
        "bklx_id": "0",
        "sfkkjyxdxnxq": "0",
        "xqh_id": xqh_id,
        "jg_id": jg_id,
        "njdm_id_1": grade,
        "zyh_id_1": zyh_id,
        "zyh_id": zyh_id,
        "zyfx_id": zyfx_id,
        "njdm_id": grade,
        "bh_id": bh_id,
        "bjgkczxbbjwcx": "0",
        "xbm": xbm,
        "xslbdm": xslbdm,
        "mzm": mzm,
        "xz": xz,
        "ccdm": ccdm,
        "xsbj": xsbj,
        "sfkknj": "1",
        "sfkkzy": "1",
        "kzybkxy": "0",
        "sfznkx": "0",
        "zdkxms": "1",
        "sfkxq": "0",
        "sfkcfx": "0",
        "kkbk": "1",
        "kkbkdj": "0",
        "sfkgbcx": "1",
        "sfrxtgkcxd": "1",
        "tykczgxdcs": "0",
        "xkxnm": xkxnm,
        "xkxqm": xkxqm,
        "kklxdm": kklxdm,
        "bbhzxjxb": "0",
        "xkkz_id": xkkz_id,
        "rlkz": "0",
        "xkzgbj": "0",
        "kspage": str(start),
        "jspage": str(end),
        "jxbzb": "",
    }
    try:
        debug_func(f"Fetch small list: {target[0]} [range {start}-{end}]")
        req = http_post(url=url, data=data, timeout=10).json()
        ret_data = {}
        if "tmpList" in req:
            for clz in req["tmpList"]:
                if clz["kch_id"] in ret_data:
                    ret_data[clz["kch_id"]].append(clz)
                else:
                    ret_data[clz["kch_id"]] = [clz]
        item_count = len(req.get("tmpList", []))
        return {
            "courses": ret_data,
            "page": page,
            "count": item_count,
            "has_more": item_count >= COURSE_PAGE_SIZE,
            "next_page": page + 1,
        }
    except Exception as e:
        log_func(Text(f"获取课程详情失败: {e}", style="bold red"))
        debug_func(f"获取小类异常: {e}[/]")
        return {
            "courses": {},
            "page": page,
            "count": 0,
            "has_more": False,
            "next_page": page,
        }


def fetch_class_detail_and_plan(
    kklxdm, kch_id, zyh_id, xkkz_id, rwlx, log_func, debug_func
):
    q_url = base_url + "/jwglxt/xsxk/zzxkyzbjk_cxJxbWithKchZzxkYzb.html?gnmkdm=N253512"
    qk_data = {
        "rwlx": rwlx,
        "xkly": "1",
        "bklx_id": "0",
        "sfkkjyxdxnxq": "0",
        "xqh_id": xqh_id,
        "jg_id": jg_id,
        "zyh_id": zyh_id,
        "zyfx_id": zyfx_id,
        "njdm_id": njdm_id,
        "bh_id": bh_id,
        "xbm": xbm,
        "xslbdm": xslbdm,
        "mzm": mzm,
        "xz": xz,
        "ccdm": ccdm,
        "xsbj": xsbj,
        "sfkknj": "1",
        "sfkkzy": "1",
        "kzybkxy": "0",
        "sfznkx": "0",
        "zdkxms": "1",
        "sfkxq": "0",
        "sfkcfx": "0",
        "bbhzxjxb": "0",
        "kkbk": "0",
        "kkbkdj": "0",
        "xkxnm": xkxnm,
        "xkxqm": xkxqm,
        "xkxskcgskg": "0",
        "rlkz": "0",
        "kklxdm": kklxdm,
        "kch_id": kch_id,
        "jxbzcxskg": "0",
        "xkkz_id": xkkz_id,
        "cxbj": "0",
        "fxbj": "0",
    }
    try:
        debug_func(f"查询班级详情: KCH={kch_id}")
        req = http_post(url=q_url, data=qk_data, timeout=8)
        return req.json()
    except requests.Timeout:
        debug_func(f"[bold red]!!! TIMEOUT (KCH={kch_id}) - 可能被Ban或网络卡顿 !!![/]")
        return None
    except Exception as e:
        debug_func(f"查询详情异常: {e}[/]")
        return None


def execute_choose(
    jxb_id, kch_id, kcmc, rwlx, xkkz_id, grade, zyh_id, kklxdm, debug_func
):
    qk_url = base_url + "/jwglxt/xsxk/zzxkyzbjk_xkBcZyZzxkYzb.html?gnmkdm=N253512"
    qk_data = {
        "jxb_ids": jxb_id,
        "kch_id": kch_id,
        "kcmc": kcmc,
        "rwlx": rwlx,
        "rlkz": "0",
        "rlzlkz": "0",
        "sxbj": "0",
        "xxkbj": "0",
        "qz": "0",
        "cxbj": "0",
        "xkkz_id": xkkz_id,
        "njdm_id": grade,
        "zyh_id": zyh_id,
        "kklxdm": kklxdm,
        "xklc": "1",
        "xkxnm": xkxnm,
        "xkxqm": xkxqm,
    }
    try:
        debug_func(f"发送选课请求: JXB={jxb_id}")
        return http_post(url=qk_url, data=qk_data, timeout=5)
    except Exception as e:
        debug_func(f"选课请求异常: {e}[/]")
        return None


def execute_withdraw(jxb_id, kch_id, debug_func):
    tk_url = base_url + "/jwglxt/xsxk/zzxkyzb_tuikBcZzxkYzb.html?gnmkdm=N253512"
    tk_data = {
        "kch_id": kch_id,
        "jxb_ids": jxb_id,
        "xkxnm": xkxnm,
        "xkxqm": xkxqm,
        "txbsfrl": "0",
    }
    try:
        debug_func(f"发送退课请求: JXB={jxb_id}")
        return http_post(url=tk_url, data=tk_data, timeout=5)
    except Exception as e:
        debug_func(f"退课请求异常: {e}[/]")
        return None


def make_category_key(target):
    return tuple(target)


def merge_class_data(class_list_req, course_info_list):
    final_data = []
    detail_by_jxb_id = {
        item.get("jxb_id"): item for item in course_info_list if item.get("jxb_id")
    }
    if detail_by_jxb_id:
        for clz in class_list_req:
            detail = detail_by_jxb_id.get(clz.get("jxb_id"))
            if detail is not None:
                final_data.append([clz, detail])
    if final_data:
        return final_data
    for clz, detail in zip(class_list_req, course_info_list):
        final_data.append([clz, detail])
    return final_data


def fetch_choosed_list(log_func=None, debug_func=None):
    url = base_url + "/jwglxt/xsxk/zzxkyzb_cxZzxkYzbChoosedDisplay.html?gnmkdm=N253512"
    data = {
        "jg_id": jg_id,
        "njdm_id": njdm_id,
        "zyfx_id": zyfx_id,
        "bh_id": bh_id,
        "xz": xz,
        "ccdm": ccdm,
        "xqh_id": xqh_id,
        "xkxnm": xkxnm,
        "xkxqm": xkxqm,
        "xkly": "1",
    }
    try:
        if debug_func:
            debug_func("GET ChoosedDisplay")
        res = http_post(url=url, data=data, timeout=10)
        return res.json()
    except Exception as e:
        if log_func:
            log_func(Text(f"获取已选课程失败: {e}", style="bold red"))
        return []
    for clz, detail in zip(class_list_req, course_info_list):
        final_data.append([clz, detail])
    return final_data


WEEKDAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
MAX_WEEK = 19
MAX_JIECI = 13
COURSE_PAGE_SIZE = 50


def parse_sksj_to_slots(sksj_str):
    if not sksj_str or "星期" not in sksj_str:
        return []
    slots = []
    for part in sksj_str.replace("<br/>", ", ").split(", "):
        try:
            m = re.findall(r"星期(.*)第(.*)节{(.*)}", part)
            if not m:
                continue
            day_ch, jieci_str, week_str = m[0]
            day = num_map.get(day_ch)
            if day is None:
                continue
            jiecis = []
            for j in jieci_str.split(","):
                if "-" in j:
                    a, b = j.split("-")
                    jiecis.extend(range(int(a), int(b) + 1))
                else:
                    jiecis.append(int(j))
            weeks = []
            is_odd = "(单)" in week_str
            is_even = "(双)" in week_str
            wc = week_str.replace("(单)", "").replace("(双)", "").replace("周", "")
            if "-" in wc:
                ws, we = wc.split("-")
                all_w = range(int(ws), int(we) + 1)
            else:
                all_w = [int(wc)]
            for w in all_w:
                if is_odd and w % 2 != 1:
                    continue
                if is_even and w % 2 != 0:
                    continue
                weeks.append(w)
            for w in weeks:
                for j in jiecis:
                    slots.append((w, day, j))
        except Exception:
            continue
    return slots


class ContextMenuScreen(ModalScreen):
    BINDINGS = [("escape", "close_screen", "Close")]
    CSS = """
    ContextMenuScreen {
        align: center middle;
        background: $background 20%;
    }
    .context-menu-panel {
        background: $surface;
        border: thick $primary;
        padding: 1 2;
        width: 72;
        max-width: 80%;
        height: auto;
    }
    """

    def __init__(self, node_data, is_selected=False, **kwargs):
        super().__init__(**kwargs)
        self.node_data = node_data
        self.is_selected = is_selected
        self.enter_armed = False
        self.button_ids = []

    def on_mount(self) -> None:
        self.button_ids = [button.id for button in self.query(Button) if button.id]
        self.set_focus(self.query_one("#ctx-close", Button))
        self.set_timer(0.1, self._arm_enter)

    def _arm_enter(self) -> None:
        self.enter_armed = True

    def on_key(self, event) -> None:
        if event.key == "enter" and not self.enter_armed:
            event.stop()
            return
        if event.key in {"up", "down"}:
            self._move_button_focus(-1 if event.key == "up" else 1)
            event.stop()

    def _move_button_focus(self, step: int) -> None:
        if not self.button_ids:
            return
        focused_id = getattr(self.focused, "id", None)
        if focused_id not in self.button_ids:
            target_id = self.button_ids[-1] if step < 0 else self.button_ids[0]
        else:
            idx = self.button_ids.index(focused_id)
            target_id = self.button_ids[(idx + step) % len(self.button_ids)]
        self.set_focus(self.query_one(f"#{target_id}", Button))

    def compose(self) -> ComposeResult:
        with Container(classes="context-menu-panel"):
            yield Static("[bold]操作菜单[/]", id="ctx-title")
            yield Static(f"选中: {self.node_data.get('type', '?')}", id="ctx-info")
            yield Static(build_node_detail_renderable(self.node_data), id="ctx-empty")
            if self.node_data.get("type") == "class":
                yield Button(
                    "退课" if self.is_selected else "选课",
                    variant="success",
                    id="ctx-action",
                )
            yield Button("关闭", variant="primary", id="ctx-close")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if not self.enter_armed:
            return
        if event.button.id == "ctx-action":
            self.dismiss("action")
            return
        if event.button.id == "ctx-close":
            self.dismiss()

    def action_close_screen(self):
        self.dismiss()


# --- App 界面类 ---


class CourseApp(App):
    BINDINGS = [("enter", "open_context_menu", "操作菜单")]

    CSS = """
    Screen {
        layout: vertical;
    }
    .header-box {
        background: $primary;
        color: white;
        content-align: center middle;
        text-style: bold;
        height: 1;
    }
    #main-container {
        layout: horizontal;
        height: 1fr;
    }
    #left-pane {
        width: 65%;
        height: 100%;
        border-right: solid $panel;
    }
    #right-pane {
        width: 35%;
        height: 100%;
        layout: vertical;
    }
    #course_tree {
        height: 1fr;
    }
    #tree-toolbar {
        height: 1;
        layout: horizontal;
        background: $surface-darken-1;
        padding: 0 1;
    }
    #tree-toolbar Static {
        width: auto;
    }
    #tree-toolbar Button {
        height: 1;
        min-width: 0;
        margin: 0;
        padding: 0 1;
    }
    TabbedContent {
        height: 1fr;
    }
    #tab-timetable > Vertical {
        height: 1fr;
    }
    #timetable {
        width: 100%;
        height: auto;
        max-height: 16;
    }
    #week-controls {
        height: 1;
        layout: horizontal;
        padding: 0 1;
    }
    #week-controls Static {
        height: 1;
        padding: 0 1;
        width: auto;
    }
    .week-nav {
        height: 1;
        padding: 0 1;
        color: $text;
    }
    #week-label {
        width: auto;
        content-align: center middle;
    }
    #week-credit {
        width: auto;
        content-align: center middle;
        color: $text-muted;
    }
    #week-refresh {
        color: $text-muted;
    }
    #week-info {
        display: none;
    }
    RichLog {
        background: $surface;
        overflow-y: scroll;
        scrollbar-gutter: stable;
    }
    #logger {
        height: 1fr;
    }
    #timetable-detail {
        height: 1fr;
        min-height: 5;
        border-top: solid $panel;
        padding: 0 1;
    }
    #timetable-detail-content {
        width: 100%;
        height: auto;
    }
    Input {
        dock: bottom;
        border: solid blue;
    }
    .context-menu-panel {
        background: $surface;
        border: thick $primary;
        padding: 1 2;
        width: 40;
        height: auto;
    }
    .hidden {
        display: none;
    }
    """

    big_list_cache = []
    current_small_list = {}
    current_small_list_keys = []
    current_context = {}
    category_course_cache = {}
    course_class_cache = {}
    display_week = 1
    filter_no_conflict = False
    timetable_entries = []
    timetable_day_width = 10
    selected_timetable_cell = None
    selected_course_ids = set()
    selected_class_ids = set()
    selected_do_jxb_ids = set()
    current_credit = 0.0
    max_credit = 32.0
    refresh_status = ""

    def compose(self) -> ComposeResult:
        yield Static("ZJNU 抢课终端", classes="header-box")
        with Container(id="main-container"):
            with Container(id="left-pane"):
                with TabbedContent():
                    with TabPane("课程树", id="tab-tree"):
                        with Vertical():
                            with Horizontal(id="tree-toolbar"):
                                yield Button("[bold]显示选项[/]", id="btn-display-opts")
                                yield Static("", id="toolbar-status")
                            yield Tree("课程分类", id="course_tree")
                    with TabPane("当前课表", id="tab-timetable"):
                        with Vertical():
                            with Horizontal(id="week-controls"):
                                yield Static(
                                    "上一周", id="week-prev", classes="week-nav"
                                )
                                yield Static(f"第 1/{MAX_WEEK} 周", id="week-label")
                                yield Static(
                                    "下一周", id="week-next", classes="week-nav"
                                )
                                yield Static("学分0.0/32", id="week-credit")
                                yield Static(
                                    "刷新", id="week-refresh", classes="week-nav"
                                )
                                yield Static("", id="week-info")
                            yield DataTable(id="timetable")
                            with VerticalScroll(id="timetable-detail"):
                                yield Static("", id="timetable-detail-content")
            with Container(id="right-pane"):
                yield RichLog(id="logger", highlight=True, wrap=True)
        yield Footer()

    def on_mount(self) -> None:
        tree = self.get_tree()
        tree.show_root = False
        tree.root.expand()
        self.set_focus(tree)
        set_request_logger(self.debug_write)
        self.init_timetable()
        self.call_after_refresh(self.refresh_timetable_layout)
        self.debug_write("Client Initialized[/]")
        self.log_write(Text("系统启动中...", style="yellow"))
        if not STUDENT_NUMBER:
            self.log_write(Text("警告: 请先在代码中填写学号和密码！", style="bold red"))
        elif is_authenticated:
            self.log_write(Text(f"已登录，当前地址: {base_url}", style="bold green"))
            self.log_write("正在获取课程列表...")
            self.action_fetch_big_list()
        else:
            self.action_auto_login()

    def on_button_pressed(self, event: Button.Pressed) -> None:
        btn_id = event.button.id
        if btn_id == "btn-display-opts":
            self.filter_no_conflict = not self.filter_no_conflict
            self.query_one("#toolbar-status", Static).update(
                f"过滤冲突: {'开' if self.filter_no_conflict else '关'}"
            )
            if self.filter_no_conflict:
                self.apply_tree_filter()
            else:
                tree = self.get_tree()
                for cat_node in tree.root.children:
                    for course_node in cat_node.children:
                        course_node.remove_class("hidden")

    def on_key(self, event) -> None:
        if event.key != "enter":
            return
        if self.focused is not self.get_tree():
            return
        self.action_open_context_menu()
        event.stop()

    def get_tree(self):
        return self.query_one("#course_tree", Tree)

    def log_write(self, renderable):
        self.debug_write(renderable)

    def debug_write(self, msg):
        timestamp = time.strftime("%H:%M:%S", time.localtime())
        prefix = f"[{timestamp}] "
        logger = self.query_one("#logger", RichLog)
        width = max(40, logger.size.width or 40)
        if isinstance(msg, Text):
            renderable = Text(
                format_log_with_prefix(prefix, msg.plain, width),
                spans=list(msg.spans),
                style=msg.style,
                no_wrap=False,
                overflow="fold",
            )
        elif not isinstance(msg, str):
            logger.write(msg)
            return
        else:
            renderable = Text(
                format_log_with_prefix(prefix, str(msg), width),
                no_wrap=False,
                overflow="fold",
            )
        logger.write(renderable)

    def set_tree_placeholder(self, message: str):
        tree = self.get_tree()
        tree.root.remove_children()
        tree.root.add_leaf(message, data={"type": "placeholder"})

    def init_timetable(self):
        self._rebuild_timetable()
        self.render_timetable()
        self.show_all_choosed()

    def _get_timetable_day_width(self) -> int:
        dt = self.query_one("#timetable", DataTable)
        width = dt.size.width
        if width <= 0:
            try:
                width = self.query_one("#tab-timetable").size.width
            except Exception:
                width = 0
        if width <= 0:
            return self.timetable_day_width
        usable_width = max(width - 8, 42)
        return max(6, usable_width // 7)

    def _rebuild_timetable(self):
        dt = self.query_one("#timetable", DataTable)
        dt.cursor_type = "cell"
        dt.show_cursor = False
        day_width = self._get_timetable_day_width()
        self.timetable_day_width = day_width
        placeholder = " " * day_width
        dt.clear(columns=True)
        dt.add_column("节次", key="jieci", width=4)
        for d in range(1, 8):
            dt.add_column(WEEKDAY_NAMES[d - 1], key=f"day{d}", width=day_width)
        for j in range(1, MAX_JIECI + 1):
            dt.add_row(str(j), key=f"j{j}", *[placeholder for _ in range(7)])

    def refresh_timetable_layout(self):
        day_width = self._get_timetable_day_width()
        if day_width == self.timetable_day_width:
            return
        self._rebuild_timetable()
        self.render_timetable()
        self._sync_timetable_cursor()

    def _sync_timetable_cursor(self):
        dt = self.query_one("#timetable", DataTable)
        if self.selected_timetable_cell is None:
            dt.show_cursor = False
            return
        row_key, col_key = self.selected_timetable_cell
        try:
            dt.cursor_coordinate = dt.get_cell_coordinate(row_key, col_key)
            dt.show_cursor = True
        except Exception:
            dt.show_cursor = False

    def on_resize(self, event) -> None:
        self.call_after_refresh(self.refresh_timetable_layout)

    def add_timetable_entry(self, name, sksj_str, entry_data=None):
        slots = parse_sksj_to_slots(sksj_str)
        if not slots:
            return
        self.timetable_entries.append(
            {
                "name": name,
                "sksj_raw": sksj_str,
                "slots": slots,
                "data": entry_data or {},
            }
        )
        self.render_timetable()

    def get_occupied_slots_for_week(self, week):
        occupied = {}
        for entry in self.timetable_entries:
            for w, day, jieci in entry["slots"]:
                if w == week:
                    key = (day, jieci)
                    if key not in occupied:
                        occupied[key] = []
                    occupied[key].append(entry["name"])
        return occupied

    def get_all_slots_for_cell(self, day, jieci):
        entries = []
        for entry in self.timetable_entries:
            for w, d, j in entry["slots"]:
                if d == day and j == jieci:
                    entries.append((w, entry))
        return entries

    def render_timetable(self):
        dt = self.query_one("#timetable", DataTable)
        week = self.display_week
        occupied = self.get_occupied_slots_for_week(week)
        has_other = {}
        for entry in self.timetable_entries:
            for w, d, j in entry["slots"]:
                if d is not None and j is not None and w != week:
                    has_other.setdefault((d, j), []).append((w, entry["name"]))
        week_label = self.query_one("#week-label", Static)
        week_label.update(f"第 {week}/{MAX_WEEK} 周")
        credit_label = self.query_one("#week-credit", Static)
        credit_label.update(f"学分{self.current_credit:.1f}/{self.max_credit:g}")
        for j in range(1, MAX_JIECI + 1):
            row_key = f"j{j}"
            for d in range(1, 8):
                col_key = f"day{d}"
                names = occupied.get((d, j))
                other = has_other.get((d, j))
                if names:
                    cell_text = "\n".join(names)
                elif other:
                    cell_text = f"[dim]{'、'.join(n for _, n in other[:2])}[/]"
                else:
                    cell_text = " " * self.timetable_day_width
                try:
                    dt.update_cell(row_key, col_key, cell_text)
                except Exception:
                    pass
        week_info = self.query_one("#week-info", Static)
        count = sum(len(v) for v in occupied.values())
        week_info.update(f"({count} 节课)")

    def show_timetable_detail(self, text):
        detail = self.query_one("#timetable-detail-content", Static)
        detail.update(text)

    def show_all_choosed(self):
        if not self.timetable_entries:
            table = make_simple_table("全部课程(0)")
            table.add_column("名称", overflow="fold")
            table.add_column("学分", overflow="fold")
            table.add_column("教师", overflow="fold")
            table.add_column("时间", overflow="fold")
            table.add_column("地点", overflow="fold")
            table.add_row("暂无已选课程", "", "", "", "")
            self.show_timetable_detail(table)
            return
        table = make_simple_table(f"全部课程({len(self.timetable_entries)})")
        table.add_column("名称", ratio=2, overflow="fold")
        table.add_column("学分", ratio=1, overflow="fold")
        table.add_column("教师", ratio=1, overflow="fold")
        table.add_column("时间", ratio=2, overflow="fold")
        table.add_column("地点", ratio=2, overflow="fold")
        for entry in self.timetable_entries:
            info = entry.get("data", {})
            name = format_course_name_cell(
                entry["name"], info.get("kch_id", ""), info.get("class_no", "")
            )
            credit = info.get("credit", "")
            teacher = format_teacher_cell(
                info.get("teacher_name", ""), info.get("teacher_title", "")
            )
            location = info.get("location", "")
            sksj = entry.get("sksj_raw", "")
            table.add_row(name, credit, teacher, sksj, location)
        self.show_timetable_detail(table)

    def clear_timetable_selection(self):
        self.selected_timetable_cell = None
        self._sync_timetable_cursor()
        self.show_all_choosed()

    def _show_timetable_cell_detail(self, row_key, col_key) -> None:
        if col_key == "jieci":
            self.show_all_choosed()
            return
        try:
            jieci = int(row_key.replace("j", ""))
        except Exception:
            self.show_all_choosed()
            return
        day = None
        for d in range(1, 8):
            if col_key == f"day{d}":
                day = d
                break
        if day is None:
            self.show_all_choosed()
            return
        entries = self.get_all_slots_for_cell(day, jieci)
        if not entries:
            self.show_all_choosed()
            return
        day_name = ["一", "二", "三", "四", "五", "六", "日"][day - 1]
        grouped = {}
        for w, entry in sorted(entries, key=lambda x: x[0]):
            info = entry.get("data", {})
            key = (
                format_course_name_cell(
                    entry["name"], info.get("kch_id", ""), info.get("class_no", "")
                ),
                info.get("credit", ""),
                format_teacher_cell(
                    info.get("teacher_name", ""), info.get("teacher_title", "")
                ),
                entry.get("sksj_raw", ""),
                info.get("location", ""),
            )
            grouped.setdefault(key, []).append(w)
        table = make_simple_table(f"周{day_name}第{jieci}节({len(grouped)})")
        table.add_column("名称", ratio=2, overflow="fold")
        table.add_column("学分", ratio=1, overflow="fold")
        table.add_column("教师", ratio=1, overflow="fold")
        table.add_column("周次", ratio=1, overflow="fold")
        table.add_column("时间", ratio=2, overflow="fold")
        table.add_column("地点", ratio=2, overflow="fold")
        for (name, credit, teacher, sksj, location), weeks in grouped.items():
            week_text = format_week_ranges(weeks)
            table.add_row(name, credit, teacher, week_text, sksj, location)
        self.show_timetable_detail(table)

    def on_data_table_cell_highlighted(self, event: DataTable.CellHighlighted) -> None:
        return

    def on_data_table_cell_selected(self, event: DataTable.CellSelected) -> None:
        return

    def _toggle_or_select_timetable_cell(self, row_key, col_key) -> None:
        current = (row_key, col_key)
        if self.selected_timetable_cell == current:
            self.clear_timetable_selection()
            return
        self.selected_timetable_cell = current
        self._sync_timetable_cursor()
        self._show_timetable_cell_detail(row_key, col_key)

    def on_click(self, event) -> None:
        widget_id = getattr(event.widget, "id", None)
        if widget_id == "week-prev":
            self.display_week = max(1, self.display_week - 1)
            self.render_timetable()
            return
        if widget_id == "week-refresh":
            self.fetch_timetable()
            return
        if widget_id == "week-next":
            self.display_week = min(MAX_WEEK, self.display_week + 1)
            self.render_timetable()
            return

    def on_mouse_down(self, event) -> None:
        dt = self.query_one("#timetable", DataTable)
        meta = getattr(event.style, "meta", None) or {}
        if "row" not in meta or "column" not in meta:
            return
        coordinate = Coordinate(meta["row"], meta["column"])
        if not dt.is_valid_coordinate(coordinate):
            return
        if dt.cursor_type != "cell":
            dt.cursor_type = "cell"
        dt.cursor_coordinate = coordinate
        cell_key = dt.coordinate_to_cell_key(coordinate)
        row_key = (
            cell_key.row_key.value
            if hasattr(cell_key.row_key, "value")
            else str(cell_key.row_key)
        )
        col_key = (
            cell_key.column_key.value
            if hasattr(cell_key.column_key, "value")
            else str(cell_key.column_key)
        )
        self._toggle_or_select_timetable_cell(row_key, col_key)

    def apply_tree_filter(self):
        if not self.filter_no_conflict:
            return
        occupied = set()
        for entry in self.timetable_entries:
            for w, day, jieci in entry["slots"]:
                occupied.add((day, jieci, w))
        tree = self.get_tree()
        for cat_node in tree.root.children:
            for course_node in cat_node.children:
                data = course_node.data or {}
                if data.get("type") != "course":
                    continue
                final_data = data.get("final_data")
                if not final_data:
                    course_node.set_class("hidden" if not data.get("loaded") else "")
                    continue
                has_no_conflict = False
                for clz, detail in final_data:
                    sksj = clz.get("sksj", "").replace("<br/>", ", ")
                    slots = parse_sksj_to_slots(sksj)
                    conflict = False
                    for w, day, jieci in slots:
                        if (day, jieci, w) in occupied:
                            conflict = True
                            break
                    if not conflict:
                        has_no_conflict = True
                        break
                if has_no_conflict:
                    course_node.remove_class("hidden")
                else:
                    course_node.set_class("hidden")

    def populate_big_tree(self):
        tree = self.get_tree()
        tree.root.remove_children()
        if not self.big_list_cache:
            tree.root.add_leaf("未获取到分类", data={"type": "placeholder"})
            return
        for target in self.big_list_cache:
            node = tree.root.add(
                style_category_label(target[0]),
                data={
                    "type": "category",
                    "target": target,
                    "loaded": False,
                    "loading": False,
                },
            )
            node.add_leaf("展开后加载课程", data={"type": "placeholder"})

    def activate_category_context(self, target_big):
        cache_key = make_category_key(target_big)
        category_state = self.category_course_cache.get(cache_key)
        if category_state is None:
            return
        small_list = category_state.get("courses", {})
        self.current_small_list = small_list
        self.current_small_list_keys = list(small_list.keys())
        self.current_context["target_big"] = target_big

    def build_extra_params(self, target_big):
        rwlx = "1" if target_big[0] == "主修课程" else "2"
        return [rwlx, target_big[2], target_big[3], target_big[4], target_big[1]]

    def populate_category_node(self, node, target, page_result, append=False):
        node.remove_children()
        node.data["loading"] = False
        cache_key = make_category_key(target)
        existing_state = self.category_course_cache.get(
            cache_key,
            {
                "courses": {},
                "loaded_count": 0,
                "has_more": False,
                "next_page": 2,
            },
        )
        merged_courses = dict(existing_state.get("courses", {})) if append else {}
        for kch_id, course_info_list in page_result.get("courses", {}).items():
            if kch_id in merged_courses:
                merged_courses[kch_id].extend(course_info_list)
            else:
                merged_courses[kch_id] = list(course_info_list)
        category_state = {
            "courses": merged_courses,
            "loaded_count": len(merged_courses),
            "has_more": page_result.get("has_more", False),
            "next_page": page_result.get("next_page", 2),
        }
        self.category_course_cache[cache_key] = category_state
        node.data["loaded"] = True
        node.data["has_more"] = category_state["has_more"]
        node.data["next_page"] = category_state["next_page"]
        self.activate_category_context(target)
        small_list = category_state["courses"]
        if not small_list:
            node.add_leaf("无课程", data={"type": "placeholder"})
            node.set_label(style_category_label(f"{target[0]} (0)"))
            return
        loaded_count = category_state["loaded_count"]
        more_suffix = "+" if category_state["has_more"] else ""
        node.set_label(
            style_category_label(f"{target[0]} ({loaded_count}{more_suffix})")
        )
        for kch_id, course_info_list in small_list.items():
            course_name = course_info_list[0].get("kcmc", kch_id)
            course_label = build_course_node_label(
                course_name,
                kch_id,
                course_info_list,
                len(course_info_list),
                kch_id in self.selected_course_ids,
            )
            course_node = node.add(
                course_label,
                data={
                    "type": "course",
                    "target_big": target,
                    "kch_id": kch_id,
                    "course_info_list": course_info_list,
                    "course_name": course_name,
                    "loaded": False,
                    "loading": False,
                },
            )
            course_node.add_leaf("展开后加载教学班", data={"type": "placeholder"})
        if category_state["has_more"]:
            node.add_leaf(
                "加载更多...",
                data={
                    "type": "load_more_courses",
                    "target": target,
                    "next_page": category_state["next_page"],
                },
            )

    def populate_course_node(self, node, target_big, kch_id, course_name, final_data):
        node.remove_children()
        node.data["loaded"] = True
        node.data["loading"] = False
        extra_params = self.build_extra_params(target_big)
        node.data["final_data"] = final_data
        node.data["extra_params"] = extra_params
        self.course_class_cache[(make_category_key(target_big), kch_id)] = final_data
        if not final_data:
            node.add_leaf("无教学班", data={"type": "placeholder"})
            node.set_label(build_course_node_label(course_name, kch_id, [], 0, False))
            return
        course_info_list = node.data.get("course_info_list") or []
        course_header = build_course_node_label(
            course_name,
            kch_id,
            course_info_list,
            len(final_data),
            kch_id in self.selected_course_ids,
        )
        node.set_label(course_header)
        for index, item in enumerate(final_data, start=1):
            clz, detail = item
            label = build_class_tree_label(index, course_name, clz, detail)
            if is_selected_class_pair(
                clz, detail, self.selected_class_ids, self.selected_do_jxb_ids
            ):
                label = f"[green]{label}[/]"
            node.add_leaf(
                label,
                data={
                    "type": "class",
                    "target_big": target_big,
                    "course_name": course_name,
                    "class_index": index,
                    "class_pair": item,
                    "extra_params": extra_params,
                    "final_data": [item],
                },
            )

    def refresh_tree_selection_marks(self):
        tree = self.get_tree()
        for category_node in tree.root.children:
            for course_node in category_node.children:
                data = course_node.data or {}
                if data.get("type") != "course":
                    continue
                kch_id = data.get("kch_id", "")
                course_name = data.get("course_name", kch_id)
                course_info_list = data.get("course_info_list") or []
                class_count = (
                    len(data.get("final_data", []))
                    if data.get("loaded")
                    else len(course_info_list)
                )
                label = build_course_node_label(
                    course_name,
                    kch_id,
                    course_info_list,
                    class_count,
                    kch_id in self.selected_course_ids,
                )
                course_node.set_label(label)
                for class_node in course_node.children:
                    class_data = class_node.data or {}
                    if class_data.get("type") != "class":
                        continue
                    clz, detail = class_data.get("class_pair", ({}, {}))
                    class_label = build_class_tree_label(
                        class_data.get("class_index", 1), course_name, clz, detail
                    )
                    if is_selected_class_pair(
                        clz, detail, self.selected_class_ids, self.selected_do_jxb_ids
                    ):
                        class_label = f"[green]{class_label}[/]"
                    class_node.set_label(class_label)

    def set_selected_context(self, data):
        self.current_context["selected_node_data"] = data
        target_big = data.get("target_big") or data.get("target")
        if target_big:
            self.activate_category_context(target_big)
        if data.get("type") in {"course", "class"} and data.get("final_data"):
            self.current_context["final_data"] = data["final_data"]
            self.current_context["extra_params"] = data["extra_params"]

    @work(thread=True)
    def fetch_timetable(self):
        self.debug_write("正在获取已选课程...")
        self.call_from_thread(self._set_refresh_status, "中")
        choosed = fetch_choosed_list(self.log_write, self.debug_write)
        if not choosed:
            self.debug_write("无已选课程")
            self.call_from_thread(self._refresh_timetable, [])
            self.call_from_thread(self._set_refresh_status, "失败")
            return
        self.debug_write(f"已选课程: {len(choosed)} 条")
        self.call_from_thread(self._refresh_timetable, choosed)
        self.call_from_thread(self._set_refresh_status, "完成")

    def _set_refresh_status(self, status_text):
        self.refresh_status = status_text
        self.render_timetable()

    def _refresh_timetable(self, choosed):
        self.timetable_entries = []
        self.selected_course_ids = set()
        self.selected_class_ids = set()
        self.selected_do_jxb_ids = set()
        self.max_credit = max_credit_limit or self.max_credit
        self.current_credit = current_credit_display or 0.0
        summed_credit = 0.0
        for item in choosed:
            jxbmc = item.get("jxbmc", "")
            name = item.get("kcmc") or jxbmc
            sksj = item.get("sksj", "").replace("<br/>", ", ")
            teacher_name, teacher_title = parse_teacher_display(item.get("jsxx", ""))
            location = item.get("jxdd", "").replace("<br/>", ", ")
            kch_id = str(item.get("t_kch_id") or item.get("kch_id") or "")
            jxb_id = str(item.get("jxb_id") or "")
            class_no = extract_class_no(jxbmc) or str(
                item.get("jxbh") or item.get("right_jxb_id") or jxb_id
            )
            do_jxb_id = str(item.get("do_jxb_id") or item.get("right_do_jxb_id") or "")
            if kch_id:
                self.selected_course_ids.add(kch_id)
            if jxb_id:
                self.selected_class_ids.add(jxb_id)
            if do_jxb_id:
                self.selected_do_jxb_ids.add(do_jxb_id)
            credit_value = item.get("xf") or item.get("jxbxf") or 0
            credit_text = (
                str(credit_value).strip() if credit_value not in (None, "") else ""
            )
            try:
                summed_credit += float(credit_text or 0)
            except Exception:
                pass
            slots = parse_sksj_to_slots(sksj)
            if slots:
                self.timetable_entries.append(
                    {
                        "name": name,
                        "sksj_raw": sksj,
                        "slots": slots,
                        "data": {
                            "teacher_name": teacher_name,
                            "teacher_title": teacher_title,
                            "location": location,
                            "kch_id": kch_id,
                            "class_no": class_no,
                            "credit": credit_text,
                        },
                    }
                )
        if self.current_credit <= 0 and summed_credit > 0:
            self.current_credit = summed_credit
        self.render_timetable()
        self.show_all_choosed()
        self.refresh_tree_selection_marks()
        if self.filter_no_conflict:
            self.apply_tree_filter()

    @work(thread=True)
    def action_auto_login(self):
        self.log_write("正在尝试登录...")
        do_login(self.log_write, self.debug_write)
        self.action_fetch_big_list()

    @work(thread=True)
    def action_fetch_big_list(self):
        self.call_from_thread(self.set_tree_placeholder, "正在加载分类...")
        self.log_write("正在获取课程列表...")
        self.category_course_cache = {}
        self.course_class_cache = {}
        self.current_small_list = {}
        self.current_small_list_keys = []
        self.current_context = {}
        self.big_list_cache = fetch_big_list(self.log_write, self.debug_write)
        self.call_from_thread(self.populate_big_tree)
        self.log_write(
            Text(f"列表获取完成，共 {len(self.big_list_cache)} 个大类", style="green")
        )
        self.log_write("左侧树可展开分类 -> 课程 -> 教学班")
        self.fetch_timetable()

    @work(thread=True)
    def load_category_courses(self, node, target, page=1, append=False):
        self.debug_write(f"加载分类课程: {target[0]} page={page}")
        page_result = fetch_small_list(target, self.log_write, self.debug_write, page)
        self.call_from_thread(
            self.populate_category_node, node, target, page_result, append
        )

    @work(thread=True)
    def load_course_classes(self, node, target_big, kch_id, course_info_list):
        course_name = course_info_list[0].get("kcmc", kch_id)
        self.debug_write(f"加载教学班: {course_name}")
        rwlx = "1" if target_big[0] == "主修课程" else "2"
        class_list_req = fetch_class_detail_and_plan(
            target_big[1],
            kch_id,
            target_big[4],
            target_big[2],
            rwlx,
            self.log_write,
            self.debug_write,
        )
        final_data = (
            []
            if not class_list_req
            else merge_class_data(class_list_req, course_info_list)
        )
        final_data.sort(
            key=lambda x: int(x[0].get("jxbrl", 0)) - int(x[1].get("yxzrs", 0)),
            reverse=True,
        )
        self.call_from_thread(
            self.populate_course_node, node, target_big, kch_id, course_name, final_data
        )

    def on_tree_node_expanded(self, event: Tree.NodeExpanded) -> None:
        data = event.node.data or {}
        node_type = data.get("type")
        if (
            node_type == "category"
            and not data.get("loaded")
            and not data.get("loading")
        ):
            data["loading"] = True
            event.node.remove_children()
            event.node.add_leaf("加载中...", data={"type": "placeholder"})
            self.load_category_courses(event.node, data["target"])
        elif (
            node_type == "course" and not data.get("loaded") and not data.get("loading")
        ):
            data["loading"] = True
            event.node.remove_children()
            event.node.add_leaf("加载中...", data={"type": "placeholder"})
            self.load_course_classes(
                event.node,
                data["target_big"],
                data["kch_id"],
                data["course_info_list"],
            )

    def on_tree_node_selected(self, event: Tree.NodeSelected) -> None:
        data = event.node.data or {}
        if data.get("type") == "load_more_courses":
            parent = event.node.parent
            if parent is None:
                return
            parent_data = parent.data or {}
            if parent_data.get("loading"):
                return
            parent_data["loading"] = True
            self.load_category_courses(
                parent,
                data["target"],
                page=data.get("next_page", 2),
                append=True,
            )
            return
        if data.get("type") in {"category", "course", "class"}:
            self.set_selected_context(data)

    def action_open_context_menu(self):
        data = self.current_context.get("selected_node_data")
        if data and data.get("type") in {"category", "course", "class"}:
            is_selected = node_is_selected_class(
                data, self.selected_class_ids, self.selected_do_jxb_ids
            )
            self.push_screen(
                ContextMenuScreen(data, is_selected=is_selected),
                callback=lambda result: self._handle_context_menu_result(data, result),
            )

    def _handle_context_menu_result(self, data, result):
        if result != "action":
            return
        if data.get("type") != "class":
            return
        self.context_menu_class_action(data)

    @work(thread=True)
    def context_menu_class_action(self, data):
        clz, detail = data.get("class_pair", ({}, {}))
        extra_params = data.get("extra_params") or []
        if len(extra_params) < 5:
            self.call_from_thread(
                self.log_write, Text("缺少提交参数，无法执行操作", style="red")
            )
            return
        rwlx, xkkz_id, grade, zyh_id, kklxdm = extra_params
        kch_id = str(detail.get("kch_id") or clz.get("kch_id") or "")
        kcmc = detail.get("kcmc") or clz.get("kcmc") or data.get("course_name", "")
        do_jxb_id = str(clz.get("do_jxb_id") or detail.get("do_jxb_id") or "")
        if not kch_id or not do_jxb_id:
            self.call_from_thread(
                self.log_write, Text("缺少课程或教学班标识，无法执行操作", style="red")
            )
            return
        is_selected = node_is_selected_class(
            data, self.selected_class_ids, self.selected_do_jxb_ids
        )
        if is_selected:
            self.call_from_thread(self.log_write, f"正在退课: {kcmc}")
            res = execute_withdraw(do_jxb_id, kch_id, self.debug_write)
        else:
            self.call_from_thread(self.log_write, f"正在选课: {kcmc}")
            res = execute_choose(
                do_jxb_id,
                kch_id,
                kcmc,
                rwlx,
                xkkz_id,
                grade,
                zyh_id,
                kklxdm,
                self.debug_write,
            )
        if res is None:
            self.call_from_thread(
                self.log_write, Text("请求失败，请查看调试日志", style="red")
            )
            return
        try:
            payload = res.json()
        except Exception:
            payload = {"raw": res.text}
        self.call_from_thread(self.log_write, Text(str(payload), style="cyan"))
        self.fetch_timetable()


if __name__ == "__main__":
    if bootstrap_login():
        app = CourseApp()
        app.run()
