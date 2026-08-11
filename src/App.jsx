import { useEffect, useMemo, useState } from "react";
import initSqlJs from "sql.js";
import {
  Pulse,
  AppWindow,
  Archive,
  ArrowLeft,
  ArrowClockwise,
  Bell,
  CaretDown,
  CaretRight,
  ChartBar,
  Check,
  CheckCircle,
  ClipboardText,
  Clock,
  Copy,
  Database,
  DotsThree,
  DownloadSimple,
  FileText,
  Funnel,
  Gauge,
  GearSix,
  GlobeHemisphereWest,
  House,
  Info,
  Key,
  ListChecks,
  MagnifyingGlass,
  PauseCircle,
  PencilSimple,
  Play,
  Plus,
  Queue,
  Robot,
  RocketLaunch,
  Rows,
  ShieldCheck,
  SidebarSimple,
  SlidersHorizontal,
  StopCircle,
  TestTube,
  UploadSimple,
  UserCircle,
  Users,
  Warning,
  X,
} from "@phosphor-icons/react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: ChartBar },
  { id: "runs", label: "Test runs", icon: Pulse },
  { id: "plans", label: "Test plans", icon: ClipboardText },
  { id: "sets", label: "Test sets", icon: Rows },
  { id: "cases", label: "Test cases", icon: ListChecks },
  { id: "data", label: "Test data", icon: Database },
  { id: "apps", label: "App config", icon: AppWindow },
  { id: "security", label: "Security config", icon: ShieldCheck },
  { id: "settings", label: "Project settings", icon: GearSix },
];

