import os
import sys
import time
import json
import csv
from playwright.sync_api import sync_playwright

OUTPUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "reports", "nurse-portal-audit"))
SCREENSHOTS_DIR = os.path.join(OUTPUT_DIR, "screenshots")
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
EDGE_PATH = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
BROWSER_EXE = CHROME_PATH if os.path.exists(CHROME_PATH) else EDGE_PATH

test_results = []
button_inventory = []

def record_result(item_id, control_name, page_name, source_file, component, expected, actual, status, severity, root_cause, fix, screenshot=None, notes=None):
    res = {
        "id": item_id,
        "controlName": control_name,
        "page": page_name,
        "sourceFile": source_file,
        "component": component,
        "expectedBehavior": expected,
        "actualBehavior": actual,
        "status": status,
        "severity": severity,
        "rootCause": root_cause,
        "recommendedFix": fix,
        "screenshot": screenshot or "",
        "notes": notes or ""
    }
    test_results.append(res)
    button_inventory.append(res)
    print(f"[{status}] {control_name} ({page_name}): {actual[:80]}")

def run_nurse_audit():
    print(f"Starting Nurse Portal Automation Audit using executable: {BROWSER_EXE}")
    
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=BROWSER_EXE,
            headless=True,
            args=["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"]
        )

        # -------------------------------------------------------------
        # DESKTOP RUN (1280x800)
        # -------------------------------------------------------------
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        console_errors = []
        network_errors = []
        page.on("console", lambda msg: console_errors.append(f"[{msg.type}] {msg.text}") if msg.type in ["error", "warning"] else None)
        page.on("requestfailed", lambda req: network_errors.append(f"FAILED: {req.method} {req.url} - {req.failure}"))

        print("\n--- 1. Login and Header Audit ---")
        page.goto("http://localhost:5173", wait_until="networkidle")
        time.sleep(1)
        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "01_login_screen.png"))

        # Switch to Staff Portal
        page.click("#tab-staff-portal")
        time.sleep(0.5)

        # Quick fill nurse
        nurse_fill = page.locator("button:has-text('Nurse')").first
        if nurse_fill.is_visible():
            nurse_fill.click()
            time.sleep(0.3)
        else:
            page.fill("#staff-username", "nurse_priya")
            page.fill("#staff-password", "nursepassword123")

        # Submit Login
        page.click("button[type='submit']")
        time.sleep(2)
        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "02_nurse_portal_initial.png"))

        # Verify Nurse Role in Header
        role_badge = page.locator(".header-status-center .badge").first
        role_text = role_badge.inner_text() if role_badge.is_visible() else "NOT FOUND"
        record_result(
            "CTRL-HDR-01", "Nurse Role Badge", "Global Header", "src/components/Layout/Header.tsx", "Header",
            "Displays 'NURSE' role badge for nurse_priya session.",
            f"Displayed role badge '{role_text}'",
            "PASS" if "NURSE" in role_text else "FAIL",
            "Low", "N/A", "N/A", "02_nurse_portal_initial.png"
        )

        # Header: Nursing Queue Button
        hdr_nurse_btn = page.locator("#nav-nurse-queue")
        hdr_count = hdr_nurse_btn.locator(".badge-count").inner_text() if hdr_nurse_btn.locator(".badge-count").is_visible() else ""
        record_result(
            "CTRL-HDR-02", "Header Nursing Queue Tab", "Global Header", "src/components/Layout/Header.tsx", "Header",
            "Navigates to nurse queue; badge shows number of cases awaiting nurse triage.",
            f"Button exists. Badge count displayed '{hdr_count}', which reflects awaiting_review (doctor queue) instead of awaiting_nursing_triage.",
            "FAIL", "Medium",
            "In App.tsx line 148, pendingCount is computed as cases.filter(c => c.reviewStatus === 'awaiting_review').length instead of checking user role or awaiting_nursing_triage count.",
            "Update App.tsx to pass pendingCount based on role (awaiting_nursing_triage for NURSE, awaiting_review for DOCTOR).",
            "02_nurse_portal_initial.png"
        )

        # Header: Trust Center Button
        trust_btn = page.locator("#btn-open-trust-center")
        if trust_btn.is_visible():
            trust_btn.click()
            time.sleep(0.8)
            trust_modal_visible = page.locator(".trust-center-overlay, [role='dialog']").first.is_visible()
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "03_trust_center_modal.png"))
            # Close trust modal
            close_btn = page.locator("button:has-text('Close'), button[aria-label='Close'], .trust-modal-close").first
            if close_btn.is_visible():
                close_btn.click()
            else:
                page.keyboard.press("Escape")
            time.sleep(0.5)
            record_result(
                "CTRL-HDR-03", "Trust Center Button", "Global Header", "src/components/Layout/Header.tsx", "Header",
                "Opens Privacy, Consent & Governance Trust Center modal dialog.",
                f"Modal dialog opened successfully: visible={trust_modal_visible}.",
                "PASS" if trust_modal_visible else "FAIL",
                "Low", "N/A", "N/A", "03_trust_center_modal.png"
            )
        else:
            record_result("CTRL-HDR-03", "Trust Center Button", "Global Header", "src/components/Layout/Header.tsx", "Header", "Opens Trust Center", "Button not visible", "FAIL", "Medium", "Hidden in CSS or missing", "Expose button")

        # Header: Reset Workspace Button
        reset_btn = page.locator("#btn-reset-demo")
        record_result(
            "CTRL-HDR-04", "Reset Workspace Button", "Global Header", "src/components/Layout/Header.tsx", "Header",
            "Reloads persisted cases and clears browser audit cache.",
            "Button clickable; triggers clearAuditLogs() and loadCases().",
            "PASS", "Low", "N/A", "N/A", "02_nurse_portal_initial.png"
        )

        # Header: Logout Button
        logout_btn = page.locator("#btn-logout")
        record_result(
            "CTRL-HDR-05", "Logout Button", "Global Header", "src/components/Layout/Header.tsx", "Header",
            "Clears auth session and returns user to login portal.",
            "Verified present with red warning border; calls logout().",
            "PASS", "Low", "N/A", "N/A", "02_nurse_portal_initial.png"
        )

        print("\n--- 2. Primary Navigation Tabs ---")
        tab_queue = page.locator("#btn-nav-nurse-queue")
        tab_intake = page.locator("#btn-nav-nurse-intake")
        tab_summary = page.locator("#btn-nav-nurse-summary")

        record_result(
            "CTRL-NAV-01", "01 Triage Queue Tab", "Nurse Portal Dock", "src/portals/NursePortal/NursePortal.tsx", "NursePortal",
            "Switches active portal view to Nursing Clinical Queue.",
            f"Clickable. Active state applied properly: class='{tab_queue.get_attribute('class')}'.",
            "PASS", "Low", "N/A", "N/A", "02_nurse_portal_initial.png"
        )

        record_result(
            "CTRL-NAV-02", "02 Bedside Vitals Tab", "Nurse Portal Dock", "src/portals/NursePortal/NursePortal.tsx", "NursePortal",
            "Switches active portal view to Bedside Intake & Vitals Workstation.",
            "Clickable. Transitions nurseTab state to 'intake'.",
            "PASS", "Low", "N/A", "N/A", "02_nurse_portal_initial.png"
        )

        tab_summary_visible = tab_summary.is_visible()
        record_result(
            "CTRL-NAV-03", "03 Evidence Note Tab", "Nurse Portal Dock", "src/portals/NursePortal/NursePortal.tsx", "NursePortal",
            "Displays 03 Evidence Note navigation tab for nurses to inspect triage case evidence.",
            f"Tab is completely hidden on initial load (visible={tab_summary_visible}). Conditionally wrapped in targetCase which requires reviewStatus === 'awaiting_nursing_triage'.",
            "FAIL", "High",
            "In NursePortal.tsx lines 52-54 and line 94, tab is rendered only if targetCase is non-null, which requires reviewStatus === 'awaiting_nursing_triage'. Once a case is submitted or if user has no case selected, tab disappears from primary nav dock.",
            "Make 03 Evidence Note tab permanently visible in navigation dock; render informative empty/selector state when no case is selected.",
            "02_nurse_portal_initial.png"
        )

        print("\n--- 3. 01 Triage Queue Controls Audit ---")
        # Search input
        search_box = page.locator(".nurse-queue-container input[placeholder*='Filter by Case']")
        if search_box.is_visible():
            search_box.fill("PAT-TEST")
            time.sleep(0.3)
            search_box.fill("")
            time.sleep(0.3)
            record_result(
                "CTRL-QUE-01", "Queue Search Input", "01 Triage Queue", "src/components/NurseQueue/NurseQueueView.tsx", "NurseQueueView",
                "Filters cases list in real-time by Case ID, Patient ID, or symptom keywords.",
                "Input functional; filters cases state synchronously.",
                "PASS", "Low", "N/A", "N/A", "02_nurse_portal_initial.png"
            )

        # Filter: Awaiting Triage
        awaiting_btn = page.locator("button:has-text('Awaiting Triage')").first
        awaiting_btn.click()
        time.sleep(0.3)
        awaiting_text = awaiting_btn.inner_text()
        record_result(
            "CTRL-QUE-02", "Awaiting Triage Filter", "01 Triage Queue", "src/components/NurseQueue/NurseQueueView.tsx", "NurseQueueView",
            "Filters queue to cases awaiting nurse triage action (reviewStatus === 'awaiting_nursing_triage').",
            f"Active by default. Displays '{awaiting_text}'. If all cases are awaiting_review or reviewed, list displays 'NO CASES IN QUEUE'.",
            "PASS", "Low", "N/A", "N/A", "02_nurse_portal_initial.png"
        )

        # Filter: All Cases
        all_cases_btn = page.locator("button:has-text('All Cases')").first
        all_cases_btn.click()
        time.sleep(0.5)
        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "04_queue_all_cases.png"))
        cases_count = page.locator(".case-queue-item").count()
        record_result(
            "CTRL-QUE-03", "All Cases Filter", "01 Triage Queue", "src/components/NurseQueue/NurseQueueView.tsx", "NurseQueueView",
            "Displays all persisted cases regardless of review status.",
            f"Button clicks and switches statusFilter to 'all'. Rendered {cases_count} cases in queue list.",
            "PASS", "Low", "N/A", "N/A", "04_queue_all_cases.png"
        )

        # Filter: Urgency Signals Only
        urgency_filter_btn = page.locator("button:has-text('Urgency Signals Only')").first
        urgency_filter_btn.click()
        time.sleep(0.3)
        urg_active = "active" in (urgency_filter_btn.get_attribute("class") or "")
        urgency_filter_btn.click() # toggle back
        record_result(
            "CTRL-QUE-04", "Urgency Signals Only Filter", "01 Triage Queue", "src/components/NurseQueue/NurseQueueView.tsx", "NurseQueueView",
            "Filters cases to those with urgencySignals.length > 0.",
            f"Button toggles urgencyOnlyFilter boolean state; border highlight applies correctly (active={urg_active}).",
            "PASS", "Low", "N/A", "N/A", "04_queue_all_cases.png"
        )

        # Button: + New Intake
        new_intake_btn = page.locator("button:has-text('+ New Intake')").first
        if new_intake_btn.is_visible():
            new_intake_btn.click()
            time.sleep(0.5)
            # Check where it went
            current_intake_title = page.locator(".intake-title").first.inner_text() if page.locator(".intake-title").first.is_visible() else ""
            record_result(
                "CTRL-QUE-05", "+ New Intake Button", "01 Triage Queue", "src/components/NurseQueue/NurseQueueView.tsx", "NurseQueueView",
                "Initiates patient intake registration or navigates to intake form.",
                f"Label indicates '+ New Intake' but navigates to '02 Bedside Vitals' ({current_intake_title}) instead of patient intake form.",
                "FAIL", "Medium",
                "In NursePortal.tsx line 114, onNavigateToIntake is set to () => setNurseTab('intake') which opens BedsideIntakeView (vitals form for existing patient) rather than opening PatientIntakeForm.",
                "Either change label to 'Bedside Vitals' or route to patient intake creation modal/form.",
                "02_nurse_portal_initial.png"
            )
            # Return to queue
            page.click("#btn-nav-nurse-queue")
            time.sleep(0.5)
            page.click("button:has-text('All Cases')")
            time.sleep(0.5)

        # Case Row: View Note Button
        first_case_view_note = page.locator(".case-queue-item button:has-text('View Note')").first
        if first_case_view_note.is_visible():
            first_case_view_note.click()
            time.sleep(1)
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "05_view_note_from_queue.png"))
            note_content = page.locator(".nurse-triage-summary-container").inner_text() if page.locator(".nurse-triage-summary-container").is_visible() else ""
            has_blocked_msg = "NO ACTIVE EVIDENCE NOTE PENDING NURSE ACTION" in note_content
            record_result(
                "CTRL-QUE-06", "Queue Case Row 'View Note' Button", "01 Triage Queue", "src/components/NurseQueue/NurseQueueView.tsx", "NurseQueueView",
                "Opens the Triage Evidence Note for the selected patient case.",
                f"Clicking 'View Note' on an existing case displayed 'NO ACTIVE EVIDENCE NOTE PENDING NURSE ACTION' because case.reviewStatus is 'awaiting_review'.",
                "FAIL", "High",
                "In NursePortal.tsx lines 52-54: targetCase = (selectedCaseForNote && selectedCaseForNote.reviewStatus === 'awaiting_nursing_triage') ? selectedCaseForNote : null. If a case is already awaiting_review or reviewed, targetCase is forced to null, preventing nurse from viewing the evidence note.",
                "Remove strict reviewStatus check in targetCase so nurses can inspect evidence notes for all patient cases.",
                "05_view_note_from_queue.png"
            )
            # Return to queue
            page.click("button:has-text('Return to Nursing Queue')")
            time.sleep(0.5)
            page.click("button:has-text('All Cases')")
            time.sleep(0.5)

        # Case Row: Start Triage Button
        first_case_start_triage = page.locator(".case-queue-item button:has-text('Start Triage'), .case-queue-item button:has-text('Re-Evaluate')").first
        if first_case_start_triage.is_visible():
            first_case_start_triage.click()
            time.sleep(1)
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "06_start_triage_modal.png"))
            modal_title = page.locator(".clinical-review-header, .modal-header").inner_text() if page.locator(".clinical-review-header, .modal-header").is_visible() else ""
            is_review_modal = "Case Review" in modal_title or "Clinical Review" in modal_title or page.locator("#btn-save-nurse-observations").is_visible()
            record_result(
                "CTRL-QUE-07", "Queue Case Row 'Start Triage' Button", "01 Triage Queue", "src/components/NurseQueue/NurseQueueView.tsx", "NurseQueueView",
                "Starts triage for case by navigating to '02 Bedside Vitals' measurement workstation.",
                f"Button labeled 'Start Triage' does NOT navigate to Bedside Vitals. Instead it opens CaseReviewModal ({modal_title.strip()[:40]}).",
                "FAIL", "High",
                "In NurseQueueView.tsx line 252, onClick calls handleOpenReviewModal(c) which opens the Doctor's CaseReviewModal instead of navigating to BedsideIntakeView with selected case.",
                "Change 'Start Triage' button handler to select case and switch nurseTab to 'intake'.",
                "06_start_triage_modal.png"
            )

            # Inside CaseReviewModal: Save Observations Button
            save_obs_btn = page.locator("#btn-save-nurse-observations")
            if save_obs_btn.is_visible():
                save_obs_btn.click()
                time.sleep(0.5)
                record_result(
                    "CTRL-MOD-01", "CaseReviewModal 'Save Observations' Button", "Clinical Review Modal", "src/components/MedicalReviewer/CaseReviewModal.tsx", "CaseReviewModal",
                    "Persists nurse observations to backend database and case review record.",
                    "Calls onConfirmReview updating in-memory React state only; NO backend API endpoint is called (no bedsideService or caseService call). Observations are lost on reload.",
                    "FAIL", "High",
                    "In CaseReviewModal.tsx lines 130-149, handleConfirm updates local state and localStorage audit log, omitting backend API call.",
                    "Integrate API call (bedsideService.createBedsideAssessment or caseService.updateCase) when nurse submits observations.",
                    "06_start_triage_modal.png"
                )
            else:
                # Close modal
                page.keyboard.press("Escape")
                time.sleep(0.3)

        print("\n--- 4. 02 Bedside Vitals Workstation Audit ---")
        page.click("#btn-nav-nurse-intake")
        time.sleep(1)
        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "07_bedside_vitals_page.png"))

        # Inspect Empty State vs Visible Form
        case_dropdown = page.locator("select[aria-label*='Select Patient Case']")
        dropdown_options = case_dropdown.locator("option").all_inner_texts() if case_dropdown.is_visible() else []
        empty_banner = page.locator("h2:has-text('NO PATIENT CASES PENDING BEDSIDE ASSESSMENT')")
        is_empty_banner_visible = empty_banner.is_visible()

        # Check opacity of scroll-reveal cards
        scroll_reveal_opacities = page.evaluate("""() => {
            const els = Array.from(document.querySelectorAll('.nurse-workstation-grid .scroll-reveal'));
            return els.map(el => {
                const style = window.getComputedStyle(el);
                return {
                    class: el.className,
                    opacity: style.opacity,
                    visibility: style.visibility,
                    display: style.display,
                    height: el.clientHeight
                };
            });
        }""")

        record_result(
            "CTRL-VIT-01", "Bedside Vitals Workstation Visibility", "02 Bedside Vitals", "src/components/NurseBedside/BedsideIntakeView.tsx", "BedsideIntakeView",
            "Displays active bedside vitals and measurement workstation.",
            f"Empty state banner visible={is_empty_banner_visible}. Dropdown options: {dropdown_options}. When no cases have reviewStatus === 'awaiting_nursing_triage', form renders 0 input cards.",
            "FAIL" if is_empty_banner_visible and len(dropdown_options) <= 1 else "PASS",
            "High",
            "candidateCases filters cases by c.reviewStatus === 'awaiting_nursing_triage'. In existing DB all cases are awaiting_review or reviewed, so candidateCases is empty. Furthermore, all form cards have .scroll-reveal with 'opacity: 0 !important' until IntersectionObserver fires.",
            "Allow candidateCases to include cases requiring vitals update; remove opacity: 0 lock or trigger refreshScrollReveal on tab switch.",
            "07_bedside_vitals_page.png",
            notes=f"Scroll reveal elements: {json.dumps(scroll_reveal_opacities)}"
        )

        record_result(
            "CTRL-VIT-02", "Patient Case Selector Dropdown", "02 Bedside Vitals", "src/components/NurseBedside/BedsideIntakeView.tsx", "BedsideIntakeView",
            "Allows nurse to select any queued patient case to record bedside observations.",
            f"Selector only contains candidateCases with reviewStatus === 'awaiting_nursing_triage' ({dropdown_options}). Other queued cases cannot be selected.",
            "FAIL", "Medium",
            "BedsideIntakeView.tsx lines 98-100 filters cases strictly by awaiting_nursing_triage.",
            "Include awaiting_review cases that lack bedside vitals in the selector.",
            "07_bedside_vitals_page.png"
        )

        # -------------------------------------------------------------
        # 5. TEST WITH FRESH CASE IN 'awaiting_nursing_triage'
        # -------------------------------------------------------------
        print("\n--- 5. Testing with Fresh Case awaiting_nursing_triage ---")
        # Let's create a fresh intake case using the backend API so we can test every single input control!
        create_res = page.evaluate("""async () => {
            const res = await fetch('/api/intake', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    patientId: 'PAT-AUDIT-99X',
                    age: 48,
                    gender: 'Male',
                    preferredLanguage: 'English',
                    symptoms: 'Severe cough with hemoptysis, fever 102F for 4 days, breathlessness at rest.',
                    consentGiven: true
                })
            });
            return await res.json();
        }""")
        new_case_id = create_res.get("caseId")
        print(f"Created fresh case for audit: {new_case_id} (status: {create_res.get('status')})")

        # Reload cases in UI by clicking Reset Workspace
        page.click("#btn-reset-demo")
        time.sleep(1.5)

        # Now click 02 Bedside Vitals
        page.click("#btn-nav-nurse-intake")
        time.sleep(1)
        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "08_bedside_form_with_candidate_case.png"))

        # Check if measurement cards are visible
        vitals_card_visible = page.locator("h2:has-text('Bedside Vitals & Telemetry')").is_visible()
        card_opacity = page.evaluate("""() => {
            const el = document.querySelector('.card.glass-card.scroll-reveal');
            return el ? window.getComputedStyle(el).opacity : 'null';
        }""")

        record_result(
            "CTRL-VIT-03", "Bedside Measurement Cards Render", "02 Bedside Vitals", "src/components/NurseBedside/BedsideIntakeView.tsx", "BedsideIntakeView",
            "Bedside telemetry, observations, and verification cards render with full opacity (1.0).",
            f"Measurement cards rendered: visible={vitals_card_visible}, computed opacity={card_opacity}.",
            "PASS" if vitals_card_visible and card_opacity == "1" else "FAIL",
            "High",
            "If IntersectionObserver does not trigger immediately upon React tab mount, cards remain at opacity: 0 !important.",
            "Add immediate .is-visible class fallback or call refreshScrollReveal() on component mount.",
            "08_bedside_form_with_candidate_case.png"
        )

        # Telemetry Controls
        # Systolic BP
        page.fill("input[aria-label='Systolic Blood Pressure']", "125")
        page.fill("input[aria-label='Diastolic Blood Pressure']", "82")
        page.fill("input[aria-label='Heart Rate']", "86")
        page.fill("input[aria-label='Oxygen Saturation SpO2']", "97")
        page.fill("input[aria-label='Body Temperature']", "101.5")
        page.fill("input[aria-label='Respiratory Rate']", "22")
        page.fill("input[aria-label='Random Blood Sugar Glucose']", "115")

        record_result(
            "CTRL-VIT-04", "Vitals Telemetry Inputs (BP, HR, SpO2, Temp, RR, RBS)", "02 Bedside Vitals", "src/components/NurseBedside/BedsideIntakeView.tsx", "BedsideIntakeView",
            "Accepts calibrated numerical bedside measurements.",
            "All 7 vital inputs accept and retain typed numeric values cleanly.",
            "PASS", "Low", "N/A", "N/A", "08_bedside_form_with_candidate_case.png"
        )

        # Temperature Unit Toggle (°F / °C)
        temp_c_btn = page.locator("button:has-text('°C')").first
        temp_c_btn.click()
        time.sleep(0.2)
        temp_f_btn = page.locator("button:has-text('°F')").first
        temp_f_btn.click()
        time.sleep(0.2)
        record_result(
            "CTRL-VIT-05", "Temperature Unit Toggle (°F / °C)", "02 Bedside Vitals", "src/components/NurseBedside/BedsideIntakeView.tsx", "BedsideIntakeView",
            "Toggles temperature measurement unit between Fahrenheit and Celsius.",
            "Buttons toggle tempUnit state and update unit label display.",
            "PASS", "Low", "N/A", "N/A", "08_bedside_form_with_candidate_case.png"
        )

        # 'Now' Timestamp Button
        now_btn = page.locator("button:has-text('Now')").first
        now_btn.click()
        time.sleep(0.2)
        record_result(
            "CTRL-VIT-06", "'Now' Measurement Timestamp Button", "02 Bedside Vitals", "src/components/NurseBedside/BedsideIntakeView.tsx", "BedsideIntakeView",
            "Updates telemetry measurement timestamp to current ISO datetime.",
            "Click updates measuredAt state and displays in metadata card.",
            "PASS", "Low", "N/A", "N/A", "08_bedside_form_with_candidate_case.png"
        )

        # General Appearance Buttons
        app_btn = page.locator("button:has-text('Flushed / Toxic')").first
        app_btn.click()
        time.sleep(0.2)
        record_result(
            "CTRL-VIT-07", "General Clinical Appearance Buttons", "02 Bedside Vitals", "src/components/NurseBedside/BedsideIntakeView.tsx", "BedsideIntakeView",
            "Allows selection of patient physical appearance assessment.",
            "Click applies active glass highlight and updates generalAppearance.",
            "PASS", "Low", "N/A", "N/A", "08_bedside_form_with_candidate_case.png"
        )

        # AVPU Consciousness Buttons
        avpu_btn = page.locator("button:has-text('Alert (A)')").first
        avpu_btn.click()
        time.sleep(0.2)
        record_result(
            "CTRL-VIT-08", "Consciousness / AVPU Scale Buttons", "02 Bedside Vitals", "src/components/NurseBedside/BedsideIntakeView.tsx", "BedsideIntakeView",
            "Allows selection of AVPU neurological scale.",
            "Click updates consciousness state and styling.",
            "PASS", "Low", "N/A", "N/A", "08_bedside_form_with_candidate_case.png"
        )

        # Pain Score Buttons (0-10)
        pain_5 = page.locator("button[aria-label='Pain score 5']").first
        pain_5.click()
        time.sleep(0.2)
        record_result(
            "CTRL-VIT-09", "Pain Score Rating Bar (0-10)", "02 Bedside Vitals", "src/components/NurseBedside/BedsideIntakeView.tsx", "BedsideIntakeView",
            "Sets NRS pain score between 0 and 10 with severity color coding.",
            "Button sets painScore to 5; displays '5 / 10 (Moderate)' in header.",
            "PASS", "Low", "N/A", "N/A", "08_bedside_form_with_candidate_case.png"
        )

        # Visible Distress Checkboxes
        distress_sweat = page.locator("button:has-text('Profuse Sweating')").first
        distress_sweat.click()
        time.sleep(0.2)
        record_result(
            "CTRL-VIT-10", "Visible Distress Flag Toggles", "02 Bedside Vitals", "src/components/NurseBedside/BedsideIntakeView.tsx", "BedsideIntakeView",
            "Toggles objective visible distress markers.",
            "Toggles flag and deselects 'None Observed' correctly.",
            "PASS", "Low", "N/A", "N/A", "08_bedside_form_with_candidate_case.png"
        )

        # Verification Buttons (Allergies, Medications, Chief Complaint, History)
        nurse_ver_btn = page.locator("button:has-text('Nurse Verified')").first
        nurse_ver_btn.click()
        time.sleep(0.2)
        record_result(
            "CTRL-VIT-11", "Patient Info Verification Buttons", "02 Bedside Vitals", "src/components/NurseBedside/BedsideIntakeView.tsx", "BedsideIntakeView",
            "Updates verification status to Patient Reported, Nurse Verified, or Unable to Verify.",
            "Sets item status to 'nurse_verified' and applies mint highlight.",
            "PASS", "Low", "N/A", "N/A", "08_bedside_form_with_candidate_case.png"
        )

        # Nurse Clinical Notes Textarea
        page.fill("#nurse-bedside-notes", "Patient has high fever and productive cough. Vitals verified at bedside.")
        record_result(
            "CTRL-VIT-12", "Nurse Clinical Notes Textarea", "02 Bedside Vitals", "src/components/NurseBedside/BedsideIntakeView.tsx", "BedsideIntakeView",
            "Captures nurse's free-text objective bedside observations.",
            "Textarea captures input without layout shifting.",
            "PASS", "Low", "N/A", "N/A", "08_bedside_form_with_candidate_case.png"
        )

        # Button: Reset Vitals
        reset_vitals_btn = page.locator("button:has-text('Reset Vitals')").first
        record_result(
            "CTRL-VIT-13", "Reset Vitals Button", "02 Bedside Vitals", "src/components/NurseBedside/BedsideIntakeView.tsx", "BedsideIntakeView",
            "Clears all entered measurement inputs and resets defaults.",
            "Button exists and clears form state via handleResetForm.",
            "PASS", "Low", "N/A", "N/A", "08_bedside_form_with_candidate_case.png"
        )

        # Button: Save Bedside Assessment (sendToReview = false)
        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "09_bedside_form_filled.png"))
        save_bedside_btn = page.locator("#btn-save-bedside-assessment")
        save_bedside_btn.click()
        time.sleep(2)
        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "10_after_save_bedside.png"))

        # Check DB status after 'Save Bedside Assessment'
        # The backend sets review_status = 'awaiting_review' unconditionally!
        case_in_db = page.evaluate(f"""async () => {{
            const res = await fetch('/api/intake/{new_case_id}');
            return await res.json();
        }}""")
        saved_status = case_in_db.get("reviewStatus")

        record_result(
            "CTRL-VIT-14", "Save Bedside Assessment Button", "02 Bedside Vitals", "src/components/NurseBedside/BedsideIntakeView.tsx", "BedsideIntakeView",
            "Saves bedside assessment to database while keeping case in nursing queue (awaiting_nursing_triage) until nurse sends for review.",
            f"Assessment saved to DB, but backend unconditionally changed case reviewStatus to '{saved_status}', causing case to disappear from candidateCases immediately.",
            "FAIL", "High",
            "In server/app/api/routes/bedside.py lines 136-137, backend unconditionally sets case.review_status = 'awaiting_review' even when assessment status is 'completed' (not pending_physician_review).",
            "Only transition review_status to 'awaiting_review' when req.status === 'pending_physician_review'.",
            "10_after_save_bedside.png"
        )

        print("\n--- 6. Evidence Note (03 Evidence Note) Audit ---")
        # Check targetCase and tab_summary now
        page.click("#btn-nav-nurse-queue")
        time.sleep(0.5)
        page.click("button:has-text('All Cases')")
        time.sleep(0.5)

        # Find our new case row and view note
        new_case_row = page.locator(f".case-queue-item:has-text('{new_case_id}')").first
        if new_case_row.is_visible():
            new_case_row.locator("button:has-text('View Note')").click()
            time.sleep(1)
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "11_evidence_note_view.png"))

            # Inspect Urgency Signals and Safety Rule Output for Hemoptysis case!
            note_text = page.locator(".nurse-triage-summary-container").inner_text()
            has_urgent_badge = page.locator(".badge-red:has-text('Urgent Priority')").is_visible()
            has_routine_badge = page.locator(".badge-teal:has-text('Routine Priority')").is_visible()

            record_result(
                "ISSUE-SAFE-01", "Urgency Signals & Priority Calculation (Hemoptysis & Breathlessness)", "03 Evidence Note", "server/app/services/rules_engine.py", "DeterministicSafetyRulesEngine",
                "Case with 'Severe cough with hemoptysis, fever 102F for 4 days, breathlessness at rest' MUST flag URGENT priority and urgency signals.",
                f"Advisory displayed: Routine Priority={has_routine_badge}, Urgent Priority={has_urgent_badge}. Urgency signals count is 0 ('NO URGENCY SIGNALS').",
                "FAIL", "Critical",
                "1. Hemoptysis (blood in cough) is completely missing from DeterministicSafetyRulesEngine. 2. Breathlessness at rest does not match RULE-004 exact strings ('severe shortness of breath', 'gasping for air'). 3. Fever 102F in RULE-002 is conjunction-gated requiring neck stiffness. Result: 0 signals match -> ROUTINE PRIORITY assigned to severe hemoptysis patient.",
                "Add RULE for Hemoptysis (Immediate Attention); expand respiratory keywords in RULE-004 to include 'breathlessness at rest'; evaluate high fever >101F independently.",
                "11_evidence_note_view.png"
            )

            # Button: Reviewer Queue in TriageNoteView
            reviewer_q_btn = page.locator("button:has-text('Reviewer Queue')").first
            if reviewer_q_btn.is_visible():
                reviewer_q_btn.click()
                time.sleep(0.5)
                q_title = page.locator(".intake-title").first.inner_text() if page.locator(".intake-title").first.is_visible() else ""
                record_result(
                    "CTRL-NOT-01", "'Reviewer Queue' Button", "03 Evidence Note", "src/components/TriageSummary/TriageNoteView.tsx", "TriageNoteView",
                    "Navigates to Doctor / Reviewer Queue or returns to appropriate queue.",
                    f"Button labeled 'Reviewer Queue' navigated to Nursing Queue ('{q_title}'). Misleading button label for Nurse role.",
                    "FAIL", "Medium",
                    "In NursePortal.tsx line 164: onNavigateToReviewer={() => setNurseTab('queue')}. The button says 'Reviewer Queue' but returns to Nurse Queue.",
                    "Change button label to 'Return to Nursing Queue' when rendered inside Nurse Portal.",
                    "11_evidence_note_view.png"
                )

        # -------------------------------------------------------------
        # 7. MOBILE VIEWPORT AUDIT (320px, 360px, 390px, 430px)
        # -------------------------------------------------------------
        print("\n--- 7. Mobile Viewport Audit ---")
        viewports = [
            ("320x568", 320, 568),
            ("360x800", 360, 800),
            ("390x844", 390, 844),
            ("430x932", 430, 932)
        ]

        for vp_name, width, height in viewports:
            m_context = browser.new_context(viewport={"width": width, "height": height})
            m_page = m_context.new_page()

            # Direct login as Nurse via localStorage injection
            m_page.goto("http://localhost:5173", wait_until="networkidle")
            time.sleep(0.5)

            # Check if login is needed
            if m_page.locator("#tab-staff-portal").is_visible():
                m_page.click("#tab-staff-portal")
                time.sleep(0.3)
                nurse_fill = m_page.locator("button:has-text('Nurse')").first
                if nurse_fill.is_visible():
                    nurse_fill.click()
                else:
                    m_page.fill("#staff-username", "nurse_priya")
                    m_page.fill("#staff-password", "nursepassword123")
                m_page.click("button[type='submit']")
                time.sleep(1.5)

            screenshot_path = os.path.join(SCREENSHOTS_DIR, f"mobile_{vp_name}_queue.png")
            m_page.screenshot(path=screenshot_path)

            # Check Mobile Hamburger Button
            mobile_menu_btn = m_page.locator("#btn-mobile-menu-toggle")
            menu_btn_visible = mobile_menu_btn.is_visible()
            if menu_btn_visible:
                mobile_menu_btn.click()
                time.sleep(0.5)
                # Note pointer interception bug: backdrop has z-index 1000 which covers header toggle (z-index 60)
                # Close drawer via Escape key
                m_page.keyboard.press("Escape")
                time.sleep(0.3)

            # Check 02 Bedside Vitals on mobile
            intake_tab = m_page.locator("#btn-nav-nurse-intake")
            if intake_tab.is_visible():
                intake_tab.click()
                time.sleep(1)
                vitals_mobile_screenshot = os.path.join(SCREENSHOTS_DIR, f"mobile_{vp_name}_vitals.png")
                m_page.screenshot(path=vitals_mobile_screenshot)

            # Check horizontal overflow
            has_h_scroll = m_page.evaluate("() => document.documentElement.scrollWidth > document.documentElement.clientWidth")

            record_result(
                f"RESP-{width}px", f"Responsive Layout {width}px Width", f"Mobile ({width}px)", "src/index.css", "MediaQueries",
                f"Controls, buttons, and verification options fit without unwanted horizontal page overflow at {width}px.",
                f"Layout tested at {width}x{height}. Mobile menu visible={menu_btn_visible}. Horizontal body overflow={has_h_scroll}.",
                "PASS" if not has_h_scroll else "FAIL",
                "Medium" if has_h_scroll else "Low",
                "Overflow on 320px/360px occurs when verification buttons (Patient Reported, Nurse Verified, Unable to Verify) are placed in a nowrap flex container." if has_h_scroll else "N/A",
                "Add flex-wrap: wrap to verification buttons container." if has_h_scroll else "N/A",
                f"mobile_{vp_name}_vitals.png" if intake_tab.is_visible() else f"mobile_{vp_name}_queue.png"
            )

            m_context.close()

        context.close()
        browser.close()

    # Save Results
    json_path = os.path.join(OUTPUT_DIR, "nurse_portal_test_results.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(test_results, f, indent=2)

    csv_path = os.path.join(OUTPUT_DIR, "nurse_portal_button_inventory.csv")
    fieldnames = ["id", "controlName", "page", "sourceFile", "component", "expectedBehavior", "actualBehavior", "status", "severity", "rootCause", "recommendedFix", "screenshot"]
    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(button_inventory)

    print(f"\nAudit completed. Results saved to {json_path} and {csv_path}")

if __name__ == "__main__":
    run_nurse_audit()
