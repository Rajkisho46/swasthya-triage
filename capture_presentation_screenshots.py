import os
import time
from playwright.sync_api import sync_playwright

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "presentation_screenshots")
os.makedirs(OUTPUT_DIR, exist_ok=True)

def capture_perfect_screenshots():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
        page = context.new_page()

        # 1. Staff Login Page
        page.goto("http://localhost:5173", wait_until="networkidle")
        time.sleep(1)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "01_patient_login.png"))

        try:
            page.locator("button:has-text('Staff / Clinical Portal'), button:has-text('Staff')").first.click()
            time.sleep(0.5)
            page.screenshot(path=os.path.join(OUTPUT_DIR, "01b_staff_login.png"))
        except Exception as e:
            print("Staff login view:", e)

        # Login as Doctor to see review cases
        try:
            page.fill("#staff-username", "dr_sharma")
            page.fill("#staff-password", "doctorpassword123")
            page.click("button[type='submit']")
            time.sleep(2)
            page.screenshot(path=os.path.join(OUTPUT_DIR, "08_medical_reviewer_workspace.png"))
            
            # Select first case in reviewer table
            row = page.locator("tr.cursor-pointer, .case-card, tbody tr").first
            if row.is_visible():
                row.click()
                time.sleep(1)
                page.screenshot(path=os.path.join(OUTPUT_DIR, "08b_medical_case_detail.png"))
        except Exception as e:
            print("Doctor capture:", e)

        # Logout & Login as Nurse
        try:
            page.locator("button:has-text('Sign Out'), button:has-text('Logout')").first.click()
            time.sleep(1)
            page.locator("button:has-text('Staff / Clinical Portal'), button:has-text('Staff')").first.click()
            time.sleep(0.5)
            page.fill("#staff-username", "nurse_priya")
            page.fill("#staff-password", "nursepassword123")
            page.click("button[type='submit']")
            time.sleep(2)
            page.screenshot(path=os.path.join(OUTPUT_DIR, "06_nurse_triage_queue.png"))

            bedside_btn = page.locator("button:has-text('Bedside'), button:has-text('Bedside Assessment')").first
            if bedside_btn.is_visible():
                bedside_btn.click()
                time.sleep(1)
                page.screenshot(path=os.path.join(OUTPUT_DIR, "07_nurse_bedside_assessment.png"))
        except Exception as e:
            print("Nurse capture:", e)

        # Logout & Login as Admin
        try:
            page.locator("button:has-text('Sign Out'), button:has-text('Logout')").first.click()
            time.sleep(1)
            page.locator("button:has-text('Staff / Clinical Portal'), button:has-text('Staff')").first.click()
            time.sleep(0.5)
            page.fill("#staff-username", "admin_user")
            page.fill("#staff-password", "adminpassword123")
            page.click("button[type='submit']")
            time.sleep(2)
            page.screenshot(path=os.path.join(OUTPUT_DIR, "09_institutional_audit_trail.png"))
        except Exception as e:
            print("Admin capture:", e)

        # Logout & Login as Patient
        try:
            page.locator("button:has-text('Sign Out'), button:has-text('Logout')").first.click()
            time.sleep(1)
            page.locator("button:has-text('Patient Portal'), button:has-text('Patient')").first.click()
            time.sleep(0.5)
            # Register or Login as patient
            page.fill("#patient-login-email", "patient_demo@example.com")
            page.fill("#patient-login-password", "patientpassword123")
            page.click("button[type='submit']")
            time.sleep(2)
            page.screenshot(path=os.path.join(OUTPUT_DIR, "02_patient_portal_dashboard.png"))

            # Click AI nav
            ai_nav = page.locator("#btn-nav-patient-ai, button:has-text('AI Assistant')").first
            if ai_nav.is_visible():
                ai_nav.click()
                time.sleep(1.5)
                # Maybe type a question in Health AI
                chat_input = page.locator("input[placeholder*='symptoms'], textarea[placeholder*='health'], textarea, input[type='text']").last
                if chat_input.is_visible():
                    chat_input.fill("I have a mild fever and cough for 2 days. What basic home care can I follow before seeing a doctor?")
                    page.keyboard.press("Enter")
                    time.sleep(2)
                page.screenshot(path=os.path.join(OUTPUT_DIR, "03_health_ai_chat.png"))

            # Click Submit/Intake nav
            submit_nav = page.locator("#btn-nav-patient-submit, button:has-text('New Triage Intake'), button:has-text('Intake')").first
            if submit_nav.is_visible():
                submit_nav.click()
                time.sleep(1.5)
                # Fill some sample intake info
                page.screenshot(path=os.path.join(OUTPUT_DIR, "04_patient_intake_multimodal.png"))

            # Click Cases / Summary nav
            cases_nav = page.locator("#btn-nav-patient-cases, button:has-text('My Cases')").first
            if cases_nav.is_visible():
                cases_nav.click()
                time.sleep(1)
                page.screenshot(path=os.path.join(OUTPUT_DIR, "05_patient_cases_history.png"))
        except Exception as e:
            print("Patient flow:", e)

        # Open Trust Center
        try:
            trust_btn = page.locator("button:has-text('Trust Center'), button:has-text('Privacy')").first
            if trust_btn.is_visible():
                trust_btn.click()
                time.sleep(1)
                page.screenshot(path=os.path.join(OUTPUT_DIR, "10_trust_center_governance.png"))
        except Exception as e:
            print("Trust center:", e)

        browser.close()
        print("All screenshots captured and saved in presentation_screenshots!")

if __name__ == "__main__":
    capture_perfect_screenshots()
