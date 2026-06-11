import { useCallback } from "react";
import { useSnapshot } from "valtio";
import { useAppContext } from "../app/app-context.jsx";
import { state, isSelectedClass } from "../app/state.js";
import { useComposingInput } from "../hooks/use-composing-input.js";
import { cx, filterValue, filterLabel, formatDebugJson } from "../shared/utils.js";
import { Dialog, DialogClose, DialogDescription, DialogPopup, DialogHeader, DialogTitle, DialogPanel, DialogFooter } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Checkbox } from "../components/ui/checkbox";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../components/ui/table";
import { Accordion, AccordionItem, AccordionTrigger, AccordionPanel } from "../components/ui/accordion";
import { Spinner } from "../components/ui/spinner";
import { Tabs, TabsList, TabsTab } from "../components/ui/tabs";
import { BookOpen, Braces, Clock, Database, KeyRound, Trash2, User, XIcon } from "lucide-react";
import { GrabModal, GrabTaskModal } from "../features/grab/GrabView.jsx";

const CHOOSED_LABELS = {
  kcmc: '课程名称', jxbmc: '教学班名称', sksj: '上课时间',
  jsxx: '教师信息', jxdd: '教学地点',
  kch_id: '课程号', t_kch_id: '课程号(教务)',
  jxb_id: '教学班ID', do_jxb_id: '选课教学班ID', jxbh: '教学班号',
  xf: '学分', jxbxf: '学分(教学班)',
  zixf: '自选否', kklxmc: '课程类型', kklxdm: '课程类型代码',
  rwlx: '任务类型', sxbj: '选上标记', cxbj: '重修标记',
  xxkbj: '已修过标记', sfktk: '是否可退课', tktjrs: '退课提交人数',
  jxbrs: '已选人数', yxzrs: '容量', qz: '权重',
  zckz: 'ZCKZ', zntgpk: '智能投排课', ddkzbj: '单独控制学分',
  isInxksj: '是否在选课时间内', krrl: 'Krrl', sfxkbj: '是否可选',
  bhbcyxkjxb: 'Bhbcyxkjxb', bdzcbj: 'Bdzcbj', jdlx: 'Jdlx',
  jxbzls: 'Jxbzls', kklxpx: 'Kklxpx', rlkz: 'Rlkz', rlzlkz: 'Rlzlkz', zy: '专业',
};

