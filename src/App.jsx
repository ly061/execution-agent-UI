import { useEffect, useMemo, useRef, useState } from "react";
import initSqlJs from "sql.js";
import * as XLSX from "xlsx";
import {
  Pulse,
  AppWindow,
  Archive,
  ArrowLeft,
  ArrowClockwise,
  ArrowDown,
  ArrowsIn,
  ArrowsOut,
  ArrowRight,
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
  FlowArrow,
  Funnel,
  Gauge,
  GearSix,
  GlobeHemisphereWest,
  GitBranch,
  House,
  Info,
  Key,
  ListChecks,
  Lock,
  MagicWand,
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
  Trash,
  UploadSimple,
  UserCircle,
  Users,
  Warning,
  PaperPlaneTilt,
  Sparkle,
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
import { createServerRun, listServerRunPlans } from "./serverRuns.js";

const NAV = [
  {
    id: "generation",
    label: "Generation",
    icon: MagicWand,
    children: [
      { id: "generate", label: "Generate cases", icon: Sparkle },
    ],
  },
  {
    id: "execution",
    label: "Execution",
    icon: TestTube,
    children: [
      { id: "dashboard", label: "Dashboard", icon: ChartBar },
      { id: "runs", label: "Test runs", icon: Pulse },
      { id: "plans", label: "Test plans", icon: ClipboardText },
      { id: "sets", label: "Test sets", icon: Rows },
      { id: "cases", label: "Test cases", icon: ListChecks },
      { id: "data", label: "My data", icon: Database },
      { id: "apps", label: "App config", icon: AppWindow },
      { id: "agents", label: "Local agents", icon: Robot },
      { id: "security", label: "Security config", icon: ShieldCheck },
      { id: "settings", label: "Project settings", icon: GearSix },
    ],
  },
];

const CURRENT_USER = "maya.chen@demo.com";
const API_KEY_STORAGE = "qa-orbit-deepseek-api-key";
const IS_GITHUB_PAGES = window.location.hostname === "ly061.github.io";
const API_ORIGIN = "";

const assetUrl = (path) => `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;

function runTargetPayload(target, type) {
  const types = { "Test case": "test_case", "Test set": "test_set", "Test plan": "test_plan", "Batch test set": "batch_test_set", "Re-run": "rerun" };
  const name = typeof target === "string" ? target : target.name || target.title || target.case_title || "Test run";
  return {
    type: types[type] || "test_case",
    id: typeof target === "object" ? target.id || target.case_id || null : null,
    ids: typeof target === "object" ? target.ids || [] : [],
    name,
  };
}

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
  Active: "success",
  Revoked: "danger",
  Ready: "success",
  Draft: "neutral",
  Healthy: "success",
  Idle: "success",
  Offline: "neutral",
  Error: "danger",
  Published: "success",
  Shared: "info",
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
  const [activeSection, setActiveSection] = useState(() => {
    const section = NAV.find((s) => s.children.some((item) => item.id === page));
    return section ? section.id : NAV[0].id;
  });
  useEffect(() => {
    const section = NAV.find((s) => s.children.some((item) => item.id === page));
    if (section) setActiveSection(section.id);
  }, [page]);
  const section = NAV.find((s) => s.id === activeSection) || NAV[0];
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
        <div className="nav-pane nav-pane-primary">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = item.id === section.id;
            return (
              <button
                key={item.id}
                className={active ? "active" : ""}
                onClick={() => {
                  setActiveSection(item.id);
                  if (collapsed) setCollapsed(false);
                }}
                title={collapsed ? item.label : undefined}
              >
                <Icon size={20} weight={active ? "fill" : "regular"} />
                {!collapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </div>
        {!collapsed && (
          <div className="nav-pane nav-pane-secondary">
            <div className="nav-pane-heading">{section.label}</div>
            {section.children.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  className={page === item.id ? "active" : ""}
                  onClick={() => setPage(item.id)}
                  title={item.label}
                >
                  <Icon size={20} weight={page === item.id ? "fill" : "regular"} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        )}
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

function Topbar({ projects, projectMerges, selectedSr, onSelectSr, archivedVisible, setArchivedVisible }) {
  const visibleProjects = projects.filter((project) => archivedVisible || project.status !== "Archived");
  const projectOptions = visibleProjects.flatMap((project) => {
    const mergedSrs = projectMerges?.[project.id] || [];
    return [
      { value: project.sr, label: project.sr, subLabel: project.name, primary: true },
      ...mergedSrs.map((sr) => ({ value: sr, label: sr, subLabel: project.name, primary: false })),
    ];
  });
  const currentProject = projectOptions.find((option) => option.value === selectedSr) || projectOptions[0];
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
          <select value={selectedSr} onChange={(event) => onSelectSr(event.target.value)} aria-label="Project">
            {visibleProjects.map((project) => {
              const mergedSrs = projectMerges?.[project.id] || [];
              return (
                <optgroup key={project.id} label={project.name}>
                  <option value={project.sr}>{project.sr} · primary</option>
                  {mergedSrs.map((sr) => (
                    <option key={sr} value={sr}>{sr} · merged</option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          <CaretDown size={14} />
        </label>
        <span className="project-context-tag" title={currentProject ? `Routes to ${currentProject.subLabel}` : ""}>
          <Users size={13} weight="duotone" />
          {currentProject ? `${currentProject.subLabel} · ${currentProject.label}` : "Select project"}
          {currentProject && !currentProject.primary && <i>merged</i>}
        </span>
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
  const [serverPlans, setServerPlans] = useState([]);
  const [executionServerOnline, setExecutionServerOnline] = useState(false);
  const maxConcurrentRuns = 3;
  const queuedCount = queue.filter((item) => item.status === "Queued").length;
  const planRuns = useMemo(() => summarizeRuns(data.runs, "plan_name"), [data.runs]);
  const setRuns = useMemo(() => summarizeRuns(data.runs, "set_name"), [data.runs]);
  const visibleCaseRuns = caseScope
    ? data.runs.filter((run) => run[caseScope.key] === caseScope.name)
    : data.runs;

  useEffect(() => {
    let active = true;
    let timer;
    async function loadServerPlans() {
      try {
        const payload = await listServerRunPlans();
        if (active) {
          setServerPlans(payload.run_plans || []);
          setExecutionServerOnline(true);
        }
      } catch {
        if (active) setExecutionServerOnline(false);
      }
      if (active) timer = setTimeout(loadServerPlans, 3000);
    }
    loadServerPlans();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

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

      <section className="panel local-agent-panel">
        <div className="local-agent-heading"><span className={`local-agent-orb ${executionServerOnline ? "online" : ""}`}><Robot size={19} weight="duotone" /></span><div><span className="panel-kicker">Control plane</span><strong>Execution Agent Server</strong><small>{executionServerOnline ? `${serverPlans.filter((plan) => ["queued", "assigned", "running"].includes(plan.status)).length} active Run Plans` : "Execution server is unavailable"}</small></div><StatusPill tone={executionServerOnline ? "success" : "neutral"}>{executionServerOnline ? "Connected" : "Offline"}</StatusPill></div>
        {serverPlans.length > 0 && <div className="local-run-list">{serverPlans.slice(0, 4).map((plan) => <div className="local-run-row" key={plan.id}><span className={`local-run-state ${plan.status}`} /><div><strong>{plan.snapshot?.target?.name || "Run Plan"}</strong><small>{plan.id.slice(0, 11)} · {plan.logs?.at(-1) || (plan.status === "queued" ? "Waiting for an authenticated Agent" : "Status updated by Local Agent")}</small></div><StatusPill tone={plan.status === "completed" ? "success" : plan.status === "failed" ? "danger" : plan.status === "running" ? "info" : "neutral"}>{plan.status}</StatusPill></div>)}</div>}
      </section>

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
        <RunDrawer run={selectedRun} onClose={() => setSelectedRun(null)} onRerun={() => onRun(selectedRun, "Re-run")} />
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
        actions={<><button className="secondary-button" onClick={() => onToast(`${plan.name} duplicated as a draft.`)}><Copy size={17} /> Duplicate</button><button className="primary-button" onClick={() => onRun(plan, "Test plan")}><Play size={16} weight="fill" /> Run plan</button></>} />

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
                <button className="primary-button compact" onClick={() => onRun(plan, "Test plan")}><Play size={15} weight="fill" /> Run</button>
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
        {selected.length > 0 && <button className="primary-button compact" onClick={() => onRun({ name: `${selected.length} selected test sets`, ids: selected }, "Batch test set")}><Play size={15} weight="fill" /> Run selected ({selected.length})</button>}
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
                <td><div className="row-actions"><button className="text-button" onClick={() => setManagedSet(set)}>Manage cases</button><button className="primary-button compact" onClick={() => onRun(set, "Test set")}><Play size={14} weight="fill" /> Run</button></div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
      {managedSet && <SetCasesDrawer testSet={managedSet} cases={cases} caseIds={setCaseMemberships[managedSet.id] || []} onClose={() => setManagedSet(null)} onAdd={addCase} onRemove={removeCase} />}
    </>
  );
}

function parseDataPreview(dataSet) {
  try {
    const rows = JSON.parse(dataSet?.preview_json || "[]");
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function parseMergedSrs(json) {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === "string" && value) : [];
  } catch {
    return [];
  }
}

function DataPreview({ dataSet, compact = false }) {
  const rows = parseDataPreview(dataSet);
  const columns = rows[0] ? Object.keys(rows[0]) : [];
  if (!rows.length) return <div className="preview-empty"><Database size={20} /><span>No preview data available.</span></div>;
  return (
    <div className={`data-preview ${compact ? "compact-preview" : ""}`}>
      <div className="data-preview-scroll">
        <table>
          <thead><tr>{columns.map((column) => <th key={column}>{column.replaceAll("_", " ")}</th>)}</tr></thead>
          <tbody>{rows.slice(0, compact ? 1 : rows.length).map((row, index) => (
            <tr key={index}>{columns.map((column) => <td key={column}>{String(row[column] ?? "—")}</td>)}</tr>
          ))}</tbody>
        </table>
      </div>
      <span className="preview-caption">Previewing {compact ? 1 : rows.length} of {dataSet.data_points} data point(s)</span>
    </div>
  );
}

function DataSetLabel({ dataSet, name }) {
  const label = dataSet?.name || name;
  if (!label) return <span className="data-binding-empty">Not assigned</span>;
  return (
    <span className="data-set-label-wrap">
      <span className="data-set-label" tabIndex={0}><Database size={13} weight="duotone" />{label}</span>
      <span className="data-set-tooltip" role="tooltip">
        <strong>{label}</strong>
        {dataSet ? (
          <span className="data-set-tooltip-grid">
            <span>Source <b>{dataSet.source_type}</b></span>
            <span>Status <b>{dataSet.status}</b></span>
            <span>Workspace <b>{dataSet.workspace}</b></span>
            <span>Data points <b>{dataSet.data_points}</b></span>
            <span>Created by <b>{dataSet.created_by}</b></span>
            <span>Updated <b>{dataSet.updated_at}</b></span>
          </span>
        ) : <span className="data-set-tooltip-missing">Data set details are unavailable.</span>}
      </span>
    </span>
  );
}

function displayCaseId(testCase) {
  return testCase.case_id || `TC-${testCase.id}`;
}

function caseDescription(testCase) {
  return testCase.description || testCase.title || "";
}

const AI_EDITABLE_CASE_FIELDS = ["case_type", "description", "preconditions", "test_steps", "test_data", "expected_result", "priority"];

async function deepSeekCaseEdit(message, testCase, dataSets) {
  const request = { message, test_case: Object.fromEntries(["case_id", ...AI_EDITABLE_CASE_FIELDS].map((field) => [field, testCase[field] || ""])), available_data_sets: dataSets.map((item) => item.name) };
  const result = IS_GITHUB_PAGES ? await (async () => {
    const apiKey = window.localStorage.getItem(API_KEY_STORAGE)?.trim();
    if (!apiKey) throw new Error("Add a DeepSeek API key in Project settings first.");
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "deepseek-v4-flash",
        temperature: 0,
        response_format: { type: "json_object" },
        thinking: { type: "disabled" },
        messages: [
          { role: "system", content: `You are a senior QA engineer helping edit one test case. Return JSON only with message and changes. Allowed fields: ${AI_EDITABLE_CASE_FIELDS.join(", ")}. Keep case_type to Web, API, or Mobile; priority to P0, P1, or P2. Use newline-separated numbered test_steps. Do not invent a test_data name outside the provided available data sets. Never return or repeat credentials.` },
          { role: "user", content: JSON.stringify({ request: request.message, current_case: request.test_case, available_data_sets: request.available_data_sets }) },
        ],
      }),
    });
    if (!response.ok) throw new Error(response.status === 401 ? "DeepSeek rejected this API key." : "DeepSeek could not update the case right now.");
    const body = await response.json();
    try {
      return JSON.parse(body.choices?.[0]?.message?.content || "{}");
    } catch {
      throw new Error("The AI service returned an invalid case update.");
    }
  })() : await apiRequest("/api/cases/assist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const changes = Object.fromEntries(Object.entries(result.changes || {}).filter(([field, value]) => AI_EDITABLE_CASE_FIELDS.includes(field) && value != null).map(([field, value]) => [field, String(value)]));
  if (!Object.keys(changes).length) throw new Error("AI did not return any safe case changes. Try a more specific request.");
  if (changes.case_type && !["Web", "API", "Mobile"].includes(changes.case_type)) delete changes.case_type;
  if (changes.priority && !["P0", "P1", "P2"].includes(changes.priority)) delete changes.priority;
  if (changes.test_data && !dataSets.some((item) => item.name === changes.test_data)) delete changes.test_data;
  if (!Object.keys(changes).length) throw new Error("AI suggested values that are not available in this project.");
  return { message: String(result.message || "I updated the case draft for your review."), changes };
}

function CaseEditModal({ testCase, suggestedCaseId, dataSets, onClose, onSave }) {
  const isNew = !testCase?.id;
  const [form, setForm] = useState(() => ({
    ...(testCase || {}),
    case_id: testCase ? displayCaseId(testCase) : suggestedCaseId,
    case_type: testCase?.case_type || "Web",
    description: caseDescription(testCase || {}),
    preconditions: testCase?.preconditions || "",
    test_steps: testCase?.test_steps || "",
    test_data: testCase?.test_data || "",
    expected_result: testCase?.expected_result || "",
    priority: testCase?.priority || "P1",
  }));
  const [aiMessage, setAiMessage] = useState("");
  const [aiMessages, setAiMessages] = useState([{ role: "agent", content: "Tell me what you want to improve. I can rewrite the description, add coverage, clarify steps, or strengthen the expected result." }]);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiHistory, setAiHistory] = useState([]);
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const selectedDataSet = dataSets.find((item) => item.name === form.test_data);

  async function askAi(text = aiMessage) {
    const outgoing = text.trim();
    if (!outgoing || aiBusy) return;
    setAiMessage("");
    setAiMessages((current) => [...current, { role: "user", content: outgoing }]);
    setAiBusy(true);
    setAiError("");
    try {
      const result = await deepSeekCaseEdit(outgoing, form, dataSets);
      const previous = form;
      const changes = Object.entries(result.changes).map(([field, after]) => ({ field, before: previous[field] || "", after }));
      setAiHistory((current) => [...current, previous]);
      setForm((current) => ({ ...current, ...result.changes }));
      setAiMessages((current) => [...current, { role: "agent", content: result.message, changes }]);
    } catch (error) {
      setAiError(error.message);
    } finally {
      setAiBusy(false);
    }
  }

  function undoAiChange() {
    if (!aiHistory.length || aiBusy) return;
    const previous = aiHistory[aiHistory.length - 1];
    setForm(previous);
    setAiHistory((current) => current.slice(0, -1));
    setAiMessages((current) => [...current, { role: "agent", content: "Undid the last AI change. Your earlier draft has been restored." }]);
  }

  return (
    <div className="modal-layer case-editor-layer">
      <button className="modal-backdrop" onClick={onClose} aria-label="Close test case editor" />
      <section className="modal-card case-editor-modal">
        <div className="modal-header case-editor-header"><div><span className="eyebrow">Test inventory</span><h2>{isNew ? "Create test case" : "Edit test case"}</h2><p>Edit manually or ask AI to improve this draft.</p></div><IconButton label="Close" onClick={onClose}><X size={20} /></IconButton></div>
        <div className="case-editor-workspace">
          <div className="case-editor-scroll">
            <div className="modal-form case-editor-form">
              <div className="case-editor-row"><label><span>Case ID</span><input value={form.case_id} onChange={(event) => update("case_id", event.target.value)} disabled={!isNew} placeholder="Unique test case ID" /></label><label><span>Case type</span><select value={form.case_type} onChange={(event) => update("case_type", event.target.value)}><option>Web</option><option>API</option><option>Mobile</option></select></label><label><span>Priority</span><select value={form.priority} onChange={(event) => update("priority", event.target.value)}><option>P0</option><option>P1</option><option>P2</option></select></label></div>
              <label><span>Description</span><textarea className="editor-description" value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="Describe the test case" /></label>
              <label><span>Pre-conditions</span><textarea value={form.preconditions} onChange={(event) => update("preconditions", event.target.value)} placeholder="Required state before execution" /></label>
              <label><span>Test steps</span><textarea className="editor-steps" value={form.test_steps || ""} onChange={(event) => update("test_steps", event.target.value)} placeholder="Enter one step per line" /></label>
              <label><span>Expected result</span><textarea value={form.expected_result || ""} onChange={(event) => update("expected_result", event.target.value)} placeholder="Expected outcome" /></label>
              <label><span>Test data</span>{form.test_data ? <span className="selected-data-control"><DataSetLabel dataSet={selectedDataSet} name={form.test_data} /><button type="button" className="text-button" onClick={() => update("test_data", "")}>Change</button></span> : <select value="" onChange={(event) => update("test_data", event.target.value)}><option value="">Not assigned</option>{dataSets.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select>}</label>
            </div>
          </div>
          <aside className="case-ai-panel">
            <div className="case-ai-heading"><span><Robot size={18} weight="duotone" /></span><div><strong>AI case assistant</strong><small>Changes are applied to this draft only</small></div></div>
            <div className="chat-messages">{aiMessages.map((item, index) => <div className={`chat-message ${item.role}`} key={`${item.role}-${index}`}><span>{item.role === "agent" ? <Robot size={16} /> : <UserCircle size={16} />}</span><div><p>{item.content}</p>{item.changes?.map((change) => <small key={change.field}>{change.field.replaceAll("_", " ")}: {change.before || "—"} → {change.after}</small>)}</div></div>)}{aiBusy && <div className="chat-message agent"><span><Robot size={16} /></span><div><p>Improving the case draft…</p></div></div>}</div>
            <div className="chat-suggestions"><button onClick={() => askAi("Make this test case clearer and more concise")}>Improve clarity</button><button onClick={() => askAi("Add important edge-case coverage to the steps and expected result")}>Add edge cases</button><button disabled={!aiHistory.length} onClick={undoAiChange}>Undo AI change</button></div>
            {aiError && <div className="case-ai-error"><Warning size={15} />{aiError}</div>}
            <div className="chat-composer"><textarea value={aiMessage} onChange={(event) => setAiMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); askAi(); } }} placeholder="Ask AI to modify this case…" /><button className="primary-button" disabled={!aiMessage.trim() || aiBusy} onClick={() => askAi()} aria-label="Send to AI"><PaperPlaneTilt size={17} weight="fill" /> Send</button></div>
          </aside>
        </div>
        <div className="modal-actions case-editor-actions"><span>AI changes are not saved until you confirm.</span><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={!form.case_id.trim() || !form.description.trim() || aiBusy} onClick={() => onSave(form)}><Check size={16} /> {isNew ? "Create case" : "Save changes"}</button></div>
      </section>
    </div>
  );
}

function CaseDetailDrawer({ testCase, dataSet, onClose, onEdit }) {
  return (
    <div className="drawer-layer">
      <button className="drawer-backdrop" onClick={onClose} aria-label="Close test case details" />
      <aside className="run-drawer case-detail-drawer">
        <div className="drawer-header"><div><span className="eyebrow">Test case details</span><h2>{displayCaseId(testCase)}</h2></div><IconButton label="Close" onClick={onClose}><X size={20} /></IconButton></div>
        <div className="drawer-title-row"><div><h3>{caseDescription(testCase)}</h3><p>Updated {testCase.updated_at}</p></div></div>
        <div className="detail-grid"><div><span>Case type</span><strong>{testCase.case_type}</strong></div><div><span>Priority</span><strong>{testCase.priority}</strong></div></div>
        <section className="drawer-section"><span className="section-label"><Info size={15} /> Pre-conditions</span><p className="detail-copy">{testCase.preconditions || "No pre-conditions defined."}</p></section>
        <section className="drawer-section"><span className="section-label"><ListChecks size={15} /> Test steps</span><p className="detail-copy pre-line">{testCase.test_steps || "No test steps defined."}</p></section>
        <section className="drawer-section"><span className="section-label"><CheckCircle size={15} /> Expected result</span><p className="detail-copy">{testCase.expected_result || "No expected result defined."}</p></section>
        <section className="drawer-section linked-data-section">
          <div className="section-heading-row"><span className="section-label"><Database size={15} /> Test data preview</span>{dataSet && <StatusPill>{dataSet.status}</StatusPill>}</div>
          {dataSet ? <><strong className="linked-data-name">{dataSet.name}</strong><DataPreview dataSet={dataSet} /></> : <div className="preview-empty"><Database size={20} /><span>No test data is bound to this case.</span></div>}
        </section>
        <div className="drawer-actions"><button className="primary-button" onClick={onEdit}><PencilSimple size={16} /> Edit and bind data</button></div>
      </aside>
    </div>
  );
}

function DataSetDrawer({ dataSet, cases, onClose, onBind, onDelete, canEdit = true }) {
  const [selectedCaseIds, setSelectedCaseIds] = useState([]);
  const linkedCases = cases.filter((testCase) => testCase.test_data === dataSet.name);
  const toggleCase = (caseId) => setSelectedCaseIds((current) => current.includes(caseId) ? current.filter((id) => id !== caseId) : [...current, caseId]);
  return (
    <div className="drawer-layer">
      <button className="drawer-backdrop" onClick={onClose} aria-label="Close data set details" />
      <aside className="set-cases-drawer data-set-drawer">
        <div className="drawer-header"><div><span className="eyebrow">Data set details</span><h2>{dataSet.name}</h2></div><IconButton label="Close" onClick={onClose}><X size={20} /></IconButton></div>
        {!canEdit && <div className="inline-notice warning"><Lock size={17} /><span>This data set was created by another user. You have read-only access — editing and binding are disabled.</span></div>}
        <div className="detail-grid"><div><span>Source</span><strong>{dataSet.source_type}</strong></div><div><span>Status</span><strong>{dataSet.status}</strong></div><div><span>Workspace</span><strong>{dataSet.workspace}</strong></div><div><span>Created by</span><strong>{dataSet.created_by}</strong></div></div>
        <section className="drawer-section"><span className="section-label"><Database size={15} /> Data preview</span><DataPreview dataSet={dataSet} /></section>
        <section className="case-manager-section"><div className="case-manager-heading"><div><span className="panel-kicker">Current usage</span><h3>Bound test cases</h3></div><span className="subtle-count">{linkedCases.length} case(s)</span></div>
          <div className="case-manager-list">{linkedCases.map((testCase) => <div className="case-manager-row" key={testCase.id}><div><strong>{testCase.title}</strong><span>TC-{testCase.id} · {testCase.case_type}</span></div><StatusPill>{testCase.status}</StatusPill></div>)}{linkedCases.length === 0 && <div className="mini-empty"><Database size={20} /><span>Not bound to any test case yet.</span></div>}</div>
        </section>
        {canEdit ? (
          <section className="case-manager-section"><div className="case-manager-heading"><div><span className="panel-kicker">Association</span><h3>Bind test cases</h3></div><span className="subtle-count">{selectedCaseIds.length} selected</span></div>
            <div className="case-binding-list">{cases.map((testCase) => <label className="case-binding-row" key={testCase.id}><input type="checkbox" checked={selectedCaseIds.includes(testCase.id)} onChange={() => toggleCase(testCase.id)} /><span><strong>{testCase.title}</strong><small>TC-{testCase.id} · Current: {testCase.test_data || "Not assigned"}</small></span></label>)}</div>
            <div className="drawer-actions">
              <button className="danger-button" onClick={() => onDelete(dataSet.name)}><Trash size={16} /> Delete data set</button>
              <button className="primary-button" disabled={!selectedCaseIds.length} onClick={() => onBind(dataSet.name, selectedCaseIds)}><Database size={16} /> Bind selected cases</button>
            </div>
          </section>
        ) : (
          <section className="case-manager-section"><div className="case-manager-heading"><div><span className="panel-kicker">Association</span><h3>Bound test cases</h3></div></div>
            <div className="case-manager-list">{linkedCases.map((testCase) => <div className="case-manager-row" key={testCase.id}><div><strong>{testCase.title}</strong><span>TC-{testCase.id} · {testCase.case_type}</span></div><StatusPill>{testCase.status}</StatusPill></div>)}{linkedCases.length === 0 && <div className="mini-empty"><Database size={20} /><span>Not bound to any test case.</span></div>}</div>
          </section>
        )}
      </aside>
    </div>
  );
}

async function apiRequest(path, options = {}) {
  const apiKey = window.localStorage.getItem(API_KEY_STORAGE)?.trim();
  const headers = new Headers(options.headers || {});
  if (apiKey) headers.set("X-DeepSeek-API-Key", apiKey);
  const response = await fetch(`${API_ORIGIN}${path}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || "The import agent could not complete the request.");
  return body;
}

