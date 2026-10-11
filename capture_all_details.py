import os
import time
from playwright.sync_api import sync_playwright

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "presentation_screenshots")
os.makedirs(OUTPUT_DIR, exist_ok=True)

def capture_all_details():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
        page = context.new_page()

        page.goto("http://localhost:5173", wait_until="networkidle")
        time.sleep(1)

        # Login as patient_demo via Staff Portal (RBAC role PATIENT)
        try:
            page.locator("button:has-text('Staff / Clinical Portal'), button:has-text('Staff')").first.click()
            time.sleep(0.5)
            page.fill("#staff-username", "patient_demo")
            page.fill("#staff-password", "patientpassword123")
            page.click("button[type='submit']")
            page.wait_for_load_state("networkidle")
            time.sleep(2)
            page.screenshot(path=os.path.join(OUTPUT_DIR, "02_patient_portal_dashboard.png"))
            print("Captured 02_patient_portal_dashboard.png")

            # Health AI Chat Tab
            ai_tab = page.locator("#btn-nav-patient-ai").first
            if ai_tab.is_visible():
                ai_tab.click()
                time.sleep(1.5)
                # Type a question
                inp = page.locator("textarea, input[placeholder*='symptom'], input[placeholder*='question'], input[type='text']").first
                if inp.is_visible():
                    inp.fill("I have a mild fever and cough for 2 days. What should I monitor and when should I see a doctor?")
                    page.keyboard.press("Enter")
                    time.sleep(3)
                page.screenshot(path=os.path.join(OUTPUT_DIR, "03_health_ai_chat.png"))
                print("Captured 03_health_ai_chat.png")

            # Intake Form Tab
            intake_tab = page.locator("#btn-nav-patient-submit").first
            if intake_tab.is_visible():
                intake_tab.click()
                time.sleep(1.5)
                page.screenshot(path=os.path.join(OUTPUT_DIR, "04_patient_intake_multimodal.png"))
                print("Captured 04_patient_intake_multimodal.png")

            # Cases Tab
            cases_tab = page.locator("#btn-nav-patient-cases").first
            if cases_tab.is_visible():
                cases_tab.click()
                time.sleep(1.5)
                page.screenshot(path=os.path.join(OUTPUT_DIR, "05_patient_cases_history.png"))
                print("Captured 05_patient_cases_history.png")
        except Exception as e:
            print("Patient capture error:", e)

        # Let's also capture Doctor Triage Note & Decision modal
        try:
            page.locator("button:has-text('Sign Out'), button:has-text('Logout')").first.click()
            time.sleep(1)
            page.locator("button:has-text('Staff / Clinical Portal'), button:has-text('Staff')").first.click()
            time.sleep(0.5)
            page.fill("#staff-username", "dr_sharma")
            page.fill("#staff-password", "doctorpassword123")
            page.click("button[type='submit']")
            time.sleep(2)

            # Click the first case row
            row = page.locator("tbody tr, .review-case-item, .case-row").first
            if row.is_visible():
                row.click()
                time.sleep(1.5)
                page.screenshot(path=os.path.join(OUTPUT_DIR, "08b_medical_case_detail.png"))
                print("Captured 08b_medical_case_detail.png")
        except Exception as e:
            print("Doctor detail capture error:", e)

        browser.close()

if __name__ == "__main__":
    capture_all_details()
