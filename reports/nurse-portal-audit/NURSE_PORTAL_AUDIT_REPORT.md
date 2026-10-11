# Swasthya Triage — Nurse Portal Functional Audit & Bug Report

**Auditor:** Senior QA Automation Engineer & React + TypeScript + FastAPI Specialist  
**Audit Target:** Nurse Portal & Bedside Clinical Triage Workflow  
**Mode:** AUDIT ONLY (No application source code or clinical rules modified)  
**Date:** October 11, 2026  
**Artifact Directory:** `reports/nurse-portal-audit/`  
**Execution Environment:** Windows 11 x64, Node.js v24+, Python 3.13 (.venv), Chrome Headless Browser Automation, Vite 8.3.0, FastAPI / Uvicorn, SQLite (`swasthya_triage.db`)

---

## Executive Summary

A comprehensive, evidence-based functional audit of the entire **Nurse Portal** in **Swasthya Triage** was executed. The audit traced all front-to-back components, routing structures, event handlers, API communications, RBAC permissions, and database operations.

Every button, menu option, filter, and interactive input was inventoried, tested, and evaluated across desktop and mobile viewports (`320px`, `360px`, `390px`, `430px`).

### Overall Audit Metrics
| Metric | Value |
|---|---|
| **Total Interactive Controls Discovered** | **31 controls** |
| **Total Controls Tested** | **31 controls** |
| **Status Breakdown** | **PASS: 19** \| **FAIL: 12** \| **BLOCKED: 0** \| **NOT TESTED: 0** |
| **Critical Severity Bugs** | **1** (Clinical Safety Failure: Missing rule for hemoptysis & respiratory distress at rest) |
| **High Severity Bugs** | **6** (Ghost Bedside Form Opacity, Queue Desync, Disappearing Evidence Note, Non-persisting Modal, Unconditional DB Status Jump, Header Badge Desync) |
| **Medium Severity Bugs** | **4** (Misleading "+ New Intake" routing, Misleading "Reviewer Queue" label, Mobile Backdrop Click Interception, Selector Scope Limitation) |
| **Low Severity Bugs** | **1** (320px nowrap button wrapping tightness) |

---

## 1. Deep Implementation Trace

### 1.1 Architecture & Component Hierarchy
```
App.tsx (MainWorkspace)
 ├── Header.tsx (Role-based Navigation, Status Chip, Trust Center, Reset, Logout, Mobile Drawer)
 └── RoleGuard.tsx (Role router -> case 'NURSE': NursePortal)
      └── NursePortal.tsx (Manages local nurseTab state: 'queue' | 'intake' | 'summary')
           ├── 01 Triage Queue -> NurseQueueView.tsx
           │    ├── SafetyBanner.tsx
           │    ├── CaseJourney.tsx
           │    ├── Search Box & Filters ('Awaiting Triage', 'All Cases', 'Urgency Signals Only')
           │    ├── Case Queue Items (View Note, Start Triage)
           │    └── CaseReviewModal.tsx (Opened via 'Start Triage')
           ├── 02 Bedside Vitals -> BedsideIntakeView.tsx
           │    ├── SafetyBanner.tsx
           │    ├── CaseJourney.tsx
           │    ├── Case Selector & Selected Case Summary Banner
           │    ├── Section 1: Bedside Vitals & Telemetry (BP, HR, SpO2, Temp, RR, RBS)
           │    ├── Section 2: Nurse Observation (Appearance, AVPU, Breathing, Mobility, Pain, Distress)
           │    ├── Section 3: Patient Information Verification (Allergies, Meds, Chief Complaint, History)
           │    ├── Section 4: Nurse Clinical Notes Textarea
           │    ├── Section 5: Measurement Metadata Card
           │    └── Action Command Area ('Reset Vitals', 'Save Bedside Assessment', 'Save & Send to Clinical Review')
           └── 03 Evidence Note -> TriageNoteView.tsx
                ├── Case Summary Context & Urgency Badge
                ├── Multimodal Evidence Inspection (Voice, OCR, Text)
                ├── AI Clinical Advisory & Gaps Checklist
                └── Bottom Command Bar ('Return to Nursing Queue', 'Reviewer Queue', 'Send for Review')
```

