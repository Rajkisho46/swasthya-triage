import os
import win32com.client

PPTX_PATH = os.path.abspath("Swasthya_Triage_Hackathon_Presentation_Professional.pptx")
EXPORT_DIR = os.path.abspath("rendered_slides")
os.makedirs(EXPORT_DIR, exist_ok=True)

def export_slides_to_images():
    ppt_app = win32com.client.Dispatch("PowerPoint.Application")
    # Open presentation in read-only / hidden mode
    pres = ppt_app.Presentations.Open(PPTX_PATH, WithWindow=False)
    
    # Export all slides as PNG images
    # Scale width 1920, height 1080 for crystal clear 1080p slide review
    pres.SaveAs(os.path.join(EXPORT_DIR, "slide.png"), 17) # 17 = ppSaveAsPNG
    
    # Also save as PDF for final deliverable preview
    pdf_path = os.path.abspath("Swasthya_Triage_Hackathon_Presentation_Professional.pdf")
    pres.SaveAs(pdf_path, 32) # 32 = ppSaveAsPDF
    print(f"PDF exported to: {pdf_path}")
    
    pres.Close()
    ppt_app.Quit()
    print(f"All slides exported as PNGs to: {EXPORT_DIR}")

if __name__ == "__main__":
    export_slides_to_images()