const BROWSER_FIELD_ALIASES = {
  case_id: ["case id", "caseid", "test case id", "用例id", "用例编号", "编号"],
  case_type: ["case type", "type", "platform", "channel", "用例类型", "类型", "端"],
  description: ["description", "title", "case name", "test case", "scenario", "scenario name", "summary", "用例描述", "描述", "用例名称", "场景"],
  preconditions: ["pre conditions", "preconditions", "pre condition", "prerequisite", "前置条件", "执行前置条件"],
  test_steps: ["test steps", "steps", "step", "actions", "procedure", "测试步骤", "操作步骤", "步骤"],
  test_data: ["test data", "data", "data set", "dataset", "测试数据", "数据集"],
  expected_result: ["expected result", "expected results", "expected", "outcome", "assertion", "预期结果", "期望结果"],
  priority: ["priority", "severity", "importance", "优先级", "重要级别"],
};

const normalizeHeader = (value) => String(value ?? "").trim().toLowerCase().replaceAll("_", " ").replace(/[\s\-–—/:()]+/g, " ");

const isActiveRow = (row) => row.filter((value) => String(value ?? "").trim()).length >= 2;
const headerScore = (row) => row.reduce((total, value) => total + (Object.values(BROWSER_FIELD_ALIASES).some((aliases) => aliases.includes(normalizeHeader(value))) ? 4 : 0), 0) + Math.min(row.filter(Boolean).length, 8) * 0.25;
const REGION_HEADER_WINDOW = 25;
const HEADER_MIN_SCORE = 1;
const DATA_OVERLAP_MIN = 0.5;

function expandMergedCells(rows, sheet) {
  const merges = sheet["!merges"] || [];
  for (const merge of merges) {
    const value = rows[merge.s.r]?.[merge.s.c];
    if (value === undefined || value === null || String(value).trim() === "") continue;
    for (let r = merge.s.r; r <= merge.e.r; r += 1) {
      if (!rows[r]) rows[r] = [];
      for (let c = merge.s.c; c <= merge.e.c; c += 1) rows[r][c] = value;
    }
  }
}

function tableRegions(rows) {
  const member = rows.map(isActiveRow);
  for (let i = 0; i < member.length; i += 1) {
    if (!member[i] && i > 0 && i + 1 < member.length && member[i - 1] && member[i + 1]) member[i] = true;
  }
  const regions = [];
  let start = -1;
  for (let i = 0; i <= member.length; i += 1) {
    const active = i < member.length && member[i];
    if (active && start === -1) start = i;
    else if (!active && start !== -1) { regions.push([start, i - 1]); start = -1; }
  }
  return regions;
}