### 1.2 Authentication, Roles & Permissions (RBAC)
- **Identity Provider:** Backend JWT authentication (`POST /api/auth/login`) verified by `server/app/utils/security.py` and demo proxy `src/server/authProxyHandler.ts`.
- **Authorized Account:** `nurse_priya` / `nursepassword123` (`Nurse Priya Nair, RN`, Role: `NURSE`, User ID: `usr_nur_01`).
- **Permissions:**
  - Allowed: Read cases (`GET /api/intake`), read case details (`GET /api/intake/{id}`), create bedside assessment (`POST /api/cases/{id}/bedside-assessment`), send case for review (`POST /api/cases/{id}/send-to-review`).
  - Prohibited: Doctor clinical sign-off (`POST /api/review/{id}/decision` returns `HTTP 403 Forbidden`), case permanent deletion (`DELETE /api/cases/{id}` returns `HTTP 403 Forbidden`).

---

## 2. Complete Button & Control Inventory

| Control ID | Control Name | Page / View | Source File | Expected Behavior | Actual Behavior | Status | Severity |
|---|---|---|---|---|---|---|---|
| **CTRL-HDR-01** | Nurse Role Badge | Global Header | `src/components/Layout/Header.tsx` | Displays `NURSE` badge in header | Verified: displays `NURSE` badge | **PASS** | Low |
| **CTRL-HDR-02** | Nursing Queue Tab & Badge | Global Header | `src/components/Layout/Header.tsx` | Navigates to queue; badge shows awaiting nurse triage count | Badge displays doctor queue count (`awaiting_review`) instead of nurse queue (`awaiting_nursing_triage`) | **FAIL** | High |
| **CTRL-HDR-03** | Trust Center Button | Global Header | `src/components/Layout/Header.tsx` | Opens Privacy & Governance modal | Modal opens and closes properly | **PASS** | Low |
| **CTRL-HDR-04** | Reset Workspace Button | Global Header | `src/components/Layout/Header.tsx` | Reloads DB cases and resets audit cache | Clears logs and calls `loadCases()` | **PASS** | Low |
| **CTRL-HDR-05** | Logout Button | Global Header | `src/components/Layout/Header.tsx` | Terminates session; redirects to login | Clears session and returns to login | **PASS** | Low |
| **CTRL-HDR-06** | Mobile Menu Toggle (Hamburger) | Global Header (Mobile) | `src/components/Layout/Header.tsx` | Opens/closes mobile navigation drawer | Opens drawer, but backdrop (`z-index: 1000`) overlays header button (`z-index: 60`), intercepting tap-to-close | **FAIL** | Medium |
| **CTRL-NAV-01** | `01 Triage Queue` Tab | Nurse Portal Dock | `src/portals/NursePortal/NursePortal.tsx` | Displays triage queue view | Switches active view to queue | **PASS** | Low |
| **CTRL-NAV-02** | `02 Bedside Vitals` Tab | Nurse Portal Dock | `src/portals/NursePortal/NursePortal.tsx` | Displays bedside vitals workstation | Switches active view to bedside intake | **PASS** | Low |
| **CTRL-NAV-03** | `03 Evidence Note` Tab | Nurse Portal Dock | `src/portals/NursePortal/NursePortal.tsx` | Displays evidence note tab for case | Conditionally hidden when `targetCase` is null; disappears whenever case moves to `awaiting_review` | **FAIL** | High |
| **CTRL-QUE-01** | Queue Search Input | `01 Triage Queue` | `src/components/NurseQueue/NurseQueueView.tsx` | Filters case list in real-time | Filters by ID, patient, and symptoms | **PASS** | Low |
| **CTRL-QUE-02** | `Awaiting Triage` Filter | `01 Triage Queue` | `src/components/NurseQueue/NurseQueueView.tsx` | Filters for `awaiting_nursing_triage` | Shows only nurse-pending cases | **PASS** | Low |
| **CTRL-QUE-03** | `All Cases` Filter | `01 Triage Queue` | `src/components/NurseQueue/NurseQueueView.tsx` | Shows all cases regardless of status | Renders all cases in database | **PASS** | Low |
| **CTRL-QUE-04** | `Urgency Signals Only` Filter | `01 Triage Queue` | `src/components/NurseQueue/NurseQueueView.tsx` | Filters cases with urgency signals | Toggles urgency filter cleanly | **PASS** | Low |
| **CTRL-QUE-05** | `+ New Intake` Button | `01 Triage Queue` | `src/components/NurseQueue/NurseQueueView.tsx` | Opens new patient intake form | Navigates to `02 Bedside Vitals` (vitals for existing patient) instead of intake form | **FAIL** | Medium |
| **CTRL-QUE-06** | `View Note` Button (Queue Row) | `01 Triage Queue` | `src/components/NurseQueue/NurseQueueView.tsx` | Opens case evidence note | If case status is `awaiting_review`, displays blank error `NO ACTIVE EVIDENCE NOTE PENDING NURSE ACTION` | **FAIL** | High |
| **CTRL-QUE-07** | `Start Triage` Button (Queue Row) | `01 Triage Queue` | `src/components/NurseQueue/NurseQueueView.tsx` | Navigates to `02 Bedside Vitals` for case | Opens Doctor `CaseReviewModal` instead of navigating to Bedside Vitals workstation | **FAIL** | High |
| **CTRL-MOD-01** | `Save Observations` Button | Case Review Modal | `src/components/MedicalReviewer/CaseReviewModal.tsx` | Saves nurse notes to case in database | Updates local component state only; no API called; notes lost on page reload | **FAIL** | High |
| **CTRL-VIT-01** | Bedside Measurement Form Workstation | `02 Bedside Vitals` | `src/components/NurseBedside/BedsideIntakeView.tsx` | Shows measurement inputs for case | Invisible (`opacity: 0 !important`) due to `.scroll-reveal` until viewport scroll or hidden if queue empty | **FAIL** | High |
| **CTRL-VIT-02** | Patient Case Selector Dropdown | `02 Bedside Vitals` | `src/components/NurseBedside/BedsideIntakeView.tsx` | Allows choosing patient for assessment | Dropdown only lists `awaiting_nursing_triage` cases; shows `(0)` if cases are in `awaiting_review` | **FAIL** | Medium |
| **CTRL-VIT-03** | Telemetry Inputs (BP, HR, SpO2, Temp, RR, RBS) | `02 Bedside Vitals` | `src/components/NurseBedside/BedsideIntakeView.tsx` | Accepts calibrated vital signs | Accepts typed values cleanly | **PASS** | Low |
| **CTRL-VIT-04** | Temperature Unit Toggle (`°F` / `°C`) | `02 Bedside Vitals` | `src/components/NurseBedside/BedsideIntakeView.tsx` | Toggles unit and updates ranges | Toggles unit and updates display | **PASS** | Low |
| **CTRL-VIT-05** | `Now` Timestamp Button | `02 Bedside Vitals` | `src/components/NurseBedside/BedsideIntakeView.tsx` | Sets timestamp to current time | Updates `measuredAt` ISO timestamp | **PASS** | Low |
| **CTRL-VIT-06** | General Appearance Option Buttons | `02 Bedside Vitals` | `src/components/NurseBedside/BedsideIntakeView.tsx` | Selects physical appearance category | Applies active styling; updates state | **PASS** | Low |
| **CTRL-VIT-07** | AVPU Consciousness Scale Buttons | `02 Bedside Vitals` | `src/components/NurseBedside/BedsideIntakeView.tsx` | Selects AVPU score | Updates AVPU score and styling | **PASS** | Low |
| **CTRL-VIT-08** | Pain Score Rating Bar (0-10) | `02 Bedside Vitals` | `src/components/NurseBedside/BedsideIntakeView.tsx` | Sets NRS 0–10 score with colors | Updates score and color badge | **PASS** | Low |
| **CTRL-VIT-09** | Visible Distress Flag Toggles | `02 Bedside Vitals` | `src/components/NurseBedside/BedsideIntakeView.tsx` | Toggles objective distress signs | Toggles flags; deselects 'None Observed' | **PASS** | Low |
| **CTRL-VIT-10** | Information Verification Buttons | `02 Bedside Vitals` | `src/components/NurseBedside/BedsideIntakeView.tsx` | Marks items Reported, Verified, or Unable | Updates status for all 4 items | **PASS** | Low |
| **CTRL-VIT-11** | Nurse Clinical Notes Textarea | `02 Bedside Vitals` | `src/components/NurseBedside/BedsideIntakeView.tsx` | Captures nurse observations text | Captures text; syncs to payload | **PASS** | Low |
| **CTRL-VIT-12** | `Reset Vitals` Button | `02 Bedside Vitals` | `src/components/NurseBedside/BedsideIntakeView.tsx` | Clears telemetry and resets defaults | Resets form fields cleanly | **PASS** | Low |
| **CTRL-VIT-13** | `Save Bedside Assessment` Button | `02 Bedside Vitals` | `src/components/NurseBedside/BedsideIntakeView.tsx` | Saves vitals to DB while keeping case in nursing triage queue | Backend unconditionally promotes status to `awaiting_review`, ejecting case from queue prematurely | **FAIL** | High |
| **CTRL-VIT-14** | `Save & Send to Clinical Review` Button | `02 Bedside Vitals` | `src/components/NurseBedside/BedsideIntakeView.tsx` | Saves vitals and promotes case to Doctor Review queue | Calls API; updates status to `awaiting_review`; case appears in Doctor Queue | **PASS** | Low |
| **CTRL-NOT-01** | `Return to Nursing Queue` Button | `03 Evidence Note` | `src/portals/NursePortal/NursePortal.tsx` | Returns to nursing queue tab | Returns to queue (`nurseTab = 'queue'`) | **PASS** | Low |
| **CTRL-NOT-02** | `Reviewer Queue` Button | `03 Evidence Note` | `src/components/TriageSummary/TriageNoteView.tsx` | Navigates to clinical review queue | Misleading label: routes nurse to Nursing Queue, not Doctor Reviewer Queue | **FAIL** | Medium |
| **CTRL-NOT-03** | `Send for Review` Button | `03 Evidence Note` | `src/components/TriageSummary/TriageNoteView.tsx` | Forwards case evidence note to Doctor Review queue | Calls `POST /api/cases/{id}/send-to-review`; creates audit log; transitions status | **PASS** | Low |
| **ISSUE-SAFE-01** | Urgency Calculation (Hemoptysis + Breathlessness) | `03 Evidence Note` | `server/app/services/rules_engine.py` | Flags case as `URGENT PRIORITY` and outputs urgency signal | Assigns `ROUTINE PRIORITY` and `NO URGENCY SIGNALS` due to missing rule and conjunct rules | **FAIL** | Critical |

