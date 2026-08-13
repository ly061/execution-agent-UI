import json
import os
import sqlite3

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(ROOT, "public", "mock-data.sqlite")

os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
if os.path.exists(DB_PATH):
    os.remove(DB_PATH)

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

cur.executescript(
    """
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      sr TEXT,
      bu TEXT NOT NULL,
      owner TEXT NOT NULL,
      status TEXT NOT NULL,
      description TEXT,
      merged_srs TEXT
    );

    CREATE TABLE plans (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      release TEXT,
      set_count INTEGER,
      case_count INTEGER,
      pass_rate INTEGER,
      environment TEXT,
      build TEXT,
      status TEXT,
      updated_at TEXT
    );

    CREATE TABLE test_sets (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      case_count INTEGER,
      case_type TEXT,
      build TEXT,
      updated_at TEXT,
      status TEXT
    );

    CREATE TABLE plan_sets (
      plan_id INTEGER NOT NULL,
      set_id INTEGER NOT NULL,
      PRIMARY KEY (plan_id, set_id)
    );

    CREATE TABLE plan_cases (
      plan_id INTEGER NOT NULL,
      case_id INTEGER NOT NULL,
      PRIMARY KEY (plan_id, case_id)
    );

    CREATE TABLE plan_case_exclusions (
      plan_id INTEGER NOT NULL,
      case_id INTEGER NOT NULL,
      PRIMARY KEY (plan_id, case_id)
    );

    CREATE TABLE set_cases (
      set_id INTEGER NOT NULL,
      case_id INTEGER NOT NULL,
      PRIMARY KEY (set_id, case_id)
    );

    CREATE TABLE cases (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      case_type TEXT,
      priority TEXT,
      test_set TEXT,
      automation TEXT,
      status TEXT,
      updated_at TEXT,
      preconditions TEXT,
      test_steps TEXT,
      test_data TEXT,
      expected_result TEXT
    );

    CREATE TABLE runs (
      id INTEGER PRIMARY KEY,
      task_id TEXT,
      run_id TEXT,
      case_id INTEGER,
      case_title TEXT,
      plan_name TEXT,
      set_name TEXT,
      application TEXT,
      build TEXT,
      environment TEXT,
      executor TEXT,
      executed_by TEXT,
      execution_time TEXT,
      duration TEXT,
      state TEXT,
      result TEXT,
      attempt INTEGER,
      log_text TEXT
    );

    CREATE TABLE data_sets (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      workspace TEXT,
      source_type TEXT,
      status TEXT,
      data_points INTEGER,
      created_by TEXT,
      updated_at TEXT,
      preview_json TEXT
    );

    CREATE TABLE applications (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT,
      account TEXT,
      versions TEXT,
      environments TEXT,
      status TEXT
    );

    CREATE TABLE executors (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT,
      current_task TEXT,
      queue_size INTEGER,
      last_active TEXT
    );

    CREATE TABLE queue (
      id INTEGER PRIMARY KEY,
      task_id TEXT,
      object_type TEXT,
      object_name TEXT,
      application TEXT,
      environment TEXT,
      submitted_by TEXT,
      submitted_at TEXT,
      status TEXT
    );

    CREATE TABLE members (
      id INTEGER PRIMARY KEY,
      name TEXT,
      email TEXT,
      role TEXT,
      joined_at TEXT
    );

    CREATE TABLE security_rules (
      id INTEGER PRIMARY KEY,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      setting TEXT,
      tone TEXT,
      enabled INTEGER NOT NULL
    );
    """
)

cur.executemany("INSERT INTO projects VALUES (?,?,?,?,?,?,?,?)", [
    (1, "Digital Claims Modernization", "SR-2451", "MY", "Maya Chen", "Active", "End-to-end quality workspace for the MY claims modernization release train.", '["SR-2480", "SR-2492"]'),
    (2, "Partner Onboarding Revamp", "SR-2478", "MY", "Leo Wong", "Active", "Partner onboarding automation and regression coverage.", None),
    (3, "Legacy Billing Sunset", "SR-2399", "MY", "Nora Lim", "Archived", "Historical project retained for audit and result lookup.", None),
])