function analyzeRegion(rows, start, end) {
  const window = Math.min(end + 1, start + REGION_HEADER_WINDOW);
  let headerIndex = -1;
  let best = -Infinity;
  for (let index = start; index < window; index += 1) {
    const value = headerScore(rows[index]);
    if (value > best) { best = value; headerIndex = index; }
  }
  if (best < HEADER_MIN_SCORE) return null;
  const seen = new Map();
  const headers = rows[headerIndex].map((value, index) => {
    const base = String(value || `Column ${index + 1}`).trim();
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    return count > 1 ? `${base} (${count})` : base;
  });
  const headerColumns = [];
  rows[headerIndex].forEach((value, index) => { if (String(value ?? "").trim()) headerColumns.push(index); });
  const dataRows = [];
  let aligned = false;
  for (let sourceIndex = headerIndex + 1; sourceIndex <= end; sourceIndex += 1) {
    const row = rows[sourceIndex];
    if (!isActiveRow(row)) continue;
    if (!aligned) {
      const filled = headerColumns.filter((column) => String(row[column] ?? "").trim()).length;
      if (headerColumns.length && filled / headerColumns.length < DATA_OVERLAP_MIN) continue;
      aligned = true;
    }
    dataRows.push({ row, sourceIndex });
  }
  let reason = "";
  if (!aligned) {
    reason = rows.slice(headerIndex + 1, end + 1).some(isActiveRow)
      ? "Header row found but rows below it do not align with the columns"
      : "Header row found but no data rows below it";
  }
  return { headerIndex, headers, dataRows, reason };
}

function parseWorkbookInBrowser(filename, bytes) {
  const workbook = XLSX.read(bytes, { type: "array" });
  const cases = [];
  const sheets = [];
  let generated = 1;
  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", raw: false });
    expandMergedCells(rows, workbook.Sheets[sheetName]);
    const tables = [];
    for (const [start, end] of tableRegions(rows)) {
      const table = analyzeRegion(rows, start, end);
      if (table) tables.push(table);
    }
    if (!tables.length) {
      sheets.push({ name: sheetName, status: "skipped", reason: "No tabular test case data detected", header_row: null, row_count: 0, mappings: [], table_index: 1 });
      continue;
    }
    tables.forEach((table, tableOffset) => {
      const used = new Set();
      const mappings = table.headers.map((header) => {
        const normalized = normalizeHeader(header);
        const exact = Object.entries(BROWSER_FIELD_ALIASES).find(([field, aliases]) => !used.has(field) && aliases.includes(normalized));
        const similar = exact || Object.entries(BROWSER_FIELD_ALIASES).find(([field, aliases]) => !used.has(field) && aliases.some((alias) => alias.length >= 4 && (normalized.includes(alias) || alias.includes(normalized))));
        const target = similar?.[0] || null;
        if (target) used.add(target);
        return { source_column: header, target_field: target, confidence: exact ? 1 : target ? 0.82 : 1, reason: exact ? "Known field alias" : target ? "Similar field name" : "Preserved as an extra field" };
      });
      const targetByHeader = Object.fromEntries(mappings.map((item) => [item.source_column, item.target_field]));
      let rowCount = 0;
      for (const { row, sourceIndex } of table.dataRows) {
        const standard = {};
        const extra_fields = {};
        table.headers.forEach((header, index) => {
          const value = row[index];
          if (value === "" || value == null) return;
          const target = targetByHeader[header];
          if (target) standard[target] = value; else extra_fields[header] = value;
        });
        if (!["description", "test_steps", "expected_result"].some((field) => String(standard[field] || "").trim())) continue;
        const rawId = String(standard.case_id || "").trim();
        cases.push({ id: null, case_id: rawId || `IMP-${String(generated++).padStart(4, "0")}`, case_type: /api|接口/i.test(standard.case_type || "") ? "API" : /mobile|app|移动/i.test(standard.case_type || "") ? "Mobile" : "Web", description: String(standard.description || "").trim(), preconditions: String(standard.preconditions || "").trim(), test_steps: String(standard.test_steps || "").trim(), test_data: String(standard.test_data || "").trim(), expected_result: String(standard.expected_result || "").trim(), priority: /high|critical|最高/i.test(standard.priority || "") ? "P0" : /low|低/i.test(standard.priority || "") ? "P2" : String(standard.priority || "P1").toUpperCase().match(/^P[0-2]$/)?.[0] || "P1", extra_fields, source_file: filename, source_sheet: sheetName, source_row: sourceIndex + 1, import_order: cases.length + 1, field_provenance: {}, mapping_confidence: 1, warnings: rawId ? [] : ["Case ID was generated"] });
        rowCount += 1;
      }
      sheets.push({ name: sheetName, status: rowCount ? "imported" : "no-data", reason: rowCount ? "" : table.reason || "Header row found but no test cases were produced", header_row: table.headerIndex + 1, row_count: rowCount, mappings, table_index: tableOffset + 1 });
    });
  }
  const tableCount = sheets.filter((sheet) => sheet.status === "imported" || sheet.status === "no-data").length;
  return { import_id: crypto.randomUUID(), filename, cases, sheets, warnings: cases.length ? [] : ["No test cases were detected."], explanation: [`Scanned ${sheets.length} sheet(s) for table-like regions and recognized ${tableCount} table(s).`, "Matched known aliases and preserved unmatched columns.", "Nothing leaves the browser until you ask DeepSeek to interpret a correction."] };
}