---

## 3. Specifically Investigated Issues

### Issue A: Bedside Vitals Page — Cause of Empty Area / Missing Form

#### Observed Phenomenon
When navigating to `02 Bedside Vitals`, the selected case header banner is visible, but the entire area underneath appears blank and empty with no visible telemetry measurement form.

#### Root Causes Proved by Code and Runtime Evidence
The investigation confirmed a dual failure mechanism:

1. **Root Cause 1: CSS Animation Invisibility (`opacity: 0 !important`)**
   - **File:** `src/components/NurseBedside/BedsideIntakeView.tsx` (Lines 690, 1029, 1272, 1375, 1406, 1454).
   - Every card in the form is declared with the `.scroll-reveal` class:
     ```tsx
     <div className="card glass-card scroll-reveal reveal-delay-2" style={{ marginBottom: 0 }}>
     ```
   - In `src/index.css` (lines 342–351):
     ```css
     .scroll-reveal, .reveal, .fade-in {
       opacity: 0 !important;
       transform: translateY(20px) !important;
       transition: opacity 600ms cubic-bezier(0.22, 1, 0.36, 1), transform 600ms ... !important;
     }
     ```
   - When switching tabs inside `NursePortal` (`queue` -> `intake`), the container mounts dynamically. In `App.tsx`, `refreshScrollReveal()` is only triggered when top-level header `activeTab` changes, **never when `nurseTab` changes inside NursePortal**.
   - **Empirical Runtime Proof:** When queried via Playwright Chrome automation:
     ```json
     {
       "selector": ".card.glass-card.scroll-reveal",
       "visible": true,
       "computedOpacity": "0"
     }
     ```
     The elements exist in the DOM with positive heights, but their computed style is locked at `opacity: 0 !important`. To the human eye, the form is completely invisible.
   - Contrast this with the Case Context Banner (lines 521–564): It does **not** have the `.scroll-reveal` class, so it renders at `opacity: 1`, leaving a stark blank gap below it.

