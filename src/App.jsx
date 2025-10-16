import React, { useMemo, useState, useEffect } from "react";

// ==========================
// 날짜/공통 유틸
// ==========================
function toYMD(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "";
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDays(d, n) {
  const base = new Date(d);
  if (isNaN(base.getTime())) return new Date(NaN);
  const dt = new Date(base);
  dt.setDate(dt.getDate() + n);
  return dt;
}
function toMidnight(d) {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  return dt.getTime();
}
function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}
const rid = () => Math.random().toString(36).slice(2, 9);

// 과목 이름을 기반으로 안정적인 파스텔 색 생성
function pastelOf(key) {
  const str = String(key || "");
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  const r = 150 + (h % 80),
    g = 150 + ((h >> 3) % 80),
    b = 150 + ((h >> 6) % 80);
  return `rgb(${r}, ${g}, ${b})`;
}
function escapeXML(s) {
  return String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}

// ==========================
// 메인 앱 (V4)
// ==========================
export default function ExamPlannerApp() {
  // 스텝: 1 기간/시험일 → 2 달력(학원·숙제 메모) → 3 과목별 횟수 → 4 날짜 배치 → 5 하루 범위 → 6 최종 수정 → 7 진행도 → 8 완성
  const [step, setStep] = useState(1);

  // 과목: {id, name, examDate, plannedSessions}
  const [subjects, setSubjects] = useState([
    { id: rid(), name: "국어", examDate: "", plannedSessions: 4 },
    { id: rid(), name: "수학", examDate: "", plannedSessions: 4 },
    { id: rid(), name: "영어", examDate: "", plannedSessions: 4 },
  ]);

  // 공부 기간: (과목 수 × 2.5)을 15~21로 보정
  const windowDays = useMemo(
    () => clamp(Math.round((subjects.length || 0) * 2.5) || 0, 15, 21),
    [subjects.length]
  );
  const sessionDays = Math.max(1, windowDays - 1); // 시험 전날(총정리) 제외

  // 시험일 계산 (첫 시험일 선택 입력 제거: 과목별 시험일만 사용)
  const firstExamDate = useMemo(() => {
    const ds = subjects
      .map((s) => s.examDate)
      .filter(Boolean)
      .map((d) => new Date(d));
    if (!ds.length) return null;
    return new Date(Math.min(...ds.map((d) => d.getTime())));
  }, [subjects]);
  const lastExamDate = useMemo(() => {
    const ds = subjects
      .map((s) => s.examDate)
      .filter(Boolean)
      .map((d) => new Date(d));
    if (!ds.length) return null;
    return new Date(Math.max(...ds.map((d) => d.getTime())));
  }, [subjects]);

  const startDate = useMemo(
    () => (firstExamDate ? addDays(firstExamDate, -windowDays) : null),
    [firstExamDate, windowDays]
  );
  const sessionEndDate = useMemo(
    () => (firstExamDate ? addDays(firstExamDate, -1) : null),
    [firstExamDate]
  );

  // 달력 범위
  const calendarDays = useMemo(() => {
    if (!startDate || !lastExamDate) return [];
    const out = [];
    let d = new Date(startDate);
    while (toMidnight(d) <= toMidnight(lastExamDate)) {
      out.push(new Date(d));
      d = addDays(d, 1);
    }
    return out;
  }, [startDate, lastExamDate]);

  const examDateSet = useMemo(() => {
    const s = new Set();
    for (const subj of subjects) if (subj.examDate) s.add(subj.examDate);
    return s;
  }, [subjects]);

  // 2) 학원 스케줄/숙제 메모
  const [dayNotes, setDayNotes] = useState({}); // { [ymd]: { academy, homework } }

  // 4) 배치: { [ymd]: Array<{id, subjectId, name, scope}> }
  const [sessionsByDate, setSessionsByDate] = useState({});

  // 5) 범위 입력을 위한 과목별 라인 텍스트 저장
  const [outlines, setOutlines] = useState({});

  // 4) 새 배치 방식용: 활성 과목
  const [activeSubjectId, setActiveSubjectId] = useState("");

  // 3) 총 세션 수/하루 평균(≤2.5 권장)
  const totalPlanned = useMemo(
    () => subjects.reduce((a, s) => a + (s.plannedSessions || 0), 0),
    [subjects]
  );
  const avgPerDay = useMemo(
    () => (sessionDays > 0 ? totalPlanned / sessionDays : 0),
    [totalPlanned, sessionDays]
  );

  // ====== helpers ======
  function updateSubject(id, patch) {
    setSubjects((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
    );
  }
  function addSubject() {
    setSubjects((prev) => [
      ...prev,
      {
        id: rid(),
        name: `과목${prev.length + 1}`,
        examDate: "",
        plannedSessions: 4,
      },
    ]);
  }
  function removeSubject(id) {
    setSubjects((prev) => prev.filter((s) => s.id !== id));
  }

  function setNote(ymd, patch) {
    setDayNotes((prev) => ({
      ...prev,
      [ymd]: { ...(prev[ymd] || {}), ...patch },
    }));
  }

  function countUsed(subjectId, sessions) {
    let n = 0;
    for (const ymd of Object.keys(sessions))
      for (const it of sessions[ymd] || []) if (it.subjectId === subjectId) n++;
    return n;
  }

  function addSession(ymd, subjectId) {
    const subj = subjects.find((s) => s.id === subjectId);
    if (!subj) return;
    if (!startDate || !sessionEndDate) return;
    const dayTs = toMidnight(new Date(ymd));
    if (dayTs > toMidnight(sessionEndDate)) {
      alert("시험 전날까지에만 배치할 수 있어요.");
      return;
    }

    const arr = sessionsByDate[ymd] ? [...sessionsByDate[ymd]] : [];

    // 시험 전날(총정리)엔 배치 금지
    const reviewLabels = getReviewLabelsFor(ymd);
    if (reviewLabels && reviewLabels.length) {
      alert("시험 전날에는 총정리만 하고 배치할 수 없어요.");
      return;
    }

    // '두 번 클릭하면 취소' — 동일 과목이 이미 있으면 하나 제거
    const idxSame = arr.map((it) => it.subjectId).lastIndexOf(subjectId);
    if (idxSame !== -1) {
      const id = arr[idxSame].id;
      const nextArr = arr.filter((it) => it.id !== id);
      setSessionsByDate({ ...sessionsByDate, [ymd]: nextArr });
      return;
    }

    // 하루 최대 3 (강제)
    if (arr.length >= 3) {
      alert("하루 최대 3과목까지만 권장합니다.");
      return;
    }
    // 과목별 계획 수 초과 방지
    const used = countUsed(subjectId, sessionsByDate);
    if (used >= (subj.plannedSessions || 0)) {
      alert("해당 과목의 계획 횟수를 모두 배치했습니다.");
      return;
    }

    // 연속 배치 권고(허용)
    const prevYmd = toYMD(addDays(new Date(ymd), -1));
    const prev = sessionsByDate[prevYmd] || [];
    if (prev.some((it) => it.subjectId === subjectId))
      setTimeout(
        () => alert("안내: 같은 과목을 이틀 연속 배치하고 있어요."),
        0
      );

    const nextArr = [
      ...arr,
      { id: rid(), subjectId, name: subj.name, scope: "" },
    ];
    setSessionsByDate({ ...sessionsByDate, [ymd]: nextArr });
  }

  // 2,6) 시험 전날 총정리 라벨 보조
  function getReviewLabelsFor(ymd) {
    const nextDay = toYMD(addDays(new Date(ymd), 1));
    const subjectsTomorrow = subjects.filter((s) => s.examDate === nextDay);
    return subjectsTomorrow.map((s) => `${s.name} 총정리`);
  }

  // 5) 아웃라인 → 범위 자동 분배 (실시간 반영)
  function sessionsOfSubjectOrdered(sSessions, sid) {
    const ymds = Object.keys(sSessions).sort();
    const out = [];
    for (const y of ymds) {
      const arr = sSessions[y] || [];
      arr.forEach((it, idx) => {
        if (it.subjectId === sid) out.push({ ymd: y, idx });
      });
    }
    return out;
  }
  function chunkLines(lines, n) {
    if (n <= 0) return [];
    if (!lines.length) return Array.from({ length: n }, () => []);
    const base = Math.floor(lines.length / n);
    let extra = lines.length % n;
    let idx = 0;
    const out = [];
    for (let i = 0; i < n; i++) {
      const take = base + (extra > 0 ? 1 : 0);
      out.push(lines.slice(idx, idx + take));
      idx += take;
      if (extra > 0) extra--;
    }
    return out;
  }
  function assignScopes(current) {
    let changed = false;
    const next = { ...current };
    for (const s of subjects) {
      const lines = (outlines[s.id] || "")
        .split(/\r?\n/)
        .map((t) => t.trim())
        .filter(Boolean);
      const n = s.plannedSessions || 0;
      const chunks = chunkLines(lines, n);
      const ordered = sessionsOfSubjectOrdered(next, s.id);
      for (let i = 0; i < ordered.length; i++) {
        const { ymd, idx } = ordered[i];
        const piece = i < chunks.length ? chunks[i].join(" / ") : "";
        const before = ((next[ymd] || [])[idx] || {}).scope || "";
        if (piece !== before) {
          const arr = next[ymd] ? [...next[ymd]] : [];
          arr[idx] = { ...arr[idx], scope: piece };
          next[ymd] = arr;
          changed = true;
        }
      }
    }
    return changed ? next : null;
  }
  useEffect(() => {
    const updated = assignScopes(sessionsByDate);
    if (updated) setSessionsByDate(updated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outlines, subjects, sessionsByDate]);

  // ====== 다운로드 (A4 PNG) — 6 최종 수정 요구사항
  function downloadCalendarPNG() {
    const svg = buildCalendarSVG(
      subjects,
      sessionsByDate,
      dayNotes,
      startDate,
      lastExamDate,
      getReviewLabelsFor,
      794,
      1123
    );
    svgToPNG(svg, `시험_달력_A4_${Date.now()}.png`);
  }
  function downloadProgressPNG() {
    const svg = buildProgressSVG(subjects, sessionsByDate, 794, 1123);
    svgToPNG(svg, `시험_진행도_A4_${Date.now()}.png`);
  }

  // ====== UI ======
  return (
    <div className="p-5 md:p-6 max-w-6xl mx-auto text-[16px] leading-relaxed">
      {/* 상단 단계 네비 + 하단 이전/다음 */}
      <div className="flex flex-wrap gap-2 mb-4">
        {[
          "1 기간/시험일",
          "2 달력",
          "3 공부 횟수",
          "4 날짜 배치",
          "5 하루 범위",
          "6 최종 수정",
          "7 진행도",
          "8 완성",
        ].map((label, i) => (
          <button
            key={i}
            onClick={() => setStep(i + 1)}
            className={`px-3 py-2 rounded-xl text-sm border ${
              step === i + 1
                ? "bg-gray-900 text-white"
                : "bg-white hover:bg-gray-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 1. 시험 공부 기간 정하기 (첫 시험일 선택 기능 제거) */}
      {step === 1 && (
        <section className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4 items-end text-gray-900">
            <div className="p-3 rounded-xl border bg-gray-50">
              <div className="text-[15px]">
                공부 기간 = 과목 수 × 2.5 (단, 15~21일)
              </div>
              <div className="font-semibold text-[18px]">
                권장: {windowDays}일 (세션 배치일: {sessionDays}일)
              </div>
            </div>
            <div className="text-[14px] text-gray-600">
              각 과목의 시험일을 아래 표에서 입력하세요.
            </div>
          </div>

          <div className="border rounded-xl p-3">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-medium text-[17px]">과목 목록</h3>
              <button
                onClick={addSubject}
                className="px-3 py-1 border rounded-lg"
              >
                과목 추가
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[15px]">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 w-10">색</th>
                    <th className="text-left">과목</th>
                    <th className="text-left">시험일</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {subjects.map((s) => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="py-2">
                        <div
                          className="w-6 h-6 rounded"
                          style={{ background: pastelOf(s.name) }}
                          title="자동 색상"
                        />
                      </td>
                      <td>
                        <input
                          className="border rounded px-2 py-1"
                          style={{ color: pastelOf(s.name) }}
                          value={s.name}
                          onChange={(e) =>
                            updateSubject(s.id, { name: e.target.value })
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="date"
                          className="border rounded px-2 py-1"
                          value={s.examDate}
                          onChange={(e) =>
                            updateSubject(s.id, { examDate: e.target.value })
                          }
                        />
                      </td>
                      <td>
                        <button
                          className="text-xs px-2 py-1 border rounded"
                          onClick={() => removeSubject(s.id)}
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <StepNav step={step} setStep={setStep} maxStep={8} />
        </section>
      )}

      {/* 2. 달력 만들기 (학원·숙제 메모, 전날 총정리 표기) */}
      {step === 2 && (
        <section className="space-y-3">
          {!startDate || !lastExamDate ? (
            <p className="text-sm text-red-600">
              스텝 1에서 과목의 시험일을 입력하세요.
            </p>
          ) : (
            <div className="grid md:grid-cols-3 gap-4">
              <div className="border rounded-xl p-3 md:col-span-2">
                <div className="text-[14px] mb-2">
                  달력: {toYMD(startDate)} ~ {toYMD(lastExamDate)} (시험 전날은
                  총정리 라벨이 표시됩니다)
                </div>
                <Calendar
                  days={calendarDays}
                  subjects={subjects}
                  sessionsByDate={sessionsByDate}
                  examDateSet={examDateSet}
                  dayNotes={dayNotes}
                  getReviewLabelsFor={getReviewLabelsFor}
                  fontScale={1.0}
                />
              </div>
              <div className="border rounded-xl p-3 md:col-span-1">
                <h3 className="font-medium mb-2 text-[16px]">학원/숙제 메모</h3>
                <NotesEditor
                  days={calendarDays}
                  dayNotes={dayNotes}
                  setNote={setNote}
                />
                <p className="text-xs text-gray-500 mt-2">
                  학원을 많이 가는 날/숙제가 많은 날을 표시해 두면 4단계에서
                  <br />
                  계획을 배치할 때 참고하기 좋아요.
                </p>
              </div>
            </div>
          )}
          <StepNav step={step} setStep={setStep} maxStep={8} />
        </section>
      )}

      {/* 3. 과목별 공부 횟수 정하기 (최대 8, 최소 4) */}
      {step === 3 && (
        <section className="space-y-3">
          <div className="border rounded-xl p-3">
            <h3 className="font-medium mb-2 text-[17px]">과목별 공부 횟수</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-[15px]">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">과목</th>
                    <th className="text-left">공부 횟수 (4~8)</th>
                  </tr>
                </thead>
                <tbody>
                  {subjects.map((s) => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td style={{ color: pastelOf(s.name) }}>{s.name}</td>
                      <td>
                        <input
                          type="number"
                          min={4}
                          max={8}
                          className="border rounded px-2 py-1 w-28"
                          value={s.plannedSessions}
                          onChange={(e) =>
                            updateSubject(s.id, {
                              plannedSessions: clamp(
                                Number(e.target.value) || 0,
                                4,
                                8
                              ),
                            })
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 text-[14px]">
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  가장 못하는 과목은 <b>최대 8회</b> 이하, 제일 자신 있는 과목도{" "}
                  <b>최소 4회</b> 이상.
                </li>
                <li>
                  총 공부 횟수: <b>{totalPlanned}</b>회 / 배치일수{" "}
                  <b>{sessionDays}</b>일 = <b>{avgPerDay.toFixed(2)} 과목/일</b>{" "}
                  → <b>{avgPerDay <= 2.5 ? "적정(≤2.5)" : "초과(>2.5)"}</b>
                </li>
              </ul>
            </div>
          </div>
          <StepNav step={step} setStep={setStep} maxStep={8} />
        </section>
      )}

      {/* 4. 과목별 공부 날짜 정하기 (과목 선택 → 달력 클릭, 두 번 클릭시 취소) */}
      {step === 4 && (
        <section className="space-y-3">
          {!startDate || !sessionEndDate ? (
            <p className="text-sm text-red-600">스텝 1~3을 먼저 완료하세요.</p>
          ) : (
            <div className="grid md:grid-cols-3 gap-4">
              <div className="border rounded-xl p-3 md:col-span-1">
                <h3 className="font-medium mb-2 text-[16px]">1) 과목 선택</h3>
                <SubjectPicker
                  subjects={subjects}
                  sessionsByDate={sessionsByDate}
                  activeSubjectId={activeSubjectId}
                  setActiveSubjectId={setActiveSubjectId}
                />
                <p className="text-xs text-gray-600 mt-2">
                  남은 횟수가 많은 과목부터 선택 후, 오른쪽 달력을 클릭해
                  배치하세요. 같은 날짜를 다시 클릭하면 해당 과목 배치가
                  취소됩니다.
                </p>
              </div>
              <div className="border rounded-xl p-3 md:col-span-2">
                <h3 className="font-medium mb-2 text-[16px]">
                  2) 달력 클릭으로 배치
                </h3>
                <Calendar
                  days={calendarDays}
                  subjects={subjects}
                  sessionsByDate={sessionsByDate}
                  examDateSet={examDateSet}
                  dayNotes={dayNotes}
                  getReviewLabelsFor={getReviewLabelsFor}
                  onDayClick={(ymd) => {
                    if (!activeSubjectId) {
                      alert("먼저 왼쪽에서 과목을 선택하세요.");
                      return;
                    }
                    addSession(ymd, activeSubjectId);
                  }}
                  clickableRange={{ start: startDate, end: sessionEndDate }}
                  fontScale={1.0}
                />
                <p className="text-xs text-gray-600 mt-2">
                  같은 과목 연속 배치는 경고만 표시되며, 하루 최대 3과목까지
                  입력됩니다. 시험 전날에는 배치할 수 없습니다.
                </p>
              </div>
            </div>
          )}
          <StepNav step={step} setStep={setStep} maxStep={8} />
        </section>
      )}

      {/* 5. 하루 공부 범위 정하기 (과목별로 입력 → 실시간 분배) */}
      {step === 5 && (
        <section className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="border rounded-xl p-3 md:col-span-2">
              <h3 className="font-medium mb-2 text-[16px]">달력</h3>
              <Calendar
                days={calendarDays}
                subjects={subjects}
                sessionsByDate={sessionsByDate}
                examDateSet={examDateSet}
                dayNotes={dayNotes}
                getReviewLabelsFor={getReviewLabelsFor}
                fontScale={1.0}
              />
            </div>
            <div className="md:col-span-1">
              {subjects.map((s) => (
                <SubjectRangeCard
                  key={s.id}
                  subject={s}
                  outlines={outlines}
                  setOutlines={setOutlines}
                  sessionsByDate={sessionsByDate}
                />
              ))}
              <p className="text-xs text-gray-500 mt-2">
                예) 한 줄에 하나씩 입력: 1.1 ↵ 1.2 ↵ 2.1 … (Enter로 줄바꿈하여
                구분)
              </p>
            </div>
          </div>
          <StepNav step={step} setStep={setStep} maxStep={8} />
        </section>
      )}

      {/* 6. 최종 수정 (과목 변경 기능 제거, 달력 폰트 크게) */}
      {step === 6 && (
        <section className="space-y-3">
          <FinalCalendar
            startDate={startDate}
            endDate={lastExamDate}
            subjects={subjects}
            sessionsByDate={sessionsByDate}
            examDateSet={examDateSet}
            dayNotes={dayNotes}
            getReviewLabelsFor={getReviewLabelsFor}
          />
          <AdjustPanel
            sessionsByDate={sessionsByDate}
            setSessionsByDate={setSessionsByDate}
          />
          <StepNav step={step} setStep={setStep} maxStep={8} />
        </section>
      )}

      {/* 7. 진행도 만들기 (막대 총 길이는 동일, 과목별 칸 수는 계획 횟수) */}
      {step === 7 && (
        <section className="space-y-4">
          <MasteryBoard subjects={subjects} sessionsByDate={sessionsByDate} />
          <StepNav step={step} setStep={setStep} maxStep={8} />
        </section>
      )}

      {/* 8. 완성: A4 한 장(달력 위, 진행도 아래) 미리보기 */}
      {step === 8 && (
        <section className="space-y-4">
          <h3 className="font-semibold text-[18px]">A4 출력 미리보기</h3>
          <div className="border rounded-xl p-3">
            <Calendar
              days={calendarDays}
              subjects={subjects}
              sessionsByDate={sessionsByDate}
              examDateSet={examDateSet}
              dayNotes={dayNotes}
              getReviewLabelsFor={getReviewLabelsFor}
              fontScale={1.2}
            />
          </div>
          <MasteryBoard subjects={subjects} sessionsByDate={sessionsByDate} />
          <div className="flex gap-2">
            <button
              className="px-3 py-2 border rounded-xl"
              onClick={downloadCalendarPNG}
            >
              달력 PNG (A4) 다운로드
            </button>
            <button
              className="px-3 py-2 border rounded-xl"
              onClick={downloadProgressPNG}
            >
              진행도 PNG (A4) 다운로드
            </button>
          </div>
          <StepNav step={step} setStep={setStep} maxStep={8} />
        </section>
      )}
    </div>
  );
}

function StepNav({ step, setStep, maxStep }) {
  return (
    <div className="flex justify-between items-center mt-4">
      <button
        disabled={step <= 1}
        onClick={() => setStep(step - 1)}
        className={`px-3 py-2 rounded-xl border ${
          step <= 1 ? "opacity-40 cursor-not-allowed" : ""
        }`}
      >
        이전
      </button>
      <div className="text-sm text-gray-500">
        {step}/{maxStep}
      </div>
      <button
        disabled={step >= maxStep}
        onClick={() => setStep(step + 1)}
        className={`px-3 py-2 rounded-xl border ${
          step >= maxStep ? "opacity-40 cursor-not-allowed" : ""
        }`}
      >
        다음
      </button>
    </div>
  );
}

// ==========================
// 달력 (fontScale로 글씨 20% 확대 등 조절)
// ==========================
function Calendar({
  days,
  subjects,
  sessionsByDate,
  examDateSet,
  dayNotes = {},
  getReviewLabelsFor,
  onDayClick,
  clickableRange,
  fontScale = 1.0,
}) {
  const weekDays = ["일", "월", "화", "수", "목", "금", "토"];
  const s = (v) => Math.round(v * fontScale);
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-xs font-medium mb-1">
        {weekDays.map((d) => (
          <div key={d} className="text-center py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const ymd = toYMD(d);
          const isExam = examDateSet.has(ymd);
          const examSubjects = isExam
            ? subjects.filter((s) => s.examDate === ymd).map((s) => s.name)
            : [];
          const reviewLabels =
            (getReviewLabelsFor ? getReviewLabelsFor(ymd) : []) || [];
          const items = sessionsByDate[ymd] || [];
          const note = dayNotes[ymd] || {};
          const inClickableRange =
            !!onDayClick &&
            (!clickableRange ||
              (toMidnight(d) >= toMidnight(clickableRange.start) &&
                toMidnight(d) <= toMidnight(clickableRange.end)));
          const blockedByExamEve = inClickableRange && reviewLabels.length > 0; // 시험 전날은 배치 금지
          const canClick = inClickableRange && !blockedByExamEve;
          const handleClick = () => {
            if (!inClickableRange) return;
            if (blockedByExamEve) {
              alert("시험 전날에는 총정리만 하고 배치할 수 없어요.");
              return;
            }
            onDayClick && onDayClick(ymd);
          };
          return (
            <button
              key={ymd}
              onClick={handleClick}
              className={`relative text-left h-[172px] border rounded-lg p-1 w-full ${
                isExam ? "bg-yellow-100" : "bg-white"
              } ${
                canClick
                  ? "hover:ring-2 hover:ring-gray-300 cursor-pointer"
                  : onDayClick
                  ? "cursor-not-allowed"
                  : "cursor-default"
              }`}
              title={
                blockedByExamEve ? "시험 전날은 배치할 수 없습니다" : undefined
              }
            >
              {/* 날짜: 좌상단 고정 (고정 높이 라벨) */}
              <div className="absolute top-1 left-1 h-5 leading-5">
                <span className="font-medium" style={{ fontSize: s(12) }}>
                  {d.getDate()}
                </span>
              </div>
              {/* 본문: 날짜 아래에서 시작 */}
              <div className="h-full pt-5 overflow-hidden">
                <div className="space-y-1">
                  {isExam && (
                    <div className="space-y-1">
                      {examSubjects.map((name, idx) => (
                        <div
                          key={`${name}-${idx}`}
                          className="px-1 py-[1px] rounded bg-yellow-300 w-fit"
                          style={{ fontSize: s(11) }}
                        >
                          {name} 시험
                        </div>
                      ))}
                    </div>
                  )}
                  {reviewLabels.length > 0 && (
                    <div
                      className="text-blue-700 space-y-[2px]"
                      style={{ fontSize: s(11) }}
                    >
                      {reviewLabels.map((label, i) => (
                        <div key={i}>{label}</div>
                      ))}
                    </div>
                  )}
                  {items.slice(0, 3).map((it) => (
                    <div
                      key={it.id}
                      className="truncate px-1 rounded"
                      style={{ background: pastelOf(it.name), fontSize: s(12) }}
                    >
                      {it.name}
                      {it.scope ? ` · ${it.scope}` : ""}
                    </div>
                  ))}
                  {items.length > 3 && (
                    <div className="text-gray-500" style={{ fontSize: s(11) }}>
                      외 {items.length - 3}개…
                    </div>
                  )}
                  {(note.academy || note.homework) && (
                    <div className="text-gray-600" style={{ fontSize: s(11) }}>
                      {note.academy && <div>학원: {note.academy}</div>}
                      {note.homework && <div>숙제: {note.homework}</div>}
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// 학원/숙제 메모 편집기 (placeholder 문구 단순화)
function NotesEditor({ days, dayNotes, setNote }) {
  return (
    <div className="space-y-2 max-h-[520px] overflow-auto">
      {days.map((d) => {
        const ymd = toYMD(d);
        const note = dayNotes[ymd] || {};
        return (
          <div key={ymd} className="border rounded p-2">
            <div className="text-xs text-gray-600 mb-1">{ymd}</div>
            <input
              className="w-full border rounded px-2 py-1 mb-1"
              placeholder="학원"
              value={note.academy || ""}
              onChange={(e) => setNote(ymd, { academy: e.target.value })}
            />
            <input
              className="w-full border rounded px-2 py-1"
              placeholder="숙제/기타"
              value={note.homework || ""}
              onChange={(e) => setNote(ymd, { homework: e.target.value })}
            />
          </div>
        );
      })}
    </div>
  );
}

// ==========================
// 새 배치 방식 UI: 과목 선택 → 달력 클릭
// ==========================
function SubjectPicker({
  subjects,
  sessionsByDate,
  activeSubjectId,
  setActiveSubjectId,
}) {
  const list = [...subjects]
    .map((s) => ({
      id: s.id,
      name: s.name,
      planned: s.plannedSessions || 0,
      used: (function () {
        let n = 0;
        for (const ymd of Object.keys(sessionsByDate))
          for (const it of sessionsByDate[ymd] || [])
            if (it.subjectId === s.id) n++;
        return n;
      })(),
    }))
    .sort((a, b) => b.planned - b.used - (a.planned - a.used));
  return (
    <div className="space-y-1">
      {list.map((s) => {
        const remain = Math.max(0, s.planned - s.used);
        const active = s.id === activeSubjectId;
        return (
          <button
            key={s.id}
            onClick={() => setActiveSubjectId(s.id)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border ${
              active ? "bg-gray-900 text-white" : "bg-white hover:bg-gray-50"
            }`}
          >
            <span
              className="font-medium"
              style={{ color: active ? "inherit" : pastelOf(s.name) }}
            >
              {s.name}
            </span>
            <span className="text-xs">
              배치 {s.used}/{s.planned} · 남은 {remain}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// 과목별 범위 카드 + 프리뷰
function SubjectRangeCard({ subject, outlines, setOutlines, sessionsByDate }) {
  const text = outlines[subject.id] || "";
  const lines = text
    .split(/\r?\n/)
    .map((t) => t.trim())
    .filter(Boolean);
  const n = subject.plannedSessions || 0;
  const chunks = (function chunkPreview(lines, n) {
    if (n <= 0) return [];
    if (!lines.length) return Array.from({ length: n }, () => []);
    const base = Math.floor(lines.length / n);
    let extra = lines.length % n;
    let idx = 0;
    const out = [];
    for (let i = 0; i < n; i++) {
      const take = base + (extra > 0 ? 1 : 0);
      out.push(lines.slice(idx, idx + take));
      idx += take;
      if (extra > 0) extra--;
    }
    return out;
  })(lines, n);
  const placed = (function () {
    let nn = 0;
    for (const ymd of Object.keys(sessionsByDate))
      for (const it of sessionsByDate[ymd] || [])
        if (it.subjectId === subject.id) nn++;
    return nn;
  })();
  const remain = Math.max(0, n - placed);

  return (
    <div className="border rounded-xl p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <div className="font-medium" style={{ color: pastelOf(subject.name) }}>
          {subject.name}
        </div>
        <div className="text-xs text-gray-500">
          세션 계획 {n} / 배치 {placed} / 남은 {remain}
        </div>
      </div>
      <textarea
        className="w-full h-28 border rounded-lg p-2 text-sm"
        placeholder={`예) 한 줄에 하나씩 입력\n1.1\n1.2\n2.1`}
        value={text}
        onChange={(e) =>
          setOutlines((prev) => ({ ...prev, [subject.id]: e.target.value }))
        }
      />
      <div className="mt-2 text-xs text-gray-600">
        Enter로 줄바꿈하면 단원별로 구분됩니다.
        <br />
        미리보기(자동 {n}등분): {chunks.map((c) => c.length).join(" | ")}
      </div>
    </div>
  );
}

// 최종 달력 (전날 총정리 라벨 포함) — 6에서 크게 보이도록 fontScale 1.2
function FinalCalendar({
  startDate,
  endDate,
  subjects,
  sessionsByDate,
  examDateSet,
  dayNotes,
  getReviewLabelsFor,
}) {
  const days = [];
  if (startDate && endDate) {
    let d = new Date(startDate);
    while (toMidnight(d) <= toMidnight(endDate)) {
      days.push(new Date(d));
      d = addDays(d, 1);
    }
  }
  return (
    <div className="border rounded-xl p-3">
      <Calendar
        days={days}
        subjects={subjects}
        sessionsByDate={sessionsByDate}
        examDateSet={examDateSet}
        dayNotes={dayNotes}
        getReviewLabelsFor={getReviewLabelsFor}
        fontScale={1.2}
      />
    </div>
  );
}

// 세부 조정 패널 (과목 변경 기능 제거)
function AdjustPanel({ sessionsByDate, setSessionsByDate }) {
  const entries = listSessionsOrdered(sessionsByDate);
  const { min, max } = minMaxYMD(sessionsByDate);

  function move(ymd, itemId, delta) {
    const destYmd = safeDayShift(ymd, delta, min, max);
    setSessionsByDate((prev) => {
      const oldArr = (prev[ymd] || []).filter((it) => it.id !== itemId);
      const moving = (prev[ymd] || []).find((it) => it.id === itemId);
      const newArr = prev[destYmd] ? [...prev[destYmd]] : [];
      if (!moving) return prev;
      if (newArr.length >= 3) {
        alert("하루 최대 3과목 권장입니다.");
        return prev;
      }
      newArr.push(moving);
      return { ...prev, [ymd]: oldArr, [destYmd]: newArr };
    });
  }
  function remove(ymd, itemId) {
    setSessionsByDate((prev) => ({
      ...prev,
      [ymd]: (prev[ymd] || []).filter((it) => it.id !== itemId),
    }));
  }

  if (!entries.length)
    return (
      <div className="border rounded-xl p-3 text-sm text-gray-600">
        조정할 항목이 없습니다.
      </div>
    );

  return (
    <div className="border rounded-xl p-3">
      <h3 className="font-medium mb-2">세부 조정</h3>
      <div className="space-y-2 max-h-[320px] overflow-auto pr-1">
        {entries.map(({ ymd, item }) => (
          <div
            key={item.id}
            className="flex flex-wrap items-center gap-2 border rounded-lg p-2"
          >
            <div className="w-28 text-xs text-gray-600">{ymd}</div>
            <div className="font-medium" style={{ color: pastelOf(item.name) }}>
              {item.name}
            </div>
            <div className="text-xs text-gray-500 truncate max-w-[240px]">
              {item.scope || "(범위 미입력)"}
            </div>
            <div className="ml-auto flex gap-2">
              <button
                className="px-2 py-1 border rounded"
                onClick={() => move(ymd, item.id, -1)}
                disabled={ymd === min}
              >
                전날로
              </button>
              <button
                className="px-2 py-1 border rounded"
                onClick={() => move(ymd, item.id, 1)}
                disabled={ymd === max}
              >
                다음날로
              </button>
              <button
                className="px-2 py-1 border rounded text-red-600"
                onClick={() => remove(ymd, item.id)}
              >
                삭제
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500 mt-2">
        참고: 하루 최대 3과목 권장. 범위를 넘는 이동은 자동으로 캘린더 초/말로
        보정됩니다.
      </p>
    </div>
  );
}
function listSessionsOrdered(s) {
  const out = [];
  const ymds = Object.keys(s).sort();
  for (const y of ymds) {
    for (const it of s[y]) out.push({ ymd: y, item: it });
  }
  return out;
}
function minMaxYMD(s) {
  const keys = Object.keys(s).sort();
  return { min: keys[0] || null, max: keys[keys.length - 1] || null };
}
function safeDayShift(currentYmd, delta, minYmd, maxYmd) {
  const next = toYMD(addDays(new Date(currentYmd), delta));
  if (!minYmd || !maxYmd) return next;
  if (toMidnight(next) < toMidnight(minYmd)) return minYmd;
  if (toMidnight(next) > toMidnight(maxYmd)) return maxYmd;
  return next;
}

// ==========================
// 진행도 (스스로 칠하기) — 막대 총 길이는 동일, 칸 수는 과목 계획 횟수
// ==========================
function MasteryBoard({ subjects /*, sessionsByDate*/ }) {
  const rows = useMemo(
    () =>
      subjects.map((s) => ({
        id: s.id,
        name: s.name,
        color: pastelOf(s.name),
        planned: s.plannedSessions || 0,
      })),
    [subjects]
  );
  const [mastered, setMastered] = useState({}); // key: subjectId#index
  const toggle = (key) =>
    setMastered((prev) => ({ ...prev, [key]: !prev[key] }));
  const countRow = (row) => {
    let n = 0;
    for (let i = 0; i < row.planned; i++) {
      if (mastered[`${row.id}#${i}`]) n++;
    }
    return n;
  };

  return (
    <div className="border rounded-xl p-3">
      <h3 className="font-medium mb-2">
        진행도 (완전히 이해했을 때만 칠하세요)
      </h3>
      <div className="space-y-3">
        {rows.map((row, idx) => (
          <div key={idx}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span style={{ color: row.color }}>{row.name}</span>
              <span>
                {countRow(row)}/{row.planned}
              </span>
            </div>
            <div
              className="w-full grid gap-1"
              style={{
                gridTemplateColumns: `repeat(${Math.max(
                  1,
                  row.planned
                )}, minmax(0,1fr))`,
              }}
            >
              {Array.from({ length: Math.max(1, row.planned) }).map((_, i) => {
                const key = `${row.id}#${i}`;
                const filled = !!mastered[key];
                if (row.planned === 0)
                  return (
                    <div
                      key={key}
                      className="h-3 rounded bg-gray-200 opacity-40 pointer-events-none"
                      title="계획 없음"
                    />
                  );
                return (
                  <button
                    key={key}
                    onClick={() => toggle(key)}
                    title={`${row.name} · ${i + 1}/${row.planned}`}
                    className={`h-3 rounded ${
                      filled ? "bg-gray-900" : "bg-gray-300"
                    }`}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==========================
// 내보내기(SVG → PNG, A4 사이즈)
// ==========================
function buildCalendarSVG(
  subjects,
  sessionsByDate,
  dayNotes,
  startDate,
  endDate,
  getReviewLabelsFor,
  A4W = 794,
  A4H = 1123
) {
  if (!startDate || !endDate) return "";
  const cols = 7,
    pad = 24;
  const days = [];
  let d = new Date(startDate);
  while (toMidnight(d) <= toMidnight(endDate)) {
    days.push(new Date(d));
    d = addDays(d, 1);
  }
  const rows = Math.ceil(days.length / cols);
  const cellW = Math.floor((A4W - pad * 2) / cols);
  const cellH = Math.floor((A4H - pad * 2) / Math.max(1, rows));
  const W = pad * 2 + cols * cellW,
    H = pad * 2 + rows * cellH;
  const items = [
    `<rect x='0' y='0' width='${W}' height='${H}' fill='#ffffff'/>`,
  ];
  days.forEach((dt, i) => {
    const x = pad + (i % cols) * cellW,
      y = pad + Math.floor(i / cols) * cellH;
    const ymd = toYMD(dt);
    const arr = sessionsByDate[ymd] || [];
    const exNames = subjects
      .filter((s) => s.examDate === ymd)
      .map((s) => s.name);
    items.push(
      `<rect x='${x + 1}' y='${y + 1}' width='${cellW - 2}' height='${
        cellH - 2
      }' rx='8' fill='#ffffff' stroke='#d1d5db'/>`
    );
    items.push(
      `<text x='${x + 8}' y='${y + 16}' font-size='12' fill='#111827'>${
        dt.getMonth() + 1
      }/${dt.getDate()}</text>`
    );
    exNames.forEach((nm, k) => {
      const ry = y + 24 + k * 16;
      items.push(
        `<rect x='${x + 6}' y='${ry - 10}' width='${
          cellW - 12
        }' height='14' rx='4' fill='#fde68a'/>`
      );
      items.push(
        `<text x='${
          x + 10
        }' y='${ry}' font-size='11' fill='#111827'>${escapeXML(nm)} 시험</text>`
      );
    });
    const rev = (getReviewLabelsFor ? getReviewLabelsFor(ymd) : []) || [];
    rev.forEach((label, k) => {
      const ry = y + cellH - 12 - k * 14 - 30;
      items.push(
        `<text x='${
          x + 10
        }' y='${ry}' font-size='11' fill='#1e3a8a'>${escapeXML(label)}</text>`
      );
    });
    arr.slice(0, 3).forEach((it, k) => {
      const ry = y + 24 + exNames.length * 16 + k * 16 + 18;
      const color = pastelOf(it.name);
      items.push(
        `<rect x='${x + 6}' y='${ry - 10}' width='${
          cellW - 12
        }' height='14' rx='4' fill='${color}'/>`
      );
      items.push(
        `<text x='${
          x + 10
        }' y='${ry}' font-size='11' fill='#111827'>${escapeXML(it.name)}${
          it.scope ? ` · ${escapeXML(it.scope)}` : ""
        }</text>`
      );
    });
    const note = dayNotes[ymd] || {};
    if (note.academy || note.homework) {
      const ny = y + cellH - 12;
      items.push(
        `<text x='${x + 8}' y='${ny}' font-size='10' fill='#374151'>${escapeXML(
          `${note.academy ? `[학원] ${note.academy} ` : ""}${
            note.homework ? `[숙제] ${note.homework}` : ""
          }`
        )}</text>`
      );
    }
  });
  return `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}' viewBox='0 0 ${W} ${H}' style='background:#ffffff'>${items.join(
    ""
  )}</svg>`;
}
// function buildProgressSVG(subjects, sessionsByDate, A4W = 794, A4H = 1123) {
function buildProgressSVG(subjects, sessionsByDate, A4W = 794) {
  const per = {};
  for (const s of subjects)
    per[s.id] = {
      name: s.name,
      color: pastelOf(s.name),
      planned: s.plannedSessions || 0,
      placed: 0,
    };
  for (const y of Object.keys(sessionsByDate || {}))
    for (const it of sessionsByDate[y] || [])
      if (per[it.subjectId]) per[it.subjectId].placed++;
  const list = Object.values(per);
  const pad = 24,
    rowH = 30,
    width = A4W,
    height = Math.max(pad * 2 + list.length * rowH, 200);
  const items = [
    `<rect x='0' y='0' width='${width}' height='${height}' fill='#ffffff'/>`,
  ];
  list.forEach((p, i) => {
    const y = pad + i * rowH;
    items.push(
      `<text x='${pad}' y='${y + 12}' font-size='12' fill='${
        p.color
      }'>${escapeXML(p.name)} ${p.placed}/${p.planned}</text>`
    );
    const barX = 220,
      barW = width - pad - barX,
      seg = p.planned ? Math.floor(barW / p.planned) : barW;
    for (let k = 0; k < Math.max(1, p.planned); k++) {
      const x = barX + k * Math.max(4, seg);
      const w = Math.max(6, seg - 2);
      const fill = k < p.placed ? "#111827" : "#d1d5db";
      items.push(
        `<rect x='${x}' y='${y}' width='${w}' height='14' rx='3' fill='${fill}'/>`
      );
    }
  });
  return `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}'>${items.join(
    ""
  )}</svg>`;
}
function svgToPNG(svgString, filename) {
  if (!svgString) return;
  const img = new Image();
  const svg = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svg);
  const canvas = document.createElement("canvas");
  const a = document.createElement("a");
  img.onload = function () {
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    a.href = canvas.toDataURL("image/png");
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
  img.src = url;
}