async function deepSeekCaseChange(message, preview) {
  const apiKey = window.localStorage.getItem(API_KEY_STORAGE)?.trim();
  if (!apiKey) throw new Error("Add a DeepSeek API key in Project settings first.");
  const response = await fetch("https://api.deepseek.com/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "deepseek-v4-flash", temperature: 0, response_format: { type: "json_object" }, thinking: { type: "disabled" }, messages: [{ role: "system", content: "Return JSON only. Edit exactly one QA case. Output import_order (integer), field (exact existing standard or extra field), value (string), message (short confirmation)." }, { role: "user", content: JSON.stringify({ request: message, cases: preview.cases.map(({ import_order, case_id, description, case_type, priority, test_data, extra_fields }) => ({ import_order, case_id, description, case_type, priority, test_data, extra_fields })) }) }] }) });
  if (!response.ok) throw new Error(response.status === 401 ? "DeepSeek rejected this API key." : "DeepSeek could not process the request.");
  const body = await response.json();
  const decision = JSON.parse(body.choices?.[0]?.message?.content || "{}");
  if (!preview.cases[Number(decision.import_order) - 1] || !decision.field || decision.value == null) throw new Error("DeepSeek did not return a safe single-case change.");
  return decision;
}

function MappingQuality({ mapping }) {
  if (!mapping.target_field) return <small className="mapping-quality preserved" title="Not mapped to the standard schema; the original column and value are preserved.">Preserved</small>;
  if (mapping.reason === "LangChain semantic mapping") return <small className="mapping-quality ai" title="DeepSeek selected this mapping from the column name and sample values.">AI match · {Math.round(mapping.confidence * 100)}%</small>;
  if (mapping.reason === "Similar field name") return <small className="mapping-quality similar" title="Matched because the source column closely resembles a known field name.">Similar match</small>;
  return <small className="mapping-quality exact" title="Matched using a configured field alias.">Exact match</small>;
}

function ExtraFieldsPreview({ fields = {} }) {
  const entries = Object.entries(fields);
  if (!entries.length) return <span className="extra-fields-empty">0</span>;
  return (
    <span className="extra-fields-preview" tabIndex={0} aria-label={`${entries.length} extra fields. Focus or hover to view values.`}>
      <span className="extra-fields-count">{entries.length}</span>
      <span className="extra-fields-tooltip" role="tooltip">
        <strong>Extra fields</strong>
        <span className="extra-fields-list">{entries.map(([key, value]) => <span className="extra-field-row" key={key}><b>{key}</b><em>{String(value ?? "—")}</em></span>)}</span>
      </span>
    </span>
  );
}

function ImportAgentModal({ onClose, onImported }) {
  const inputRef = useRef(null);
  const [stage, setStage] = useState("upload");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);

  async function upload(file) {
    if (!file) return;
    setBusy(true);
    setError("");
    const form = new FormData();
    form.append("file", file);
    try {
      const result = IS_GITHUB_PAGES ? parseWorkbookInBrowser(file.name, new Uint8Array(await file.arrayBuffer())) : await apiRequest("/api/imports/preview", { method: "POST", body: form });
      setPreview(result);
      setMessages([{ role: "agent", content: `I found ${result.cases.length} cases. Review the mapping below and tell me what to change before importing.` }]);
      setStage("preview");
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    setBusy(true);
    setError("");
    try {
      const result = IS_GITHUB_PAGES ? { cases: preview.cases.map((item, index) => ({ ...item, id: item.id || Number(String(item.case_id).replace(/\D/g, "")) || 900001 + index, title: item.description || "Imported test case", test_set: "Not assigned", automation: "Manual", status: "Draft", updated_at: "Just now" })) } : await apiRequest(`/api/imports/${preview.import_id}/confirm`, { method: "POST" });
      onImported(result.cases);
      onClose();
    } catch (confirmError) {
      setError(confirmError.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage(text = message) {
    const outgoing = text.trim();
    if (!outgoing || busy) return;
    setMessage("");
    setMessages((current) => [...current, { role: "user", content: outgoing }]);
    setBusy(true);
    setError("");
    try {
      const result = IS_GITHUB_PAGES ? await (async () => {
        const decision = await deepSeekCaseChange(outgoing, preview);
        const order = Number(decision.import_order);
        const changed = preview.cases[order - 1];
        const extra = !(decision.field in changed);
        const updated = { ...changed, extra_fields: { ...changed.extra_fields } };
        if (extra) updated.extra_fields[decision.field] = String(decision.value); else updated[decision.field] = String(decision.value);
        return { message: decision.message || `Updated case ${order}.`, changes: [{ case_id: changed.case_id, import_order: order, field: decision.field, after: String(decision.value) }], cases: [updated] };
      })() : await apiRequest(`/api/imports/${preview.import_id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: outgoing }),
      });
      if (result.cases.length) {
        setPreview((current) => ({
          ...current,
          cases: current.cases.map((item) => result.cases.find((changed) => changed.import_order === item.import_order) ? {
            ...item,
            ...result.cases.find((changed) => changed.import_order === item.import_order),
            description: result.cases.find((changed) => changed.import_order === item.import_order).title,
          } : item),
        }));
      }
      setMessages((current) => [...current, { role: "agent", content: result.message, changes: result.changes }]);
    } catch (chatError) {
      setError(chatError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-layer import-agent-layer">
      <button className="modal-backdrop" onClick={onClose} aria-label="Close import agent" />
      <section className="modal-card import-agent-modal">
        <div className="modal-header import-agent-header">
          <div><span className="eyebrow">LangChain import agent</span><h2>{stage === "upload" ? "Import test cases" : "Review and refine with Agent"}</h2></div>
          <div className="agent-status"><Sparkle size={15} weight="fill" /> LangChain</div>
          <IconButton label="Close" onClick={onClose}><X size={20} /></IconButton>
        </div>

        {stage === "upload" && <div className="import-upload-body">
          <button className="import-dropzone" onClick={() => inputRef.current?.click()} disabled={busy}>
            <span className="import-icon"><UploadSimple size={27} weight="duotone" /></span>
            <strong>{busy ? "Agent is analyzing the workbook…" : "Choose an Excel or CSV file"}</strong>
            <span>Every sheet is inspected. Unmatched columns are preserved as extra fields.</span>
            <small>.xlsx · .xls · .xlsm · .csv</small>
          </button>
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.xlsm,.csv" hidden onChange={(event) => upload(event.target.files?.[0])} />
          <div className="import-capabilities"><span><CheckCircle size={16} /> Multi-sheet detection</span><span><CheckCircle size={16} /> Semantic field mapping</span><span><CheckCircle size={16} /> Source-row audit trail</span></div>
        </div>}

        {stage === "preview" && preview && <div className="import-preview-body">
          <section className="import-summary-strip"><span><strong>{preview.cases.length}</strong> cases</span><i /><span><strong>{new Set(preview.sheets.filter((sheet) => sheet.status === "imported").map((sheet) => sheet.name)).size}</strong> sheets</span><i /><span className={preview.cases.some((item) => item.warnings.length) ? "has-warning" : ""}><strong>{preview.cases.filter((item) => item.warnings.length).length}</strong> need attention</span></section>
          <section className="agent-workspace">
            <div className="agent-explanation"><div className="agent-avatar"><Robot size={18} weight="duotone" /></div><div><div className="agent-workspace-title"><strong>How I handled this file</strong><span className="draft-badge">Draft</span></div>{preview.explanation.map((line) => <p key={line}>{line}</p>)}</div></div>
            <div className="agent-refine-intro"><strong>Review or correct my work</strong><span>Tell me what to change below. Nothing is imported until you confirm.</span></div>
            <div className="chat-messages">{messages.map((item, index) => <div className={`chat-message ${item.role}`} key={`${item.role}-${index}`}><span>{item.role === "agent" ? <Robot size={16} /> : <UserCircle size={16} />}</span><div><p>{item.content}</p>{item.changes?.map((change) => <small key={`${change.import_order}-${change.field}`}>Case {change.import_order} · {change.field}: {String(change.before ?? "—")} → {String(change.after ?? "—")}</small>)}</div></div>)}{busy && <div className="chat-message agent"><span><Robot size={16} /></span><div><p>Updating the import draft…</p></div></div>}</div>
            <div className="chat-suggestions"><button onClick={() => sendMessage("请解释一下你是怎么处理这个文件的")}>Explain this import</button><button onClick={() => sendMessage("撤销")}>Undo last change</button></div>
            <div className="chat-composer"><textarea value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(); } }} placeholder="在导入前修改，例如：第七条 case 的 user name 应该用 Lisa" /><button className="primary-button" disabled={!message.trim() || busy} onClick={() => sendMessage()}><PaperPlaneTilt size={17} weight="fill" /> Send</button></div>
          </section>
          <div className="case-preview-heading"><div><strong>Parsed test cases</strong><span>Review all {preview.cases.length} rows before import</span></div><span>{preview.cases.length} cases</span></div>
          <div className="case-preview-table"><table><thead><tr><th>#</th><th>Source</th><th>Case ID</th><th>Description</th><th>Type</th><th>Priority</th><th>Extra fields</th></tr></thead><tbody>{preview.cases.map((item) => <tr key={`${item.source_sheet}-${item.source_row}`}><td>{item.import_order}</td><td>{item.source_sheet} · {item.source_row}</td><td>{item.case_id}</td><td>{item.description || "—"}</td><td>{item.case_type}</td><td>{item.priority}</td><td><ExtraFieldsPreview fields={item.extra_fields} /></td></tr>)}</tbody></table></div>
          <div className="sheet-report-heading"><strong>Source sheets & field mappings</strong><span>Collapsed to prioritize case review</span></div>
          <div className="sheet-report-list">{preview.sheets.map((sheet) => <details key={`${sheet.name}#${sheet.table_index ?? 1}`}>
            <summary><span><FileText size={16} /><strong>{sheet.name}{(sheet.table_index ?? 1) > 1 ? ` · Table ${sheet.table_index}` : ""}</strong></span><StatusPill tone={sheet.status === "imported" ? "success" : sheet.status === "no-data" ? "warning" : "neutral"}>{sheet.status === "imported" ? `${sheet.row_count} cases` : sheet.status === "no-data" ? "No data" : "Skipped"}</StatusPill></summary>
            {sheet.status === "skipped" ? <p className="sheet-skip-reason">{sheet.reason}</p> : <>{sheet.reason && <p className="sheet-skip-reason">{sheet.reason}</p>}<div className="mapping-chips">{sheet.mappings.map((mapping) => <span key={mapping.source_column}><b>{mapping.source_column}</b><CaretRight size={12} /><em>{mapping.target_field || "extra_fields"}</em><MappingQuality mapping={mapping} /></span>)}</div></>}
          </details>)}</div>
        </div>}

        {error && <div className="import-error"><Warning size={17} /><span>{error}</span></div>}
        <div className="modal-actions import-agent-actions">
          {stage === "preview" && <><button className="secondary-button" disabled={busy} onClick={() => { setStage("upload"); setPreview(null); setMessages([]); }}>Choose another file</button><button className="primary-button" disabled={busy || !preview.cases.length} onClick={confirmImport}><Check size={16} /> {busy ? "Importing reviewed draft…" : `Confirm and import ${preview.cases.length} cases`}</button></>}
        </div>
      </section>
    </div>
  );
}

const localPlatformHints = (text) => [
  ...(/web|browser|网页|浏览器|网站/i.test(text) ? ["Web"] : []),
  ...(/api|rest|endpoint|接口|http/i.test(text) ? ["API"] : []),
  ...(/mobile|ios|android|移动|手机|app/i.test(text) ? ["Mobile"] : []),
];

function buildLocalCases(text, answers, sourceLabel) {
  const requirements = text
    .split(/\n+|(?<=[.!?。！？])\s+/)
    .map((line) => line.replace(/^[-*#\d.()、\s]+/, "").trim())
    .filter((line) => line.length >= 18)
    .slice(0, 8);
  if (!requirements.length) throw new Error("No testable requirements were found in this document.");
  const platforms = localPlatformHints(text);
  const platform = answers.platform || (platforms[0] || "Web");
  const priorityHint = /critical|最高|p0/i.test(text) ? "P0" : /low|低优|p2/i.test(text) ? "P2" : "P1";
  const priority = /p0/i.test(String(answers.priority || "")) ? "P0" : /p2/i.test(String(answers.priority || "")) ? "P2" : priorityHint;
  const cases = requirements.map((requirement, index) => ({
    title: requirement.length > 86 ? `${requirement.slice(0, 83)}…` : requirement,
    case_type: /api|endpoint|接口/i.test(requirement) || platform === "API" ? "API" : /mobile|ios|android|移动/i.test(requirement) || platform === "Mobile" ? "Mobile" : "Web",
    priority: index === 0 ? priority : priority === "P0" ? "P1" : priority,
    preconditions: "The user has access to the target environment.",
    test_steps: `1. Open the relevant feature\n2. Perform the behavior described in the requirement\n3. Observe the system response`,
    expected_result: `The system satisfies the documented requirement: ${requirement}`,
    requirement,
  }));
  return {
    session_id: crypto.randomUUID(),
    status: "generated",
    message: `Generated ${cases.length} case draft${cases.length === 1 ? "" : "s"} for your review.`,
    summary: `Found ${requirements.length} testable requirement${requirements.length === 1 ? "" : "s"} for ${sourceLabel}. Review and edit the table before adding anything to your inventory.`,
    cases,
    flowchart: buildLocalFlowchart(text),
  };
}

function buildLocalFlowchart(text) {
  const clauses = String(text).split(/\n+|(?<=[.!?。！？])\s+/).map((item) => item.replace(/^[-*#\d.()、\s]+/, "").trim()).filter((item) => item.length >= 12);
  const branching = /\b(if|when|unless|otherwise|either|role|status|state|approve|reject)\b|如果|当|否则|角色|状态|审批|拒绝/i.test(text);
  if (clauses.length < 3 && String(text).length < 360 && !branching) return null;
  const primary = clauses.slice(0, 3).map((item) => item.length > 66 ? `${item.slice(0, 63)}…` : item);
  const nodes = [
    { id: "start", label: "User starts the workflow", kind: "start", next: ["step-1"] },
    ...primary.map((label, index) => ({ id: `step-${index + 1}`, label, kind: branching && index === 1 ? "decision" : "step", next: index < primary.length - 1 ? [`step-${index + 2}`] : ["end"] })),
    { id: "end", label: "Outcome is confirmed", kind: "end", next: [] },
  ];
  return { title: "How I understand this requirement", nodes };
}

function startLocalGeneration(text, sourceLabel) {
  const questions = [];
  const platforms = localPlatformHints(text);
  if (!platforms.length) {
    questions.push({ id: "platform", question: "Which platform should the test cases target?", options: ["Web", "API", "Mobile"] });
  }
  if (!/priority|优先级|p0|p1|p2|critical|高优/i.test(text)) {
    questions.push({ id: "priority", question: "How important is the most critical flow?", options: ["P0 — must not break", "P1 — high", "P2 — normal"] });
  }
  if (questions.length) {
    return {
      session_id: crypto.randomUUID(),
      status: "asking",
      message: `I found ${text.split(/\n+/).filter((line) => line.trim().length >= 18).length} testable requirement line(s) in ${sourceLabel}. Before I build the suite, a couple of details would make the coverage accurate.`,
      questions,
      flowchart: buildLocalFlowchart(text),
    };
  }
  return buildLocalCases(text, {}, sourceLabel);
}

function continueLocalGeneration(text, answers, message, sourceLabel) {
  return buildLocalCases(text, { ...answers, platform: message, priority: message }, sourceLabel);
}

function RequirementFlow({ flowchart }) {
  if (!flowchart?.nodes?.length) return null;
  const byId = new Map(flowchart.nodes.map((node) => [node.id, node]));
  const kindLabel = { start: "Start", step: "Step", decision: "Decision", end: "Outcome" };
  const nodeIcon = (kind) => kind === "decision" ? <GitBranch size={14} weight="bold" /> : kind === "start" ? <Play size={14} weight="fill" /> : kind === "end" ? <CheckCircle size={14} weight="fill" /> : <FlowArrow size={14} weight="bold" />;
  return <section className="gen-requirement-flow" aria-label={flowchart.title || "Requirement flow"}>
    <header><span><FlowArrow size={18} weight="duotone" /></span><div><strong>{flowchart.title || "Requirement flow"}</strong><small>Generated because this requirement has multiple steps or branches</small></div></header>
    <div className="gen-flow-track">
      {flowchart.nodes.map((node, index) => <div className="gen-flow-item" key={node.id}>
        <article className={`gen-flow-node ${node.kind || "step"}`}>
          <div className="gen-flow-node-label"><span>{nodeIcon(node.kind)}</span><small>{kindLabel[node.kind] || "Step"}</small></div>
          <p>{node.label}</p>
          {!!node.next?.length && <div className="gen-flow-next">{node.next.map((nextId) => <span key={nextId}><ArrowRight size={11} />{byId.get(nextId)?.label || nextId}</span>)}</div>}
        </article>
        {index < flowchart.nodes.length - 1 && node.next?.includes(flowchart.nodes[index + 1].id) && <span className="gen-flow-connector" aria-hidden="true"><ArrowRight size={18} /><ArrowDown size={18} /></span>}
      </div>)}
    </div>
  </section>;
}

const chineseToInt = (raw) => {
  const digits = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (digits[raw] != null) return digits[raw];
  if (raw === "十") return 10;
  if (raw.startsWith("十")) return 10 + (digits[raw[1]] ?? 0);
  const tenAt = raw.indexOf("十");
  if (tenAt > 0 && digits[raw[0]] != null) {
    const tail = raw.slice(tenAt + 1);
    return digits[raw[0]] * 10 + (tail ? (digits[tail] ?? 0) : 0);
  }
  return null;
};

const extractCaseOrdinal = (message) => {
  const cn = String(message).match(/第\s*([一二两三四五六七八九十百\d]+)\s*(?:条|个|号)/);
  if (cn) return /^\d+$/.test(cn[1]) ? Number(cn[1]) : chineseToInt(cn[1]);
  const en = String(message).match(/(?:case|row|用例)\s*#?\s*(\d+)/i);
  if (en) return Number(en[1]);
  const enCn = String(message).match(/(?:case|用例)\s*([一二两三四五六七八九十]+)/i);
  if (enCn) return chineseToInt(enCn[1]);
  return null;
};

function continueLocalDraft(cases, requirementsText, message) {
  const lower = String(message || "").toLowerCase();
  const mention = (pattern) => pattern.test(lower);
  if (mention(/explain|explanation|解释|说明|what does|describe|介绍/i)) {
    const index = (extractCaseOrdinal(message) ?? 1) - 1;
    const target = index >= 0 && index < cases.length ? cases[index] : null;
    return {
      session_id: crypto.randomUUID(),
      status: "working",
      action: "reply",
      message: target
        ? `Case ${index + 1} — ${target.title}\nType: ${target.case_type} · Priority: ${target.priority}\nPreconditions: ${target.preconditions || "—"}\nTest steps:\n${target.test_steps}\nExpected result: ${target.expected_result}\nRequirement: ${target.requirement || "—"}`
        : `This draft has ${cases.length} case(s). Tell me which one to explain (for example “explain case 2”), or ask me to add, change or remove cases.`,
    };
  }
  if (mention(/remove|delete|删|移除|去掉/i)) {
    const index = (extractCaseOrdinal(message) ?? -1) - 1;
    if (index >= 0 && index < cases.length) {
      const removed = cases[index].title;
      return {
        session_id: crypto.randomUUID(),
        status: "working",
        action: "update",
        message: `Removed case ${index + 1} — ${removed}.`,
        cases: cases.filter((_, itemIndex) => itemIndex !== index),
      };
    }
    return { session_id: crypto.randomUUID(), status: "working", action: "reply", message: "Tell me which case to remove, for example “remove case 2” or “删掉第2条”." };
  }
  if (mention(/add|增加|补充|edge|边界|new case/i)) {
    const platform = /api|接口/i.test(requirementsText) ? "API" : /mobile|移动|手机/i.test(requirementsText) ? "Mobile" : "Web";
    const extra = {
      title: "Additional edge case",
      case_type: platform,
      priority: "P2",
      preconditions: "",
      test_steps: "1. Reproduce the boundary or unusual condition\n2. Observe the system response",
      expected_result: "The system handles the edge condition gracefully.",
      requirement: "Edge coverage requested by the author",
    };
    return {
      session_id: crypto.randomUUID(),
      status: "working",
      action: "update",
      message: "Added an edge-case draft you can edit in the table. On the live API the agent tailors this to your requirements.",
      cases: [...cases, extra],
    };
  }
  return {
    session_id: crypto.randomUUID(),
    status: "working",
    action: "reply",
    message: "On this static preview I can explain a case (“explain case 2”), remove one (“remove case 3” / “删掉第3条”) or add an edge case (“add an edge case”). For detailed edits, run the app with the API service or edit the table cells directly.",
  };
}

async function streamGenerationRequest(path, { form, json, onThinking }) {
  const apiKey = window.localStorage.getItem(API_KEY_STORAGE)?.trim();
  const headers = new Headers();
  if (apiKey) headers.set("X-DeepSeek-API-Key", apiKey);
  if (json) headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_ORIGIN}${path}`, { method: "POST", headers, body: form || (json ? JSON.stringify(json) : undefined) });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || "The agent could not complete the request.");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let thinking = "";
  let result = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop();
    for (const frame of frames) {
      const lines = frame.split("\n");
      let event = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;
      const payload = JSON.parse(data);
      if (event === "thinking") {
        thinking = payload.text || "";
        onThinking?.(thinking);
      } else if (event === "error") {
        throw new Error(payload.detail || "The agent could not complete the request.");
      } else if (event === "result") {
        result = payload;
      }
    }
  }
  if (!result) throw new Error("The agent returned no result.");
  return result;
}

function CaseGenerationPage({ cases, project, onAdd, onToast }) {
  const inputRef = useRef(null);
  const learnInputRef = useRef(null);
  const [stage, setStage] = useState("input");
  const [text, setText] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [composer, setComposer] = useState("");
  const [draft, setDraft] = useState(null);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [liveThinking, setLiveThinking] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [learnedProfile, setLearnedProfile] = useState(null);
  const [projectMemories, setProjectMemories] = useState([]);
  const submittingRef = useRef(false);
  const clarifyRoundsRef = useRef(0);

  useEffect(() => {
    if (!reviewOpen) return undefined;
    const onKey = (event) => { if (event.key === "Escape") setReviewOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reviewOpen]);

  useEffect(() => {
    if (IS_GITHUB_PAGES || !project?.id) return;
    Promise.all([
      apiRequest(`/api/projects/${encodeURIComponent(String(project.id))}/profiles`),
      apiRequest(`/api/projects/${encodeURIComponent(String(project.id))}/memories`),
    ])
      .then(([profile, memories]) => {
        setLearnedProfile(profile.style_profile || profile.template_profile ? profile : null);
        setProjectMemories(memories.memories || []);
      })
      .catch(() => {});
  }, [project?.id]);

  function reset() {
    setStage("input");
    setText("");
    setSourceLabel("");
    setSessionId(null);
    setMessages([]);
    setQuestions([]);
    setComposer("");
    setDraft(null);
    setSelected([]);
    setBusy(false);
    setError("");
    setLiveThinking("");
    setAttachmentMenuOpen(false);
    setReviewOpen(false);
    submittingRef.current = false;
    clarifyRoundsRef.current = 0;
  }

  function handleTurn(response, label, reasoning = "") {
    if (response?.session_id) setSessionId(response.session_id);
    setSourceLabel(label);
    setLiveThinking("");
    const action = response?.action || (response?.status === "asking" ? "ask" : "generate");
    if (action === "ask") {
      const nextQuestions = response.questions || [];
      const missingQuestions = nextQuestions
        .map((question) => question.question)
        .filter((question) => question && !String(response.message || "").includes(question));
      const content = [response.message, missingQuestions.join("\n")].filter(Boolean).join("\n\n");
      setMessages((current) => [...current, { role: "agent", content, reasoning, flowchart: response.flowchart }]);
      setQuestions(nextQuestions);
      setComposer("");
      submittingRef.current = false;
      clarifyRoundsRef.current += 1;
      setReviewOpen(false);
      setStage("chat");
      return;
    }
    // reply / generate / update all keep the conversation visible and land on the results table.
    const previousLen = draft?.cases?.length || 0;
    setQuestions([]);
    setComposer("");
    setMessages((current) => [...current, { role: "agent", content: response.message, reasoning, flowchart: response.flowchart }]);
    if (action === "reply") {
      setStage("results");
      return;
    }
    const nextCases = response?.cases || [];
    setDraft({ summary: response?.summary || draft?.summary || "", cases: nextCases, suggestions: response?.suggestions || [] });
    setSelected((current) => {
      const kept = current.filter((index) => index < nextCases.length);
      for (let index = previousLen; index < nextCases.length; index += 1) kept.push(index);
      return kept;
    });
    clarifyRoundsRef.current = 0;
    setStage("results");
  }

  async function startFromText() {
    const content = text.trim();
    if (!content || busy) return;
    setBusy(true);
    setError("");
    setLiveThinking("");
    let thinking = "";
    try {
      let response;
      if (IS_GITHUB_PAGES) {
        response = startLocalGeneration(content, "Pasted requirements");
      } else {
        const form = new FormData();
        form.append("text", content);
        form.append("project_id", String(project.id));
        response = await streamGenerationRequest("/api/generation/sessions/stream", { form, onThinking: (chunk) => { thinking = chunk; setLiveThinking(chunk); } });
      }
      handleTurn(response, "Pasted requirements", thinking);
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setBusy(false);
    }
  }

  async function upload(file) {
    if (!file) return;
    setSourceLabel(file.name);
    setBusy(true);
    setError("");
    setLiveThinking("");
    let thinking = "";
    try {
      let response;
      if (IS_GITHUB_PAGES) {
        if (!/\.(txt|md)$/i.test(file.name)) throw new Error("PDF and Word generation requires the API service. Upload .txt or .md on this static preview.");
        const content = await file.text();
        setText(content); // keep the source text so follow-up questions can generate from it
        response = startLocalGeneration(content, file.name);
      } else {
        const form = new FormData();
        form.append("file", file);
        form.append("project_id", String(project.id));
        response = await streamGenerationRequest("/api/generation/sessions/stream", { form, onThinking: (chunk) => { thinking = chunk; setLiveThinking(chunk); } });
      }
      handleTurn(response, file.name, thinking);
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setBusy(false);
    }
  }

  async function learnFromCases(file) {
    if (!file || busy) return;
    if (IS_GITHUB_PAGES) {
      setError("Project learning requires the QA Orbit API service.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const learned = await apiRequest(`/api/projects/${encodeURIComponent(String(project.id))}/learning/cases`, {
        method: "POST",
        body: form,
      });
      setLearnedProfile({ style_profile: learned.style_profile, template_profile: learned.template_profile });
      setProjectMemories((current) => [...learned.memory_candidates, ...current.filter((item) => !learned.memory_candidates.some((candidate) => candidate.id === item.id))]);
      onToast(`Learned ${learned.imported_count} approved cases for ${project.name}.`);
    } catch (learnError) {
      setError(learnError.message);
    } finally {
      setBusy(false);
      if (learnInputRef.current) learnInputRef.current.value = "";
    }
  }

  async function setMemoryStatus(memory, status) {
    try {
      const updated = await apiRequest(`/api/projects/${encodeURIComponent(String(project.id))}/memories/${memory.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setProjectMemories((current) => current.map((item) => item.id === updated.id ? updated : item));
      onToast(status === "active" ? "Project memory approved." : "Project memory deprecated.");
    } catch (memoryError) {
      setError(memoryError.message);
    }
  }

  async function submitAnswers(overrideMessage) {
    if (submittingRef.current || busy) return;
    const freeText = (overrideMessage ?? composer).trim();
    if (!freeText) return;
    submittingRef.current = true;
    setBusy(true);
    setError("");
    setLiveThinking("");
    setMessages((current) => [...current, { role: "user", content: freeText }]);
    let thinking = "";
    try {
      let response;
      if (IS_GITHUB_PAGES) {
        response = continueLocalGeneration(text, {}, freeText, sourceLabel);
      } else {
        response = await streamGenerationRequest(`/api/generation/sessions/${sessionId}/chat/stream`, {
          json: { message: freeText, answers: [] },
          onThinking: (chunk) => { thinking = chunk; setLiveThinking(chunk); },
        });
      }
      handleTurn(response, sourceLabel, thinking);
    } catch (chatError) {
      setError(chatError.message);
    } finally {
      setBusy(false);
      submittingRef.current = false;
    }
  }

  // Post-generation interaction: the author keeps chatting about the generated draft.
  async function continueDraft(text) {
    const outgoing = (text ?? composer).trim();
    if (!outgoing || busy) return;
    setComposer("");
    setMessages((current) => [...current, { role: "user", content: outgoing }]);
    setBusy(true);
    setError("");
    setLiveThinking("");
    let thinking = "";
    try {
      let response;
      if (IS_GITHUB_PAGES) {
        response = continueLocalDraft(draft.cases, text, outgoing);
      } else {
        response = await streamGenerationRequest(`/api/generation/sessions/${sessionId}/chat/stream`, {
          json: { message: outgoing, cases: draft.cases },
          onThinking: (chunk) => { thinking = chunk; setLiveThinking(chunk); },
        });
      }
      handleTurn(response, sourceLabel, thinking);
    } catch (chatError) {
      setError(chatError.message);
    } finally {
      setBusy(false);
    }
  }

  async function askProjectSupervisor() {
    if (busy || IS_GITHUB_PAGES) return;
    const prompt = "Run a complete QA review of this requirement and draft. Identify ambiguity, missing coverage, duplicates, weak assertions, and relevant project conventions. Give prioritized, evidence-based suggestions without modifying cases.";
    setMessages((current) => [...current, { role: "user", content: "Run a complete project QA review." }]);
    setBusy(true);
    setError("");
    try {
      const response = await apiRequest(`/api/projects/${encodeURIComponent(String(project.id))}/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt, generation_session_id: sessionId }),
      });
      setMessages((current) => [...current, { role: "agent", content: response.message }]);
    } catch (reviewError) {
      setError(reviewError.message);
    } finally {
      setBusy(false);
    }
  }

  function updateCase(index, field, value) {
    setDraft((current) => ({ ...current, cases: current.cases.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item) }));
  }

  function addSelected() {
    const chosen = draft.cases.filter((_, index) => selected.includes(index));
    const firstId = Math.max(0, ...cases.map((item) => Number(item.id) || 0)) + 1;
    onAdd(chosen.map((item, index) => ({
      id: firstId + index,
      case_id: `GEN-${firstId + index}`,
      title: item.title,
      description: item.title,
      case_type: item.case_type,
      priority: item.priority,
      preconditions: item.preconditions,
      test_steps: item.test_steps,
      test_data: "",
      expected_result: item.expected_result,
      automation: "Manual",
      status: "Draft",
      test_set: "Not assigned",
      updated_at: "Just now",
      extra_fields: { "Source document": sourceLabel, Requirement: item.requirement },
    })));
    onToast(`${chosen.length} generated test case${chosen.length === 1 ? "" : "s"} added as drafts.`);
    reset();
  }

  async function exportSelected() {
    if (!selected.length || busy || IS_GITHUB_PAGES) return;
    setBusy(true);
    setError("");
    try {
      const apiKey = window.localStorage.getItem(API_KEY_STORAGE)?.trim();
      const headers = { "Content-Type": "application/json" };
      if (apiKey) headers["X-DeepSeek-API-Key"] = apiKey;
      const response = await fetch(`${API_ORIGIN}/api/projects/${encodeURIComponent(String(project.id))}/export`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          filename: `${project.name}-generated-cases`,
          cases: draft.cases.filter((_, index) => selected.includes(index)),
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || "The project template could not be exported.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${project.name}-generated-cases.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
      onToast(`Exported ${selected.length} case${selected.length === 1 ? "" : "s"} with the learned project template.`);
    } catch (exportError) {
      setError(exportError.message);
    } finally {
      setBusy(false);
    }
  }

  const allSelected = draft?.cases.length > 0 && selected.length === draft.cases.length;
  const quickReplies = questions.flatMap((question) => (question.options || []).map((option) => ({ question, option })));

  // Shared workspace used both in the results view and the fullscreen review modal.
  const resultsWorkspace = draft ? (
    <div className="gen-results-workspace">
      <div className="case-preview-table gen-edit-table">
        <table>
          <thead><tr><th><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : draft.cases.map((_, index) => index))} aria-label="Select all generated cases" /></th><th>#</th><th>Title</th><th>Type</th><th>Priority</th><th>Preconditions</th><th>Test steps</th><th>Expected result</th><th>Requirement</th></tr></thead>
          <tbody>{draft.cases.map((item, index) => (
            <tr key={index} className={selected.includes(index) ? "selected-row" : ""}>
              <td><input type="checkbox" checked={selected.includes(index)} onChange={() => setSelected((current) => current.includes(index) ? current.filter((value) => value !== index) : [...current, index])} aria-label={`Select generated case ${index + 1}`} /></td>
              <td><span className="gen-row-index">{String(index + 1).padStart(2, "0")}</span></td>
              <td><input className="gen-cell gen-cell-title" value={item.title} onChange={(event) => updateCase(index, "title", event.target.value)} aria-label={`Title of case ${index + 1}`} /></td>
              <td><select className="gen-cell" value={item.case_type} onChange={(event) => updateCase(index, "case_type", event.target.value)} aria-label={`Type of case ${index + 1}`}><option>Web</option><option>API</option><option>Mobile</option></select></td>
              <td><select className="gen-cell gen-cell-priority" value={item.priority} onChange={(event) => updateCase(index, "priority", event.target.value)} aria-label={`Priority of case ${index + 1}`}><option>P0</option><option>P1</option><option>P2</option></select></td>
              <td><input className="gen-cell" value={item.preconditions || ""} onChange={(event) => updateCase(index, "preconditions", event.target.value)} aria-label={`Preconditions of case ${index + 1}`} /></td>
              <td><textarea className="gen-cell gen-cell-steps" rows={4} value={item.test_steps || ""} onChange={(event) => updateCase(index, "test_steps", event.target.value)} aria-label={`Test steps of case ${index + 1}`} /></td>
              <td><textarea className="gen-cell" rows={4} value={item.expected_result || ""} onChange={(event) => updateCase(index, "expected_result", event.target.value)} aria-label={`Expected result of case ${index + 1}`} /></td>
              <td><input className="gen-cell" value={item.requirement || ""} onChange={(event) => updateCase(index, "requirement", event.target.value)} aria-label={`Source requirement of case ${index + 1}`} /></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <aside className="gen-chat-side">
        <div className="gen-chat-side-heading"><span><Robot size={18} weight="duotone" /></span><div><strong>Continue with the agent</strong><small>Explain, edit, add or remove cases</small></div></div>
        <div className="chat-messages gen-side-messages">
          {messages.map((item, index) => <div className={`chat-message ${item.role}`} key={`${item.role}-${index}`}><span>{item.role === "agent" ? <Robot size={16} /> : <UserCircle size={16} />}</span><div>{item.role === "agent" && item.reasoning ? <details className="gen-thinking"><summary>AI thinking process</summary><pre>{item.reasoning}</pre></details> : null}<p>{item.content}</p>{item.role === "agent" && <RequirementFlow flowchart={item.flowchart} />}</div></div>)}
          {busy && <div className="chat-message agent"><span><Robot size={16} /></span><div>{liveThinking ? <details className="gen-thinking live" open><summary>AI is thinking…</summary><pre>{liveThinking}</pre></details> : <p>The agent is working…</p>}</div></div>}
        </div>
        {error && <div className="gen-chat-error"><Warning size={15} /><span>{error}</span></div>}
        <div className="chat-suggestions">
          {!IS_GITHUB_PAGES && <button onClick={askProjectSupervisor}>Run full QA review</button>}
          <button onClick={() => continueDraft("Explain case 1 — what does it verify and how?")}>Explain case 1</button>
          <button onClick={() => continueDraft("Add important edge cases that are missing from the suite")}>Add edge cases</button>
          <button onClick={() => continueDraft("Remove duplicate or redundant cases")}>Remove duplicates</button>
        </div>
        <div className="chat-composer">
          <textarea value={composer} onChange={(event) => setComposer(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); continueDraft(); } }} disabled={busy} placeholder="Ask the agent to explain, change, add or remove cases…" />
          <button className="primary-button" disabled={busy || !composer.trim()} onClick={() => continueDraft()}><PaperPlaneTilt size={17} weight="fill" /> Send</button>
        </div>
      </aside>
    </div>
  ) : null;

  return (
    <>
      <PageHeader eyebrow="AI authoring" title="Generate test cases" description={`Generate in ${project.name} with project-scoped memory, approved examples and reusable templates.`} />
      {stage === "input" && <section className="generator-chat-entry">
        <div className="generator-chat-welcome">
          <span className="generator-chat-mark"><Sparkle size={25} weight="duotone" /></span>
          <h2>What would you like to test?</h2>
          <p>Describe the feature, paste a requirement, or attach a document. I’ll ask for anything important that’s missing.</p>
        </div>
        <div
          className={`generator-chat-composer ${dragging ? "dragging" : ""}`}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => { event.preventDefault(); setDragging(false); upload(event.dataTransfer.files?.[0]); }}
        >
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); startFromText(); } }}
            rows={4}
            disabled={busy}
            autoFocus
            placeholder="Describe a feature or paste your requirements…"
            aria-label="Describe what you want to test"
          />
          <div className="generator-chat-toolbar">
            <div className="generator-chat-tools">
              <div className="generator-attachment-menu">
                <button type="button" disabled={busy} aria-haspopup="menu" aria-expanded={attachmentMenuOpen} onClick={() => setAttachmentMenuOpen((open) => !open)} title="Add a file"><UploadSimple size={17} /><span>Attach</span><CaretDown size={13} /></button>
                {attachmentMenuOpen && <div className="generator-attachment-popover" role="menu" aria-label="Attachment options">
                  <button type="button" role="menuitem" onClick={() => { setAttachmentMenuOpen(false); inputRef.current?.click(); }}><span><FileText size={18} weight="duotone" /></span><div><strong>Upload requirement</strong><small>PDF, DOCX, Markdown or TXT</small></div></button>
                  <button type="button" role="menuitem" onClick={() => { setAttachmentMenuOpen(false); learnInputRef.current?.click(); }}><span><Database size={18} weight="duotone" /></span><div><strong>Learn cases</strong><small>Learn style from approved XLSX, XLS or CSV</small></div></button>
                </div>}
              </div>
            </div>
            <div className="generator-chat-send">
              {text && <span>{text.length.toLocaleString()}</span>}
              <button type="button" aria-label="Send requirements" disabled={busy || !text.trim()} onClick={startFromText}><PaperPlaneTilt size={18} weight="fill" /></button>
            </div>
          </div>
          <input ref={inputRef} type="file" accept=".pdf,.docx,.md,.txt" hidden onChange={(event) => { setAttachmentMenuOpen(false); upload(event.target.files?.[0]); }} />
          <input ref={learnInputRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(event) => { setAttachmentMenuOpen(false); learnFromCases(event.target.files?.[0]); }} />
        </div>
        <div className="generator-chat-prompts" aria-label="Example prompts">
          <button onClick={() => setText("Generate login test cases covering valid credentials, invalid passwords, account lockout, and session expiry.")}>Test a login flow</button>
          <button onClick={() => setText("Create API test cases for creating, updating, and cancelling an order, including validation and permission errors.")}>Cover an API</button>
          <button onClick={() => setText("Review this requirement for missing edge cases and then generate a complete regression suite.")}>Build a regression suite</button>
        </div>
        {busy && <div className="generator-chat-progress"><span className="loading-line" /><strong>{sourceLabel ? `Analyzing ${sourceLabel}…` : "Analyzing your requirements…"}</strong></div>}
        {error && <div className="import-error generator-chat-error"><Warning size={17} /><span>{error}</span></div>}
        {(learnedProfile || projectMemories.length > 0) && <div className="generator-context-summary">
          {learnedProfile && <div className="generator-profile-ready"><CheckCircle size={17} /><span><strong>Project profile ready</strong> · {learnedProfile.style_profile?.sample_count || 0} approved examples · applied automatically</span></div>}
          {!!projectMemories.length && <details className="generator-memory-details">
            <summary><Database size={16} /><span>{projectMemories.length} project memor{projectMemories.length === 1 ? "y" : "ies"}</span><CaretDown size={14} /></summary>
            <div className="project-memory-list">
              {projectMemories.map((memory) => <div key={memory.id} className="inline-notice"><Database size={17} /><span><strong>{memory.memory_type}</strong> {memory.content}</span><div className="row-actions">{memory.status === "candidate" && <button className="text-button" onClick={() => setMemoryStatus(memory, "active")}>Approve</button>}{memory.status === "active" && <button className="text-button" onClick={() => setMemoryStatus(memory, "deprecated")}>Disable</button>}<StatusPill>{memory.status}</StatusPill></div></div>)}
            </div>
          </details>}
        </div>}
        <p className="generator-chat-footnote">QA Orbit can make mistakes. Review generated cases before adding them to your project.</p>
      </section>}

      {stage === "chat" && <section className="panel gen-chat-panel">
        <div className="gen-chat-header">
          <div><span className="generator-file-icon"><Robot size={21} weight="duotone" /></span><div><span className="panel-kicker">Interactive generation</span><h2>{sourceLabel}</h2><p>Answer the agent's questions — it only asks for details that change the suite.</p></div></div>
          <button className="secondary-button" onClick={reset}><ArrowClockwise size={16} /> Start over</button>
        </div>
        <div className="gen-chat-body">
          <div className="chat-messages">
            {messages.map((item, index) => <div className={`chat-message ${item.role}`} key={`${item.role}-${index}`}><span>{item.role === "agent" ? <Robot size={16} /> : <UserCircle size={16} />}</span><div>{item.role === "agent" && item.reasoning ? <details className="gen-thinking"><summary>AI thinking process</summary><pre>{item.reasoning}</pre></details> : null}<p>{item.content}</p>{item.role === "agent" && <RequirementFlow flowchart={item.flowchart} />}</div></div>)}
            {busy && <div className="chat-message agent"><span><Robot size={16} /></span><div>{liveThinking ? <details className="gen-thinking live" open><summary>AI is thinking…</summary><pre>{liveThinking}</pre></details> : <p>The agent is working…</p>}</div></div>}
          </div>
          {error && <div className="gen-chat-error"><Warning size={15} /><span>{error}</span></div>}
          {questions.length > 0 && <div className="gen-quick-replies">
            {!!quickReplies.length && <div>{quickReplies.map(({ question, option }) => <button key={`${question.id}-${option}`} disabled={busy} onClick={() => setComposer((current) => [current.trim(), questions.length > 1 ? `${question.question}: ${option}` : option].filter(Boolean).join("\n"))}>{option}</button>)}</div>}
            <button className="gen-skip-reply" disabled={busy} onClick={() => submitAnswers("Use your best judgment for the remaining details.")}>Use best judgment</button>
          </div>}
          <div className="chat-composer gen-main-composer">
            <textarea value={composer} onChange={(event) => setComposer(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submitAnswers(); } }} disabled={busy} autoFocus placeholder={questions.length ? "Reply to the agent…" : "Message the agent…"} aria-label="Reply to the agent" />
            <button className="primary-button" aria-label="Send reply" disabled={busy || !composer.trim()} onClick={() => submitAnswers()}><PaperPlaneTilt size={17} weight="fill" /> {busy ? "Working…" : "Send"}</button>
          </div>
        </div>
      </section>}

      {stage === "results" && draft && <section className="panel generator-results">
        <div className="generator-result-header">
          <div><span className="generator-file-icon"><FileText size={21} weight="duotone" /></span><div><span className="panel-kicker">Generation complete</span><h2>{sourceLabel}</h2><p>{draft.summary}</p></div></div>
          <div className="generator-header-actions"><button className="secondary-button" onClick={() => setReviewOpen(true)}><ArrowsOut size={16} /> Review fullscreen</button><button className="secondary-button" onClick={reset}><ArrowClockwise size={16} /> Start over</button></div>
        </div>
        <div className="generator-toolbar">
          <label><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : draft.cases.map((_, index) => index))} /><strong>{selected.length} of {draft.cases.length} selected</strong></label>
          <span>Edit any cell, or keep asking the agent to explain, change, add or remove cases — your edits are kept.</span>
        </div>
        {!!draft.suggestions?.length && <div className="gen-agent-suggestions">
          {draft.suggestions.map((suggestion) => <article key={suggestion.id} className={`inline-notice ${suggestion.severity === "critical" ? "danger" : ""}`}><Warning size={17} weight="fill" /><span><strong>{suggestion.title}</strong> {suggestion.detail}</span></article>)}
        </div>}
        {resultsWorkspace}
        <div className="generator-actions"><span><Info size={16} /> Only selected cases will be added or exported.</span><div className="row-actions">{learnedProfile?.template_profile && !IS_GITHUB_PAGES && <button className="secondary-button" disabled={!selected.length || busy} onClick={exportSelected}><UploadSimple size={17} /> Export template</button>}<button className="primary-button" disabled={!selected.length} onClick={addSelected}><Plus size={17} /> Add {selected.length} to Test cases</button></div></div>
      </section>}

      {reviewOpen && draft && (
        <div className="modal-layer review-layer" role="dialog" aria-modal="true">
          <button className="modal-backdrop" onClick={() => setReviewOpen(false)} aria-label="Exit review mode" />
          <section className="review-modal">
            <div className="review-header">
              <div className="review-title"><span className="review-orb"><ArrowsOut size={19} weight="duotone" /></span><div><span className="panel-kicker">Review mode</span><h2>{sourceLabel}</h2><p>{draft.summary}</p></div></div>
              <div className="review-header-actions"><span className="review-hint"><Info size={15} /> Edits and chat are shared with the page view.</span><button className="secondary-button" onClick={() => setReviewOpen(false)}><ArrowsIn size={16} /> Exit review</button></div>
            </div>
            {resultsWorkspace}
            <div className="generator-actions review-actions"><span><Info size={16} /> Only selected cases will be added or exported.</span><div className="row-actions">{learnedProfile?.template_profile && !IS_GITHUB_PAGES && <button className="secondary-button" disabled={!selected.length || busy} onClick={exportSelected}><UploadSimple size={17} /> Export template</button>}<button className="primary-button" disabled={!selected.length} onClick={addSelected}><Plus size={17} /> Add {selected.length} to Test cases</button></div></div>
          </section>
        </div>
      )}
    </>
  );
}

function CasesPage({ cases, setCases, dataSets, onRun, onToast }) {
  const [queryText, setQueryText] = useState("");
  const [type, setType] = useState("All types");
  const [menuCaseId, setMenuCaseId] = useState(null);
  const [editingCase, setEditingCase] = useState(null);
  const [creatingCase, setCreatingCase] = useState(false);
  const [viewingCase, setViewingCase] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedCaseIds, setSelectedCaseIds] = useState([]);
  const [selectedDataSet, setSelectedDataSet] = useState("");
  const filtered = cases.filter((testCase) =>
    (`${testCase.id} ${testCase.case_id || ""} ${testCase.title}`).toLowerCase().includes(queryText.toLowerCase()) && (type === "All types" || testCase.case_type === type),
  );
  const allVisibleSelected = filtered.length > 0 && filtered.every((testCase) => selectedCaseIds.includes(testCase.id));
  const toggleCase = (caseId) => setSelectedCaseIds((current) => current.includes(caseId) ? current.filter((id) => id !== caseId) : [...current, caseId]);
  const toggleVisible = () => setSelectedCaseIds((current) => allVisibleSelected ? current.filter((id) => !filtered.some((testCase) => testCase.id === id)) : [...new Set([...current, ...filtered.map((testCase) => testCase.id)])]);
  function bindSelectedCases() {
    if (!selectedDataSet || !selectedCaseIds.length) return;
    setCases((current) => current.map((testCase) => selectedCaseIds.includes(testCase.id) ? { ...testCase, test_data: selectedDataSet, updated_at: "11 Aug 2026" } : testCase));
    onToast(`${selectedDataSet} bound to ${selectedCaseIds.length} test case(s).`);
    setSelectedCaseIds([]);
    setSelectedDataSet("");
  }
  function saveCase(form) {
    const normalized = { ...form, title: form.description };
    if (form.id) {
      setCases((current) => current.map((item) => item.id === form.id ? { ...item, ...normalized, updated_at: "11 Aug 2026" } : item));
      onToast(`TC-${form.id} saved. Reused instances were updated.`);
    } else {
      const id = Math.max(...cases.map((item) => item.id)) + 1;
      setCases((current) => [...current, { ...normalized, id, automation: "Manual", status: "Draft", test_set: "Not assigned", updated_at: "11 Aug 2026" }]);
      onToast(`${form.case_id} created.`);
    }
    setEditingCase(null);
    setCreatingCase(false);
  }
  function duplicateCase(testCase) {
    const id = Math.max(...cases.map((item) => item.id)) + 1;
    const description = `${caseDescription(testCase)} — Copy`;
    setCases((current) => [...current, { ...testCase, id, case_id: `TC-${id}`, title: description, description, status: "Draft", updated_at: "11 Aug 2026" }]);
    setMenuCaseId(null);
    onToast(`TC-${testCase.id} duplicated as draft TC-${id}.`);
  }
  function mergeImported(importedCases, updatesOnly = false) {
    setCases((current) => {
      const findMatch = (item) => importedCases.find((candidate) => candidate.id === item.id);
      if (updatesOnly) return current.map((item) => findMatch(item) ? { ...item, ...findMatch(item), extra_fields: { ...(item.extra_fields || {}), ...(findMatch(item).extra_fields || {}) } } : item);
      const importedIds = new Set(importedCases.map((item) => item.id));
      return [...current.filter((item) => !importedIds.has(item.id)), ...importedCases];
    });
    if (!updatesOnly) onToast(`${importedCases.length} test cases imported with source audit data.`);
  }
  return (
    <>
      <PageHeader eyebrow="Test inventory" title="Test cases" description="Search, maintain and execute the reusable test inventory for this project."
        actions={<><button className="secondary-button" onClick={() => setImportOpen(true)}><UploadSimple size={17} /> Upload cases</button><button className="primary-button" onClick={() => setCreatingCase(true)}><Plus size={17} /> New test case</button></>} />
      <div className="filter-bar">
        <label className="search-field"><MagnifyingGlass size={18} /><input value={queryText} onChange={(event) => setQueryText(event.target.value)} placeholder="Search ID or description" /></label>
        <select className="filter-select" value={type} onChange={(event) => setType(event.target.value)}><option>All types</option><option>Web</option><option>API</option><option>Mobile</option></select>
        <button className="secondary-button compact"><Funnel size={16} /> More filters</button>
      </div>
      {selectedCaseIds.length > 0 && <div className="bulk-bind-bar"><div><Database size={18} /><strong>{selectedCaseIds.length} test case(s) selected</strong></div><select value={selectedDataSet} onChange={(event) => setSelectedDataSet(event.target.value)}><option value="">Choose test data</option>{dataSets.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select><button className="primary-button compact" disabled={!selectedDataSet} onClick={bindSelectedCases}>Bind test data</button><button className="text-button" onClick={() => setSelectedCaseIds([])}>Clear</button></div>}
      <section className="panel flush-panel cases-panel">
        <div className="table-wrap">
          <table className="data-table selectable-table">
            <thead><tr><th><input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} aria-label="Select all visible test cases" /></th><th>Case ID</th><th>Case type</th><th>Description</th><th>Pre-conditions</th><th>Test steps</th><th>Test data</th><th>Expected result</th><th>Priority</th><th /></tr></thead>
            <tbody>{filtered.map((testCase) => (
              <tr key={testCase.id}>
                <td><input type="checkbox" checked={selectedCaseIds.includes(testCase.id)} onChange={() => toggleCase(testCase.id)} aria-label={`Select ${displayCaseId(testCase)}`} /></td>
                <td><button className="table-link" onClick={() => setViewingCase(testCase)}>{displayCaseId(testCase)}</button></td>
                <td>{testCase.case_type}</td>
                <td><strong className="cell-primary">{caseDescription(testCase)}</strong><span className="cell-secondary">Updated {testCase.updated_at}</span></td>
                <td className="case-text-cell">{testCase.preconditions || "—"}</td>
                <td className="case-text-cell pre-line">{testCase.test_steps || "—"}</td>
                <td><span className="data-binding-cell"><DataSetLabel dataSet={dataSets.find((item) => item.name === testCase.test_data)} name={testCase.test_data} /></span></td>
                <td className="case-text-cell">{testCase.expected_result || "—"}</td>
                <td><span className={`priority ${testCase.priority.toLowerCase()}`}>{testCase.priority}</span></td>
                <td><div className="row-actions"><div className="action-menu-wrap"><IconButton label={`More actions for ${displayCaseId(testCase)}`} onClick={() => setMenuCaseId((current) => current === testCase.id ? null : testCase.id)}><DotsThree size={19} /></IconButton>{menuCaseId === testCase.id && <div className="action-menu"><button onClick={() => { setEditingCase(testCase); setMenuCaseId(null); }}><PencilSimple size={16} /> Edit case</button><button onClick={() => duplicateCase(testCase)}><Copy size={16} /> Duplicate case</button></div>}</div><button className="primary-button compact" onClick={() => onRun(testCase, "Test case")}><Play size={14} weight="fill" /> Run</button></div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
      {viewingCase && <CaseDetailDrawer testCase={cases.find((item) => item.id === viewingCase.id) || viewingCase} dataSet={dataSets.find((item) => item.name === (cases.find((item) => item.id === viewingCase.id) || viewingCase).test_data)} onClose={() => setViewingCase(null)} onEdit={() => { setEditingCase(cases.find((item) => item.id === viewingCase.id) || viewingCase); setViewingCase(null); }} />}
      {(editingCase || creatingCase) && <CaseEditModal testCase={editingCase} suggestedCaseId={`TC-${Math.max(...cases.map((item) => item.id)) + 1}`} dataSets={dataSets} onClose={() => { setEditingCase(null); setCreatingCase(false); }} onSave={saveCase} />}
      {importOpen && <ImportAgentModal onClose={() => setImportOpen(false)} onImported={mergeImported} />}
    </>
  );
}

function DataPage({ dataSets, cases, setCases, onToast }) {
  const [tab, setTab] = useState("My data");
  const [queryText, setQueryText] = useState("");
  const [selectedData, setSelectedData] = useState(null);
  const myData = useMemo(() => dataSets.filter((item) => item.created_by === CURRENT_USER), [dataSets]);
  const counts = useMemo(() => ({
    "My data": myData.length,
    "All data": dataSets.length,
  }), [myData, dataSets]);
  const filtered = (tab === "My data" ? myData : dataSets).filter((item) => item.name.toLowerCase().includes(queryText.toLowerCase()));
  function bindCases(dataSetName, caseIds) {
    setCases((current) => current.map((testCase) => caseIds.includes(testCase.id) ? { ...testCase, test_data: dataSetName, updated_at: "11 Aug 2026" } : testCase));
    onToast(`${dataSetName} bound to ${caseIds.length} test case(s).`);
    setSelectedData(null);
  }
  function deleteDataSet(dataSetName) {
    onToast(`${dataSetName} deleted.`);
    setSelectedData(null);
  }
  return (
    <>
      <PageHeader eyebrow="Reusable input" title="My data" description="Import, manage and reuse data sets across test cases without duplicating fixtures."
        actions={<button className="primary-button" onClick={() => onToast("Import panel opened. Choose a file to create a new data set.")}><UploadSimple size={17} /> Import data set</button>} />
      <div className="workspace-tabs">
        {["My data", "All data"].map((item) => (
          <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}<span>{counts[item]}</span></button>
        ))}
      </div>
      <div className="filter-bar data-filter"><label className="search-field"><MagnifyingGlass size={18} /><input value={queryText} onChange={(event) => setQueryText(event.target.value)} placeholder="Search data sets" /></label><span>Showing {filtered.length} data set(s)</span></div>
      <div className="data-card-grid">
        {filtered.map((item) => {
          const canEdit = item.created_by === CURRENT_USER;
          return (
            <article className={`data-card ${!canEdit ? "read-only" : ""}`} key={item.id}>
              <div className="data-card-header">
                <div className="data-set-icon"><Database size={19} weight="duotone" /></div>
                <div className="data-card-actions">
                  {!canEdit && <span className="read-only-badge" title="You can only edit data sets you created"><Lock size={14} /> Read-only</span>}
                  {canEdit && <IconButton label="Delete data set" className="danger-hover" onClick={() => deleteDataSet(item.name)}><Trash size={17} /></IconButton>}
                  <IconButton label="Data set actions"><DotsThree size={19} /></IconButton>
                </div>
              </div>
              <h2>{item.name}</h2>
              <div className="data-meta"><span>Source type</span><strong>{item.source_type}</strong><span>Updated</span><strong>{item.updated_at}</strong></div>
              <StatusPill>{item.status}</StatusPill>
              <div className="data-card-footer"><div><span>Created by</span><strong>{item.created_by}</strong></div><div className="data-points"><strong>{item.data_points}</strong><span>Data points</span></div></div>
              <button className="card-hit" onClick={() => setSelectedData(item)} aria-label={`Open ${item.name}`} />
            </article>
          );
        })}
        {filtered.length === 0 && <EmptyState title="No data sets here yet" detail={tab === "My data" ? "Import a data set to get started." : "No data sets match your search."} />}
      </div>
      {selectedData && <DataSetDrawer dataSet={selectedData} cases={cases} canEdit={selectedData.created_by === CURRENT_USER} onClose={() => setSelectedData(null)} onBind={bindCases} onDelete={deleteDataSet} />}
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

function AgentKeysPage({ project, onToast }) {
  const [keys, setKeys] = useState([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createdKey, setCreatedKey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revoking, setRevoking] = useState(null);

  async function loadKeys() {
    if (IS_GITHUB_PAGES) {
      setError("API Key management requires the QA Orbit Server.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await apiRequest(`/api/agent-keys?project_id=${encodeURIComponent(String(project.id))}`);
      setKeys(result.agent_keys || []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadKeys(); }, [project.id]);

  async function createKey(event) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    setError("");
    try {
      const result = await apiRequest("/api/agent-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, project_id: String(project.id) }),
      });
      setCreatedKey(result);
      setName("");
      setShowCreate(false);
      await loadKeys();
      onToast(`${result.name} API key created.`);
    } catch (createError) {
      setError(createError.message);
    } finally {
      setCreating(false);
    }
  }

  async function copyCreatedKey() {
    try {
      await navigator.clipboard.writeText(createdKey.api_key);
      onToast("Local Agent API key copied to the clipboard.");
    } catch {
      onToast("Copy was blocked. Select and copy the key manually.");
    }
  }

  async function revokeKey() {
    const target = revoking;
    setRevoking(null);
    if (!target) return;
    try {
      await apiRequest(`/api/agent-keys/${target.id}`, { method: "DELETE" });
      await loadKeys();
      onToast(`${target.name} was revoked and its Agent sessions were closed.`);
    } catch (revokeError) {
      setError(revokeError.message);
    }
  }

  const activeKeys = keys.filter((key) => !key.revoked_at);
  const deviceCount = keys.reduce((total, key) => total + Number(key.agent_count || 0), 0);
  const latestUse = keys.map((key) => key.last_used_at).filter(Boolean).sort().at(-1);
  const formatDate = (value) => value ? new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Never";

  return (
    <>
      <PageHeader eyebrow="Execution access" title="Local agents" description="Create and revoke enrollment keys used by desktop Agents to authenticate and claim Run Plans."
        actions={<button className="primary-button" onClick={() => setShowCreate((open) => !open)}><Plus size={17} /> Create API key</button>} />

      <div className="agent-key-metrics">
        <article className="metric-card"><div className="metric-icon"><Key size={21} weight="duotone" /></div><div><span>Active API keys</span><strong>{activeKeys.length}</strong><small>{keys.length} total</small></div></article>
        <article className="metric-card"><div className="metric-icon blue"><Robot size={21} weight="duotone" /></div><div><span>Enrolled devices</span><strong>{deviceCount}</strong><small>Across this project</small></div></article>
        <article className="metric-card"><div className="metric-icon green"><Clock size={21} weight="duotone" /></div><div><span>Last Agent activity</span><strong className="metric-date">{latestUse ? formatDate(latestUse).split(",")[0] : "—"}</strong><small>{latestUse ? formatDate(latestUse).split(",").slice(1).join(",").trim() : "No device connected"}</small></div></article>
      </div>

      {showCreate && (
        <section className="panel agent-key-create-panel">
          <div className="agent-key-create-copy"><div className="local-agent-orb online"><Key size={20} weight="duotone" /></div><div><strong>Create an enrollment key</strong><span>Name the machine or deployment group that will use this key. The full secret is shown once.</span></div></div>
          <form className="agent-key-create-form" onSubmit={createKey}>
            <label><span>Key name</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. QA Lab Mac mini" maxLength="120" /></label>
            <button type="button" className="secondary-button" onClick={() => setShowCreate(false)}>Cancel</button>
            <button className="primary-button" disabled={!name.trim() || creating}>{creating ? "Creating…" : "Create key"}</button>
          </form>
        </section>
      )}

      {createdKey && (
        <section className="agent-key-secret" role="status">
          <div className="agent-key-secret-heading"><CheckCircle size={22} weight="fill" /><div><strong>Copy this API key now</strong><span>For security, QA Orbit will not display the full value again.</span></div><button className="icon-button" onClick={() => setCreatedKey(null)} aria-label="Hide API key"><X size={17} /></button></div>
          <div className="agent-key-secret-value"><code>{createdKey.api_key}</code><button className="secondary-button" onClick={copyCreatedKey}><Copy size={16} /> Copy</button></div>
          <small>Paste this value into the Local Agent Connection page with this Server URL: <code>{window.location.origin}</code></small>
        </section>
      )}

      {error && <div className="agent-key-error"><Warning size={18} weight="fill" /><span>{error}</span><button className="text-button" onClick={loadKeys}>Retry</button></div>}

      <section className="panel agent-key-list-panel">
        <div className="panel-heading"><div><span className="panel-kicker">Project credentials</span><h2>Agent API keys</h2></div><StatusPill>{loading ? "Loading" : `${activeKeys.length} active`}</StatusPill></div>
        {loading ? <div className="empty-state"><ArrowClockwise size={25} /><strong>Loading API keys…</strong></div> : keys.length ? (
          <div className="table-wrap"><table className="data-table agent-key-table"><thead><tr><th>Name</th><th>Key prefix</th><th>Devices</th><th>Created</th><th>Last used</th><th>Status</th><th aria-label="Actions" /></tr></thead><tbody>
            {keys.map((key) => <tr key={key.id}><td><strong className="cell-primary">{key.name}</strong><span className="cell-secondary">{key.id}</span></td><td><code>{key.key_prefix}••••••••</code></td><td>{key.agent_count || 0}</td><td>{formatDate(key.created_at)}</td><td>{formatDate(key.last_used_at)}</td><td><StatusPill>{key.revoked_at ? "Revoked" : "Active"}</StatusPill></td><td>{!key.revoked_at && <button className="danger-text-button" onClick={() => setRevoking(key)}>Revoke</button>}</td></tr>)}
          </tbody></table></div>
        ) : <div className="empty-state"><Key size={27} weight="duotone" /><strong>No Local Agent keys yet</strong><span>Create a key to connect the first desktop Agent to this project.</span></div>}
      </section>

      {revoking && <ConfirmModal title={`Revoke ${revoking.name}?`} detail="The key will stop working immediately and all Agent sessions created with it will be closed. This cannot be undone." confirmLabel="Revoke API key" onClose={() => setRevoking(null)} onConfirm={revokeKey} />}
    </>
  );
}

function SettingsPage({ project, projects, projectMerges, setProjectMerges, onToast }) {
  const [archivalOpen, setArchivalOpen] = useState(false);
  const [newSrInput, setNewSrInput] = useState("");
  const [owners, setOwners] = useState([project.owner]);
  const [editingOwners, setEditingOwners] = useState(false);
  const [newOwner, setNewOwner] = useState("");
  const [apiKey, setApiKey] = useState(() => window.localStorage.getItem(API_KEY_STORAGE) || "");
  const [apiKeyStatus, setApiKeyStatus] = useState(apiKey ? "saved" : "empty");
  const [apiKeyBusy, setApiKeyBusy] = useState(false);
  const mergedSrs = projectMerges[project.id] || [];

  async function saveApiKey() {
    const value = apiKey.trim();
    if (!value) {
      window.localStorage.removeItem(API_KEY_STORAGE);
      setApiKeyStatus("empty");
      onToast("DeepSeek API key removed from this browser.");
      return;
    }
    setApiKeyBusy(true);
    setApiKeyStatus("checking");
    try {
      const result = IS_GITHUB_PAGES ? await (async () => {
        const response = await fetch("https://api.deepseek.com/models", { headers: { Authorization: `Bearer ${value}` } });
        if (!response.ok) throw new Error(response.status === 401 ? "DeepSeek rejected this API key." : "DeepSeek could not verify this API key right now.");
        return { model: "deepseek-v4-flash" };
      })() : await apiRequest("/api/config/validate", { method: "POST", headers: { "X-DeepSeek-API-Key": value } });
      window.localStorage.setItem(API_KEY_STORAGE, value);
      setApiKeyStatus("valid");
      onToast(`DeepSeek API key verified for ${result.model || "the import agent"}.`);
    } catch (validationError) {
      setApiKeyStatus("invalid");
      onToast(validationError.message);
    } finally {
      setApiKeyBusy(false);
    }
  }

  function updateMergedSrs(next) {
    setProjectMerges((current) => ({ ...current, [project.id]: next }));
  }

  function addMergedSr(sr) {
    const trimmed = sr.trim();
    if (!trimmed) return;
    if (trimmed === project.sr) {
      onToast(`${trimmed} is already the primary SR for this project.`);
      return;
    }
    if (mergedSrs.includes(trimmed)) {
      onToast(`${trimmed} is already merged into this project.`);
      return;
    }
    const owner = projects.find((item) => item.sr === trimmed);
    if (owner && owner.id !== project.id) {
      onToast(`${trimmed} is the primary SR for ${owner.name}. Remove it there first or use a new SR ID.`);
      return;
    }
    updateMergedSrs([...mergedSrs, trimmed]);
    onToast(`${trimmed} now routes to ${project.name} from the project selector.`);
  }

  function removeMergedSr(sr) {
    updateMergedSrs(mergedSrs.filter((item) => item !== sr));
    onToast(`${sr} is no longer merged into ${project.name}.`);
  }

  function addOwner() {
    const value = newOwner.trim();
    if (!value) return;
    if (owners.includes(value)) {
      onToast(`${value} is already an owner.`);
      return;
    }
    setOwners([...owners, value]);
    setNewOwner("");
    onToast(`${value} added as project owner.`);
  }

  function removeOwner(name) {
    if (owners.length <= 1) {
      onToast("At least one owner is required.");
      return;
    }
    setOwners(owners.filter((item) => item !== name));
    onToast(`${name} removed from owners.`);
  }

  function handleAddFromInput() {
    const value = newSrInput.trim();
    if (!value) return;
    addMergedSr(value);
    setNewSrInput("");
  }

  const availableSrSuggestions = projects
    .filter((item) => item.id !== project.id)
    .flatMap((item) => {
      const aliases = projectMerges[item.id] || [];
      return [{ sr: item.sr, projectName: item.name, primary: true }, ...aliases.map((sr) => ({ sr, projectName: item.name, primary: false }))];
    })
    .filter(({ sr }) => !mergedSrs.includes(sr) && sr !== project.sr);

  return (
    <>
      <PageHeader eyebrow="Project administration" title="Project settings" description={`Project identity, SR ownership and merged SR routing for ${project.name}.`}
        actions={<button className="secondary-button" onClick={() => onToast("Project changes saved.")}><Check size={17} /> Save changes</button>} />
      <div className="settings-layout">
        <section className="panel settings-panel" key={project.id}>
          <div className="panel-heading"><div><span className="panel-kicker">Project info</span><h2>Identity & ownership</h2></div><StatusPill>{project.status}</StatusPill></div>
          <div className="settings-form">
            <label><span>Project name</span><input defaultValue={project.name} /></label>
            <label><span>Description</span><textarea defaultValue={project.description} /></label>
            <div className="form-row"><label><span>BU</span><input defaultValue={project.bu} disabled /></label><label><span>SR</span><input defaultValue={project.sr} disabled /></label></div>
            <label><span>Project owners</span>
              <div className="owner-list">
                {owners.map((name) => (
                  <div className="owner-row" key={name}>
                    <div className="avatar">{name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</div>
                    <strong>{name}</strong>
                    {editingOwners && owners.length > 1 && (
                      <button className="danger-text-button" onClick={() => removeOwner(name)} aria-label={`Remove ${name}`}><X size={14} /> Remove</button>
                    )}
                  </div>
                ))}
                {editingOwners && (
                  <div className="owner-add-row">
                    <input value={newOwner} onChange={(event) => setNewOwner(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addOwner(); }} placeholder="Enter owner name" />
                    <button className="primary-button compact" disabled={!newOwner.trim()} onClick={addOwner}><Plus size={14} /> Add</button>
                  </div>
                )}
              </div>
              <button className="text-button" onClick={() => { setEditingOwners(!editingOwners); setNewOwner(""); }}>{editingOwners ? "Done" : "Edit owner"}</button>
            </label>
          </div>
        </section>
        <section className="panel merge-panel">
          <div className="panel-heading"><div><span className="panel-kicker">SR routing</span><h2>Merge SR</h2></div><StatusPill>{mergedSrs.length} merged</StatusPill></div>
          <div className="merge-summary">
            <Users size={18} weight="duotone" />
            <span>Select any merged SR from the top project selector and it routes here. The primary SR <strong>{project.sr}</strong> is always routed to {project.name}.</span>
          </div>
          <div className="merge-section">
            <div className="merge-section-heading"><strong>Primary SR</strong><span>Always routes to this project</span></div>
            <div className="merged-sr-row primary">
              <div className="merged-sr-meta"><strong>{project.sr}</strong><span>Project identifier · read-only</span></div>
              <StatusPill tone="info">Primary</StatusPill>
            </div>
          </div>
          <div className="merge-section">
            <div className="merge-section-heading"><strong>Merged SRs</strong><span>{mergedSrs.length} additional SR{mergedSrs.length === 1 ? "" : "s"} route to this project</span></div>
            {mergedSrs.length > 0 ? (
              <div className="merged-sr-list">
                {mergedSrs.map((sr) => (
                  <div className="merged-sr-row" key={sr}>
                    <div className="merged-sr-meta"><strong>{sr}</strong><span>Alias for {project.name}</span></div>
                    <div className="merged-sr-actions">
                      <StatusPill tone="success">Merged</StatusPill>
                      <button className="danger-text-button" onClick={() => removeMergedSr(sr)} aria-label={`Unmerge ${sr}`}><X size={14} /> Unmerge</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="merge-empty"><Info size={18} /><span>No merged SRs yet. Add one below.</span></div>
            )}
          </div>
          <div className="merge-section">
            <div className="merge-section-heading"><strong>Add SR</strong><span>Type a new SR ID or pick one from another project</span></div>
            <div className="merge-add-row">
              <label className="search-field full">
                <Key size={16} />
                <input value={newSrInput} onChange={(event) => setNewSrInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") handleAddFromInput(); }} placeholder="e.g. SR-2501" />
              </label>
              <button className="primary-button compact" disabled={!newSrInput.trim()} onClick={handleAddFromInput}><Plus size={14} /> Merge SR</button>
            </div>
            {availableSrSuggestions.length > 0 && (
              <div className="available-sr-list">
                <div className="available-sr-heading"><span>Available from other projects</span><span>{availableSrSuggestions.length} suggestion{availableSrSuggestions.length === 1 ? "" : "s"}</span></div>
                {availableSrSuggestions.map(({ sr, projectName, primary }) => (
                  <div className="available-sr-row" key={`${projectName}-${sr}`}>
                    <div className="available-sr-meta"><strong>{sr}</strong><span>{primary ? "Primary" : "Merged"} · {projectName}</span></div>
                    <button className="secondary-button compact" onClick={() => addMergedSr(sr)}><Plus size={13} /> Merge</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
      <section className="panel api-key-panel">
        <div className="panel-heading"><div><span className="panel-kicker">Import agent</span><h2>DeepSeek API key</h2></div><StatusPill tone={apiKeyStatus === "valid" ? "success" : apiKeyStatus === "invalid" ? "danger" : "info"}>{apiKeyStatus === "valid" ? "Verified" : apiKeyStatus === "invalid" ? "Invalid" : apiKey ? "Saved" : "Not configured"}</StatusPill></div>
        <div className="api-key-content">
          <div className="api-key-copy"><Key size={20} weight="duotone" /><div><strong>Use your own key for AI-assisted imports</strong><span>The key stays in this browser and is sent only with import-agent requests. It is never written to the project database or source code.</span></div></div>
          <div className="api-key-controls">
            <label><span>API key</span><input type="password" autoComplete="off" value={apiKey} onChange={(event) => { setApiKey(event.target.value); setApiKeyStatus(event.target.value.trim() ? "saved" : "empty"); }} placeholder="sk-…" aria-label="DeepSeek API key" /></label>
            <button className="primary-button" disabled={apiKeyBusy} onClick={saveApiKey}><Check size={16} /> {apiKeyBusy ? "Verifying…" : apiKey.trim() ? "Save & verify" : "Remove key"}</button>
          </div>
        </div>
      </section>
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
  const targetName = typeof target === "string" ? target : target.name || target.title || target.case_title || "Test run";
  const [agentError, setAgentError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [application, setApplication] = useState(applications[0]?.name || "");
  const [environment, setEnvironment] = useState("UAT");
  const [captureScreenshots, setCaptureScreenshots] = useState(true);
  const [instructions, setInstructions] = useState(`Execute the QA Orbit test: ${targetName}. Verify the expected outcome and report any failure with clear evidence.`);

  async function start() {
    setSubmitting(true);
    setAgentError("");
    try {
      await onStart({
        application,
        environment,
        instructions,
        captureScreenshots,
      });
    } catch (error) {
      setAgentError(error.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-layer" role="dialog" aria-modal="true">
      <button className="modal-backdrop" onClick={onClose} aria-label="Close run configuration" />
      <section className="modal-card run-modal">
        <div className="modal-header"><div><span className="eyebrow">{type}</span><h2>Configure execution</h2></div><IconButton label="Close" onClick={onClose}><X size={20} /></IconButton></div>
        <div className="run-target"><div className="run-target-icon"><Play size={18} weight="fill" /></div><div><span>{type}</span><strong>{targetName}</strong></div></div>
        {isRerun && <div className="inline-notice"><Info size={18} /><span>Uses the latest case and script with the original application, build, environment and test data snapshot.</span></div>}
        <div className="modal-form">
          <div className="agent-connection ready"><span className="agent-connection-dot" /><div><strong>Execution Agent Server</strong><small>{agentError || "The server will create an immutable Run Plan and assign it to an authenticated Local Agent."}</small></div><StatusPill tone="info">Server queue</StatusPill></div>
          <label><span>Application</span><select value={application} onChange={(event) => setApplication(event.target.value)} disabled={isRerun}>{applications.map((app) => <option key={app.id}>{app.name}</option>)}</select></label>
          <div className="form-row"><label><span>Version / build</span><select disabled={isRerun}><option>v8.12.0-rc3</option><option>v8.12.0-rc2</option></select></label><label><span>Environment</span><select value={environment} onChange={(event) => setEnvironment(event.target.value)} disabled={isRerun}><option>UAT</option><option>SIT</option><option>PROD-SIM</option></select></label></div>
          <label><span>Test data</span><select disabled={isRerun}><option>CLAIMS_HAPPY_PATH_V3 · Data point 01</option><option>OCR_MULTI_PAGE_INVOICES · Data point 02</option></select></label>
          <label><span>Agent instructions</span><textarea rows="4" value={instructions} onChange={(event) => setInstructions(event.target.value)} /></label>
          <label className="checkbox-row"><input type="checkbox" checked={captureScreenshots} onChange={(event) => setCaptureScreenshots(event.target.checked)} /><span>Capture screenshots on failure</span></label>
        </div>
        <div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={submitting || !instructions.trim()} onClick={start}><Play size={16} weight="fill" /> {submitting ? "Creating Run Plan…" : "Create Run Plan"}</button></div>
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
  const [projectMerges, setProjectMerges] = useState(null);
  const [selectedSr, setSelectedSr] = useState("");

  useEffect(() => {
    if (!data || setCaseMemberships) return;
    setSetCaseMemberships(Object.fromEntries(data.sets.map((set) => [set.id, data.setCases.filter((item) => item.set_id === set.id).map((item) => item.case_id)])));
  }, [data, setCaseMemberships]);

  useEffect(() => {
    if (data && !caseRecords) setCaseRecords(data.cases);
  }, [data, caseRecords]);

  useEffect(() => {
    if (!data || projectMerges) return;
    setProjectMerges(Object.fromEntries(data.projects.map((project) => [project.id, parseMergedSrs(project.merged_srs)])));
  }, [data, projectMerges]);

  useEffect(() => {
    if (!data || selectedSr || !projectMerges) return;
    setSelectedSr(data.projects[0]?.sr || "");
  }, [data, projectMerges, selectedSr]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!data || !setCaseMemberships || !caseRecords || !projectMerges) return <LoadingScreen error={error} />;

  const resolveProject = (sr) => {
    if (!sr) return null;
    return (
      data.projects.find((project) => project.sr === sr) ||
      data.projects.find((project) => (projectMerges[project.id] || []).includes(sr)) ||
      null
    );
  };
  const currentProject = resolveProject(selectedSr) || data.projects[0];
  const handleSelectSr = (sr) => {
    setSelectedSr(sr);
    const resolved = resolveProject(sr);
    if (resolved && resolved.id !== data.projects[0].id) {
      // No-op for now; future pages could react to project changes.
    }
  };

  const pageContent = {
    dashboard: <Dashboard data={data} onViewRuns={() => setPage("runs")} />,
    runs: <TestRunsPage data={data} onRun={(target, type) => setRunModal({ target, type })} onToast={setToast} />,
    plans: <PlansPage plans={data.plans} sets={data.sets} cases={caseRecords} setCaseMemberships={setCaseMemberships} planSets={data.planSets} planCases={data.planCases} planCaseExclusions={data.planCaseExclusions} onRun={(target, type) => setRunModal({ target, type })} onToast={setToast} />,
    sets: <SetsPage sets={data.sets} cases={caseRecords} setCaseMemberships={setCaseMemberships} setSetCaseMemberships={setSetCaseMemberships} onRun={(target, type) => setRunModal({ target, type })} onToast={setToast} />,
    cases: <CasesPage cases={caseRecords} setCases={setCaseRecords} dataSets={data.dataSets} onRun={(target, type) => setRunModal({ target, type })} onToast={setToast} />,
    generate: <CaseGenerationPage key={currentProject.id} project={currentProject} cases={caseRecords} onAdd={(generated) => { setCaseRecords((current) => [...current, ...generated]); setPage("cases"); }} onToast={setToast} />,
    data: <DataPage dataSets={data.dataSets} cases={caseRecords} setCases={setCaseRecords} onToast={setToast} />,
    apps: <AppsPage applications={data.applications} onToast={setToast} />,
    agents: <AgentKeysPage key={currentProject.id} project={currentProject} onToast={setToast} />,
    security: <SecurityPage securityRules={data.securityRules} onToast={setToast} />,
    settings: <SettingsPage key={currentProject.id} project={currentProject} projects={data.projects} projectMerges={projectMerges} setProjectMerges={setProjectMerges} onToast={setToast} />,
  }[page];

  return (
    <div className={`app-shell ${collapsed ? "nav-collapsed" : ""}`}>
      <Sidebar page={page} setPage={setPage} collapsed={collapsed} setCollapsed={setCollapsed} />
      <div className="workspace">
        <Topbar projects={data.projects} projectMerges={projectMerges} selectedSr={selectedSr} onSelectSr={handleSelectSr} archivedVisible={archivedVisible} setArchivedVisible={setArchivedVisible} />
        <main className="page-content">{pageContent}</main>
      </div>
      {runModal && <RunModal target={runModal.target} type={runModal.type} applications={data.applications} onClose={() => setRunModal(null)} onStart={async (run) => {
        const result = await createServerRun({
          target: runTargetPayload(runModal.target, runModal.type),
          application: run.application,
          environment: run.environment,
          build: "v8.12.0-rc3",
          instructions: run.instructions,
          capture_screenshots: run.captureScreenshots,
          headless: false,
          max_steps: 50,
          allowed_domains: [],
          execution_target: "local_agent",
        });
        setRunModal(null);
        setToast(`Run Plan ${result.run_plan.id.slice(0, 11)} queued on the server.`);
        setPage("runs");
      }} />}
      {toast && <div className="toast"><CheckCircle size={19} weight="fill" /><span>{toast}</span><button onClick={() => setToast("")} aria-label="Dismiss"><X size={16} /></button></div>}
    </div>
  );
}