2. **Root Cause 2: Queue Filter Exclusion (`candidateCases` Length = 0)**
   - **File:** `src/components/NurseBedside/BedsideIntakeView.tsx` (Lines 98–103).
   - The form filters cases using:
     ```tsx
     const candidateCases = cases.filter(c => c.reviewStatus === 'awaiting_nursing_triage');
     ```
   - In the live database, when patient cases are created through deterministic processing or after any assessment save, their status is set to `awaiting_review`.
   - When `candidateCases.length === 0`, `currentCase` evaluates to `null`, rendering the fallback banner:
     ```tsx
     <h2>NO PATIENT CASES PENDING BEDSIDE ASSESSMENT</h2>
     ```
     All vitals form markup is unmounted from the DOM entirely.

---

### Issue B: Evidence Note Page — Workflow & Persistence Investigation

#### 1. "View Note" from Queue
- **Observed Behavior:** Clicking "View Note" on a case in the Nursing Queue displays:
  ```
  NO ACTIVE EVIDENCE NOTE PENDING NURSE ACTION
  Evidence note for completed patient cases has been submitted and forwarded...
  ```
- **Proven Cause:** In `NursePortal.tsx` (lines 52–54):
  ```tsx
  const targetCase = (selectedCaseForNote && selectedCaseForNote.reviewStatus === 'awaiting_nursing_triage')
    ? selectedCaseForNote
    : ((activeCase && activeCase.reviewStatus === 'awaiting_nursing_triage') ? activeCase : null);
  ```
  If a nurse attempts to review the evidence note of any case whose status is `awaiting_review` or `reviewed`, `targetCase` is forced to `null`, rendering the block message and hiding the note.

