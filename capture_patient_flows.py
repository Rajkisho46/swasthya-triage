import os
import time
from playwright.sync_api import sync_playwright

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "presentation_screenshots")
os.makedirs(OUTPUT_DIR, exist_ok=True)

def capture_patient_flows():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
        page = context.new_page()

        page.goto("http://localhost:5173", wait_until="networkidle")
        time.sleep(1)

        # Login as Patient
        page.fill("#patient-login-email", "patient_demo@example.com")
        page.fill("#patient-login-password", "patientpassword123")
        page.click("button[type='submit']")
        time.sleep(2)

        # 1. Health AI Assistant
        try:
            ai_dock = page.locator("#btn-nav-patient-ai, button:has-text('AI Assistant')").first
            if ai_dock.is_visible():
                ai_dock.click()
                time.sleep(1.5)
                # Type a realistic symptom query
                input_box = page.locator("input[type='text'], textarea").last
                if input_box.is_visible():
                    input_box.fill("I have had a sore throat and mild fever for 2 days. What precautions should I take?")
                    page.keyboard.press("Enter")
                    time.sleep(2.5)
                page.screenshot(path=os.path.join(OUTPUT_DIR, "03_health_ai_chat.png"))
                print("Captured 03_health_ai_chat.png")
        except Exception as e:
            print("AI capture error:", e)

        # 2. Patient Intake Form
        try:
            intake_dock = page.locator("#btn-nav-patient-submit, #btn-patient-new-intake, button:has-text('New Symptom Check')").first
            if intake_dock.is_visible():
                intake_dock.click()
                time.sleep(1.5)
                page.screenshot(path=os.path.join(OUTPUT_DIR, "04_patient_intake_multimodal.png"))
                print("Captured 04_patient_intake_multimodal.png")
        except Exception as e:
            print("Intake capture error:", e)

        browser.close()

if __name__ == "__main__":
    capture_patient_flows()
