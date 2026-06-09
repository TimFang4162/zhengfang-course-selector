import base64
import html
import json
import re
import time
from typing import Any
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

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

REQ_TIMEOUT = {
    "login": 50,
    "filter": 50,
    "big_list": 50,
    "small_list": 50,
    "class_detail": 50,
    "choose": 50,
    "withdraw": 50,
    "course_detail": 50,
    "teacher_detail": 50,
    "choosed_list": 50,
    "academic_status": 50,
    "academic_detail": 50,
    "cookie_verify": 50,
}

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
request_seq = 0

COURSE_PAGE_SIZE = 50
MAX_WEEK = 19
MAX_JIECI = 13
num_map = {"一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5, "六": 6, "日": 7}


def set_request_logger(logger):
    global request_logger
    request_logger = logger


def build_remote_filter_params(filters: dict | None):
    if not filters:
        return {}
    params = {}
    keyword = str(filters.get("keyword") or "").strip()
    keywords = [item.strip() for item in keyword.split(" ") if item.strip()]
    for index, item in enumerate(keywords):
        params[f"filter_list[{index}]"] = item
    for field, values in (
        ("jg_id_list", filters.get("collegeIds") or []),
        ("zyh_id_list", filters.get("majorIds") or []),
        ("kkbm_id_list", filters.get("teachingCollegeIds") or []),
        ("njdm_id_list", filters.get("gradeIds") or []),
        ("kclb_id_list", filters.get("courseCategoryIds") or []),
        ("kcxzdm_list", filters.get("courseNatureIds") or []),
        ("kcgs_list", filters.get("courseOwnershipIds") or []),
        ("jxms_list", filters.get("teachingModeIds") or []),
        ("sksj_list", filters.get("weekdayIds") or []),
        ("skjc_list", filters.get("periodIds") or []),
        ("xf_list", filters.get("credits") or []),
        ("jxbmc_list", filters.get("classNames") or []),
        ("tjbj_list", filters.get("recommended") or []),
        ("yl_list", filters.get("hasCapacity") or []),
        ("sksjct_list", filters.get("timeConflict") or []),
        ("cxbj_list", filters.get("retake") or []),
    ):
        for index, value in enumerate(values):
            value = str(value).strip()
            if value:
                params[f"{field}[{index}]"] = value
    return params


FILTER_OPTION_SOURCES = {
    "college": (
        "/jwglxt/xkgl/common_queryXyPaged.html?localeKey=zh_CN&jg_id=w&gnmkdm=N253512",
        "jgxh",
        "asc",
    ),
    "major": (
        "/jwglxt/xkgl/common_queryZyPaged.html?localeKey=zh_CN&zyh_id=w&gnmkdm=N253512",
        "zyxh",
        "asc",
    ),
    "teachingCollege": (
        "/jwglxt/xkgl/common_queryKkbmPaged.html?localeKey=zh_CN&gnmkdm=N253512",
        "jgxh",
        "asc",
    ),
    "courseCategory": (
        "/jwglxt/xkgl/common_queryKclbListPaged.html?gnmkdm=N253512",
        "kclbdm",
        "asc",
    ),
    "courseNature": (
        "/jwglxt/xkgl/common_queryKcxzPaged.html?gnmkdm=N253512",
        "dm",
        "asc",
    ),
    "courseOwnership": (
        "/jwglxt/xkgl/common_queryKcgsPaged.html?gnmkdm=N253512",
        "px,kcgsdm",
        "asc",
    ),
    "teachingMode": (
        "/jwglxt/xtgl/comm_cxJcsjList.html?lxdm=0032&gnmkdm=N253512",
        "",
        "",
    ),
    "weekday": ("/jwglxt/xtgl/comm_cxJcsjList.html?lxdm=0036&gnmkdm=N253512", "", ""),
    "period": ("/jwglxt/xkgl/common_querySkjcList.html?gnmkdm=N253512", "dm", "asc"),
}

FILTER_OPTION_QUERY_FIELDS = {
    "college": "jg_id",
}


def _with_query_param(path: str, key: str, value: str) -> str:
    split = urlsplit(path)
    params = dict(parse_qsl(split.query, keep_blank_values=True))
    params[key] = value
    return urlunsplit(
        (split.scheme, split.netloc, split.path, urlencode(params), split.fragment)
    )


def _fetch_major_grid_options(page: int, show_count: int, query: str, extra: dict):
    data = {
        "title": "专业列表",
        "mapper[key]": "zyh_id",
        "mapper[text]": "zymc",
        "index": "zyh_id_list",
        "checked": "",
        "multiselect": "true",
        "selectAttr": "true",
        "width": "800",
        "height": "500",
        "gridType": "4",
        "queryModel.currentPage": str(page),
        "queryModel.showCount": str(show_count),
        "queryModel.sortOrder": "asc",
        "queryModel.sortName": "zymc ",
        "rangeable": "true",
        "text": "专业",
        "url": "/jwglxt/xkgl/common_queryZyPaged.html?localeKey=zh_CN&zyh_id=w",
        "parent": "jg_id_list",
        "sort": "zyxh",
        "order": "asc",
        "moreEvent": "dialog",
        "multiple": "true",
        "hidden": "false",
        "showSize": "6",
        "more": "true",
        "zyh": query,
        "_search": "false",
        "time": "0",
    }
    college_id = str((extra or {}).get("jg_id_list[0]") or "").strip()
    if college_id:
        data["jg_id"] = college_id
    return http_post(
        url=base_url + "/jwglxt/grid/grid_cxCommonSelectList.html?gnmkdm=N253512",
        data=data,
        timeout=REQ_TIMEOUT["filter"],
    ).json()


def fetch_filter_options(option_type, page=1, show_count=20, query="", extra=None):
    if option_type not in FILTER_OPTION_SOURCES:
        raise ValueError("无效筛选项类型")
    path, sort_name, sort_order = FILTER_OPTION_SOURCES[option_type]
    start = (page - 1) * show_count
    data = {
        "queryModel.currentPage": str(page),
        "queryModel.showCount": str(show_count),
        "minNum": str(start),
        "maxNum": str(start + show_count),
        "queryModel.sortOrder": sort_order,
        "queryModel.sortName": sort_name,
        "rangeable": "true",
    }
    query = str(query or "").strip()
    extra = extra or {}
    if option_type == "major" and query:
        return _fetch_major_grid_options(page, show_count, query, extra)
    if query:
        data["filter_list[0]"] = query
        query_field = FILTER_OPTION_QUERY_FIELDS.get(option_type)
        if query_field:
            path = _with_query_param(path, query_field, query)
    data.update(extra)
    return http_post(
        url=base_url + path, data=data, timeout=REQ_TIMEOUT["filter"]
    ).json()


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


def _next_request_id() -> str:
    global request_seq
    request_seq += 1
    return f"req-{request_seq}"


def _truncate_text(value: Any, limit: int = 20000) -> str:
    text = str(value or "")
    if len(text) <= limit:
        return text
    return f"{text[:limit]}\n... [truncated {len(text) - limit} chars]"


def _serialize_request_body(kwargs: dict) -> str:
    if "json" in kwargs and kwargs["json"] is not None:
        try:
            return _truncate_text(
                json.dumps(kwargs["json"], ensure_ascii=False, indent=2)
            )
        except Exception:
            return _truncate_text(kwargs["json"])
    if "data" in kwargs and kwargs["data"] is not None:
        data = kwargs["data"]
        if isinstance(data, dict):
            return _truncate_text(
                json.dumps(data, ensure_ascii=False, indent=2, default=str)
            )
        return _truncate_text(data)
    return ""


def _serialize_response_body(response) -> str:
    try:
        content_type = response.headers.get("Content-Type", "")
        if any(
            token in content_type
            for token in ("application/json", "text/", "javascript", "xml", "html")
        ):
            return _truncate_text(response.text)
        return f"<{content_type or 'binary'} {len(response.content)} bytes>"
    except Exception as exc:
        return f"<unavailable: {exc}>"


def _log_request_event(entry: dict):
    if request_logger is not None:
        request_logger(entry)


def _request(method: str, url: str, **kwargs):
    started = time.perf_counter()
    request_id = _next_request_id()
    path = _format_request_path(url)
    request_headers = dict(kwargs.get("headers") or {})
    request_body = _serialize_request_body(kwargs)
    _log_request_event(
        {
            "type": "request",
            "level": "info",
            "phase": "start",
            "requestId": request_id,
            "method": method.upper(),
            "path": path,
            "status": None,
            "ok": None,
            "ms": None,
            "message": f"{method.upper()} {path}",
            "detail": {
                "url": url,
                "method": method.upper(),
                "requestHeaders": request_headers,
                "requestBody": request_body,
                "responseHeaders": {},
                "responseBody": "",
                "error": "",
            },
        }
    )
    try:
        response = sess.request(method=method.upper(), url=url, **kwargs)
    except Exception as exc:
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        _log_request_event(
            {
                "type": "request",
                "level": "error",
                "phase": "finish",
                "requestId": request_id,
                "method": method.upper(),
                "path": path,
                "status": None,
                "ok": False,
                "ms": elapsed_ms,
                "message": f"{method.upper()} {path} -> ERROR {exc}",
                "detail": {
                    "url": url,
                    "method": method.upper(),
                    "requestHeaders": request_headers,
                    "requestBody": request_body,
                    "responseHeaders": {},
                    "responseBody": "",
                    "error": str(exc),
                },
            }
        )
        raise
    elapsed_ms = int((time.perf_counter() - started) * 1000)
    _log_request_event(
        {
            "type": "request",
            "level": "info" if response.ok else "error",
            "phase": "finish",
            "requestId": request_id,
            "method": method.upper(),
            "path": path,
            "status": response.status_code,
            "ok": response.ok,
            "ms": elapsed_ms,
            "message": f"{method.upper()} {path} -> {response.status_code} ({elapsed_ms}ms)",
            "detail": {
                "url": url,
                "method": method.upper(),
                "requestHeaders": request_headers,
                "requestBody": request_body,
                "responseHeaders": dict(response.headers),
                "responseBody": _serialize_response_body(response),
                "error": "",
            },
        }
    )
    return response


def http_get(url: str, **kwargs):
    return _request("GET", url, **kwargs)


def http_post(url: str, **kwargs):
    return _request("POST", url, **kwargs)


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


def parse_teacher_jgh_id(jsxx: str) -> str:
    if not jsxx:
        return ""
    ids = []
    for teacher in jsxx.split(";"):
        teacher = teacher.strip()
        if not teacher:
            continue
        parts = [part.strip() for part in teacher.split("/")]
        if parts and parts[0]:
            ids.append(parts[0])
    return ";".join(ids)


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
        res = http_get(public_key, headers=header, timeout=REQ_TIMEOUT["login"])
        if res.status_code != 200:
            res = http_get(public_key, headers=header, timeout=REQ_TIMEOUT["login"])
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
            timeout=REQ_TIMEOUT["login"],
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
            timeout=REQ_TIMEOUT["big_list"],
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


def fetch_small_list(target, log_func, debug_func, page=1, remote_filters=None):
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
    data.update(build_remote_filter_params(remote_filters))
    try:
        debug_func(f"Fetch small list: {target[0]} [range {start}-{end}]")
        req = http_post(
            url=base_url
            + "/jwglxt/xsxk/zzxkyzb_cxZzxkYzbPartDisplay.html?gnmkdm=N253512",
            data=data,
            timeout=REQ_TIMEOUT["small_list"],
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
    kklxdm,
    kch_id,
    zyh_id,
    xkkz_id,
    rwlx,
    log_func,
    debug_func,
    remote_filters=None,
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
    data.update(build_remote_filter_params(remote_filters))
    try:
        debug_func(f"查询班级详情: KCH={kch_id}")
        return http_post(
            url=base_url
            + "/jwglxt/xsxk/zzxkyzbjk_cxJxbWithKchZzxkYzb.html?gnmkdm=N253512",
            data=data,
            timeout=REQ_TIMEOUT["class_detail"],
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
            timeout=REQ_TIMEOUT["choose"],
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
            timeout=REQ_TIMEOUT["withdraw"],
        )
    except Exception as exc:
        debug_func(f"退课请求异常: {exc}")
        return None


_COURSE_DETAIL_FIELDS = {
    "课程代码": "code",
    "课程名称": "name",
    "课程英文名称": "englishName",
    "开课学院": "academy",
    "学分": "credits",
    "课程类别": "category",
    "课程归属": "ownership",
    "开课学期": "term",
    "成绩录入级别": "gradeLevel",
    "可否申请免听": "canAudit",
    "统一安排补考否": "makeupExam",
    "可否快速选课": "quickSelect",
    "课程启用年级": "startYear",
    "是否是实践课": "isPractice",
    "是否可补考": "canRetake",
    "面向对象": "targetAudience",
    "周学时": "weeklyHours",
    "预修课": "prerequisites",
    "课程简介": "introduction",
    "教学大纲": "syllabus",
}

_TEACHER_DETAIL_FIELDS = {
    "教师姓名": "name",
    "姓名拼音": "pinyin",
    "性别": "gender",
    "所在单位": "department",
    "最高学历": "education",
    "电子邮箱": "email",
    "研究方向": "research",
    "科室名称": "office",
    "职称": "title",
    "教师简介": "introduction",
}

_TD_ROW_RE = re.compile(
    r"<td[^>]*>\s*([^<{]+?)\s*<!--.*?-->\s*</td>\s*"
    r"<td[^>]*align=\"left\">(.*?)</td>",
    re.DOTALL,
)
_TD_ROW_WIDE_RE = re.compile(
    r"<td[^>]*>\s*([^<{]+?)\s*<!--.*?-->\s*</td>\s*"
    r"<td[^>]*colspan=\"\d+\">(.*?)</td>",
    re.DOTALL,
)
_LABEL_VALUE_RE = re.compile(
    r"<label[^>]*>\s*([^<{]+?)\s*<!--.*?-->\s*</label>\s*<div[^>]*>(.*?)</div>",
    re.DOTALL,
)


def _strip_tags(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()


def fetch_course_detail(kch_id, debug_func=print):
    try:
        debug_func(f"查询课程详情: KCH={kch_id}")
        resp = http_post(
            url=base_url + "/jwglxt/xkgl/common_cxKcxxModel.html?gnmkdm=N253512",
            data={"kch_id": kch_id},
            timeout=REQ_TIMEOUT["course_detail"],
        )
        text = resp.text
        result = {}
        for label, raw_val in _TD_ROW_RE.findall(text):
            key = _COURSE_DETAIL_FIELDS.get(label.strip())
            if key:
                result[key] = _strip_tags(raw_val)
        for label, raw_val in _TD_ROW_WIDE_RE.findall(text):
            key = _COURSE_DETAIL_FIELDS.get(label.strip())
            if key:
                result[key] = _strip_tags(raw_val)
        return result
    except Exception as exc:
        debug_func(f"查询课程详情异常: {exc}")
        return None


def fetch_teacher_detail(jgh_id, kch_id, debug_func=print):
    try:
        debug_func(f"查询教师详情: JGH={jgh_id} KCH={kch_id}")
        resp = http_post(
            url=base_url + "/jwglxt/xkgl/common_cxJsxxModel.html?gnmkdm=N253512",
            data={"jgh_id": jgh_id, "kch_id": kch_id},
            timeout=REQ_TIMEOUT["teacher_detail"],
        )
        text = resp.text
        result = {}
        for label, raw_val in _LABEL_VALUE_RE.findall(text):
            key = _TEACHER_DETAIL_FIELDS.get(label.strip())
            if key:
                result[key] = _strip_tags(raw_val)
        return result
    except Exception as exc:
        debug_func(f"查询教师详情异常: {exc}")
        return None


def fetch_academic_course_basic_info(kch_id, debug_func=print):
    try:
        debug_func(f"查询学业课程基本信息: KCH={kch_id}")
        ts = int(time.time() * 1000)
        url = (
            base_url
            + f"/jwglxt/jxjhgl/common_cxKcJbxx.html?id={kch_id}&time={ts}&gnmkdm=N105515"
        )
        resp = http_post(url, timeout=REQ_TIMEOUT["course_detail"])
        text = resp.text

        result = {"kchId": kch_id}

        labels = {
            "课程代码": "courseCode",
            "课程中文名称": "name",
            "课程英文名称": "englishName",
            "开课部门": "academy",
            "学分": "credits",
            "课程类别": "category",
            "课程归属": "ownership",
            "课程负责人": "director",
            "是否实践课标记": "isPracticeText",
            "实践周数": "practiceWeeks",
            "预修要求": "prerequisites",
            "成绩录入级别": "gradeLevel",
            "申请免听标记": "canAudit",
            "统一安排补考标记": "makeupExam",
            "快速选课标记": "quickSelect",
            "课程启用年级": "startYear",
            "面向对象": "targetAudience",
            "备注": "remarks",
            "中文课程简介": "introductionZh",
            "英文课程简介": "introductionEn",
            "中文教学大纲": "syllabusZh",
            "英文教学大纲": "syllabusEn",
        }

        for label_key, field_name in labels.items():
            m = re.search(
                r"<td[^>]*>\s*"
                + re.escape(label_key)
                + r"\s*</td>\s*<th[^>]*>\s*(.*?)\s*</th>",
                text,
                re.DOTALL,
            )
            if m:
                result[field_name] = _strip_tags(m.group(1))

        hours_m = re.search(r"课程学时[：:]\s*([\d.]+)", text)
        if hours_m:
            result["totalHours"] = hours_m.group(1)

        hour_rows = re.findall(
            r"<td[^>]*class=\"align-center\"[^>]*>\s*(.*?)\s*</td>"
            r"\s*<td[^>]*class=\"align-center\"[^>]*>\s*(.*?)\s*</td>"
            r"\s*<td[^>]*class=\"align-center\"[^>]*>\s*(.*?)\s*</td>"
            r"\s*<td[^>]*class=\"align-center\"[^>]*>\s*(.*?)\s*</td>",
            text,
            re.DOTALL,
        )
        if hour_rows:
            result["hoursBreakdown"] = [
                {
                    "item": _strip_tags(r[0]),
                    "weekly": _strip_tags(r[1]),
                    "total": _strip_tags(r[2]),
                    "mark": _strip_tags(r[3]),
                }
                for r in hour_rows
            ]

        return result
    except Exception as exc:
        debug_func(f"查询学业课程基本信息异常: {exc}")
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
            timeout=REQ_TIMEOUT["choosed_list"],
        ).json()
    except Exception as exc:
        if log_func:
            log_func(f"获取已选课程失败: {exc}")
        return []


def _extract_hidden_inputs(text: str) -> dict:
    values = {}
    for tag in re.findall(r"<input\b[^>]*>", text, flags=re.I):
        name_match = re.search(r"\bname=['\"]([^'\"]*)", tag, flags=re.I)
        id_match = re.search(r"\bid=['\"]([^'\"]*)", tag, flags=re.I)
        value_match = re.search(r"\bvalue=['\"]([^'\"]*)", tag, flags=re.I)
        key = name_match or id_match
        if key:
            values[key.group(1)] = html.unescape(
                value_match.group(1) if value_match else ""
            )
    return values


def _clean_academic_node_label(raw_label: str) -> str:
    label = raw_label.replace("&nbsp;", " ")
    label = re.sub(r"\"\s*\+\s*\$\.i18n\.get\('yqxf'\).*?\+\s*\"", "要求学分", label)
    label = re.sub(r"\"\s*\+\s*\$\.i18n\.get\('hdxf'\).*?\+\s*\"", "获得学分", label)
    label = re.sub(r"\"\s*\+\s*\$\.i18n\.get\('whdxf'\).*?\+\s*\"", "未获得学分", label)
    label = re.sub(r"\"\s*\+\s*\$\.i18n\.get\('.*?'\).*?\+\s*\"", " ", label)
    label = re.sub(r"<[^>]*>", " ", label)
    label = re.sub(r"[\"+]", " ", label)
    label = html.unescape(label)
    label = re.sub(r"\s+", " ", label).strip()
    label = re.sub(r"\s*(要求学分|获得学分|未获得学分):.*$", "", label).strip()
    return label


def _academic_credit_status(
    earned: str, required: str, passed: bool
) -> tuple[str, str]:
    try:
        earned_value = float(earned)
        required_value = float(required)
    except Exception:
        return ("unknown", "未知")
    if earned_value < required_value:
        return ("not_full", "学分未满")
    if not passed:
        return ("node_failed", "节点未过")
    if earned_value == required_value:
        return ("full", "学分已满")
    return ("overflow", "学分超出")


def _academic_substitute_status(value: str) -> tuple[str, str]:
    parts = [part for part in str(value or "").split(",") if part]
    if "1" in parts:
        return ("external_course", "校外课程替代节点")
    if "2" in parts:
        return ("internal_course", "校内课程替代节点")
    if "3" in parts:
        return ("node", "节点替代")
    return ("none", "")


def _academic_course_status(code, max_score="") -> tuple[str, str]:
    raw = str(code or "")
    if raw == "1" or max_score == "未开放":
        return ("studying", "在修")
    if raw == "2":
        return ("failed", "未过")
    if raw == "3":
        return ("not_started", "未修")
    if raw in ("4", "21"):
        return ("passed", "已修")
    if raw in ("5", "6", "7", "8", "9"):
        return ("substituted", "课程替代")
    if raw == "10":
        return ("warning_ignored", "预警不审核")
    return ("unknown", raw)


def parse_academic_page(text: str) -> dict:
    hidden = _extract_hidden_inputs(text)
    gpa_match = re.search(
        r'name=["\']showGpa["\'].*?<font[^>]*color:\s*red[^>]*>\s*([0-9.]+)',
        text,
        re.S,
    )
    plan_counts_match = re.search(
        r"计划总课程.*?&nbsp;([0-9]+)&nbsp;.*?通过.*?&nbsp;([0-9]+)&nbsp;.*?未通过.*?&nbsp;([0-9]+)&nbsp;.*?未修.*?&nbsp;([0-9]+)&nbsp;.*?在读\s*&nbsp;([0-9]+)",
        text,
        re.S,
    )
    outside_counts_match = re.search(
        r"计划外.*?通过.*?&nbsp;([0-9]+)&nbsp;.*?未通过.*?&nbsp;([0-9]+)&nbsp;",
        text,
        re.S,
    )
    node_pattern = re.compile(
        r"<li id='li(?P<li_id>[^']*)'(?P<body>.*?)<span id='showKc", re.S
    )
    nodes_by_id = {}
    for match in node_pattern.finditer(text):
        body = match.group("body")
        p_match = re.search(
            r"<p class='title1' id='p(?P<p_id>[^']*)' yxxf='(?P<earned>[^']*)' "
            r"yqzdxf='(?P<required>[^']*)' sftg='(?P<passed>[^']*)'>(?P<label>.*?)$",
            body,
            re.S,
        )
        if not p_match:
            continue
        node_id = p_match.group("p_id") or match.group("li_id")
        if node_id in nodes_by_id:
            continue
        parent_match = re.search(r"fxfyqjd_id='([^']*)'", body)
        jdkcsx_match = re.search(r"jdkcsx='([^']*)'", body)
        sfmjd_match = re.search(r"sfmjd='([^']*)'", body)
        thzt_match = re.search(
            rf"id\s*=\s*'thzt{re.escape(node_id)}' value='([^']*)'", text
        )
        credit_status, credit_status_text = _academic_credit_status(
            p_match.group("earned"),
            p_match.group("required"),
            p_match.group("passed") == "1",
        )
        substitute_status, substitute_status_text = _academic_substitute_status(
            thzt_match.group(1) if thzt_match else ""
        )
        nodes_by_id[node_id] = {
            "id": node_id,
            "parentId": parent_match.group(1) if parent_match else "",
            "name": _clean_academic_node_label(p_match.group("label")) or node_id,
            "earnedCredit": format_credit_text(p_match.group("earned")),
            "requiredCredit": format_credit_text(p_match.group("required")),
            "passed": p_match.group("passed") == "1",
            "creditStatus": credit_status,
            "creditStatusText": credit_status_text,
            "substituteStatus": substitute_status,
            "substituteStatusText": substitute_status_text,
            "courseSource": jdkcsx_match.group(1) if jdkcsx_match else "",
            "isLeaf": (sfmjd_match.group(1) if sfmjd_match else "") == "1",
            "children": [],
            "courses": [],
        }
    for node in nodes_by_id.values():
        parent = nodes_by_id.get(node["parentId"])
        if parent:
            parent["children"].append(node)
    roots = [
        node for node in nodes_by_id.values() if not nodes_by_id.get(node["parentId"])
    ]
    return {
        "params": {
            key: hidden.get(key, "")
            for key in [
                "xh_id",
                "cjlrxn",
                "cjlrxq",
                "bkcjlrxn",
                "bkcjlrxq",
                "xscjcxkz",
                "cjcxkzzt",
                "cjztkz",
                "cjzt",
            ]
        },
        "rawHtml": text,
        "rawDetailJson": [],
        "summary": {
            "serverGpa": gpa_match.group(1) if gpa_match else "",
            "planTotalCourses": int(plan_counts_match.group(1))
            if plan_counts_match
            else 0,
            "planPassedCourses": int(plan_counts_match.group(2))
            if plan_counts_match
            else 0,
            "planFailedCourses": int(plan_counts_match.group(3))
            if plan_counts_match
            else 0,
            "planUnstartedCourses": int(plan_counts_match.group(4))
            if plan_counts_match
            else 0,
            "planStudyingCourses": int(plan_counts_match.group(5))
            if plan_counts_match
            else 0,
            "outsidePassedCourses": int(outside_counts_match.group(1))
            if outside_counts_match
            else 0,
            "outsideFailedCourses": int(outside_counts_match.group(2))
            if outside_counts_match
            else 0,
        },
        "nodes": roots,
        "flatNodes": list(nodes_by_id.values()),
    }


def normalize_academic_course(item: dict) -> dict:
    credit_text = format_credit_text(item.get("XF"))
    try:
        credit_value = float(credit_text) if credit_text else None
    except Exception:
        credit_value = None
    status_type, status_text = _academic_course_status(
        item.get("XDZT"), str(item.get("MAXCJ") or "")
    )
    return {
        "kchId": str(item.get("KCH_ID") or item.get("KCH") or ""),
        "kch": str(item.get("KCH") or item.get("KCH_ID") or ""),
        "name": str(item.get("KCMC") or ""),
        "englishName": str(item.get("KCYWMC") or ""),
        "creditText": credit_text,
        "creditValue": credit_value,
        "statusCode": str(item.get("XDZT") or ""),
        "statusType": status_type,
        "status": status_text,
        "score": str(item.get("CJ") or ""),
        "maxScore": str(item.get("MAXCJ") or ""),
        "gradePoint": str(item.get("JD") or ""),
        "academicYear": str(item.get("XNMC") or item.get("JYXDXNMC") or ""),
        "term": str(item.get("XQMMC") or item.get("JYXDXQMC") or ""),
        "suggestedYear": str(item.get("JYXDXNMC") or ""),
        "suggestedTerm": str(item.get("JYXDXQMC") or ""),
        "courseCategory": str(item.get("KCLBMC") or ""),
        "courseNature": str(item.get("KCXZMC") or ""),
        "courseFormat": str(item.get("KCGSMC") or ""),
        "hoursText": str(item.get("XSXXXX") or ""),
        "planned": str(item.get("SFJHKC") or ""),
    }


def _academic_node_courses_payload(node, params):
    payload = {
        "fromXh_id": "",
        "xfyqjd_id": node["id"],
        "xh_id": params.get("xh_id", ""),
    }
    if node["id"] in ("qtkcxfyq", "cxcyqkxfyq"):
        payload.update(
            {
                "cjlrxn": params.get("cjlrxn", ""),
                "cjlrxq": params.get("cjlrxq", ""),
                "bkcjlrxn": params.get("bkcjlrxn", ""),
                "bkcjlrxq": params.get("bkcjlrxq", ""),
                "xscjcxkz": params.get("xscjcxkz", ""),
                "cjcxkzzt": params.get("cjcxkzzt", ""),
                "cjztkz": params.get("cjztkz", ""),
                "cjzt": params.get("cjzt", ""),
            }
        )
    return payload


def _academic_node_courses_endpoint(node):
    return (
        "xsxyqk_cxJxzxjhxfyqKcxx.html"
        if node["courseSource"] == "1" or node["id"] in ("qtkcxfyq", "cxcyqkxfyq")
        else "xsxyqk_cxJxzxjhxfyqFKcxx.html"
    )


def fetch_academic_node_courses(
    node_id, course_source, params, log_func=None, debug_func=None
):
    proxy_node = {"id": node_id, "courseSource": course_source}
    payload = _academic_node_courses_payload(proxy_node, params)
    endpoint = _academic_node_courses_endpoint(proxy_node)
    if debug_func:
        debug_func(f"POST 学业情况课程明细: {node_id}")
    try:
        courses = http_post(
            base_url + f"/jwglxt/xsxy/{endpoint}?gnmkdm=N105515",
            data=payload,
            timeout=REQ_TIMEOUT["academic_detail"],
        ).json()
    except Exception:
        courses = []
    return [normalize_academic_course(item) for item in courses or []]


def fetch_academic_status(tree_only=False, log_func=None, debug_func=None):
    try:
        if debug_func:
            debug_func("GET 学业情况页面")
        page = http_get(
            base_url
            + "/jwglxt/xsxy/xsxyqk_cxXsxyqkIndex.html?gnmkdm=N105515&layout=default",
            timeout=REQ_TIMEOUT["academic_status"],
        ).text
        parsed = parse_academic_page(page)
        params = parsed["params"]
        parsed["rawDetailJson"] = []
        if not tree_only:
            for node in parsed["flatNodes"]:
                if not node["isLeaf"]:
                    continue
                payload = _academic_node_courses_payload(node, params)
                endpoint = _academic_node_courses_endpoint(node)
                if debug_func:
                    debug_func(f"POST 学业情况课程明细: {node['name']}")
                try:
                    courses = http_post(
                        base_url + f"/jwglxt/xsxy/{endpoint}?gnmkdm=N105515",
                        data=payload,
                        timeout=REQ_TIMEOUT["academic_detail"],
                    ).json()
                except Exception:
                    courses = []
                node["courses"] = [
                    normalize_academic_course(item) for item in courses or []
                ]
                parsed["rawDetailJson"].append(
                    {
                        "nodeId": node["id"],
                        "nodeName": node["name"],
                        "endpoint": endpoint,
                        "payload": payload,
                        "response": courses or [],
                    }
                )
        parsed.pop("flatNodes", None)
        return parsed
    except Exception as exc:
        if log_func:
            log_func(f"获取学业情况失败: {exc}")
        if debug_func:
            debug_func(f"学业情况异常: {exc}")
        return {
            "params": {},
            "rawHtml": "",
            "rawDetailJson": [],
            "summary": {
                "serverGpa": "",
                "planTotalCourses": 0,
                "planPassedCourses": 0,
                "planFailedCourses": 0,
                "planUnstartedCourses": 0,
                "planStudyingCourses": 0,
                "outsidePassedCourses": 0,
                "outsideFailedCourses": 0,
            },
            "nodes": [],
        }