cur.executemany("INSERT INTO plans VALUES (?,?,?,?,?,?,?,?,?,?)", [
    (1, "August Release Regression", "2026.08", 4, 128, 91, "UAT", "v8.12.0-rc3", "In progress", "11 Aug 2026, 09:42"),
    (2, "Claims API Smoke", "2026.08", 2, 36, 97, "SIT", "v8.12.0-rc2", "Completed", "10 Aug 2026, 18:10"),
    (3, "Mobile Critical Journey", "2026.07", 3, 54, 88, "UAT", "mobile-5.6.1", "Attention", "09 Aug 2026, 14:26"),
    (4, "July Release Regression", "2026.07", 5, 142, 96, "PROD-SIM", "v8.11.4", "Completed", "31 Jul 2026, 20:14"),
])

cur.executemany("INSERT INTO test_sets VALUES (?,?,?,?,?,?,?)", [
    (1, "Claims submission — Web", 32, "Web", "v8.12.0-rc3", "11 Aug 2026, 09:18", "Ready"),
    (2, "Document upload & OCR", 24, "Web / API", "v8.12.0-rc3", "10 Aug 2026, 17:52", "Ready"),
    (3, "Partner authorization", 18, "API", "v8.12.0-rc2", "10 Aug 2026, 12:06", "Ready"),
    (4, "Mobile claim tracking", 28, "Mobile", "mobile-5.6.1", "09 Aug 2026, 14:02", "Needs review"),
    (5, "Payment reconciliation", 26, "Web / API", "v8.11.4", "31 Jul 2026, 18:47", "Ready"),
])

cur.executemany("INSERT INTO plan_sets VALUES (?,?)", [
    (1, 1), (1, 2), (1, 3), (1, 4),
    (2, 2), (2, 3),
    (3, 4),
    (4, 1), (4, 2), (4, 3), (4, 4), (4, 5),
])

cur.executemany("INSERT INTO plan_cases VALUES (?,?)", [
    (2, 168109),
    (3, 163924), (3, 168443),
])

cur.executemany("INSERT INTO cases VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", [
    (163924, "Submit a motor claim with complete evidence", "Web", "P0", "Claims submission — Web", "Automated", "Active", "11 Aug 2026", "User is authenticated and policy is active.", "1. Open New Claim\n2. Complete incident details\n3. Upload evidence\n4. Submit", "CLAIMS_HAPPY_PATH_V3", "Claim is created and a reference number is displayed."),
    (164205, "Validate OCR response for multi-page invoice", "API", "P1", "Document upload & OCR", "Automated", "Active", "11 Aug 2026", "OCR service and Claims API are available.", "1. Upload multi-page invoice\n2. Poll OCR result\n3. Validate confidence score", "OCR_MULTI_PAGE_INVOICES", "OCR response returns all pages with confidence score at least 0.90."),
    (165834, "Reject unsupported document type", "Web", "P1", "Document upload & OCR", "Automated", "Active", "10 Aug 2026", "User is on the evidence upload step.", "1. Select an unsupported file\n2. Attempt upload", "DMS_SIT_DATA", "Upload is blocked and a validation message is shown."),
    (166627, "Create claim using partner delegated token", "API", "P0", "Partner authorization", "Automated", "Active", "10 Aug 2026", "Partner account and delegated token are valid.", "1. Request delegated token\n2. POST a new claim\n3. Validate response", "PARTNER_DELEGATED_TOKENS", "Claim is created with HTTP 201."),
    (167011, "Track claim status from mobile home", "Mobile", "P1", "Mobile claim tracking", "Manual", "Active", "09 Aug 2026", "User has an existing submitted claim.", "1. Sign in\n2. Open Home\n3. Select claim card", "MY_PERSONAL_SANDBOX", "Current claim status and latest update are displayed."),
    (167822, "Resume an interrupted mobile submission", "Mobile", "P2", "Mobile claim tracking", "Automated", "Active", "09 Aug 2026", "A draft claim exists on the device.", "1. Relaunch app\n2. Open draft\n3. Resume submission", "MOBILE_INTERRUPTED_SESSION", "The draft resumes from the last completed step."),
    (168109, "Reconcile partial payment against reserve", "API", "P1", "Payment reconciliation", "Automated", "Active", "08 Aug 2026", "A claim reserve and partial payment exist.", "1. Submit payment\n2. Fetch reserve\n3. Compare balances", "DMS_SIT_DATA", "Remaining reserve equals original reserve minus payment."),
    (168443, "Display validation summary for missing fields", "Web", "P2", "Claims submission — Web", "Manual", "Draft", "08 Aug 2026", "User is on the claim review page.", "1. Leave required fields empty\n2. Select Submit", "CLAIMS_HAPPY_PATH_V3", "Validation summary lists every missing required field."),
])