#### 2. "Reviewer Queue" Button in Evidence Note
- **Observed Behavior:** The button is labeled `Reviewer Queue`, but clicking it navigates the nurse back to the `Nursing Queue`.
- **Proven Cause:** In `NursePortal.tsx` (line 164):
  ```tsx
  onNavigateToReviewer={() => setNurseTab('queue')}
  ```
  The component passes an internal tab setter back to `'queue'`. A Nurse account does not have authorization to view the Doctor Review Queue (`DOCTOR` role required), making the button label deceptive.

#### 3. "Send for Review" Button
- **Observed Behavior:** Works correctly when `targetCase` is active.
- **Workflow & Persistence Trace:**
  1. Triggers `caseService.sendForMedicalReview(caseId, notes)`.
  2. Sends `POST /api/cases/{case_id}/send-to-review` with authorization header.
  3. Backend updates `cases.review_status = "awaiting_review"`.
  4. Records two immutable audit events (`CASE_SENT_FOR_MEDICAL_REVIEW` and `CASE_STATUS_CHANGED`).
  5. Refreshes database record and returns updated case.
  6. Case becomes visible in Doctor Review Queue (`GET /api/review/queue`).
  7. Verified persistent in SQLite (`swasthya_triage.db`).

---

### Issue C: Queue and Case Selection Investigation

1. **Queue Filters:**
   - `Awaiting Triage`: Filters strictly for `c.reviewStatus === 'awaiting_nursing_triage'`.
   - `All Cases`: Displays all cases in database regardless of status.
   - `Urgency Signals Only`: Filters for cases where `c.urgencySignals.length > 0`.
   - **Finding:** Filters work as coded, but because new cases created via local intake default to `awaiting_review`, the default `Awaiting Triage` filter frequently displays an empty queue (`NO CASES IN QUEUE`).

2. **Patient Selector in Bedside Vitals:**
   - Only lists cases where `c.reviewStatus === 'awaiting_nursing_triage'`.
   - Changing the selector updates `selectedCaseId` and triggers `bedsideService.getLatestBedsideAssessment(caseId)` to load existing measurements.
   - **Finding:** If all cases have advanced past `awaiting_nursing_triage`, the selector renders:
     ```html
     <option value="">No cases in queue (0)</option>
     ```