const assetUrl = (path) => `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;

const resultTone = {
  Passed: "success",
  Failed: "danger",
  Running: "info",
  Queued: "neutral",
  Completed: "success",
  Cancelled: "neutral",
  Terminated: "warning",
  "In progress": "info",
  Attention: "warning",
  Ready: "success",
  Active: "success",
  Draft: "neutral",
  Healthy: "success",
  Idle: "success",
  Offline: "neutral",
  Error: "danger",
  Published: "success",
  Imported: "info",
};

function query(db, statement) {
  const result = db.exec(statement)[0];
  if (!result) return [];
  return result.values.map((values) =>
    Object.fromEntries(result.columns.map((column, index) => [column, values[index]])),
  );
}

function useMockDatabase() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const SQL = await initSqlJs({ locateFile: () => assetUrl("sql-wasm.wasm") });
        const bytes = await fetch(assetUrl("mock-data.sqlite")).then((response) => response.arrayBuffer());
        const db = new SQL.Database(new Uint8Array(bytes));
        const payload = {
          projects: query(db, "SELECT * FROM projects ORDER BY id"),
          plans: query(db, "SELECT * FROM plans ORDER BY id"),
          planSets: query(db, "SELECT * FROM plan_sets ORDER BY plan_id, set_id"),
          planCases: query(db, "SELECT * FROM plan_cases ORDER BY plan_id, case_id"),
          planCaseExclusions: query(db, "SELECT * FROM plan_case_exclusions ORDER BY plan_id, case_id"),
          setCases: query(db, "SELECT * FROM set_cases ORDER BY set_id, case_id"),
          sets: query(db, "SELECT * FROM test_sets ORDER BY id"),
          cases: query(db, "SELECT * FROM cases ORDER BY id"),
          runs: query(db, "SELECT * FROM runs ORDER BY id"),
          dataSets: query(db, "SELECT * FROM data_sets ORDER BY id"),
          applications: query(db, "SELECT * FROM applications ORDER BY id"),
          executors: query(db, "SELECT * FROM executors ORDER BY id"),
          queue: query(db, "SELECT * FROM queue ORDER BY id"),
          members: query(db, "SELECT * FROM members ORDER BY id"),
          securityRules: query(db, "SELECT * FROM security_rules ORDER BY id"),
        };
        db.close();
        if (active) setData(payload);
      } catch (err) {
        if (active) setError(err.message || "Unable to load mock database");
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  return { data, error };
}

function StatusPill({ children, tone }) {
  const className = tone || resultTone[children] || "neutral";
  return <span className={`status-pill ${className}`}>{children}</span>;
}

function IconButton({ label, children, onClick, className = "" }) {
  return (
    <button className={`icon-button ${className}`} aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  );
}

function EmptyState({ title, detail }) {
  return (
    <div className="empty-state">
      <Info size={24} weight="duotone" />
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

function Sidebar({ page, setPage, collapsed, setCollapsed }) {
  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="brand-block">
        <img src={assetUrl("qa-orbit-logo.png")} alt="QA Orbit" className="brand-logo" />
        {!collapsed && (
          <div>
            <strong>QA Orbit</strong>
            <span>Test operations</span>
          </div>
        )}
      </div>
      <nav className="side-nav" aria-label="Main navigation">
        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={page === item.id ? "active" : ""}
              onClick={() => setPage(item.id)}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={20} weight={page === item.id ? "fill" : "regular"} />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>
      <div className="side-footer">
        <button onClick={() => setCollapsed(!collapsed)} title="Collapse navigation">
          <SidebarSimple size={20} />
          {!collapsed && <span>Collapse</span>}
        </button>
        <div className="avatar-row">
          <div className="avatar">MC</div>
          {!collapsed && (
            <div>
              <strong>Maya Chen</strong>
              <span>Admin · Project owner</span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

function Topbar({ projects, archivedVisible, setArchivedVisible }) {
  const visibleProjects = projects.filter((project) => archivedVisible || project.status !== "Archived");
  return (
    <header className="topbar">
      <div className="breadcrumbs">
        <House size={16} weight="fill" />
        <CaretRight size={12} />
        <span>Functional testing</span>
      </div>
      <div className="top-controls">
        <label className="context-select">
          <span>BU</span>
          <select defaultValue="MY">
            <option>MY</option>
          </select>
          <CaretDown size={14} />
        </label>
        <label className="context-select project-select">
          <span>Project</span>
          <select defaultValue="Digital Claims Modernization">
            {visibleProjects.map((project) => (
              <option key={project.id}>{project.name}</option>
            ))}
          </select>
          <CaretDown size={14} />
        </label>
        <button
          className={`archive-toggle ${archivedVisible ? "active" : ""}`}
          onClick={() => setArchivedVisible(!archivedVisible)}
          title="Admin: show archived projects"
        >
          <Archive size={17} />
          <span>Archived</span>
        </button>
        <IconButton label="Notifications">
          <Bell size={19} />
          <i className="notification-dot" />
        </IconButton>
      </div>
    </header>
  );
}

function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <div className="page-header">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="page-actions">{actions}</div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, meta, tone = "pink" }) {
  return (
    <article className="metric-card">
      <div className={`metric-icon ${tone}`}><Icon size={21} weight="duotone" /></div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{meta}</small>
      </div>
    </article>
  );
}

function RunTable({ runs, onSelect }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Task ID</th>
            <th>Test case</th>
            <th>Build</th>
            <th>Environment</th>
            <th>Executed by</th>
            <th>Execution time</th>
            <th>Duration</th>
            <th>State</th>
            <th>Result</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id} onClick={() => onSelect(run)}>
              <td><button className="table-link">{run.task_id}</button></td>
              <td>
                <strong className="cell-primary">{run.case_title}</strong>
                <span className="cell-secondary">{run.plan_name}</span>
              </td>
              <td>{run.build}</td>
              <td>{run.environment}</td>
              <td>{run.executed_by}</td>
              <td>{run.execution_time}</td>
              <td>{run.duration}</td>
              <td><StatusPill>{run.state}</StatusPill></td>
              <td><StatusPill>{run.result}</StatusPill></td>
              <td><DotsThree size={20} weight="bold" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function summarizeRuns(runs, groupKey) {
  return Object.values(runs.reduce((groups, run) => {
    const name = run[groupKey];
    const group = groups[name] || { name, runs: [] };
    group.runs.push(run);
    groups[name] = group;
    return groups;
  }, {})).map((group) => {
    const passed = group.runs.filter((run) => run.result === "Passed").length;
    const failed = group.runs.filter((run) => run.result === "Failed").length;
    const completed = passed + failed;
    const latest = group.runs[group.runs.length - 1];
    const state = group.runs.some((run) => run.state === "Running")
      ? "Running"
      : group.runs.some((run) => run.state === "Queued") ? "Queued" : "Completed";
    const result = failed > 0 ? "Failed" : state === "Running" ? "Running" : state === "Queued" ? "Queued" : "Passed";
    return {
      ...group,
      passed,
      failed,
      state,
      result,
      passRate: completed ? `${Math.round((passed / completed) * 100)}%` : "—",
      build: latest.build,
      environment: latest.environment,
      executedBy: latest.executed_by,
      executionTime: latest.execution_time,
    };
  });
}

function RunSummaryTable({ groups, type, onViewCases }) {
  return (
    <div className="table-wrap">
      <table className="data-table summary-runs-table">
        <thead>
          <tr>
            <th>{type}</th>
            <th>Cases</th>
            <th>Passed</th>
            <th>Failed</th>
            <th>Pass rate</th>
            <th>Build</th>
            <th>Environment</th>
            <th>Executed by</th>
            <th>Execution time</th>
            <th>State</th>
            <th>Result</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <tr key={group.name}>
              <td><strong className="cell-primary">{group.name}</strong><span className="cell-secondary">Latest grouped execution</span></td>
              <td>{group.runs.length}</td>
              <td>{group.passed}</td>
              <td>{group.failed}</td>
              <td><strong>{group.passRate}</strong></td>
              <td>{group.build}</td>
              <td>{group.environment}</td>
              <td>{group.executedBy}</td>
              <td>{group.executionTime}</td>
              <td><StatusPill>{group.state}</StatusPill></td>
              <td><StatusPill>{group.result}</StatusPill></td>
              <td><button className="text-button" onClick={() => onViewCases(group)}>View cases <CaretRight size={14} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Dashboard({ data, onViewRuns }) {
  const results = [
    { name: "Passed", value: data.runs.filter((run) => run.result === "Passed").length, color: "#21a179" },
    { name: "Failed", value: data.runs.filter((run) => run.result === "Failed").length, color: "#e45b74" },
    { name: "Running", value: data.runs.filter((run) => run.state === "Running").length, color: "#4b7bec" },
    { name: "Queued", value: data.runs.filter((run) => run.state === "Queued").length, color: "#98a2b3" },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Project command center"
        title="Quality overview"
        description="Live release health and execution evidence for Digital Claims Modernization."
        actions={
          <button className="secondary-button"><DownloadSimple size={17} /> Export report</button>
        }
      />

      <section className="metrics-grid">
        <MetricCard icon={ClipboardText} label="Active test plans" value="4" meta="1 running now" />
        <MetricCard icon={ListChecks} label="Total test cases" value="388" meta="+18 this release" tone="blue" />
        <MetricCard icon={CheckCircle} label="Latest pass rate" value="91%" meta="+3.2% vs previous" tone="green" />
        <MetricCard icon={Robot} label="Executors online" value="4 / 5" meta="1 executor offline" tone="amber" />
      </section>

      <section className="dashboard-split">
        <article className="panel result-panel">
          <div className="panel-heading">
            <div><span className="panel-kicker">Latest run</span><h2>Execution results</h2></div>
            <button className="text-button" onClick={onViewRuns}>View all runs <CaretRight size={14} /></button>
          </div>
          <div className="result-overview">
            <div className="score-block">
              <strong>91%</strong>
              <span>Pass rate</span>
              <small>August Release Regression</small>
            </div>
            <div className="chart-area" aria-label="Execution result chart">
              <ResponsiveContainer width="100%" height={170}>
                <BarChart data={results} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8eaf0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#667085", fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "#98a2b3", fontSize: 11 }} allowDecimals={false} />
                  <Tooltip cursor={{ fill: "#f7f8fb" }} contentStyle={{ borderRadius: 10, border: "1px solid #e8eaf0" }} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={44}>
                    {results.map((item) => <Cell key={item.name} fill={item.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </article>

        <article className="panel executor-panel">
          <div className="panel-heading">
            <div><span className="panel-kicker">Capacity</span><h2>Executor status</h2></div>
            <StatusPill tone="success">4 online</StatusPill>
          </div>
          <div className="executor-list">
            {data.executors.slice(0, 4).map((executor) => (
              <div className="executor-row" key={executor.id}>
                <div className={`executor-orb ${executor.status.toLowerCase()}`}><Robot size={17} weight="duotone" /></div>
                <div><strong>{executor.name}</strong><span>{executor.current_task === "—" ? executor.last_active : executor.current_task}</span></div>
                <StatusPill>{executor.status}</StatusPill>
              </div>
            ))}
          </div>
        </article>
      </section>

    </>
  );
}

function TestRunsPage({ data, onRun, onToast }) {
  const [runTab, setRunTab] = useState("Test cases");
  const [selectedRun, setSelectedRun] = useState(null);
  const [caseScope, setCaseScope] = useState(null);
  const [queue, setQueue] = useState(data.queue);
  const [queueExpanded, setQueueExpanded] = useState(false);
  const maxConcurrentRuns = 3;
  const queuedCount = queue.filter((item) => item.status === "Queued").length;
  const planRuns = useMemo(() => summarizeRuns(data.runs, "plan_name"), [data.runs]);
  const setRuns = useMemo(() => summarizeRuns(data.runs, "set_name"), [data.runs]);
  const visibleCaseRuns = caseScope
    ? data.runs.filter((run) => run[caseScope.key] === caseScope.name)
    : data.runs;

  function viewCases(group, key) {
    setCaseScope({ key, name: group.name });
    setRunTab("Test cases");
  }

  function selectTab(tab) {
    setRunTab(tab);
    if (tab !== "Test cases") setCaseScope(null);
  }

  function cancelTask(taskId) {
    setQueue((items) => items.map((item) => item.task_id === taskId ? { ...item, status: "Cancelled" } : item));
    onToast(`${taskId} was cancelled and removed from the queue.`);
  }

  return (
    <>
      <PageHeader
        eyebrow="Execution evidence"
        title="Test runs"
        description="Review test execution history, results and detailed evidence across cases, plans and sets."
      />

      <section className={`panel queue-panel queue-collapsible ${queueExpanded ? "expanded" : ""}`}>
        <button className="queue-summary-button" onClick={() => setQueueExpanded((expanded) => !expanded)} aria-expanded={queueExpanded}>
          <span className="queue-summary-icon"><Queue size={20} weight="duotone" /></span>
          <span className="queue-summary-copy">
            <span className="panel-kicker">Live queue</span>
            <strong>Waiting tasks</strong>
          </span>
          <span className="queue-capacity">
            <small>Queued / max concurrent</small>
            <strong>{queuedCount} / {maxConcurrentRuns}</strong>
          </span>
          {queueExpanded ? <CaretDown size={18} /> : <CaretRight size={18} />}
        </button>
        {queueExpanded && (
          <div className="queue-list">
            {queue.map((item, index) => (
              <div className={`queue-item ${item.status === "Cancelled" ? "cancelled" : ""}`} key={item.id}>
                <span className="queue-position">{item.status === "Cancelled" ? <X size={15} /> : index + 1}</span>
                <div className="queue-copy">
                  <strong>{item.object_name}</strong>
                  <span>{item.task_id} · {item.application} · {item.environment}</span>
                </div>
                <span className="queue-owner">{item.submitted_by}</span>
                <StatusPill>{item.status}</StatusPill>
                {item.status === "Queued" && (
                  <button className="danger-text-button" onClick={() => cancelTask(item.task_id)}>Cancel</button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel runs-panel">
        <div className="panel-heading table-heading">
          <div>
            <span className="panel-kicker">Evidence</span>
            <h2>Test runs</h2>
          </div>
          <div className="table-tools">
            <div className="segmented-control">
              {["Test cases", "Test plans", "Test sets"].map((tab) => (
                <button key={tab} className={runTab === tab ? "active" : ""} onClick={() => selectTab(tab)}>{tab}</button>
              ))}
            </div>
            {caseScope && <button className="secondary-button compact" onClick={() => setCaseScope(null)}><X size={14} /> Clear {caseScope.name}</button>}
            <button className="secondary-button compact"><Funnel size={16} /> Filters</button>
          </div>
        </div>
        {runTab === "Test cases" && <RunTable runs={visibleCaseRuns} onSelect={setSelectedRun} />}
        {runTab === "Test plans" && <RunSummaryTable groups={planRuns} type="Test plan" onViewCases={(group) => viewCases(group, "plan_name")} />}
        {runTab === "Test sets" && <RunSummaryTable groups={setRuns} type="Test set" onViewCases={(group) => viewCases(group, "set_name")} />}
      </section>

      {selectedRun && (
        <RunDrawer run={selectedRun} onClose={() => setSelectedRun(null)} onRerun={() => onRun(selectedRun.case_title, "Re-run")} />
      )}
    </>
  );
}

function RunDrawer({ run, onClose, onRerun }) {
  const [attempt, setAttempt] = useState(run.attempt);
  return (
    <div className="drawer-layer" role="dialog" aria-modal="true" aria-label="Run details">
      <button className="drawer-backdrop" onClick={onClose} aria-label="Close run details" />
      <aside className="run-drawer">
        <div className="drawer-header">
          <div><span className="eyebrow">{run.run_id}</span><h2>{run.task_id}</h2></div>
          <IconButton label="Close" onClick={onClose}><X size={20} /></IconButton>
        </div>
        <div className="drawer-title-row">
          <div><h3>{run.case_title}</h3><p>{run.plan_name} · {run.set_name}</p></div>
          <StatusPill>{run.result}</StatusPill>
        </div>
        <div className="detail-grid">
          <div><span>Application</span><strong>{run.application}</strong></div>
          <div><span>Build</span><strong>{run.build}</strong></div>
          <div><span>Environment</span><strong>{run.environment}</strong></div>
          <div><span>Executor</span><strong>{run.executor}</strong></div>
          <div><span>Executed by</span><strong>{run.executed_by}</strong></div>
          <div><span>Duration</span><strong>{run.duration}</strong></div>
        </div>
        <div className="attempt-tabs">
          {Array.from({ length: Math.max(1, run.attempt) }, (_, index) => index + 1).map((item) => (
            <button key={item} className={attempt === item ? "active" : ""} onClick={() => setAttempt(item)}>Attempt {item}</button>
          ))}
        </div>
        <section className="drawer-section">
          <div className="section-label"><Pulse size={17} /> Execution log</div>
          <pre>{attempt === run.attempt ? run.log_text : "09:14:10 Previous attempt initialized\n09:14:42 Assertion failed\n09:14:43 Evidence captured"}</pre>
        </section>
        {run.result === "Failed" && (
          <section className="drawer-section">
            <div className="section-label"><FileText size={17} /> Screenshot evidence</div>
            <img src={assetUrl("run-evidence.jpg")} alt="Execution screenshot evidence" className="evidence-image" />
          </section>
        )}
        <div className="drawer-actions">
          {run.state === "Running" ? (
            <button className="danger-button"><StopCircle size={17} /> Terminate</button>
          ) : run.result === "Failed" ? (
            <button className="primary-button" onClick={onRerun}><ArrowClockwise size={17} /> Re-run failed case</button>
          ) : (
            <button className="secondary-button"><DownloadSimple size={17} /> Download evidence</button>
          )}
        </div>
      </aside>
    </div>
  );
}

function PlanLibraryModal({ type, items, includedIds, coveredCaseIds = [], onClose, onAdd }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const isSet = type === "set";
  const toggle = (id) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  return (
    <div className="modal-layer">
      <button className="modal-backdrop" onClick={onClose} aria-label="Close library picker" />
      <section className="modal-card library-modal">
        <div className="modal-header">
          <div><span className="eyebrow">Existing library</span><h2>Add test {isSet ? "sets" : "cases"}</h2></div>
          <IconButton label="Close" onClick={onClose}><X size={20} /></IconButton>
        </div>
        <p className="modal-description">Select one or more existing test {isSet ? "sets" : "cases"} to add to this plan.</p>
        <div className="library-list">
          {items.map((item) => {
            const id = item.id;
            const included = includedIds.includes(id) || (!isSet && coveredCaseIds.includes(id));
            return (
              <label className={`library-item ${included ? "included" : ""}`} key={id}>
                <input type="checkbox" disabled={included} checked={included || selectedIds.includes(id)} onChange={() => toggle(id)} />
                <span className="library-item-copy">
                  <strong>{isSet ? item.name : item.title}</strong>
                  <small>{isSet ? `${item.case_count} cases · ${item.case_type}` : `TC-${item.id} · ${item.case_type} · ${item.priority}`}</small>
                </span>
                {included && <StatusPill>{!isSet && coveredCaseIds.includes(id) ? "Covered by set" : "Added"}</StatusPill>}
              </label>
            );
          })}
        </div>
        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose}>Cancel</button>
          <button className="primary-button" disabled={!selectedIds.length} onClick={() => onAdd(selectedIds)}><Plus size={16} /> Add selected ({selectedIds.length})</button>
        </div>
      </section>
    </div>
  );
}

function PlanDetail({ plan, sets, cases, setCaseMemberships, membership, setMembership, onBack, onRun, onToast }) {
  const [picker, setPicker] = useState(null);
  const includedSets = sets.filter((item) => membership.setIds.includes(item.id));
  const coveredCaseIds = [...new Set(includedSets.flatMap((set) => setCaseMemberships[set.id] || []))];
  const coveredBySet = cases.filter((item) => coveredCaseIds.includes(item.id));
  const directCases = cases.filter((item) => membership.caseIds.includes(item.id));
  const excludedCaseIds = membership.excludedCaseIds || [];
  const activeCoveredCases = coveredBySet.filter((item) => !excludedCaseIds.includes(item.id));
  const includedCases = [...activeCoveredCases, ...directCases.filter((item) => !activeCoveredCases.some((covered) => covered.id === item.id) && !excludedCaseIds.includes(item.id))];

  function addItems(ids) {
    setMembership((current) => ({
      ...current,
      [plan.id]: picker === "set"
        ? { ...membership, setIds: [...membership.setIds, ...ids] }
        : { ...membership, caseIds: [...new Set([...membership.caseIds, ...ids])], excludedCaseIds: excludedCaseIds.filter((id) => !ids.includes(id)) },
    }));
    onToast(`${ids.length} test ${picker}${ids.length > 1 ? "s" : ""} added to ${plan.name}.`);
    setPicker(null);
  }

  function removeSet(set) {
    setMembership((current) => ({ ...current, [plan.id]: { ...membership, setIds: membership.setIds.filter((id) => id !== set.id) } }));
    onToast(`${set.name} removed from ${plan.name}.`);
  }

  function removeCase(testCase) {
    const isDirect = membership.caseIds.includes(testCase.id);
    const isCovered = coveredBySet.some((item) => item.id === testCase.id);
    setMembership((current) => ({
      ...current,
      [plan.id]: {
        ...membership,
        caseIds: membership.caseIds.filter((id) => id !== testCase.id),
        excludedCaseIds: isCovered ? [...new Set([...excludedCaseIds, testCase.id])] : excludedCaseIds,
      },
    }));
    onToast(`${testCase.title} removed from ${plan.name}${isDirect && isCovered ? " and excluded from its test set coverage" : ""}.`);
  }

  return (
    <>
      <button className="back-button" onClick={onBack}><ArrowLeft size={17} /> Back to test plans</button>
      <PageHeader eyebrow={`Release ${plan.release}`} title={plan.name} description="Review plan coverage and add reusable test sets or individual test cases before execution."
        actions={<><button className="secondary-button" onClick={() => onToast(`${plan.name} duplicated as a draft.`)}><Copy size={17} /> Duplicate</button><button className="primary-button" onClick={() => onRun(plan.name, "Test plan")}><Play size={16} weight="fill" /> Run plan</button></>} />

      <section className="plan-detail-summary">
        <div><span>Status</span><StatusPill>{plan.status}</StatusPill></div>
        <div><span>Application version</span><strong>{plan.build}</strong></div>
        <div><span>Environment</span><strong>{plan.environment}</strong></div>
        <div><span>Test sets</span><strong>{includedSets.length}</strong></div>
        <div><span>Visible / total cases</span><strong>{includedCases.length} / {plan.case_count}</strong></div>
        <div><span>Latest pass rate</span><strong>{plan.pass_rate}%</strong></div>
      </section>

      <section className="panel plan-content-panel">
        <div className="panel-heading">
          <div><span className="panel-kicker">Reusable groups</span><h2>Test sets in this plan</h2><p>{includedSets.length} sets are included in the current plan.</p></div>
          <button className="secondary-button compact" onClick={() => setPicker("set")}><Plus size={16} /> Add existing sets</button>
        </div>
        <div className="table-wrap">
          <table className="data-table plan-detail-table">
            <thead><tr><th>Test set</th><th>Cases</th><th>Type</th><th>Latest build</th><th>Status</th><th /></tr></thead>
            <tbody>{includedSets.map((set) => <tr key={set.id}><td><strong className="cell-primary">{set.name}</strong><span className="cell-secondary">SET-{String(set.id).padStart(4, "0")}</span></td><td>{set.case_count}</td><td>{set.case_type}</td><td>{set.build}</td><td><StatusPill>{set.status}</StatusPill></td><td><button className="danger-text-button" onClick={() => removeSet(set)}><X size={14} /> Remove</button></td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="panel plan-content-panel">
        <div className="panel-heading">
          <div><span className="panel-kicker">Deduplicated coverage</span><h2>Test cases in this plan</h2><p>Showing {includedCases.length} seeded records of {plan.case_count}; duplicates across sets execute only once.</p></div>
          <button className="secondary-button compact" onClick={() => setPicker("case")}><Plus size={16} /> Add existing cases</button>
        </div>
        <div className="table-wrap">
          <table className="data-table plan-detail-table">
            <thead><tr><th>Test case</th><th>Source</th><th>Type</th><th>Priority</th><th>Automation</th><th>Status</th><th /></tr></thead>
            <tbody>{includedCases.map((item) => {
              const direct = membership.caseIds.includes(item.id) && !coveredBySet.some((covered) => covered.id === item.id);
              const sourceSets = includedSets.filter((set) => (setCaseMemberships[set.id] || []).includes(item.id)).map((set) => set.name);
              return <tr key={item.id}><td><strong className="cell-primary">{item.title}</strong><span className="cell-secondary">TC-{item.id}</span></td><td>{direct ? "Added directly" : sourceSets.join(", ")}</td><td>{item.case_type}</td><td><span className={`priority ${item.priority.toLowerCase()}`}>{item.priority}</span></td><td>{item.automation}</td><td><StatusPill>{item.status}</StatusPill></td><td><button className="danger-text-button" onClick={() => removeCase(item)}><X size={14} /> Remove</button></td></tr>;
            })}</tbody>
          </table>
        </div>
      </section>

      {picker && <PlanLibraryModal type={picker} items={picker === "set" ? sets : cases} includedIds={picker === "set" ? membership.setIds : membership.caseIds.filter((id) => !excludedCaseIds.includes(id))} coveredCaseIds={activeCoveredCases.map((item) => item.id)} onClose={() => setPicker(null)} onAdd={addItems} />}
    </>
  );
}

function PlansPage({ plans, sets, cases, setCaseMemberships, planSets, planCases, planCaseExclusions, onRun, onToast }) {
  const [queryText, setQueryText] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [memberships, setMemberships] = useState(() => Object.fromEntries(plans.map((plan) => [plan.id, {
    setIds: planSets.filter((item) => item.plan_id === plan.id).map((item) => item.set_id),
    caseIds: planCases.filter((item) => item.plan_id === plan.id).map((item) => item.case_id),
    excludedCaseIds: planCaseExclusions.filter((item) => item.plan_id === plan.id).map((item) => item.case_id),
  }])));
  const filtered = plans.filter((plan) => plan.name.toLowerCase().includes(queryText.toLowerCase()));
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId);
  if (selectedPlan) {
    return <PlanDetail plan={selectedPlan} sets={sets} cases={cases} setCaseMemberships={setCaseMemberships} membership={memberships[selectedPlan.id] || { setIds: [], caseIds: [], excludedCaseIds: [] }} setMembership={setMemberships} onBack={() => setSelectedPlanId(null)} onRun={onRun} onToast={onToast} />;
  }
  return (
    <>
      <PageHeader eyebrow="Release orchestration" title="Test plans" description="Compose reusable test sets, define run defaults and track release confidence."
        actions={<button className="primary-button" onClick={() => onToast("New test plan draft created.")}><Plus size={17} /> New test plan</button>} />
      <div className="filter-bar">
        <label className="search-field"><MagnifyingGlass size={18} /><input value={queryText} onChange={(event) => setQueryText(event.target.value)} placeholder="Search test plans" /></label>
        <button className="secondary-button compact"><SlidersHorizontal size={16} /> Release: All</button>
      </div>
      <div className="plan-grid">
        {filtered.map((plan) => (
          <article className="plan-card" key={plan.id}>
            <div className="plan-card-top">
              <div className="plan-icon"><RocketLaunch size={22} weight="duotone" /></div>
              <StatusPill>{plan.status}</StatusPill>
            </div>
            <span className="plan-release">Release {plan.release}</span>
            <h2>{plan.name}</h2>
            <div className="plan-stats">
              <div><strong>{plan.set_count}</strong><span>Test sets</span></div>
              <div><strong>{plan.case_count}</strong><span>Unique cases</span></div>
              <div><strong>{plan.pass_rate}%</strong><span>Pass rate</span></div>
            </div>
            <div className="plan-config"><span>{plan.environment}</span><span>{plan.build}</span></div>
            <div className="plan-progress"><i style={{ width: `${plan.pass_rate}%` }} /></div>
            <div className="card-footer">
              <small>Updated {plan.updated_at}</small>
              <div>
                <IconButton label="Duplicate plan" onClick={() => onToast(`${plan.name} duplicated as a draft.`)}><Copy size={18} /></IconButton>
                <button className="secondary-button compact" onClick={() => setSelectedPlanId(plan.id)}>View details</button>
                <button className="primary-button compact" onClick={() => onRun(plan.name, "Test plan")}><Play size={15} weight="fill" /> Run</button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function SetCasesDrawer({ testSet, cases, caseIds, onClose, onAdd, onRemove }) {
  const [queryText, setQueryText] = useState("");
  const currentCases = cases.filter((item) => caseIds.includes(item.id));
  const availableCases = cases.filter((item) => !caseIds.includes(item.id) && item.title.toLowerCase().includes(queryText.toLowerCase()));
  return (
    <div className="drawer-layer">
      <button className="drawer-backdrop" onClick={onClose} aria-label="Close test set case manager" />
      <aside className="set-cases-drawer">
        <div className="drawer-header"><div><span className="eyebrow">Test set coverage</span><h2>Manage cases</h2></div><IconButton label="Close" onClick={onClose}><X size={20} /></IconButton></div>
        <div className="set-manager-title"><div className="plan-icon"><Rows size={21} weight="duotone" /></div><div><h3>{testSet.name}</h3><p>SET-{String(testSet.id).padStart(4, "0")} · {currentCases.length} linked cases</p></div></div>

        <section className="case-manager-section">
          <div className="case-manager-heading"><div><span className="panel-kicker">Current coverage</span><h3>Cases in this set</h3></div><span className="subtle-count">{currentCases.length} cases</span></div>
          <div className="case-manager-list">
            {currentCases.map((item) => <div className="case-manager-row" key={item.id}><div><strong>{item.title}</strong><span>TC-{item.id} · {item.case_type} · {item.priority}</span></div><button className="danger-text-button" onClick={() => onRemove(item)}><X size={14} /> Remove</button></div>)}
            {!currentCases.length && <div className="mini-empty"><ListChecks size={24} /><span>No cases in this set yet.</span></div>}
          </div>
        </section>

        <section className="case-manager-section add-case-section">
          <div className="case-manager-heading"><div><span className="panel-kicker">Case library</span><h3>Add existing test cases</h3></div></div>
          <label className="search-field full"><MagnifyingGlass size={17} /><input value={queryText} onChange={(event) => setQueryText(event.target.value)} placeholder="Search existing cases" /></label>
          <div className="case-manager-list available-list">
            {availableCases.map((item) => <div className="case-manager-row" key={item.id}><div><strong>{item.title}</strong><span>TC-{item.id} · {item.case_type} · {item.priority} · {item.automation}</span></div><button className="secondary-button compact" onClick={() => onAdd(item)}><Plus size={14} /> Add</button></div>)}
            {!availableCases.length && <div className="mini-empty"><CheckCircle size={24} /><span>All matching cases are already included.</span></div>}
          </div>
        </section>
      </aside>
    </div>
  );
}

function SetsPage({ sets, cases, setCaseMemberships, setSetCaseMemberships, onRun, onToast }) {
  const [queryText, setQueryText] = useState("");
  const [selected, setSelected] = useState([]);
  const [managedSet, setManagedSet] = useState(null);
  const filtered = sets.filter((set) => set.name.toLowerCase().includes(queryText.toLowerCase()));
  function toggle(id) {
    setSelected((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  }
  function addCase(item) {
    setSetCaseMemberships((current) => ({ ...current, [managedSet.id]: [...new Set([...(current[managedSet.id] || []), item.id])] }));
    onToast(`${item.title} added to ${managedSet.name}.`);
  }
  function removeCase(item) {
    setSetCaseMemberships((current) => ({ ...current, [managedSet.id]: (current[managedSet.id] || []).filter((id) => id !== item.id) }));
    onToast(`${item.title} removed from ${managedSet.name}.`);
  }
  return (
    <>
      <PageHeader eyebrow="Reusable coverage" title="Test sets" description="Organize test cases into reusable execution groups across release plans."
        actions={<><button className="secondary-button"><UploadSimple size={17} /> Upload set</button><button className="primary-button" onClick={() => onToast("New test set draft created.")}><Plus size={17} /> New test set</button></>} />
      <div className="filter-bar">
        <label className="search-field"><MagnifyingGlass size={18} /><input value={queryText} onChange={(event) => setQueryText(event.target.value)} placeholder="Search test sets" /></label>
        {selected.length > 0 && <button className="primary-button compact" onClick={() => onRun(`${selected.length} selected test sets`, "Batch test set")}><Play size={15} weight="fill" /> Run selected ({selected.length})</button>}
      </div>
      <section className="panel flush-panel">
        <div className="table-wrap">
          <table className="data-table selectable-table">
            <thead><tr><th /><th>Test set</th><th>Case count</th><th>Case type</th><th>Latest build</th><th>Updated</th><th>Status</th><th /></tr></thead>
            <tbody>{filtered.map((set) => (
              <tr key={set.id}>
                <td><input type="checkbox" checked={selected.includes(set.id)} onChange={() => toggle(set.id)} aria-label={`Select ${set.name}`} /></td>
                <td><strong className="cell-primary">{set.name}</strong><span className="cell-secondary">SET-{String(set.id).padStart(4, "0")}</span></td>
                <td>{set.case_count}</td><td>{set.case_type}</td><td>{set.build}</td><td>{set.updated_at}</td><td><StatusPill>{set.status}</StatusPill></td>
                <td><div className="row-actions"><button className="text-button" onClick={() => setManagedSet(set)}>Manage cases</button><button className="primary-button compact" onClick={() => onRun(set.name, "Test set")}><Play size={14} weight="fill" /> Run</button></div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
      {managedSet && <SetCasesDrawer testSet={managedSet} cases={cases} caseIds={setCaseMemberships[managedSet.id] || []} onClose={() => setManagedSet(null)} onAdd={addCase} onRemove={removeCase} />}
    </>
  );
}

function CaseEditModal({ testCase, onClose, onSave }) {
  const isNew = !testCase?.id;
  const [form, setForm] = useState(testCase || {
    title: "", case_type: "Web", priority: "P1", automation: "Automated", status: "Draft",
    preconditions: "", test_steps: "", test_data: "", expected_result: "", test_set: "Not assigned",
  });
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  return (
    <div className="modal-layer">
      <button className="modal-backdrop" onClick={onClose} aria-label="Close test case editor" />
      <section className="modal-card case-editor-modal">
        <div className="modal-header"><div><span className="eyebrow">Test inventory</span><h2>{isNew ? "Create test case" : "Edit test case"}</h2></div><IconButton label="Close" onClick={onClose}><X size={20} /></IconButton></div>
        <div className="modal-form case-editor-form">
          {!isNew && <label><span>Case ID</span><input value={`TC-${form.id}`} disabled /></label>}
          <label><span>Description</span><input value={form.title} onChange={(event) => update("title", event.target.value)} placeholder="Describe the expected behavior" /></label>
          <div className="form-row">
            <label><span>Case type</span><select value={form.case_type} onChange={(event) => update("case_type", event.target.value)}><option>Web</option><option>API</option><option>Mobile</option></select></label>
            <label><span>Priority</span><select value={form.priority} onChange={(event) => update("priority", event.target.value)}><option>P0</option><option>P1</option><option>P2</option></select></label>
          </div>
          <div className="form-row">
            <label><span>Execution type</span><select value={form.automation} onChange={(event) => update("automation", event.target.value)}><option>Automated</option><option>Manual</option></select></label>
            <label><span>Status</span><select value={form.status} onChange={(event) => update("status", event.target.value)}><option>Active</option><option>Draft</option></select></label>
          </div>
          <label><span>Preconditions</span><textarea value={form.preconditions || ""} onChange={(event) => update("preconditions", event.target.value)} placeholder="Required state before execution" /></label>
          <label><span>Test steps</span><textarea value={form.test_steps || ""} onChange={(event) => update("test_steps", event.target.value)} placeholder="Enter one step per line" /></label>
          <label><span>Test data</span><input value={form.test_data || ""} onChange={(event) => update("test_data", event.target.value)} placeholder="Data Set or Data Profile reference" /></label>
          <label><span>Expected result</span><textarea value={form.expected_result || ""} onChange={(event) => update("expected_result", event.target.value)} placeholder="Expected outcome" /></label>
          {!isNew && <div className="inline-notice"><Info size={17} /><span>Test Set membership is managed from Test sets → Manage cases. Editing this Case updates it everywhere it is reused.</span></div>}
        </div>
        <div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={!form.title.trim()} onClick={() => onSave(form)}><Check size={16} /> {isNew ? "Create case" : "Save changes"}</button></div>
      </section>
    </div>
  );
}

function CasesPage({ cases, setCases, onRun, onToast }) {
  const [queryText, setQueryText] = useState("");
  const [type, setType] = useState("All types");
  const [menuCaseId, setMenuCaseId] = useState(null);
  const [editingCase, setEditingCase] = useState(null);
  const [creatingCase, setCreatingCase] = useState(false);
  const filtered = cases.filter((testCase) =>
    testCase.title.toLowerCase().includes(queryText.toLowerCase()) && (type === "All types" || testCase.case_type === type),
  );
  function saveCase(form) {
    if (form.id) {
      setCases((current) => current.map((item) => item.id === form.id ? { ...item, ...form, updated_at: "11 Aug 2026" } : item));
      onToast(`TC-${form.id} saved. Reused instances were updated.`);
    } else {
      const id = Math.max(...cases.map((item) => item.id)) + 1;
      setCases((current) => [...current, { ...form, id, updated_at: "11 Aug 2026" }]);
      onToast(`TC-${id} created as ${form.status}.`);
    }
    setEditingCase(null);
    setCreatingCase(false);
  }
  function duplicateCase(testCase) {
    const id = Math.max(...cases.map((item) => item.id)) + 1;
    setCases((current) => [...current, { ...testCase, id, title: `${testCase.title} — Copy`, status: "Draft", updated_at: "11 Aug 2026" }]);
    setMenuCaseId(null);
    onToast(`TC-${testCase.id} duplicated as draft TC-${id}.`);
  }
  return (
    <>
      <PageHeader eyebrow="Test inventory" title="Test cases" description="Search, maintain and execute the reusable test inventory for this project."
        actions={<><button className="secondary-button"><UploadSimple size={17} /> Upload cases</button><button className="primary-button" onClick={() => setCreatingCase(true)}><Plus size={17} /> New test case</button></>} />
      <div className="filter-bar">
        <label className="search-field"><MagnifyingGlass size={18} /><input value={queryText} onChange={(event) => setQueryText(event.target.value)} placeholder="Search ID or description" /></label>
        <select className="filter-select" value={type} onChange={(event) => setType(event.target.value)}><option>All types</option><option>Web</option><option>API</option><option>Mobile</option></select>
        <button className="secondary-button compact"><Funnel size={16} /> More filters</button>
      </div>
      <section className="panel flush-panel cases-panel">
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Case ID</th><th>Description</th><th>Type</th><th>Priority</th><th>Test set</th><th>Automation</th><th>Status</th><th /></tr></thead>
            <tbody>{filtered.map((testCase) => (
              <tr key={testCase.id}>
                <td><button className="table-link" onClick={() => setEditingCase(testCase)}>{testCase.id}</button></td>
                <td><strong className="cell-primary">{testCase.title}</strong><span className="cell-secondary">Updated {testCase.updated_at}</span></td>
                <td>{testCase.case_type}</td><td><span className={`priority ${testCase.priority.toLowerCase()}`}>{testCase.priority}</span></td><td>{testCase.test_set}</td><td>{testCase.automation}</td><td><StatusPill>{testCase.status}</StatusPill></td>
                <td><div className="row-actions"><div className="action-menu-wrap"><IconButton label={`More actions for TC-${testCase.id}`} onClick={() => setMenuCaseId((current) => current === testCase.id ? null : testCase.id)}><DotsThree size={19} /></IconButton>{menuCaseId === testCase.id && <div className="action-menu"><button onClick={() => { setEditingCase(testCase); setMenuCaseId(null); }}><PencilSimple size={16} /> Edit case</button><button onClick={() => duplicateCase(testCase)}><Copy size={16} /> Duplicate case</button></div>}</div><button className="primary-button compact" onClick={() => onRun(testCase.title, "Test case")}><Play size={14} weight="fill" /> Run</button></div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
      {(editingCase || creatingCase) && <CaseEditModal testCase={editingCase} onClose={() => { setEditingCase(null); setCreatingCase(false); }} onSave={saveCase} />}
    </>
  );
}

function DataPage({ dataSets, onToast }) {
  const [workspace, setWorkspace] = useState("Team Workspace");
  const [queryText, setQueryText] = useState("");
  const counts = useMemo(() => Object.fromEntries(["My Workspace", "Team Workspace", "Published"].map((name) => [name, dataSets.filter((item) => item.workspace === name).length])), [dataSets]);
  const filtered = dataSets.filter((item) => item.workspace === workspace && item.name.toLowerCase().includes(queryText.toLowerCase()));
  return (
    <>
      <PageHeader eyebrow="Reusable input" title="Test data" description="Import, publish and reuse data sets across test cases without duplicating fixtures."
        actions={<button className="primary-button" onClick={() => onToast("Import panel opened. Choose a file to create a new data set.")}><UploadSimple size={17} /> Import data set</button>} />
      <div className="workspace-tabs">
        {["My Workspace", "Team Workspace", "Published"].map((item) => (
          <button key={item} className={workspace === item ? "active" : ""} onClick={() => setWorkspace(item)}>{item}<span>{counts[item]}</span></button>
        ))}
      </div>
      <div className="filter-bar data-filter"><label className="search-field"><MagnifyingGlass size={18} /><input value={queryText} onChange={(event) => setQueryText(event.target.value)} placeholder="Search data sets" /></label><span>Showing {filtered.length} data set(s)</span></div>
      <div className="data-card-grid">
        {filtered.map((item) => (
          <article className="data-card" key={item.id}>
            <div className="data-card-header"><div className="data-set-icon"><Database size={19} weight="duotone" /></div><IconButton label="Data set actions"><DotsThree size={19} /></IconButton></div>
            <h2>{item.name}</h2>
            <div className="data-meta"><span>Source type</span><strong>{item.source_type}</strong><span>Updated</span><strong>{item.updated_at}</strong></div>
            <StatusPill>{item.status}</StatusPill>
            <div className="data-card-footer"><div><span>Created by</span><strong>{item.created_by}</strong></div><div className="data-points"><strong>{item.data_points}</strong><span>Data points</span></div></div>
            <button className="card-hit" onClick={() => onToast(`${item.name} selected for test case association.`)} aria-label={`Open ${item.name}`} />
          </article>
        ))}
        {filtered.length === 0 && <EmptyState title="No data sets here yet" detail="Import a data set or publish one from another workspace." />}
      </div>
    </>
  );
}

function AppsPage({ applications, onToast }) {
  return (
    <>
      <PageHeader eyebrow="Execution configuration" title="Application config" description="Maintain the applications, versions, environments and test accounts available to runs."
        actions={<button className="primary-button" onClick={() => onToast("New application configuration created.")}><Plus size={17} /> Add application</button>} />
      <div className="app-grid">
        {applications.map((app) => (
          <article className="app-card" key={app.id}>
            <div className="app-card-header"><div className="application-icon"><AppWindow size={22} weight="duotone" /></div><StatusPill>{app.status}</StatusPill></div>
            <h2>{app.name}</h2><a href={app.url}>{app.url}</a>
            <div className="config-section"><span>Test account</span><strong>{app.account}</strong></div>
            <div className="config-section"><span>Versions / builds</span><div className="chip-row">{app.versions.split(", ").map((item) => <i key={item}>{item}</i>)}</div></div>
            <div className="config-section"><span>Environments</span><div className="chip-row">{app.environments.split(", ").map((item) => <i key={item}>{item}</i>)}</div></div>
            <button className="secondary-button full" onClick={() => onToast(`${app.name} configuration opened.`)}><GearSix size={16} /> Manage configuration</button>
          </article>
        ))}
      </div>
    </>
  );
}

const securityCategoryIcons = {
  "Access & navigation": GlobeHemisphereWest,
  "Network & file boundaries": Database,
  "Secrets & privacy": Key,
  "Browser isolation": AppWindow,
  "Runtime & environment": Gauge,
};

function SecurityPage({ securityRules, onToast }) {
  const [rules, setRules] = useState(securityRules);
  const categories = Object.keys(securityCategoryIcons);
  const enabledCount = rules.filter((rule) => rule.enabled).length;
  function toggleRule(id) {
    setRules((current) => current.map((rule) => rule.id === id ? { ...rule, enabled: rule.enabled ? 0 : 1 } : rule));
  }
  return (
    <>
      <PageHeader eyebrow="Defense in depth" title="Security config" description="Configure browser automation safeguards across access, data, browser isolation and runtime execution."
        actions={<button className="primary-button" onClick={() => onToast(`Security policy saved. ${enabledCount} of ${rules.length} safeguards are enabled.`)}><Check size={17} /> Save policy</button>} />

      <section className="security-overview panel">
        <div className="security-score"><div className="security-shield"><ShieldCheck size={29} weight="duotone" /></div><div><span>Project protection</span><strong>{enabledCount}/{rules.length} safeguards enabled</strong><small>Policy applies to new Test Case, Test Set and Test Plan runs.</small></div></div>
        <div className="security-health"><span>Security posture</span><StatusPill>{enabledCount >= 12 ? "Healthy" : "Attention"}</StatusPill></div>
        <div className="security-health"><span>Last policy update</span><strong>11 Aug 2026, 10:18</strong></div>
        <div className="security-health"><span>Managed by</span><strong>Project Admin</strong></div>
      </section>

      <div className="security-grid">
        {categories.map((category, categoryIndex) => {
          const Icon = securityCategoryIcons[category];
          const categoryRules = rules.filter((rule) => rule.category === category);
          return (
            <section className="security-column" key={category}>
              <div className="security-column-header"><span>{categoryIndex + 1}</span><Icon size={20} weight="duotone" /><strong>{category}</strong></div>
              <div className="security-rule-list">
                {categoryRules.map((rule) => (
                  <article className={`security-rule ${rule.enabled ? "enabled" : ""}`} key={rule.id}>
                    <div className="security-rule-title"><span>{rule.id}</span><h3>{rule.title}</h3></div>
                    <p>{rule.description}</p>
                    <div className={`security-setting ${rule.tone}`}>{rule.setting}</div>
                    <div className="security-rule-control"><span>{rule.enabled ? "Enabled" : "Disabled"}</span><button className={`switch ${rule.enabled ? "on" : ""}`} onClick={() => toggleRule(rule.id)} role="switch" aria-checked={Boolean(rule.enabled)} aria-label={`${rule.enabled ? "Disable" : "Enable"} ${rule.title}`}><i /></button></div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <div className="security-legend"><span><i className="legend-dot enabled" /> Built-in / enabled</span><span><i className="legend-dot warning" /> Configure to activate</span><span><i className="legend-dot neutral" /> Off or environment-dependent</span><strong><ShieldCheck size={17} /> Secure defaults + explicit policy = stronger protection</strong></div>
    </>
  );
}

function SettingsPage({ project, members, onToast }) {
  const [archivalOpen, setArchivalOpen] = useState(false);
  return (
    <>
      <PageHeader eyebrow="Project administration" title="Project settings" description="Project identity, SR ownership and team access for Digital Claims Modernization."
        actions={<button className="secondary-button" onClick={() => onToast("Project changes saved.")}><Check size={17} /> Save changes</button>} />
      <div className="settings-layout">
        <section className="panel settings-panel">
          <div className="panel-heading"><div><span className="panel-kicker">Project info</span><h2>Identity & ownership</h2></div><StatusPill>{project.status}</StatusPill></div>
          <div className="settings-form">
            <label><span>Project name</span><input defaultValue={project.name} /></label>
            <label><span>Description</span><textarea defaultValue={project.description} /></label>
            <div className="form-row"><label><span>BU</span><input defaultValue={project.bu} disabled /></label><label><span>SR</span><input defaultValue={project.sr} disabled /></label></div>
            <label><span>Project owner</span><div className="owner-control"><div className="avatar">MC</div><strong>{project.owner}</strong><button className="text-button" onClick={() => onToast("Owner transfer workflow opened.")}>Transfer ownership</button></div></label>
          </div>
        </section>
        <section className="panel members-panel">
          <div className="panel-heading"><div><span className="panel-kicker">Access</span><h2>Project members</h2></div><button className="secondary-button compact" onClick={() => onToast("Member search opened.")}><Plus size={16} /> Add member</button></div>
          <div className="member-list">{members.map((member) => (
            <div className="member-row" key={member.id}><div className="avatar alt">{member.name.split(" ").map((part) => part[0]).join("")}</div><div><strong>{member.name}</strong><span>{member.email}</span></div><StatusPill tone={member.role === "Owner" ? "info" : "neutral"}>{member.role}</StatusPill><IconButton label="Member actions"><DotsThree size={18} /></IconButton></div>
          ))}</div>
        </section>
      </div>
      <section className="danger-zone">
        <div><Archive size={22} /><div><strong>Archive project</strong><span>Only admins can archive. Historical evidence remains available.</span></div></div>
        <button className="danger-button" onClick={() => setArchivalOpen(true)}>Archive project</button>
      </section>
      {archivalOpen && <ConfirmModal title="Archive this project?" detail="Queued tasks will be cancelled. Running tasks will finish and all historical data will remain available." confirmLabel="Archive project" onClose={() => setArchivalOpen(false)} onConfirm={() => { setArchivalOpen(false); onToast("Project archived. Admins can restore it at any time."); }} />}
    </>
  );
}

function RunModal({ target, type, applications, onClose, onStart }) {
  const isRerun = type === "Re-run";
  return (
    <div className="modal-layer" role="dialog" aria-modal="true">
      <button className="modal-backdrop" onClick={onClose} aria-label="Close run configuration" />
      <section className="modal-card run-modal">
        <div className="modal-header"><div><span className="eyebrow">{type}</span><h2>Configure execution</h2></div><IconButton label="Close" onClick={onClose}><X size={20} /></IconButton></div>
        <div className="run-target"><div className="run-target-icon"><Play size={18} weight="fill" /></div><div><span>{type}</span><strong>{target}</strong></div></div>
        {isRerun && <div className="inline-notice"><Info size={18} /><span>Uses the latest case and script with the original application, build, environment and test data snapshot.</span></div>}
        <div className="modal-form">
          <label><span>Application</span><select disabled={isRerun}>{applications.map((app) => <option key={app.id}>{app.name}</option>)}</select></label>
          <div className="form-row"><label><span>Version / build</span><select disabled={isRerun}><option>v8.12.0-rc3</option><option>v8.12.0-rc2</option></select></label><label><span>Environment</span><select disabled={isRerun}><option>UAT</option><option>SIT</option><option>PROD-SIM</option></select></label></div>
          <label><span>Test data</span><select disabled={isRerun}><option>CLAIMS_HAPPY_PATH_V3 · Data point 01</option><option>OCR_MULTI_PAGE_INVOICES · Data point 02</option></select></label>
          <label className="checkbox-row"><input type="checkbox" defaultChecked /><span>Capture screenshots on failure</span></label>
        </div>
        <div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={onStart}><Play size={16} weight="fill" /> Start run</button></div>
      </section>
    </div>
  );
}

function ConfirmModal({ title, detail, confirmLabel, onClose, onConfirm }) {
  return (
    <div className="modal-layer" role="dialog" aria-modal="true">
      <button className="modal-backdrop" onClick={onClose} aria-label="Close confirmation" />
      <section className="modal-card confirm-modal">
        <div className="warning-icon"><Warning size={24} weight="fill" /></div>
        <h2>{title}</h2><p>{detail}</p>
        <div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="danger-button" onClick={onConfirm}>{confirmLabel}</button></div>
      </section>
    </div>
  );
}

function LoadingScreen({ error }) {
  return (
    <div className="loading-screen">
      <img src={assetUrl("qa-orbit-logo.png")} alt="QA Orbit" />
      {error ? <><strong>Unable to load prototype data</strong><span>{error}</span></> : <><div className="loading-line" /><span>Loading SQLite workspace…</span></>}
    </div>
  );
}

export function App() {
  const { data, error } = useMockDatabase();
  const [page, setPage] = useState("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [archivedVisible, setArchivedVisible] = useState(false);
  const [runModal, setRunModal] = useState(null);
  const [toast, setToast] = useState("");
  const [setCaseMemberships, setSetCaseMemberships] = useState(null);
  const [caseRecords, setCaseRecords] = useState(null);

  useEffect(() => {
    if (!data || setCaseMemberships) return;
    setSetCaseMemberships(Object.fromEntries(data.sets.map((set) => [set.id, data.setCases.filter((item) => item.set_id === set.id).map((item) => item.case_id)])));
  }, [data, setCaseMemberships]);

  useEffect(() => {
    if (data && !caseRecords) setCaseRecords(data.cases);
  }, [data, caseRecords]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!data || !setCaseMemberships || !caseRecords) return <LoadingScreen error={error} />;

  const pageContent = {
    dashboard: <Dashboard data={data} onViewRuns={() => setPage("runs")} />,
    runs: <TestRunsPage data={data} onRun={(target, type) => setRunModal({ target, type })} onToast={setToast} />,
    plans: <PlansPage plans={data.plans} sets={data.sets} cases={caseRecords} setCaseMemberships={setCaseMemberships} planSets={data.planSets} planCases={data.planCases} planCaseExclusions={data.planCaseExclusions} onRun={(target, type) => setRunModal({ target, type })} onToast={setToast} />,
    sets: <SetsPage sets={data.sets} cases={caseRecords} setCaseMemberships={setCaseMemberships} setSetCaseMemberships={setSetCaseMemberships} onRun={(target, type) => setRunModal({ target, type })} onToast={setToast} />,
    cases: <CasesPage cases={caseRecords} setCases={setCaseRecords} onRun={(target, type) => setRunModal({ target, type })} onToast={setToast} />,
    data: <DataPage dataSets={data.dataSets} onToast={setToast} />,
    apps: <AppsPage applications={data.applications} onToast={setToast} />,
    security: <SecurityPage securityRules={data.securityRules} onToast={setToast} />,
    settings: <SettingsPage project={data.projects[0]} members={data.members} onToast={setToast} />,
  }[page];

  return (
    <div className={`app-shell ${collapsed ? "nav-collapsed" : ""}`}>
      <Sidebar page={page} setPage={setPage} collapsed={collapsed} setCollapsed={setCollapsed} />
      <div className="workspace">
        <Topbar projects={data.projects} archivedVisible={archivedVisible} setArchivedVisible={setArchivedVisible} />
        <main className="page-content">{pageContent}</main>
      </div>
      {runModal && <RunModal target={runModal.target} type={runModal.type} applications={data.applications} onClose={() => setRunModal(null)} onStart={() => { setRunModal(null); setToast("Run R-4823 started. 12 case tasks were added to the queue."); setPage("runs"); }} />}
      {toast && <div className="toast"><CheckCircle size={19} weight="fill" /><span>{toast}</span><button onClick={() => setToast("")} aria-label="Dismiss"><X size={16} /></button></div>}
    </div>
  );
}