function RawDataAccordion({ rawData }) {
  const entries = Object.entries(CHOOSED_LABELS).filter(([k]) => {
    const v = rawData[k];
    return v != null && v !== '';
  });
  return (
    <Accordion>
      <AccordionItem value="choosed-fields">
        <AccordionTrigger><span className="inline-flex items-center gap-1.5"><Database className="size-4" />教务原始数据 ({entries.length} 字段)</span></AccordionTrigger>
        <AccordionPanel>
          <div className="debug-grid">
            {entries.map(([key, label]) => (
              <><div key={`${key}-l`}>{label}</div><div key={`${key}-v`}>{String(rawData[key])}</div></>
            ))}
          </div>
          <pre className="max-h-[260px] mt-2 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-[1.45] text-foreground">{formatDebugJson(rawData)}</pre>
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
}

export function ModalLayer() {
  const app = useAppContext();
  const snap = useSnapshot(state);
  const picker = snap.filterPicker;

  const pickerSearch = useComposingInput(picker?.query || "", useCallback((v) => { state.filterPicker.query = v; }, []));

  const modalClass = snap.modalClass;
  const classConflictEntries = (() => {
    const item = modalClass?.item;
    if (!item?.slots?.length) return [];
    const itemSlots = new Set(item.slots.map((s) => s.join("-")));
    return (snap.timetable.entries || []).filter((entry) => (entry.slots || []).some((s) => itemSlots.has(s.join("-"))));
  })();
  const classDebugPayload = (() => {
    if (!modalClass) return null;
    if (modalClass.entry) return { source: "timetable", entry: modalClass.entry };
    return { source: "class-list", categoryId: modalClass.categoryId, course: modalClass.course, classItem: modalClass.item };
  })();
  const modalTitle = (() => {
    if (modalClass?.entry) return `${modalClass.entry.name} / ${modalClass.entry.classNo || "-"}`;
    if (modalClass?.course && modalClass?.item) return `${modalClass.course.courseName} / ${modalClass.item.classNo}`;
    if (modalClass?.course) return modalClass.course.courseName;
    return "课程详情";
  })();
  const modalActionLabel = (() => {
    if (modalClass?.entry) return "退课";
    if (modalClass?.item) return isSelectedClass(modalClass.item) ? "退课" : "选课";
    return "操作";
  })();
  const logDetailEntry = snap.logDetailKey ? snap.logEntries.get(snap.logDetailKey) : null;
  const logDetailTitle = (() => {
    if (!logDetailEntry) return "日志详情";
    return logDetailEntry.type === "request" ? `${logDetailEntry.method || "HTTP"} ${logDetailEntry.path || ""}` : `${app.logs.logTypeText(logDetailEntry.type)} #${logDetailEntry.id}`;
  })();
  const pickerKeyStr = (() => {
    if (!picker) return "";
    return `${picker.type}${picker.parent?.collegeId ? `:${picker.parent.collegeId}` : ""}${picker.query ? `:${picker.query}` : ""}`;
  })();
  const pickerOptions = snap.filterOptions[pickerKeyStr]?.items || [];
  const pickerHasMore = Boolean(snap.filterOptions[pickerKeyStr]?.hasMore);
  const pickerPage = snap.filterOptions[pickerKeyStr]?.page || 1;
  const pickerIsMajor = picker?.type === "major";
  const pickerSelectedItems = (() => {
    const selected = picker?.selected || [];
    return selected.map((item) => {
      const value = filterValue(item);
      const option = pickerOptions.find((o) => o.value === value);
      return { value, label: filterLabel(item) || option?.displayLabel || option?.label || value };
    });
  })();
  const pickerOptionSelected = (value) => (picker?.selected || []).some((item) => filterValue(item) === value);
  const togglePickerValue = (value, label) => {
    const proxyPicker = state.filterPicker;
    if (!proxyPicker) return;
    const selected = proxyPicker.selected;
    const idx = selected.findIndex((item) => filterValue(item) === value);
    if (idx >= 0) selected.splice(idx, 1);
    else selected.push({ value, label: label || value });
  };
  const applyPicker = () => {
    const proxyPicker = state.filterPicker;
    if (!proxyPicker) return;
    const tab = state.courseTabs.find((t) => t.id === proxyPicker.tabId);
    if (tab?.type === "query") {
      tab.draftFilters[proxyPicker.field] = [...proxyPicker.selected];
      if (proxyPicker.field === "collegeIds") tab.draftFilters.majorIds = [];
    }
    state.filterPicker = null;
    app.tree.saveTabsState();
    app.tree.renderTree();
  };
  const pickerLoading = snap.loadingFilterOptions.has(pickerKeyStr);

  return (
    <>
      <Dialog open={!!picker} onOpenChange={(open) => { if (!open) state.filterPicker = null; }}>
        <DialogPopup className="sm:max-w-2xl">
          <DialogHeader>
            <span className="text-muted-foreground">筛选</span>
            <DialogTitle>{picker?.title || "..."}</DialogTitle>
          </DialogHeader>
          <DialogPanel className="flex flex-col gap-3" scrollFade={false}>
            <form className="flex gap-1.5" onSubmit={(e) => {
              e.preventDefault();
              state.filterPicker.page = 1;
              app.tree.loadFilterOptions(state.filterPicker.type, state.filterPicker.parent || {}, 1, state.filterPicker.query).catch(app.showError);
            }}>
              <Input type="search" className="flex-1" placeholder="搜索选项" {...pickerSearch} onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                state.filterPicker.page = 1;
                app.tree.loadFilterOptions(state.filterPicker.type, state.filterPicker.parent || {}, 1, state.filterPicker.query).catch(app.showError);
              }} />
              <Button variant="ghost" size="sm" type="submit" disabled={pickerLoading}>
                {pickerLoading && <Spinner />}
                {pickerLoading ? "搜索中..." : "搜索"}
              </Button>
            </form>
            {pickerSelectedItems.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-muted-foreground text-xs">已选</span>
                {pickerSelectedItems.map((item) => (
                  <Badge key={item.value} variant="secondary" render={<button type="button" />} onClick={() => togglePickerValue(item.value)}>
                    {item.label}
                    <XIcon className="-me-0.5" />
                  </Badge>
                ))}
              </div>
            )}
            <div className="max-h-[min(420px,55vh)] overflow-auto">
              {!pickerOptions.length ? (
                !pickerLoading && <div className="py-2 px-2 text-muted-foreground text-sm">无选项，输入关键词后搜索或稍后重试</div>
              ) : pickerIsMajor ? (
                <Table className="min-w-max border-collapse text-xs">
                  <TableHeader><TableRow><TableHead className="w-[34px] text-center"></TableHead><TableHead className="font-semibold">专业代码</TableHead><TableHead className="font-semibold">专业名称</TableHead><TableHead className="font-semibold">学院</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {pickerOptions.map((item) => (
                      <TableRow key={item.value} onClick={() => togglePickerValue(item.value, item.displayLabel || item.label)} className={cx("hover:bg-accent", { "bg-accent/50": pickerOptionSelected(item.value) })}>
                        <TableCell className="w-[34px] text-center"><Checkbox checked={pickerOptionSelected(item.value)} onClick={(e) => e.stopPropagation()} onCheckedChange={() => togglePickerValue(item.value, item.displayLabel || item.label)} /></TableCell>
                        <TableCell>{item.raw?.zyh || item.value}</TableCell>
                        <TableCell>{item.raw?.zymc || item.label}</TableCell>
                        <TableCell>{item.raw?.jgmc || ""}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                pickerOptions.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-sm px-1.5 py-0.5 min-h-7 text-left text-sm hover:bg-accent"
                    onClick={() => togglePickerValue(item.value, item.displayLabel || item.label)}
                  >
                    <Checkbox checked={pickerOptionSelected(item.value)} onClick={(e) => e.stopPropagation()} onCheckedChange={() => togglePickerValue(item.value, item.displayLabel || item.label)} />
                    <span className="flex-1 truncate">{item.displayLabel || item.label}</span>
                    <span className="text-muted-foreground text-xs shrink-0">{item.value}</span>
                  </button>
                ))
              )}
            </div>
            {pickerHasMore && (
              <Button variant="ghost" size="sm" className="self-start text-info" disabled={pickerLoading} onClick={() => app.tree.loadFilterOptions(state.filterPicker.type, state.filterPicker.parent || {}, pickerPage + 1, state.filterPicker.query).catch(app.showError)}>
                {pickerLoading && <Spinner />}
                加载更多
              </Button>
            )}
          </DialogPanel>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => { state.filterPicker.selected = []; }}><Trash2 aria-hidden="true" />清空</Button>
            <Button variant="default" onClick={applyPicker}>应用</Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <Dialog open={!!modalClass} onOpenChange={(open) => { if (!open) app.timetable.closeClassModal(); }}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>{modalTitle}</DialogTitle>
          </DialogHeader>
          <DialogPanel>
            <div id="modal-content" className="min-h-0 p-2.5 overflow-y-auto bg-background border border-border">
              {modalClass?.entry && (
                <>
                  <div className="class-meta"><div>课程</div><div>{modalClass.entry.name}</div></div>
                  <div className="class-meta"><div>课程号</div><div>{modalClass.entry.kchId || "-"}</div></div>
                  <div className="class-meta"><div>课程类型</div><div>{modalClass.entry.kklxmc || "-"}</div></div>
                  <div className="class-meta"><div>教学班</div><div>{modalClass.entry.classNo || "-"}</div></div>
                  <div className="class-meta"><div>学分</div><div>{modalClass.entry.creditText || "-"}</div></div>
                  <div className="class-meta"><div>上课教师</div><div>{modalClass.entry.teacherName || ""} <span className="text-muted-foreground">{modalClass.entry.teacherTitle || ""}</span></div></div>
                  <div className="class-meta"><div>上课时间</div><div>{modalClass.entry.sksj || "-"}</div></div>
                  <div className="class-meta"><div>教学地点</div><div>{modalClass.entry.location || "-"}</div></div>
                  <div className="class-meta"><div>重修标记</div><div>{modalClass.entry.cxbj === "1" ? <Badge variant="destructive" size="sm">重修</Badge> : "正常"}</div></div>
                  <div className="class-meta"><div>选课方式</div><div>{modalClass.entry.zixf === "1" ? "自选上" : "系统调整"}</div></div>
                  <div className="class-meta"><div>选课状态</div><div>{modalClass.entry.sxbj === "1" ? "已选上" : "待筛选"}</div></div>
                  <div className="class-meta"><div>允许退课</div><div>{modalClass.entry.sfktk === "1" ? "是" : "否"}</div></div>
                </>
              )}
              {modalClass?.entry?.rawData && <RawDataAccordion rawData={modalClass.entry.rawData} />}
              {modalClass?.item && (
                <>
                  <div className="class-meta"><div>教学班</div><div>{modalClass.item.classNo}</div></div>
                  <div className="class-meta"><div>课程号</div><div>{modalClass.item.kchId || modalClass?.course?.kchId || "-"}</div></div>
                  <div className="class-meta"><div>上课教师</div><div>{modalClass.item.teacherName || ""} <span className="text-muted-foreground">{modalClass.item.teacherTitle || ""}</span></div></div>
                  <div className="class-meta"><div>上课时间</div><div>{modalClass.item.sksj || ""}</div></div>
                  <div className="class-meta"><div>教学地点</div><div>{modalClass.item.location || ""}</div></div>
                  <div className="class-meta"><div>开课学院</div><div>{modalClass.item.academy || "-"}</div></div>
                  <div className="class-meta"><div>选课备注</div><div>{modalClass.item.remark || "-"}</div></div>
                  <div className="class-meta"><div>课程性质</div><div>{modalClass.item.courseProperty || "-"}</div></div>
                  <div className="class-meta"><div>已选/容量</div><div>{modalClass.item.selectedCount}/{modalClass.item.capacity}</div></div>
                  {classConflictEntries.length > 0 && (
                    <div className="class-meta"><div>冲突课程</div><div>{classConflictEntries.map((entry) => <div key={entry.doJxbId}>{entry.name} <span className="text-muted-foreground">{entry.classNo || "-"} / {entry.sksj || "-"}</span></div>)}</div></div>
                  )}
                  {snap.teacherDetail === null && (
                    <Button variant="link" size="sm" onClick={() => app.timetable.loadTeacherDetail(modalClass.item.teacherJghId, modalClass.item.kchId || modalClass?.course?.kchId)} className="mt-2">查看教师详情</Button>
                  )}
                  {snap.teacherDetail?._loading && <div className="text-muted-foreground mt-2">加载教师详情中...</div>}
                  {snap.teacherDetail && !snap.teacherDetail._loading && (
                    <Accordion>
                      <AccordionItem value="teacher-detail" defaultOpen>
                        <AccordionTrigger><span className="inline-flex items-center gap-1.5"><User className="size-4" />教师详情</span></AccordionTrigger>
                        <AccordionPanel>
                        {snap.teacherDetail.name ? (
                        <div className="debug-grid">
                          {snap.teacherDetail.name && <><div>教师姓名</div><div>{snap.teacherDetail.name}</div></>}
                          {snap.teacherDetail.pinyin && <><div>姓名拼音</div><div>{snap.teacherDetail.pinyin}</div></>}
                          {snap.teacherDetail.gender && <><div>性别</div><div>{snap.teacherDetail.gender}</div></>}
                          {snap.teacherDetail.title && <><div>职称</div><div>{snap.teacherDetail.title}</div></>}
                          {snap.teacherDetail.department && <><div>所在单位</div><div>{snap.teacherDetail.department}</div></>}
                          {snap.teacherDetail.education && <><div>最高学历</div><div>{snap.teacherDetail.education}</div></>}
                          {snap.teacherDetail.email && <><div>电子邮箱</div><div>{snap.teacherDetail.email}</div></>}
                          {snap.teacherDetail.research && <><div>研究方向</div><div>{snap.teacherDetail.research}</div></>}
                          {snap.teacherDetail.office && <><div>科室名称</div><div>{snap.teacherDetail.office}</div></>}
                          {snap.teacherDetail.introduction && <><div>教师简介</div><div>{snap.teacherDetail.introduction}</div></>}
                        </div>
                      ) : <div className="mt-1.5">暂无教师详情数据</div>}
                        </AccordionPanel>
                      </AccordionItem>
                    </Accordion>
                  )}
                </>
              )}
              {modalClass?.course && !modalClass?.item && (
                <>
                  <div className="class-meta"><div>课程</div><div>{modalClass.course.courseName}</div></div>
                  <div className="class-meta"><div>课程号</div><div>{modalClass.course.kchId || "-"}</div></div>
                  <div className="class-meta"><div>学分</div><div>{modalClass.course.creditText || "-"}</div></div>
                  <div className="class-meta"><div>教学班</div><div>{modalClass.course.classCount ?? "-"}</div></div>
                  <div className="class-meta"><div>已选</div><div>{snap.timetable.selectedCourseIds?.includes(modalClass.course.kchId) ? "是" : "否"}</div></div>
                  {snap.courseDetail === null && (
                    <Button variant="link" size="sm" onClick={() => app.timetable.loadCourseDetail(modalClass.course.kchId)} className="mt-2">查看课程详情</Button>
                  )}
                  {snap.courseDetail?._loading && <div className="text-muted-foreground mt-2">加载课程详情中...</div>}
                  {snap.courseDetail && !snap.courseDetail._loading && (
                    <Accordion>
                      <AccordionItem value="course-detail" defaultOpen>
                        <AccordionTrigger><span className="inline-flex items-center gap-1.5"><BookOpen className="size-4" />课程基本信息</span></AccordionTrigger>
                        <AccordionPanel>
                        {snap.courseDetail.name || snap.courseDetail.code ? (
                        <div className="debug-grid">
                          {snap.courseDetail.name && <><div>课程名称</div><div>{snap.courseDetail.name}</div></>}
                          {snap.courseDetail.englishName && <><div>英文名称</div><div>{snap.courseDetail.englishName}</div></>}
                          {snap.courseDetail.academy && <><div>开课学院</div><div>{snap.courseDetail.academy}</div></>}
                          {snap.courseDetail.category && <><div>课程类别</div><div>{snap.courseDetail.category}</div></>}
                          {snap.courseDetail.ownership && <><div>课程归属</div><div>{snap.courseDetail.ownership}</div></>}
                          {snap.courseDetail.credits && <><div>学分</div><div>{snap.courseDetail.credits}</div></>}
                          {snap.courseDetail.weeklyHours && <><div>周学时</div><div>{snap.courseDetail.weeklyHours}</div></>}
                          {snap.courseDetail.gradeLevel && <><div>成绩录入级别</div><div>{snap.courseDetail.gradeLevel}</div></>}
                          {snap.courseDetail.canAudit && <><div>可否申请免听</div><div>{snap.courseDetail.canAudit}</div></>}
                          {snap.courseDetail.makeupExam && <><div>统一安排补考否</div><div>{snap.courseDetail.makeupExam}</div></>}
                          {snap.courseDetail.canRetake && <><div>是否可补考</div><div>{snap.courseDetail.canRetake}</div></>}
                          {snap.courseDetail.quickSelect && <><div>可否快速选课</div><div>{snap.courseDetail.quickSelect}</div></>}
                          {snap.courseDetail.isPractice && <><div>是否是实践课</div><div>{snap.courseDetail.isPractice}</div></>}
                          {snap.courseDetail.startYear && <><div>课程启用年级</div><div>{snap.courseDetail.startYear}</div></>}
                          {snap.courseDetail.prerequisites && <><div>预修课</div><div>{snap.courseDetail.prerequisites}</div></>}
                          {snap.courseDetail.targetAudience && <><div>面向对象</div><div>{snap.courseDetail.targetAudience}</div></>}
                          {snap.courseDetail.introduction && <><div>课程简介</div><div>{snap.courseDetail.introduction}</div></>}
                          {snap.courseDetail.syllabus && <><div>教学大纲</div><div>{snap.courseDetail.syllabus}</div></>}
                        </div>
                      ) : <div className="mt-1.5">暂无课程详情数据</div>}
                        </AccordionPanel>
                      </AccordionItem>
                    </Accordion>
                  )}
                </>
              )}
              {classDebugPayload && (
                <Accordion>
                  <AccordionItem value="grab-fields">
                    <AccordionTrigger><span className="inline-flex items-center gap-1.5"><KeyRound className="size-4" />抢课 / 选课关键字段</span></AccordionTrigger>
                    <AccordionPanel>
                    <div className="debug-grid">
                      <div>来源</div><div>{classDebugPayload.source}</div>
                      <div>categoryId</div><div>{classDebugPayload.categoryId ?? "-"}</div>
                      <div>course.kchId</div><div>{classDebugPayload.course?.kchId || classDebugPayload.entry?.kchId || "-"}</div>
                      <div>classNo</div><div>{classDebugPayload.classItem?.classNo || classDebugPayload.entry?.classNo || "-"}</div>
                      <div>容量</div><div>{classDebugPayload.classItem ? `${classDebugPayload.classItem.selectedCount}/${classDebugPayload.classItem.capacity}` : "-"}</div>
                    </div>
                    </AccordionPanel>
                  </AccordionItem>
                  <AccordionItem value="time-slots">
                    <AccordionTrigger><span className="inline-flex items-center gap-1.5"><Clock className="size-4" />时间 slots</span></AccordionTrigger>
                    <AccordionPanel>
                    <pre className="max-h-[260px] mt-2 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-[1.45] text-foreground">{formatDebugJson(classDebugPayload.classItem?.slots || classDebugPayload.entry?.slots || [])}</pre>


                    </AccordionPanel>
                  </AccordionItem>
                  <AccordionItem value="raw-json">
                    <AccordionTrigger><span className="inline-flex items-center gap-1.5"><Braces className="size-4" />原始详情 JSON</span></AccordionTrigger>
                    <AccordionPanel>
                    <pre className="max-h-[260px] mt-2 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-[1.45] text-foreground">{formatDebugJson(classDebugPayload)}</pre>
                    </AccordionPanel>
                  </AccordionItem>
                </Accordion>
              )}
            </div>
          </DialogPanel>
          <DialogFooter>
            {(modalClass?.entry || modalClass?.item) && (
              <Button variant="default" id="modal-action" onClick={() => app.timetable.executeModalAction().catch(app.showError)}>{modalActionLabel}</Button>
            )}
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <GrabModal />
      <GrabTaskModal />

      <Dialog open={!!snap.speedModalVisible} onOpenChange={(open) => { if (!open) app.auth.closeSpeedModal(); }}>
        <DialogPopup>
          <DialogHeader>
            <span className="text-muted-foreground">Connectivity</span>
            <DialogTitle>教务地址测速</DialogTitle>
          </DialogHeader>
          <DialogPanel>
            <div id="speed-content" className="speed-content max-h-[min(60vh,520px)] overflow-y-auto">
              <Table className="speed-table">
                <TableHeader><TableRow><TableHead className="py-[7px] px-2 border-b border-border text-left align-top">地址</TableHead><TableHead className="py-[7px] px-2 border-b border-border text-left align-top">状态</TableHead><TableHead className="py-[7px] px-2 border-b border-border text-left align-top">耗时</TableHead><TableHead className="py-[7px] px-2 border-b border-border text-left align-top">说明</TableHead></TableRow></TableHeader>
                <TableBody>
                  {snap.speedRows.map((row) => (
                    <TableRow key={row.url} className={row.statusClass}>
                      <TableCell className="py-[7px] px-2 border-b border-border text-left align-top"><Button variant="link" size="sm" className="link-button min-h-0 p-0 border-0 text-info text-left" onClick={() => { app.auth.setLoginBaseUrl(row.url); app.auth.closeSpeedModal(); }}>{row.url}</Button><div className="text-muted-foreground">{row.label}</div></TableCell>
                      <TableCell className="py-[7px] px-2 border-b border-border text-left align-top">{row.status}</TableCell>
                      <TableCell className="py-[7px] px-2 border-b border-border text-left align-top">{row.ms}</TableCell>
                      <TableCell className="py-[7px] px-2 border-b border-border text-left align-top">{row.message}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </DialogPanel>
        </DialogPopup>
      </Dialog>

      <Dialog open={!!snap.logDetailKey} onOpenChange={(open) => { if (!open) app.logs.closeLogDetail(); }}>
        <DialogPopup>
          <DialogHeader>
            <span className="text-muted-foreground">Request Detail</span>
            <DialogTitle>{logDetailTitle}</DialogTitle>
          </DialogHeader>
          <DialogPanel>
            <div id="log-detail-content" className="min-h-0 p-2.5 overflow-y-auto bg-background border border-border">
              {logDetailEntry && (
                logDetailEntry.type === "request" ? (
                  <>
                    <div className="class-meta"><div>时间</div><div>{logDetailEntry.timestamp}</div></div>
                    <div className="class-meta"><div>类型</div><div>{app.logs.logTypeText(logDetailEntry.type)} / {logDetailEntry.level || "info"}</div></div>
                    <div className="class-meta"><div>状态</div><div>{String(logDetailEntry.status ?? "ERROR")}</div></div>
                    <div className="class-meta"><div>耗时</div><div>{String(logDetailEntry.ms ?? 0)}ms</div></div>
                    <div className="class-meta"><div>URL</div><div>{logDetailEntry.detail?.url || ""}</div></div>
                    <div className="class-meta"><div>请求头</div><div><pre className="max-h-[220px] m-0 p-2 overflow-auto border border-border-subtle bg-background whitespace-pre-wrap break-all font-mono text-xs leading-[1.45] text-foreground">{app.logs.formatLogDetailBlock(logDetailEntry.detail?.requestHeaders || {})}</pre></div></div>
                    <div className="class-meta"><div>请求体</div><div><pre className="max-h-[220px] m-0 p-2 overflow-auto border border-border-subtle bg-background whitespace-pre-wrap break-all font-mono text-xs leading-[1.45] text-foreground">{app.logs.formatLogDetailBlock(logDetailEntry.detail?.requestBody || "")}</pre></div></div>
                    <div className="class-meta"><div>响应头</div><div><pre className="max-h-[220px] m-0 p-2 overflow-auto border border-border-subtle bg-background whitespace-pre-wrap break-all font-mono text-xs leading-[1.45] text-foreground">{app.logs.formatLogDetailBlock(logDetailEntry.detail?.responseHeaders || {})}</pre></div></div>
                    <div className="class-meta"><div>响应体</div><div><pre className="max-h-[220px] m-0 p-2 overflow-auto border border-border-subtle bg-background whitespace-pre-wrap break-all font-mono text-xs leading-[1.45] text-foreground">{app.logs.formatLogDetailBlock(logDetailEntry.detail?.responseBody || logDetailEntry.detail?.error || "")}</pre></div></div>
                  </>
                ) : (
                  <>
                    <div className="class-meta"><div>时间</div><div>{logDetailEntry.timestamp}</div></div>
                    <div className="class-meta"><div>类型</div><div>{app.logs.logTypeText(logDetailEntry.type)} / {logDetailEntry.level || "info"}</div></div>
                    <div className="class-meta"><div>消息</div><div><pre className="max-h-[220px] m-0 p-2 overflow-auto border border-border-subtle bg-background whitespace-pre-wrap break-all font-mono text-xs leading-[1.45] text-foreground">{app.logs.formatLogDetailBlock(logDetailEntry.message || "")}</pre></div></div>
                  </>
                )
              )}
            </div>
          </DialogPanel>
        </DialogPopup>
      </Dialog>

      <Dialog open={!!snap.academicCourseDetail} onOpenChange={(open) => { if (!open) app.academic.closeAcademicCourseDetail(); }}>
        <DialogPopup>
          <DialogHeader>
            <span className="text-muted-foreground">Course Detail</span>
            <DialogTitle>{snap.academicCourseDetail?.name || "课程基本信息"}</DialogTitle>
          </DialogHeader>
          <DialogPanel>
            {snap.academicCourseDetail?._loading && <div className="text-muted-foreground mt-2">加载课程详情中...</div>}
            {snap.academicCourseDetail?._error && <div className="text-muted-foreground mt-2">加载课程详情失败</div>}
            {snap.academicCourseDetail && !snap.academicCourseDetail._loading && !snap.academicCourseDetail._error && snap.academicCourseDetail.name && (
              <Accordion>
                <AccordionItem value="academic-course-detail" defaultOpen>
                   <AccordionTrigger><span className="inline-flex items-center gap-1.5"><BookOpen className="size-4" />课程基本信息</span></AccordionTrigger>
                  <AccordionPanel>
                  <div className="debug-grid">
                    {snap.academicCourseDetail.name && <><div>课程名称</div><div>{snap.academicCourseDetail.name}</div></>}
                    {snap.academicCourseDetail.englishName && <><div>英文名称</div><div>{snap.academicCourseDetail.englishName}</div></>}
                    {snap.academicCourseDetail.academy && <><div>开课部门</div><div>{snap.academicCourseDetail.academy}</div></>}
                    {snap.academicCourseDetail.credits && <><div>学分</div><div>{snap.academicCourseDetail.credits}</div></>}
                    {snap.academicCourseDetail.category && <><div>课程类别</div><div>{snap.academicCourseDetail.category}</div></>}
                    {snap.academicCourseDetail.ownership && <><div>课程归属</div><div>{snap.academicCourseDetail.ownership}</div></>}
                    {snap.academicCourseDetail.director && <><div>课程负责人</div><div>{snap.academicCourseDetail.director}</div></>}
                    {snap.academicCourseDetail.isPracticeText && <><div>是否实践课</div><div>{snap.academicCourseDetail.isPracticeText}</div></>}
                    {snap.academicCourseDetail.totalHours && <><div>课程学时</div><div>{snap.academicCourseDetail.totalHours}</div></>}
                    {snap.academicCourseDetail.gradeLevel && <><div>成绩录入级别</div><div>{snap.academicCourseDetail.gradeLevel}</div></>}
                    {snap.academicCourseDetail.canAudit && <><div>申请免听</div><div>{snap.academicCourseDetail.canAudit}</div></>}
                    {snap.academicCourseDetail.makeupExam && <><div>统一安排补考</div><div>{snap.academicCourseDetail.makeupExam}</div></>}
                    {snap.academicCourseDetail.quickSelect && <><div>快速选课</div><div>{snap.academicCourseDetail.quickSelect}</div></>}
                    {snap.academicCourseDetail.startYear && <><div>课程启用年级</div><div>{snap.academicCourseDetail.startYear}</div></>}
                    {snap.academicCourseDetail.prerequisites && <><div>预修要求</div><div>{snap.academicCourseDetail.prerequisites}</div></>}
                    {snap.academicCourseDetail.targetAudience && <><div>面向对象</div><div>{snap.academicCourseDetail.targetAudience}</div></>}
                    {snap.academicCourseDetail.introductionZh && <><div>中文课程简介</div><div>{snap.academicCourseDetail.introductionZh}</div></>}
                    {snap.academicCourseDetail.introductionEn && <><div>英文课程简介</div><div>{snap.academicCourseDetail.introductionEn}</div></>}
                    {snap.academicCourseDetail.syllabusZh && <><div>中文教学大纲</div><div>{snap.academicCourseDetail.syllabusZh}</div></>}
                    {snap.academicCourseDetail.syllabusEn && <><div>英文教学大纲</div><div>{snap.academicCourseDetail.syllabusEn}</div></>}
                    {snap.academicCourseDetail.remarks && <><div>备注</div><div>{snap.academicCourseDetail.remarks}</div></>}
                  </div>
                  </AccordionPanel>
                </AccordionItem>
                {snap.academicCourseDetail.hoursBreakdown?.length > 0 && (
                  <AccordionItem value="hours-breakdown" defaultOpen>
                    <AccordionTrigger>学时分配</AccordionTrigger>
                    <AccordionPanel>
                    <Table className="my-1">
                      <TableHeader>
                        <TableRow>
                          <TableHead>分项</TableHead>
                          <TableHead>周数/周学时</TableHead>
                          <TableHead>总学时</TableHead>
                          <TableHead>标记</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {snap.academicCourseDetail.hoursBreakdown.map((row) => (
                          <TableRow key={`${row.item}-${row.weekly || "-"}-${row.total || "-"}-${row.mark || "-"}`}>
                            <TableCell>{row.item}</TableCell>
                            <TableCell>{row.weekly || "-"}</TableCell>
                            <TableCell>{row.total || "-"}</TableCell>
                            <TableCell>{row.mark || "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    </AccordionPanel>
                  </AccordionItem>
                )}
              </Accordion>
            )}
          </DialogPanel>
        </DialogPopup>
      </Dialog>

      <Dialog open={!!snap.rawModalVisible} onOpenChange={(open) => { if (!open) app.academic.closeAcademicRawModal(); }}>
        <DialogPopup className="grab-card">
          <DialogHeader>
            <span className="text-muted-foreground">Academic Raw Page</span>
            <DialogTitle>{snap.rawModalTitle}</DialogTitle>
          </DialogHeader>
          <Tabs value={snap.rawTab} onValueChange={(v) => app.academic.switchAcademicRawTab(v)}>
            <TabsList>
              {snap.rawPreviewVisible && (
                <TabsTab value="preview">渲染</TabsTab>
              )}
              <TabsTab value="source">原始内容</TabsTab>
            </TabsList>
          </Tabs>
          <DialogPanel>
            <div className="academic-raw-body">
              <iframe id="academic-raw-preview" className={cx("academic-raw-pane academic-raw-frame", { active: true, "!hidden": snap.rawTab !== "preview" })} title="教务原始网页渲染预览" srcDoc={snap.rawPreviewSrcdoc}></iframe>
              <div id="academic-raw-content" className={cx("academic-raw-pane academic-raw-editor", { "!hidden": snap.rawTab !== "source" })}></div>
            </div>
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    </>
  );
}