cur.executemany("INSERT INTO set_cases VALUES (?,?)", [
    (1, 163924), (1, 168443),
    (2, 164205), (2, 165834), (2, 168443),
    (3, 166627),
    (4, 167011), (4, 167822),
    (5, 168109),
])

cur.executemany("INSERT INTO runs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [
    (1, "T-163924", "R-4821", 163924, "Submit a motor claim with complete evidence", "August Release Regression", "Claims submission — Web", "Claims Portal", "v8.12.0-rc3", "UAT", "exec-mac-04", "Maya Chen", "11 Aug 2026, 09:41", "04m 12s", "Completed", "Passed", 1, "09:41:02 Session initialized\n09:41:11 Evidence uploaded\n09:44:58 Claim created: CLM-908234\n09:45:14 Assertion passed"),
    (2, "T-164205", "R-4821", 164205, "Validate OCR response for multi-page invoice", "August Release Regression", "Document upload & OCR", "Claims API", "v8.12.0-rc3", "UAT", "exec-linux-12", "Maya Chen", "11 Aug 2026, 09:41", "00m 38s", "Completed", "Failed", 2, "09:41:04 Request accepted\n09:41:28 OCR response received\n09:41:39 Assertion failed: confidenceScore expected >= 0.90, actual 0.74"),
    (3, "T-165834", "R-4821", 165834, "Reject unsupported document type", "August Release Regression", "Document upload & OCR", "Claims Portal", "v8.12.0-rc3", "UAT", "exec-win-02", "Maya Chen", "11 Aug 2026, 09:42", "00m 29s", "Completed", "Passed", 1, "09:42:01 Uploaded EXE attachment\n09:42:09 Validation banner displayed\n09:42:30 Assertion passed"),
    (4, "T-166627", "R-4821", 166627, "Create claim using partner delegated token", "August Release Regression", "Partner authorization", "Partner Gateway", "v4.8.2", "UAT", "exec-linux-09", "Maya Chen", "11 Aug 2026, 09:42", "01m 06s", "Completed", "Failed", 1, "09:42:10 Token issued\n09:42:34 POST /claims returned 403\n09:43:16 Expected 201, received 403"),
    (5, "T-167011", "R-4821", 167011, "Track claim status from mobile home", "Mobile Critical Journey", "Mobile claim tracking", "Claims Mobile", "mobile-5.6.1", "UAT", "exec-ios-07", "Leo Wong", "11 Aug 2026, 09:43", "02m 11s", "Running", "Running", 1, "09:43:02 Device allocated\n09:43:27 User signed in\n09:44:03 Claim card opened"),
    (6, "T-167822", "R-4822", 167822, "Resume an interrupted mobile submission", "Mobile Critical Journey", "Mobile claim tracking", "Claims Mobile", "mobile-5.6.1", "UAT", "exec-android-03", "Leo Wong", "11 Aug 2026, 09:45", "—", "Queued", "Queued", 1, "Waiting for available Android executor"),
])