3. **Case ID Consistency:**
   - Case IDs (`CAS-xxx` or `case_xxx`) are preserved consistently across API requests, audit events, and database tables (`cases`, `bedside_assessments`, `clinical_reviews`, `consents`, `audit_events`).

---

### Issue D: Clinical Safety Behavior — Urgency Signals & Triage Priority

#### Observed Clinical Test Case
- **Patient Complaint:**
  ```
  Severe cough with hemoptysis, fever 102F for 4 days, breathlessness at rest.
  ```
- **Observed System Output:**
  ```
  NO URGENCY SIGNALS
  ROUTINE PRIORITY
  ```
- **Clinical Risk:** Extremely high. Hemoptysis (coughing blood) with high fever and dyspnea at rest is a life-threatening red-flag presentation (potential pulmonary embolism, tuberculosis, severe pneumonia, or alveolar hemorrhage) that should never be triaged as "Routine".

#### Systematic Root Cause Proof

1. **Omission of "Hemoptysis" from Rules Engine:**
   - In `server/app/services/rules_engine.py`, `DeterministicSafetyRulesEngine.RULES` contains only 6 rules (`RULE-001` through `RULE-006`):
     - `RULE-001`: Cardiorespiratory Distress (requires chest pain + dyspnea).
     - `RULE-002`: Severe Febrile with Meningeal / Neurological Signs.
     - `RULE-003`: Obstetric Emergency Bleeding.
     - `RULE-004`: Severe Isolated Respiratory Failure.
     - `RULE-005`: Acute Abdominal Guarding.
     - `RULE-006`: Severe Lab Anomaly Alert.
   - **There is no rule for Hemoptysis.** The word `hemoptysis` does not appear anywhere in `server/app/services/rules_engine.py`.

2. **Conjunction Gating in Fever Rule (`RULE-002`):**
   - The patient reports `fever 102F`.
   - `RULE-002` matches `keywords_a` ("fever"), but requires `keywords_b`:
     ```python
     "keywords_b": ["stiff neck", "neck rigidity", "neck pain", "altered consciousness", "confusion", ...]
     ```
   - In `rules_engine.py` line 178:
     ```python
     is_triggered = match_a and match_b
     ```
   - Because the patient does not report stiff neck or confusion, `match_b` is `False`. High fever is discarded as non-urgent.

3. **Rigid Exact-Phrase Gating in Respiratory Rule (`RULE-004`):**
   - The patient reports `breathlessness at rest`.
   - `RULE-004` only matches these exact string phrases:
     ```python
     "keywords_a": [
         "severe shortness of breath", "gasping for air", "unable to breathe", "severe breathing difficulty"
     ]
     ```
   - The phrase `breathlessness at rest` does not contain any of those 4 phrases.
   - In `RULE-001`, `breathlessness` is in `keywords_b`, but requires `keywords_a` (chest pain).
   - Result: Dyspnea at rest triggers no rule.

4. **Overall Urgency Output:**
   - In `rules_engine.py` line 205:
     ```python
     def compute_overall_urgency(cls, signals: List[UrgencySignalSchema]) -> str:
         if any(s.level == "immediate_attention" for s in signals):
             return "HIGH_URGENCY"
         elif any(s.level == "attention_required" for s in signals):
             return "ELEVATED"
         return "ROUTINE"
     ```
   - With 0 rules triggered, `safety_signals` is `[]`, and overall urgency defaults to `"ROUTINE"`.
   - In `TriageNoteView.tsx` line 159, `hasUrgency` evaluates to `false`, rendering `<ShieldCheck /> Routine Priority`.

---

## 4. Mobile Layout & Responsiveness Audit

Tested on Chromium headless at viewport widths of **320px**, **360px**, **390px**, and **430px**.

