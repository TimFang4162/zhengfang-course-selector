import base64
import json
import re
import time
from pathlib import Path

import requests
import rsa
import urllib3
from Crypto.Util.number import bytes_to_long
from fake_useragent import UserAgent


urllib3.disable_warnings()

ROOT = Path(__file__).resolve().parent.parent
CREDENTIALS_FILE = ROOT / ".jwxt_credentials.json"
ADDRESS_CHOICES = [
    ("1", "http://10.1.70.164", "内网地址 10.1.70.164"),
    ("2", "http://10.1.70.165", "内网地址 10.1.70.165"),
    ("3", "http://10.1.70.166", "内网地址 10.1.70.166"),
    ("4", "http://10.1.70.167", "内网地址 10.1.70.167"),
    ("5", "http://10.1.70.168", "内网地址 10.1.70.168"),
    ("6", "http://10.1.70.169", "内网地址 10.1.70.169"),
    ("7", "http://10.1.70.170", "内网地址 10.1.70.170"),
    ("8", "http://10.1.70.171", "内网地址 10.1.70.171"),
    ("9", "http://10.1.70.172", "内网地址 10.1.70.172"),
    ("10", "http://10.1.70.173", "内网地址 10.1.70.173"),
    ("11", "https://jwxt.zjnu.edu.cn", "校外统一地址 jwxt.zjnu.edu.cn"),
    ("12", "https://webvpn.zjnu.edu.cn", "WebVPN 外层地址"),
]

STUDENT_NUMBER = ""
PASSWORD = ""
base_url = "http://10.1.70.171"

sess = requests.Session()
header = {
    "User-Agent": UserAgent().random,
    "Accept": "application/json, text/javascript, */*; q=0.01",
}
sess.headers = header
sess.verify = False

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
is_authenticated = False
request_logger = None

