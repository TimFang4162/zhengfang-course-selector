import re
import time


class GrabTaskMixin:
    def _expr_needs_classes(self, expression: str) -> bool:
        return bool(
            re.search(
                r"\bclass\.|\bteachers\b|\bconflicts\b|\bhas_capacity\b", expression
            )
        )

    def _extract_course_ids(self, expression: str):
        return re.findall(r"course\.id\s*==\s*[\"']([^\"']+)[\"']", expression)

    def _extract_category_ids(self, expression: str):
        return re.findall(
            r"course\.categoryId\s*==\s*[\"']?([^\"'\s)]+)[\"']?", expression
        )

    def _eval_grab_expression(
        self, expression: str, category: dict, course: dict, class_item: dict | None
    ):
        selected = self._to_int(class_item.get("selectedCount")) if class_item else 0
        capacity = self._to_int(class_item.get("capacity")) if class_item else 0
        course_obj = {
            "id": str(course.get("kchId", "")),
            "name": course.get("courseName", ""),
            "credit": course.get("creditValue"),
            "categoryId": str(category.get("id", "")),
        }
        class_obj = None
        if class_item:
            class_obj = {
                "id": str(class_item.get("doJxbId") or class_item.get("jxbId") or ""),
                "no": class_item.get("classNo", ""),
                "teacher": class_item.get("teacherName", ""),
                "time": class_item.get("sksj", ""),
                "location": class_item.get("location", ""),
                "selected": selected,
                "capacity": capacity,
                "capacityLeft": max(0, capacity - selected),
            }
        env = {
            "course": self._AttrDict(course_obj),
            "class_": self._AttrDict(class_obj or {}),
            "teachers": [
                class_item.get("teacherName", ""),
                class_item.get("teacherTitle", ""),
            ]
            if class_item
            else [],
            "conflicts": False,
            "has_capacity": bool(class_item and capacity > selected),
        }
        try:
            return bool(
                eval(expression.replace("class.", "class_."), {"__builtins__": {}}, env)
            )
        except Exception:
            return False

    class _AttrDict(dict):
        def __getattr__(self, key):
            return self.get(key)

    def _to_int(self, value):
        try:
            return int(value)
        except Exception:
            return 0

    def preview_grab(self, payload: dict):
        with self.lock:
            self._require_auth()
            context = payload.get("context") or {}
            expression = str(payload.get("expression") or "True")
            match_limit = int(payload.get("matchLimit") or 200)
            state = self.tree_state()
            category_ids = set(self._extract_category_ids(expression))
            course_ids = set(self._extract_course_ids(expression))
            if context.get("type") == "category":
                category_ids.add(str(context.get("categoryId")))
            elif context.get("categoryId") not in (None, ""):
                category_ids.add(str(context.get("categoryId")))
            if context.get("kchId"):
                course_ids.add(str(context.get("kchId")))
            needs_classes = self._expr_needs_classes(expression)
            missing = {"courseLoads": [], "classLoads": []}
            matches = []
            scan_course_count = 0
            candidate_course_keys = set()
            candidate_class_count = 0
            request_count = 0
            for category in state["items"]:
                category_id = str(category["id"])
                if category_ids and category_id not in category_ids:
                    continue
                if not category.get("coursesLoaded") or category.get("hasMore"):
                    missing["courseLoads"].append(
                        {
                            "categoryId": category["id"],
                            "name": category["name"],
                            "mode": "all",
                        }
                    )
                    request_count += 1
                    continue
                for course in category.get("courses", []):
                    if course_ids and str(course["kchId"]) not in course_ids:
                        continue
                    scan_course_count += 1
                    if needs_classes and not course.get("classesLoaded"):
                        missing["classLoads"].append(
                            {
                                "categoryId": category["id"],
                                "kchId": course["kchId"],
                                "courseName": course["courseName"],
                            }
                        )
                        request_count += 1
                        continue
                    for class_item in course.get("classes") or [None]:
                        if self._eval_grab_expression(
                            expression, category, course, class_item
                        ):
                            matches.append(
                                {
                                    "category": {
                                        "id": category["id"],
                                        "name": category["name"],
                                    },
                                    "course": course,
                                    "classItem": class_item,
                                }
                            )
                            candidate_course_keys.add((category["id"], course["kchId"]))
                            if class_item:
                                candidate_class_count += 1
            ready = not missing["courseLoads"] and not missing["classLoads"]
            return {
                "ready": ready,
                "missing": missing,
                "matches": matches[:match_limit],
                "scanCourseCount": scan_course_count,
                "candidateCourseCount": len(candidate_course_keys),
                "candidateClassCount": candidate_class_count,
                "estimatedRequestsPerTick": len(candidate_course_keys)
                if ready
                else request_count,
            }

    def load_missing(self, payload: dict):
        with self.lock:
            missing = payload.get("missing") or {}
            for item in missing.get("courseLoads", []):
                self.load_all_courses(int(item["categoryId"]))
            for item in missing.get("classLoads", []):
                self.fetch_classes(int(item["categoryId"]), str(item["kchId"]))
            return {"ok": True, "tree": self.tree_state()}

    def create_grab_task(self, payload: dict):
        with self.lock:
            self._require_auth()
            expression = str(payload.get("expression") or "True")
            context = payload.get("context") or {}
            preview = self.preview_grab(
                {"context": context, "expression": expression, "matchLimit": 100000}
            )
            if not preview.get("ready"):
                raise ValueError("抢课任务仍有缺失数据，请先加载缺失数据")
            candidates = {}
            for item in preview.get("matches", []):
                class_item = item.get("classItem")
                if not class_item:
                    continue
                key = (int(item["category"]["id"]), str(item["course"]["kchId"]))
                bucket = candidates.setdefault(
                    key,
                    {
                        "categoryId": key[0],
                        "kchId": key[1],
                        "courseName": item["course"].get("courseName", key[1]),
                        "classIds": set(),
                    },
                )
                bucket["classIds"].add(
                    str(
                        class_item.get("doJxbId")
                        or class_item.get("jxbId")
                        or class_item.get("classNo")
                    )
                )
            task_id = f"grab-{self.next_grab_task_id}"
            self.next_grab_task_id += 1
            now = time.time()
            start_mode = str(payload.get("startMode") or "now")
            start_at = (
                self._parse_timestamp(payload.get("startAt"))
                if start_mode == "scheduled"
                else now
            )
            status = "running" if start_at <= now else "waiting"
            task = {
                "id": task_id,
                "name": payload.get("name") or "抢课任务",
                "expression": expression,
                "context": context,
                "status": status,
                "progress": "等待 tick" if status == "running" else "等待启动时间",
                "tickInterval": float(payload.get("tickInterval") or 3),
                "timeoutSeconds": float(payload.get("timeoutSeconds") or 600),
                "stopOnFirstSuccess": bool(payload.get("stopOnFirstSuccess", True)),
                "errorPolicy": str(payload.get("errorPolicy") or "retry_once"),
                "startMode": start_mode,
                "startAt": start_at,
                "createdAt": now,
                "startedAt": now if status == "running" else None,
                "lastTickAt": 0,
                "tickCount": 0,
                "successCount": 0,
                "lastError": "",
                "lastResult": "",
                "events": [],
                "candidateCourses": [
                    {**value, "classIds": sorted(value["classIds"])}
                    for value in candidates.values()
                ],
                "candidateCourseCount": len(candidates),
                "candidateClassCount": sum(
                    len(value["classIds"]) for value in candidates.values()
                ),
            }
            self.grab_tasks[task_id] = task
            self._log_info(
                f"创建抢课任务 {task_id}: {task['candidateCourseCount']} 门候选课程"
            )
            return {"ok": True, "task": self._public_grab_task(task)}

    def _parse_timestamp(self, value):
        if not value:
            return time.time()
        if isinstance(value, (int, float)):
            return float(value)
        text = str(value)
        try:
            return float(text)
        except Exception:
            pass
        try:
            from datetime import datetime

            return datetime.fromisoformat(text.replace("Z", "+00:00")).timestamp()
        except Exception:
            return time.time()

    def list_grab_tasks(self):
        with self.lock:
            return {
                "items": [
                    self._public_grab_task(task) for task in self.grab_tasks.values()
                ]
            }

    def stop_grab_task(self, payload: dict):
        with self.lock:
            task = self._get_grab_task(payload)
            task["status"] = "stopped"
            task["progress"] = "已手动停止"
            self._add_task_event(task, "手动停止")
            return {"ok": True, "task": self._public_grab_task(task)}

    def start_grab_task(self, payload: dict):
        with self.lock:
            task = self._get_grab_task(payload)
            task["status"] = "running"
            task["progress"] = "手动启动"
            task["lastTickAt"] = 0
            task["startedAt"] = time.time()
            self._add_task_event(task, "手动启动")
            return {"ok": True, "task": self._public_grab_task(task)}

    def _get_grab_task(self, payload: dict):
        task_id = str(payload.get("id") or "")
        task = self.grab_tasks.get(task_id)
        if not task:
            raise ValueError("无效抢课任务")
        return task

    def _add_task_event(self, task: dict, message: str):
        task.setdefault("events", []).append(
            {"time": time.strftime("%H:%M:%S"), "message": message}
        )
        task["events"] = task["events"][-50:]

    def _public_grab_task(self, task: dict):
        return {
            "id": task["id"],
            "name": task["name"],
            "status": task["status"],
            "progress": task["progress"],
            "tickCount": task["tickCount"],
            "successCount": task["successCount"],
            "candidateCourseCount": task["candidateCourseCount"],
            "candidateClassCount": task["candidateClassCount"],
            "startMode": task.get("startMode"),
            "startAt": task.get("startAt"),
            "tickInterval": task.get("tickInterval"),
            "timeoutSeconds": task.get("timeoutSeconds"),
            "stopOnFirstSuccess": task.get("stopOnFirstSuccess"),
            "errorPolicy": task.get("errorPolicy"),
            "expression": task.get("expression"),
            "lastError": task.get("lastError"),
            "lastResult": task.get("lastResult"),
            "events": task.get("events", [])[-20:],
        }

    def _scheduler_tick(self):
        with self.lock:
            if not self.mod.is_authenticated:
                return
            now = time.time()
            for task in list(self.grab_tasks.values()):
                if task.get("status") != "running":
                    if task.get("status") == "waiting" and now >= task.get(
                        "startAt", now
                    ):
                        task["status"] = "running"
                        task["progress"] = "到达启动时间"
                        task["startedAt"] = now
                        self._add_task_event(task, "到达启动时间，开始运行")
                    continue
                if (
                    now - (task.get("startedAt") or task["createdAt"])
                    > task["timeoutSeconds"]
                ):
                    task["status"] = "timeout"
                    task["progress"] = "已超时"
                    self._add_task_event(task, "任务超时")
                    continue
                if now - task["lastTickAt"] < task["tickInterval"]:
                    continue
                self._run_grab_task_tick(task, now)

    def _run_grab_task_tick(self, task: dict, now: float):
        task["lastTickAt"] = now
        task["tickCount"] += 1
        task["progress"] = (
            f"tick {task['tickCount']} / 刷新 {task['candidateCourseCount']} 门课程"
        )
        for course_target in task["candidateCourses"]:
            try:
                data = self._fetch_classes_for_task(task, course_target)
            except Exception as exc:
                task["lastError"] = str(exc)
                if task.get("errorPolicy") == "stop":
                    task["status"] = "failed"
                    task["progress"] = f"错误停止: {exc}"
                    self._add_task_event(task, task["progress"])
                    return
                task["progress"] = f"请求失败，跳过: {course_target['courseName']}"
                self._add_task_event(task, task["progress"])
                continue
            class_ids = set(course_target["classIds"])
            for class_item in data.get("classes", []):
                item_id = str(
                    class_item.get("doJxbId")
                    or class_item.get("jxbId")
                    or class_item.get("classNo")
                )
                if item_id not in class_ids:
                    continue
                course = self._course_summary(
                    course_target["categoryId"],
                    course_target["kchId"],
                    self.course_info_cache[course_target["categoryId"]][
                        course_target["kchId"]
                    ],
                )
                category = {"id": course_target["categoryId"], "name": ""}
                if not self._eval_grab_expression(
                    task["expression"], category, course, class_item
                ):
                    continue
                if self._to_int(class_item.get("capacity")) <= self._to_int(
                    class_item.get("selectedCount")
                ):
                    continue
                res = self.choose_class(
                    {
                        "categoryId": course_target["categoryId"],
                        "kchId": course_target["kchId"],
                        "doJxbId": class_item.get("doJxbId"),
                        "courseName": course_target["courseName"],
                    }
                )
                task["successCount"] += 1
                task["lastResult"] = str(res.get("payload", ""))[:300]
                task["progress"] = (
                    f"已尝试选课 {course_target['courseName']} / {class_item.get('classNo')}"
                )
                self._add_task_event(task, task["progress"])
                self.fetch_timetable()
                if task.get("stopOnFirstSuccess"):
                    task["status"] = "success"
                    task["progress"] = (
                        f"成功后停止: {course_target['courseName']} / {class_item.get('classNo')}"
                    )
                    self._add_task_event(task, task["progress"])
                    return
        task["progress"] = f"tick {task['tickCount']} 完成，未命中余量"

    def _fetch_classes_for_task(self, task: dict, course_target: dict):
        try:
            return self.fetch_classes(
                course_target["categoryId"], course_target["kchId"]
            )
        except Exception:
            if task.get("errorPolicy") != "retry_once":
                raise
            self._add_task_event(
                task, f"请求失败，重试一次: {course_target['courseName']}"
            )
            return self.fetch_classes(
                course_target["categoryId"], course_target["kchId"]
            )