| Viewport | Mobile Drawer Toggle | Horizontal Body Scroll | Visual Clipping / Layout Observations |
|---|---|---|---|
| **320px** (iPhone SE) | Present (`btn-mobile-menu-toggle`) | **No** (`has_h_scroll = False`) | 1. Verification buttons (`Patient Reported`, `Nurse Verified`, `Unable to Verify`) flex-pack tightly. 2. Mobile backdrop (`z-index: 1000`) overlays header toggle (`z-index: 60`), intercepting tap-to-close pointer events. |
| **360px** (Android Standard) | Present (`btn-mobile-menu-toggle`) | **No** (`has_h_scroll = False`) | Pain scale buttons (0–10) fit cleanly with horizontal momentum scroll (`overflow-x: auto`). |
| **390px** (iPhone 14/15) | Present (`btn-mobile-menu-toggle`) | **No** (`has_h_scroll = False`) | Navigation chips wrap gracefully across 2 rows. |
| **430px** (iPhone Pro Max) | Present (`btn-mobile-menu-toggle`) | **No** (`has_h_scroll = False`) | All telemetry cards, vitals grid, and observation pickers render with ample padding. |

---

## 5. Build, Test & Environment Verification Outcomes

### Commands Executed & Outcomes
1. **Frontend Unit Tests:**
   - Command: `npm run test`
   - Result: `v10_nurse_portal.test.ts` passed (11/11 tests pass in 140ms). Overall suite failed on `v16_health_ai_e2e_suite.test.ts` due to unreachable mock AI service.
2. **Production Bundle Build:**
   - Command: `npm run build` (`tsc -b && vite build`)
   - Outcome: **PASS** (`✓ built in 1.08s`, `dist/assets/index-DQJF8y1J.js` 716 kB). Zero TypeScript compilation errors.
3. **Backend Test Suite:**
   - Command: `.\.venv\Scripts\python -m pytest server/tests`
   - Outcome: **PASS** (107 passed in 209s). Zero backend test failures.
4. **End-to-End Nurse Lifecycle Verification Script:**
   - Command: `.\.venv\Scripts\python verify_nursing_lifecycle.py`
   - Outcome: **PASS** (All 10 steps verified: Nurse Login, Patient Intake, Nursing Queue, Bedside Assessment, Reviewer Queue, SQLite direct persistence, Doctor Sign-off).
5. **Headless Browser Automation Audit:**
   - Command: `.\.venv\Scripts\python scratch/run_nurse_portal_audit.py`
   - Outcome: **PASS** (Launched Google Chrome, exercised all 31 controls, captured 12 evidence screenshots).

---

## 6. The Three Most Critical Fixes to Prioritize

### Fix 1 (Clinical Safety): Add Hemoptysis & Acute Dyspnea Rules
- **Component:** `server/app/services/rules_engine.py` & `src/services/processor/DeterministicProcessor.ts`
- **Issue:** Hemoptysis and isolated breathlessness at rest produce `NO URGENCY SIGNALS` and `ROUTINE PRIORITY`.
- **Solution:** Add `RULE-007: Acute Hemoptysis / Pulmonary Hemorrhage` (`immediate_attention`) and expand `RULE-004` keywords to match `breathlessness at rest`, `shortness of breath at rest`, and `dyspnea at rest`.

### Fix 2 (UI Invisibility): Fix Ghost Card Opacity in Bedside Workstation
- **Component:** `src/components/NurseBedside/BedsideIntakeView.tsx` & `src/utils/scrollReveal.ts`
- **Issue:** Telemetry input cards remain locked at `opacity: 0 !important` upon tab navigation, creating a large blank area below the case banner.
- **Solution:** Call `refreshScrollReveal()` in `useEffect` when `BedsideIntakeView` mounts, or add `.is-visible` directly to measurement cards on mount.

### Fix 3 (Workflow & Routing): Decouple Case Viewing from `awaiting_nursing_triage`
- **Component:** `src/portals/NursePortal/NursePortal.tsx` & `src/components/NurseQueue/NurseQueueView.tsx`
- **Issue:**
  1. Nurses clicking `View Note` on cases with status `awaiting_review` are blocked by `"NO ACTIVE EVIDENCE NOTE PENDING NURSE ACTION"`.
  2. Nurses clicking `Start Triage` are directed to the Doctor review modal instead of the Bedside Vitals form.
  3. Clicking `Save Bedside Assessment` prematurely changes database status to `awaiting_review`.
- **Solution:** Allow `targetCase` in `NursePortal.tsx` to hold cases in any review status; route `Start Triage` directly to `BedsideIntakeView`; and preserve `awaiting_nursing_triage` in backend when assessment `status !== 'pending_physician_review'`.

---

## 7. Audit File Manifest

