import ast
import re
import time


class GrabTaskMixin:
    _DYNAMIC_GRAB_NAMES = {"conflicts", "has_capacity"}
    _DYNAMIC_GRAB_CLASS_FIELDS = {"selected", "capacityLeft"}

    def _class_identity_set(self, class_item: dict | None):
        if not class_item:
            return set()
        class_no = class_item.get("classNo")
        return {str(class_no)} if class_no not in (None, "") else set()

    def _class_choose_id(self, class_item: dict | None):
        if not class_item:
            return ""
        return str(class_item.get("doJxbId") or class_item.get("jxbId") or "")

    def _build_conflict_context(self, timetable: dict):
        occupied_slots = set()
        selected_class_ids = set()
        selected_do_jxb_ids = set()
        for entry in (timetable or {}).get("entries", []):
            for slot in entry.get("slots") or []:
                occupied_slots.add(tuple(slot))
        for item in (timetable or {}).get("selectedClassIds", []):
            if item not in (None, ""):
                selected_class_ids.add(str(item))
        for item in (timetable or {}).get("selectedDoJxbIds", []):
            if item not in (None, ""):
                selected_do_jxb_ids.add(str(item))
        return {
            "occupiedSlots": occupied_slots,
            "selectedClassIds": selected_class_ids,
            "selectedDoJxbIds": selected_do_jxb_ids,
        }

    def _class_conflicts(self, class_item: dict | None, conflict_context: dict) -> bool:
        if not class_item:
            return False
        jxb_id = str(class_item.get("jxbId") or "")
        do_jxb_id = str(class_item.get("doJxbId") or "")
        if jxb_id and jxb_id in conflict_context["selectedClassIds"]:
            return False
        if do_jxb_id and do_jxb_id in conflict_context["selectedDoJxbIds"]:
            return False
        for slot in class_item.get("slots") or []:
            if tuple(slot) in conflict_context["occupiedSlots"]:
                return True
        return False

    def _expr_needs_classes(self, expression: str) -> bool:
        return bool(
            re.search(
                r"\bclass\.|\bteachers\b|\bconflicts\b|\bhas_capacity\b", expression
            )
        )

    def _extract_scan_scope(self, expression: str):
        try:
            tree = ast.parse(expression.replace("class.", "class_."), mode="eval")
        except SyntaxError:
            return set(), set()
        scope = self._scan_scope_from_node(tree.body)
        return scope.get("categoryIds") or set(), scope.get("courseIds") or set()

    def _scan_scope_from_node(self, node):
        if isinstance(node, ast.BoolOp):
            child_scopes = [self._scan_scope_from_node(value) for value in node.values]
            if isinstance(node.op, ast.And):
                return self._merge_and_scan_scopes(child_scopes)
            if isinstance(node.op, ast.Or):
                return self._merge_or_scan_scopes(child_scopes)
            return {}
        if (
            isinstance(node, ast.Compare)
            and len(node.ops) == 1
            and len(node.comparators) == 1
        ):
            return self._scan_scope_from_compare(
                node.left, node.ops[0], node.comparators[0]
            )
        return {}

    def _merge_and_scan_scopes(self, scopes):
        merged = {}
        for scope in scopes:
            for key, values in scope.items():
                merged[key] = merged[key] & values if key in merged else set(values)
        return merged

    def _merge_or_scan_scopes(self, scopes):
        merged = {}
        for key in ("categoryIds", "courseIds"):
            if scopes and all(key in scope for scope in scopes):
                values = set()
                for scope in scopes:
                    values.update(scope[key])
                merged[key] = values
        return merged

    def _scan_scope_from_compare(self, left, op, right):
        left_field = self._scan_scope_field(left)
        right_field = self._scan_scope_field(right)
        if isinstance(op, ast.Eq):
            if left_field:
                value = self._scan_scope_literal(right)
                return {left_field: {value}} if value is not None else {}
            if right_field:
                value = self._scan_scope_literal(left)
                return {right_field: {value}} if value is not None else {}
        if isinstance(op, ast.In) and left_field:
            values = self._scan_scope_literal_collection(right)
            return {left_field: values} if values else {}
        return {}

    def _scan_scope_field(self, node):
        if not isinstance(node, ast.Attribute) or not isinstance(node.value, ast.Name):
            return None
        if node.value.id != "course":
            return None
        if node.attr == "id":
            return "courseIds"
        if node.attr == "categoryId":
            return "categoryIds"
        return None

    def _scan_scope_literal(self, node):
        if isinstance(node, ast.Constant) and isinstance(node.value, (str, int)):
            return str(node.value)
        return None

    def _scan_scope_literal_collection(self, node):
        if not isinstance(node, (ast.List, ast.Tuple, ast.Set)):
            return set()
        values = set()
        for item in node.elts:
            value = self._scan_scope_literal(item)
            if value is None:
                return set()
            values.add(value)
        return values

    def _eval_grab_expression(
        self,
        expression: str,
        category: dict,
        course: dict,
        class_item: dict | None,
        conflict_context: dict,
    ):
        env = self._grab_expression_env(category, course, class_item, conflict_context)
        try:
            return bool(
                eval(expression.replace("class.", "class_."), {"__builtins__": {}}, env)
            )
        except Exception:
            return False

    def _eval_grab_scan_expression(
        self,
        expression: str,
        category: dict,
        course: dict,
        class_item: dict | None,
        conflict_context: dict,
    ):
        env = self._grab_expression_env(category, course, class_item, conflict_context)
        try:
            tree = ast.parse(expression.replace("class.", "class_."), mode="eval")
            return self._grab_scan_node_can_match(tree.body, env)
        except Exception:
            return True

    def _grab_expression_env(
        self,
        category: dict,
        course: dict,
        class_item: dict | None,
        conflict_context: dict,
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
        return {
            "course": self._AttrDict(course_obj),
            "class_": self._AttrDict(class_obj or {}),
            "teachers": [
                class_item.get("teacherName", ""),
                class_item.get("teacherTitle", ""),
            ]
            if class_item
            else [],
            "conflicts": self._class_conflicts(class_item, conflict_context),
            "has_capacity": bool(class_item and capacity > selected),
        }

    def _grab_scan_node_can_match(self, node, env: dict) -> bool:
        if isinstance(node, ast.BoolOp):
            results = [
                self._grab_scan_node_can_match(value, env) for value in node.values
            ]
            if isinstance(node.op, ast.And):
                return all(results)
            if isinstance(node.op, ast.Or):
                return any(results)
            return True
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.Not):
            value = self._grab_static_node_value(node.operand, env)
            return True if value is None else not bool(value)
        value = self._grab_static_node_value(node, env)
        return True if value is None else bool(value)

    def _grab_static_node_value(self, node, env: dict):
        if self._grab_node_has_dynamic_value(node):
            return None
        try:
            expr = ast.Expression(body=node)
            ast.fix_missing_locations(expr)
            return eval(compile(expr, "<grab-scan>", "eval"), {"__builtins__": {}}, env)
        except Exception:
            return None

    def _grab_node_has_dynamic_value(self, node) -> bool:
        for child in ast.walk(node):
            if isinstance(child, ast.Name) and child.id in self._DYNAMIC_GRAB_NAMES:
                return True
            if (
                isinstance(child, ast.Attribute)
                and child.attr in self._DYNAMIC_GRAB_CLASS_FIELDS
                and isinstance(child.value, ast.Name)
                and child.value.id == "class_"
            ):
                return True
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
            conflict_context = self._build_conflict_context(
                self.fetch_timetable(refresh=False)
            )
            category_ids, course_ids = self._extract_scan_scope(expression)
            if course_ids and not category_ids:
                if (
                    context.get("categoryId") not in (None, "")
                    and str(context.get("kchId") or "") in course_ids
                ):
                    category_ids.add(str(context.get("categoryId")))
                found_course_ids = set()
                found_category_ids = set()
                for category in state["items"]:
                    for course in category.get("courses", []):
                        if str(course["kchId"]) in course_ids:
                            found_course_ids.add(str(course["kchId"]))
                            found_category_ids.add(str(category["id"]))
                if found_course_ids == course_ids:
                    category_ids.update(found_category_ids)
            if not category_ids and not course_ids:
                if context.get("categoryId") not in (None, ""):
                    category_ids.add(str(context.get("categoryId")))
                if context.get("kchId"):
                    course_ids.add(str(context.get("kchId")))
            needs_classes = True
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
                if not course_ids and (
                    not category.get("coursesLoaded") or category.get("hasMore")
                ):
                    missing["courseLoads"].append(
                        {
                            "categoryId": category["id"],
                            "name": category["name"],
                            "mode": "all",
                        }
                    )
                    request_count += 1
                    continue
                courses_by_id = {
                    str(course["kchId"]): course
                    for course in category.get("courses", [])
                }
                if course_ids:
                    courses = [
                        courses_by_id.get(kch_id)
                        or self._course_summary(int(category_id), kch_id, [])
                        for kch_id in sorted(course_ids)
                    ]
                else:
                    courses = category.get("courses", [])
                for course in courses:
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
                    for class_item in course.get("classes") or []:
                        if self._eval_grab_scan_expression(
                            expression, category, course, class_item, conflict_context
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
            course_loads = missing.get("courseLoads", [])
            class_loads = missing.get("classLoads", [])
            self._log_info(
                f"加载抢课预览缺失数据: {len(course_loads)} 个大类，{len(class_loads)} 门课程教学班"
            )
            for item in course_loads:
                self.load_all_courses(int(item["categoryId"]))
            for item in class_loads:
                self.fetch_classes(int(item["categoryId"]), str(item["kchId"]))
            self._log_info("抢课预览缺失数据加载完成")
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
                self._log_warn("创建抢课任务失败: 仍有缺失数据")
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
                bucket["classIds"].update(self._class_identity_set(class_item))
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
                "lastTickDebug": {},
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
                f"创建抢课任务 {task_id}: {task['candidateCourseCount']} 门候选课程，{task['candidateClassCount']} 个教学班"
            )
            self._publish_grab_state()
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
            result = {
                "items": [
                    self._public_grab_task(task) for task in self.grab_tasks.values()
                ]
            }
            if self.grab_tasks and self.mod.is_authenticated:
                result["tree"] = self.tree_state()
                result["timetable"] = self.fetch_timetable(refresh=False)
            return result

    def stop_grab_task(self, payload: dict):
        with self.lock:
            task = self._get_grab_task(payload)
            task["status"] = "stopped"
            task["progress"] = "已手动停止"
            self._add_task_event(task, "手动停止")
            self._log_info(f"手动停止抢课任务: {task['id']}")
            self._publish_grab_state()
            return {"ok": True, "task": self._public_grab_task(task)}

    def start_grab_task(self, payload: dict):
        with self.lock:
            task = self._get_grab_task(payload)
            task["status"] = "running"
            task["progress"] = "手动启动"
            task["lastTickAt"] = 0
            task["startedAt"] = time.time()
            self._add_task_event(task, "手动启动")
            self._log_info(f"手动启动抢课任务: {task['id']}")
            self._publish_grab_state()
            return {"ok": True, "task": self._public_grab_task(task)}

    def _publish_grab_state(self):
        if hasattr(self, "_publish_event"):
            self._publish_event("grab.tasks", self.list_grab_tasks())

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
            "lastTickDebug": task.get("lastTickDebug", {}),
            "candidateCourses": task.get("candidateCourses", []),
            "context": task.get("context", {}),
            "createdAt": task.get("createdAt"),
            "startedAt": task.get("startedAt"),
            "lastTickAt": task.get("lastTickAt"),
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
        conflict_context = self._build_conflict_context(
            self.fetch_timetable(refresh=False)
        )
        skipped_id_count = 0
        skipped_expression_count = 0
        skipped_capacity_count = 0
        checked_class_count = 0
        matched_identity_count = 0
        attempted_count = 0
        for course_target in task["candidateCourses"]:
            try:
                data = self._fetch_classes_for_task(task, course_target)
            except Exception as exc:
                task["lastError"] = str(exc)
                if task.get("errorPolicy") == "stop":
                    task["status"] = "failed"
                    task["progress"] = f"错误停止: {exc}"
                    self._add_task_event(task, task["progress"])
                    self._log_business(
                        f"抢课任务失败: {task['id']} / {exc}", level="error"
                    )
                    return
                task["progress"] = f"请求失败，跳过: {course_target['courseName']}"
                self._add_task_event(task, task["progress"])
                continue
            class_ids = set(course_target["classIds"])
            for class_item in data.get("classes", []):
                checked_class_count += 1
                item_ids = self._class_identity_set(class_item)
                if class_ids and not item_ids.intersection(class_ids):
                    skipped_id_count += 1
                    continue
                matched_identity_count += 1
                course = self._course_summary(
                    course_target["categoryId"],
                    course_target["kchId"],
                    self.course_info_cache[course_target["categoryId"]][
                        course_target["kchId"]
                    ],
                )
                category = {"id": course_target["categoryId"], "name": ""}
                if not self._eval_grab_expression(
                    task["expression"], category, course, class_item, conflict_context
                ):
                    skipped_expression_count += 1
                    continue
                if self._to_int(class_item.get("capacity")) <= self._to_int(
                    class_item.get("selectedCount")
                ):
                    skipped_capacity_count += 1
                    continue
                choose_id = self._class_choose_id(class_item)
                if not choose_id:
                    task["lastError"] = "命中教学班但缺少 doJxbId/jxbId，无法提交选课"
                    self._add_task_event(task, task["lastError"])
                    continue
                res = self.choose_class(
                    {
                        "categoryId": course_target["categoryId"],
                        "kchId": course_target["kchId"],
                        "doJxbId": choose_id,
                        "courseName": course_target["courseName"],
                    }
                )
                attempted_count += 1
                task["lastResult"] = str(res.get("payload", ""))[:300]
                if not res.get("ok"):
                    task["lastError"] = res.get("message", "选课失败")
                    task["progress"] = (
                        f"选课失败: {course_target['courseName']} / {class_item.get('classNo')}"
                    )
                    self._add_task_event(task, task["progress"])
                    continue
                task["successCount"] += 1
                task["progress"] = (
                    f"已尝试选课 {course_target['courseName']} / {class_item.get('classNo')}"
                )
                self._add_task_event(task, task["progress"])
                self.fetch_timetable(refresh=True)
                if task.get("stopOnFirstSuccess"):
                    task["status"] = "success"
                    task["progress"] = (
                        f"成功后停止: {course_target['courseName']} / {class_item.get('classNo')}"
                    )
                    self._add_task_event(task, task["progress"])
                    self._log_info(
                        f"抢课任务成功: {task['id']} / {course_target['courseName']} / {class_item.get('classNo')}"
                    )
                    self._publish_grab_state()
                    return
        task["lastTickDebug"] = {
            "checkedClassCount": checked_class_count,
            "matchedIdentityCount": matched_identity_count,
            "attemptedCount": attempted_count,
            "skippedIdCount": skipped_id_count,
            "skippedExpressionCount": skipped_expression_count,
            "skippedCapacityCount": skipped_capacity_count,
        }
        task["progress"] = (
            f"tick {task['tickCount']} 完成，未命中余量"
            f" / ID跳过 {skipped_id_count}"
            f" / 表达式跳过 {skipped_expression_count}"
            f" / 容量跳过 {skipped_capacity_count}"
        )
        self._publish_grab_state()

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