COURSE_PAGE_SIZE = 50
MAX_WEEK = 19
MAX_JIECI = 13
num_map = {"一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5, "六": 6, "日": 7}


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
    if request_logger is not None:
        request_logger(f"{method.upper()} {_format_request_path(url)}")


def http_get(url: str, **kwargs):
    _log_request_start("GET", url)
    return sess.get(url, **kwargs)


def http_post(url: str, **kwargs):
    _log_request_start("POST", url)
    return sess.post(url, **kwargs)


def rsa_encryption(n, e, msg):
    key = rsa.PublicKey(
        bytes_to_long(base64.b64decode(n)), bytes_to_long(base64.b64decode(e))
    )
    return rsa.encrypt(msg.encode("UTF-8"), key)


def reset_runtime_state():
    global bh_id, xsbj, njdm_id, xkxnm, xkxqm, xqh_id, jg_id, zyfx_id, xbm
    global xslbdm, mzm, xz, ccdm, max_credit_limit, current_credit_display
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
    CREDENTIALS_FILE.write_text(
        json.dumps(
            {"student_number": student_number, "password": password},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def mask_student_number(student_number: str):
    if len(student_number) <= 4:
        return "*" * len(student_number)
    return f"{student_number[:2]}{'*' * (len(student_number) - 4)}{student_number[-2:]}"


def first_non_empty(*values) -> str:
    for value in values:
        if value not in (None, ""):
            text = str(value).strip()
            if text:
                return text
    return ""


def format_credit_text(credit_value) -> str:
    if credit_value in (None, ""):
        return ""
    try:
        return f"{float(str(credit_value).strip()):.1f}"
    except Exception:
        return str(credit_value).strip()


def get_course_credit_text(course_info_list) -> str:
    if not course_info_list:
        return ""
    first = course_info_list[0]
    return format_credit_text(first.get("xf") or first.get("jxbxf"))


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


def extract_class_no(jxbmc: str) -> str:
    if not jxbmc:
        return ""
    match = re.search(r"-(\d{5})\s*$", jxbmc)
    return match.group(1) if match else ""


def parse_sksj_to_slots(sksj_str):
    if not sksj_str or "星期" not in sksj_str:
        return []
    slots = []
    for part in sksj_str.replace("<br/>", ", ").split(", "):
        try:
            match = re.findall(r"星期(.*)第(.*)节{(.*)}", part)
            if not match:
                continue
            day_ch, jieci_str, week_str = match[0]
            day = num_map.get(day_ch)
            if day is None:
                continue
            jiecis = []
            for item in jieci_str.split(","):
                if "-" in item:
                    start, end = item.split("-")
                    jiecis.extend(range(int(start), int(end) + 1))
                else:
                    jiecis.append(int(item))
            is_odd = "(单)" in week_str
            is_even = "(双)" in week_str
            week_text = (
                week_str.replace("(单)", "").replace("(双)", "").replace("周", "")
            )
            if "-" in week_text:
                start, end = week_text.split("-")
                weeks = range(int(start), int(end) + 1)
            else:
                weeks = [int(week_text)]
            for week in weeks:
                if is_odd and week % 2 != 1:
                    continue
                if is_even and week % 2 != 0:
                    continue
                for jieci in jiecis:
                    slots.append((week, day, jieci))
        except Exception:
            continue
    return slots


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
        debug_func("正在提交登录表单...")
        req = http_post(
            url=login_url,
            headers=header,
            data={"language": "zh_CN", "yhm": STUDENT_NUMBER, "mm": mm},
            allow_redirects=False,
            timeout=5,
        )
        if req.status_code == 302:
            log_func("登录成功！")
            debug_func("登录成功 (302 Redirect)")
            return True
        log_func(f"登录失败 状态码: {req.status_code}")
        debug_func(f"登录失败: {req.text}")
        return False
    except Exception as exc:
        log_func(f"登录异常: {exc}")
        debug_func(f"Exception: {exc}")
        return False


def fetch_big_list(log_func, debug_func):
    global bh_id, xsbj, njdm_id, xkxnm, xkxqm, xqh_id, jg_id, zyfx_id, xbm
    global xslbdm, mzm, xz, ccdm, max_credit_limit, current_credit_display
    try:
        debug_func("GET zzxkyzb_cxZzxkYzbIndex.html")
        text = http_get(
            base_url + "/jwglxt/xsxk/zzxkyzb_cxZzxkYzbIndex.html?gnmkdm=N253512",
            timeout=8,
        ).text
        if "您不在可选课名单中" in text:
            log_func("错误：当前不在选课名单中")
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
                    max_credit_limit = float(max_credit_match[0] or 0)
                if current_credit_match:
                    current_credit_display = float(current_credit_match[0] or 0)
                debug_func("页面参数解析成功")
            except Exception:
                log_func("解析页面参数失败，请检查是否登录")
                debug_func("参数解析失败")
                return []
        lst = re.findall(r'onclick="queryCourse\((.*)\)', text)
        lst = [item.replace("'", "").split(",")[1:] for item in lst]
        final_list = []
        for index, label in enumerate(
            re.findall(r'role="tab" data-toggle="tab">(.*)</a>', text)
        ):
            final_list.append([label] + lst[index])
        return final_list
    except Exception as exc:
        log_func(f"获取列表异常: {exc}")
        debug_func(f"获取大类异常: {exc}")
        return []


def fetch_small_list(target, log_func, debug_func, page=1):
    rwlx = "1" if target[0] == "主修课程" else "2"
    zyh_id = target[4]
    kklxdm = target[1]
    grade = target[3]
    xkkz_id = target[2]
    start = (page - 1) * COURSE_PAGE_SIZE + 1
    end = page * COURSE_PAGE_SIZE
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
        req = http_post(
            url=base_url
            + "/jwglxt/xsxk/zzxkyzb_cxZzxkYzbPartDisplay.html?gnmkdm=N253512",
            data=data,
            timeout=10,
        ).json()
        ret_data = {}
        for clz in req.get("tmpList", []):
            ret_data.setdefault(clz["kch_id"], []).append(clz)
        item_count = len(req.get("tmpList", []))
        return {
            "courses": ret_data,
            "page": page,
            "count": item_count,
            "has_more": item_count >= COURSE_PAGE_SIZE,
            "next_page": page + 1,
        }
    except Exception as exc:
        log_func(f"获取课程详情失败: {exc}")
        debug_func(f"获取小类异常: {exc}")
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
    data = {
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
        return http_post(
            url=base_url
            + "/jwglxt/xsxk/zzxkyzbjk_cxJxbWithKchZzxkYzb.html?gnmkdm=N253512",
            data=data,
            timeout=8,
        ).json()
    except requests.Timeout:
        debug_func(f"!!! TIMEOUT (KCH={kch_id}) - 可能被Ban或网络卡顿 !!!")
        return None
    except Exception as exc:
        debug_func(f"查询详情异常: {exc}")
        return None


def execute_choose(
    jxb_id, kch_id, kcmc, rwlx, xkkz_id, grade, zyh_id, kklxdm, debug_func
):
    data = {
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
        return http_post(
            url=base_url + "/jwglxt/xsxk/zzxkyzbjk_xkBcZyZzxkYzb.html?gnmkdm=N253512",
            data=data,
            timeout=5,
        )
    except Exception as exc:
        debug_func(f"选课请求异常: {exc}")
        return None


def execute_withdraw(jxb_id, kch_id, debug_func):
    data = {
        "kch_id": kch_id,
        "jxb_ids": jxb_id,
        "xkxnm": xkxnm,
        "xkxqm": xkxqm,
        "txbsfrl": "0",
    }
    try:
        debug_func(f"发送退课请求: JXB={jxb_id}")
        return http_post(
            url=base_url + "/jwglxt/xsxk/zzxkyzb_tuikBcZzxkYzb.html?gnmkdm=N253512",
            data=data,
            timeout=5,
        )
    except Exception as exc:
        debug_func(f"退课请求异常: {exc}")
        return None


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
        return http_post(
            url=base_url
            + "/jwglxt/xsxk/zzxkyzb_cxZzxkYzbChoosedDisplay.html?gnmkdm=N253512",
            data=data,
            timeout=10,
        ).json()
    except Exception as exc:
        if log_func:
            log_func(f"获取已选课程失败: {exc}")
        return []