All audit documents, CSV inventory data, test results, and screenshots are organized in `reports/nurse-portal-audit/`:

1. **Audit Report (Markdown):** [NURSE_PORTAL_AUDIT_REPORT.md](file:///c:/Users/malli/OneDrive/Desktop/ALL%20PROJECT/swasthya-triage/reports/nurse-portal-audit/NURSE_PORTAL_AUDIT_REPORT.md)
2. **Button Inventory Matrix (CSV):** [nurse_portal_button_inventory.csv](file:///c:/Users/malli/OneDrive/Desktop/ALL%20PROJECT/swasthya-triage/reports/nurse-portal-audit/nurse_portal_button_inventory.csv)
3. **Machine-Readable Test Results (JSON):** [nurse_portal_test_results.json](file:///c:/Users/malli/OneDrive/Desktop/ALL%20PROJECT/swasthya-triage/reports/nurse-portal-audit/nurse_portal_test_results.json)
4. **Runtime Evidence Screenshots:**
   - [01_login_screen.png](file:///c:/Users/malli/OneDrive/Desktop/ALL%20PROJECT/swasthya-triage/reports/nurse-portal-audit/screenshots/01_login_screen.png) — Staff Login Gateway.
   - [02_nurse_portal_initial.png](file:///c:/Users/malli/OneDrive/Desktop/ALL%20PROJECT/swasthya-triage/reports/nurse-portal-audit/screenshots/02_nurse_portal_initial.png) — Nurse Portal Initial Queue View (showing hidden 03 tab).
   - [03_trust_center_modal.png](file:///c:/Users/malli/OneDrive/Desktop/ALL%20PROJECT/swasthya-triage/reports/nurse-portal-audit/screenshots/03_trust_center_modal.png) — Trust Center Modal.
   - [04_queue_all_cases.png](file:///c:/Users/malli/OneDrive/Desktop/ALL%20PROJECT/swasthya-triage/reports/nurse-portal-audit/screenshots/04_queue_all_cases.png) — Queue All Cases Filter.
   - [05_view_note_from_queue.png](file:///c:/Users/malli/OneDrive/Desktop/ALL%20PROJECT/swasthya-triage/reports/nurse-portal-audit/screenshots/05_view_note_from_queue.png) — "NO ACTIVE EVIDENCE NOTE PENDING NURSE ACTION" Bug.
   - [06_start_triage_modal.png](file:///c:/Users/malli/OneDrive/Desktop/ALL%20PROJECT/swasthya-triage/reports/nurse-portal-audit/screenshots/06_start_triage_modal.png) — "Start Triage" Opening Doctor Modal.
   - [07_bedside_vitals_page.png](file:///c:/Users/malli/OneDrive/Desktop/ALL%20PROJECT/swasthya-triage/reports/nurse-portal-audit/screenshots/07_bedside_vitals_page.png) — Empty Bedside State When Queue Lacks Candidates.
   - [08_bedside_form_with_candidate_case.png](file:///c:/Users/malli/OneDrive/Desktop/ALL%20PROJECT/swasthya-triage/reports/nurse-portal-audit/screenshots/08_bedside_form_with_candidate_case.png) — Selected Case Header & Opacity 0 Measurement Cards.
   - [09_bedside_form_filled.png](file:///c:/Users/malli/OneDrive/Desktop/ALL%20PROJECT/swasthya-triage/reports/nurse-portal-audit/screenshots/09_bedside_form_filled.png) — Bedside Measurement Inputs Filled.
   - [10_after_save_bedside.png](file:///c:/Users/malli/OneDrive/Desktop/ALL%20PROJECT/swasthya-triage/reports/nurse-portal-audit/screenshots/10_after_save_bedside.png) — Premature Queue Ejection After Save.
   - [11_evidence_note_view.png](file:///c:/Users/malli/OneDrive/Desktop/ALL%20PROJECT/swasthya-triage/reports/nurse-portal-audit/screenshots/11_evidence_note_view.png) — Hemoptysis Case Displaying "Routine Priority".
   - [mobile_320x568_queue.png](file:///c:/Users/malli/OneDrive/Desktop/ALL%20PROJECT/swasthya-triage/reports/nurse-portal-audit/screenshots/mobile_320x568_queue.png) — 320px Mobile Queue View.