cur.executemany("INSERT INTO data_sets VALUES (?,?,?,?,?,?,?,?,?)", [
    (62510, "CLAIMS_HAPPY_PATH_V3", "Team Workspace", "File", "Imported", 6, "data.owner01@demo.com", "14 Jul 2026, 10:43", json.dumps([
        {"policy_number": "POL-2026-10031", "claimant_name": "Demo Customer 01", "email": "claimant01@demo.com", "incident_type": "Motor collision", "estimated_loss": "12500.00"},
        {"policy_number": "POL-2026-10044", "claimant_name": "Demo Customer 02", "email": "claimant02@demo.com", "incident_type": "Windscreen damage", "estimated_loss": "840.00"},
    ])),
    (60914, "OCR_MULTI_PAGE_INVOICES", "Team Workspace", "File", "Imported", 6, "data.owner02@demo.com", "10 Jul 2026, 17:22", json.dumps([
        {"invoice_id": "INV-DEMO-1042", "vendor": "Demo Repair Services", "contact_email": "billing01@demo.com", "pages": 4, "total": "3280.50"},
        {"invoice_id": "INV-DEMO-1068", "vendor": "Demo Medical Centre", "contact_email": "billing02@demo.com", "pages": 7, "total": "5110.00"},
    ])),
    (56003, "MOBILE_INTERRUPTED_SESSION", "Team Workspace", "File", "Imported", 34, "data.owner03@demo.com", "05 Jun 2026, 10:12", json.dumps([
        {"session_id": "SES-DEMO-201", "user_email": "mobile.user01@demo.com", "last_step": "Evidence upload", "device": "iPhone 16", "draft_age": "18 minutes"},
        {"session_id": "SES-DEMO-202", "user_email": "mobile.user02@demo.com", "last_step": "Incident details", "device": "Pixel 10", "draft_age": "7 minutes"},
    ])),
    (56002, "DMS_SIT_DATA", "Team Workspace", "File", "Imported", 5, "data.owner04@demo.com", "16 Jun 2026, 15:51", json.dumps([
        {"document_id": "DOC-DEMO-301", "file_name": "sample-invoice.pdf", "owner_email": "document.owner01@demo.com", "mime_type": "application/pdf", "size": "1.8 MB"},
        {"document_id": "DOC-DEMO-302", "file_name": "unsupported-demo.exe", "owner_email": "document.owner02@demo.com", "mime_type": "application/x-msdownload", "size": "420 KB"},
    ])),
    (55122, "PARTNER_DELEGATED_TOKENS", "Published", "API", "Published", 12, "data.owner05@demo.com", "02 Aug 2026, 09:35", json.dumps([
        {"partner_id": "PARTNER-DEMO-01", "service_email": "partner.service01@demo.com", "scope": "claims:create", "expires_in": 3600, "token_state": "Valid"},
        {"partner_id": "PARTNER-DEMO-02", "service_email": "partner.service02@demo.com", "scope": "claims:read", "expires_in": 1800, "token_state": "Valid"},
    ])),
    (54018, "MY_PERSONAL_SANDBOX", "My Workspace", "File", "Draft", 4, "data.owner06@demo.com", "11 Aug 2026, 08:28", json.dumps([
        {"claim_id": "CLM-DEMO-401", "user_email": "sandbox.user01@demo.com", "status": "Submitted", "channel": "Mobile", "last_updated": "11 Aug 2026, 08:20"},
        {"claim_id": "CLM-DEMO-402", "user_email": "sandbox.user02@demo.com", "status": "Under review", "channel": "Web", "last_updated": "11 Aug 2026, 08:24"},
    ])),
])

cur.executemany("INSERT INTO applications VALUES (?,?,?,?,?,?,?)", [
    (1, "Claims Portal", "https://claims-uat.example.com", "qa.claims.web", "v8.12.0-rc3, v8.12.0-rc2, v8.11.4", "SIT, UAT, PROD-SIM", "Healthy"),
    (2, "Claims API", "https://api-claims-uat.example.com", "svc.qa.claims", "v8.12.0-rc3, v8.12.0-rc2", "SIT, UAT", "Healthy"),
    (3, "Claims Mobile", "aia-claims://uat", "mobile.qa.user", "mobile-5.6.1, mobile-5.5.8", "SIT, UAT", "Healthy"),
    (4, "Partner Gateway", "https://partner-uat.example.com", "svc.qa.partner", "v4.8.2, v4.7.9", "SIT, UAT", "Attention"),
])

cur.executemany("INSERT INTO executors VALUES (?,?,?,?,?,?)", [
    (1, "exec-mac-04", "Idle", "—", 0, "12 sec ago"),
    (2, "exec-linux-12", "Running", "T-164205", 2, "Now"),
    (3, "exec-win-02", "Idle", "—", 0, "21 sec ago"),
    (4, "exec-ios-07", "Running", "T-167011", 1, "Now"),
    (5, "exec-android-03", "Offline", "—", 3, "18 min ago"),
])

cur.executemany("INSERT INTO queue VALUES (?,?,?,?,?,?,?,?,?)", [
    (1, "T-167822", "Test Case", "Resume an interrupted mobile submission", "Claims Mobile", "UAT", "Leo Wong", "11 Aug 2026, 09:45", "Queued"),
    (2, "T-168109", "Test Case", "Reconcile partial payment against reserve", "Claims API", "SIT", "Maya Chen", "11 Aug 2026, 09:46", "Queued"),
    (3, "T-168443", "Test Case", "Display validation summary for missing fields", "Claims Portal", "UAT", "Nora Lim", "11 Aug 2026, 09:47", "Queued"),
])

cur.executemany("INSERT INTO members VALUES (?,?,?,?,?)", [
    (1, "Maya Chen", "project.owner01@demo.com", "Owner", "14 Jan 2026"),
    (2, "Leo Wong", "project.member01@demo.com", "Member", "14 Jan 2026"),
    (3, "Nora Lim", "project.member02@demo.com", "Member", "20 Feb 2026"),
    (4, "Aria Chen", "project.member03@demo.com", "Member", "02 Mar 2026"),
])

cur.executemany("INSERT INTO security_rules VALUES (?,?,?,?,?,?,?)", [
    (1, "Access & navigation", "Domain access control", "Allowlist and blocklist for browser destinations.", "Unrestricted by default", "neutral", 0),
    (2, "Access & navigation", "Navigation guard", "Validate pre-navigation, redirects and newly opened tabs.", "Active after domain rules", "success", 1),
    (3, "Access & navigation", "Custom action scope", "Restrict each action to explicitly approved domains.", "Configure explicitly", "warning", 0),
    (4, "Network & file boundaries", "SSRF / IP protection", "Block private, loopback and encoded IP targets.", "Off by default", "neutral", 0),
    (5, "Network & file boundaries", "File read & upload boundaries", "Restrict file operations to approved paths.", "Partially built-in", "warning", 1),
    (6, "Network & file boundaries", "Safe download paths", "Sanitize names, block traversal and validate real paths.", "Built-in", "success", 1),
    (7, "Secrets & privacy", "Secret placeholder protection", "Expose placeholders to automation and inject values only at runtime.", "Sensitive data required", "neutral", 1),
    (8, "Secrets & privacy", "Domain-bound secrets", "Inject credentials only when the current domain matches policy.", "Nested scope required", "neutral", 1),
    (9, "Secrets & privacy", "Sensitive data redaction", "Redact logs, action history and saved sessions.", "Limited coverage", "neutral", 1),
    (10, "Browser isolation", "Screenshot privacy", "Block screenshot evidence from being exposed to AI processing.", "Vision usually on", "neutral", 0),
    (11, "Browser isolation", "Chromium sandbox", "Isolate browser processes where the runtime supports it.", "Environment-dependent", "neutral", 1),
    (12, "Browser isolation", "Browser security policy", "Retain same-origin, certificate and site-isolation controls.", "Security enabled", "success", 1),
    (13, "Runtime & environment", "Dedicated browser profile", "Use temporary executor-owned profiles for every run.", "Built-in by default", "success", 1),
    (14, "Runtime & environment", "Browser permission control", "Control clipboard, notifications, camera, microphone and location.", "Clipboard + notifications", "warning", 1),
    (15, "Runtime & environment", "Runaway execution protection", "Apply step caps, timeouts, loop detection and pause/stop controls.", "Default limits", "success", 1)
])

conn.commit()
conn.close()
print(DB_PATH)
