import io
import os
import uuid
from typing import Optional, Dict, Any
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from ..models.patient import PatientCase
from ..utils.timestamps import utc_now_iso

class ReferralService:
    @staticmethod
    def generate_referral_pdf(case_dict: Dict[str, Any], clinician_notes: str = "", destination: str = "Tertiary Care Hospital") -> bytes:
        """
        Generate a structured clinical referral document in PDF format.
        DOES NOT automatically transmit; generated for clinician review and download.
        """
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=letter,
            rightMargin=36,
            leftMargin=36,
            topMargin=36,
            bottomMargin=36
        )

        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            "DocTitle",
            parent=styles["Heading1"],
            fontSize=18,
            leading=22,
            textColor=colors.HexColor("#0D3B66"),
            alignment=1
        )
        subtitle_style = ParagraphStyle(
            "DocSubTitle",
            parent=styles["Normal"],
            fontSize=10,
            leading=14,
            textColor=colors.HexColor("#555555"),
            alignment=1
        )
        section_heading = ParagraphStyle(
            "SectionHeading",
            parent=styles["Heading2"],
            fontSize=12,
            leading=16,
            textColor=colors.HexColor("#008080"),
            spaceBefore=10,
            spaceAfter=4
        )
        body_style = ParagraphStyle(
            "Body",
            parent=styles["Normal"],
            fontSize=9,
            leading=13,
            textColor=colors.HexColor("#222222")
        )
        alert_style = ParagraphStyle(
            "Alert",
            parent=styles["Normal"],
            fontSize=9,
            leading=13,
            textColor=colors.HexColor("#C0392B"),
            backColor=colors.HexColor("#FDEDEC")
        )

        story = []

        # Header
        story.append(Paragraph("SWASTHYA TRIAGE CLINICAL REFERRAL BRIEF", title_style))
        story.append(Paragraph("Clinical Decision Support & Handover Documentation", subtitle_style))
        story.append(Spacer(1, 10))
        story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#008080"), spaceBefore=2, spaceAfter=10))

        # Metadata Table
        meta_data = [
            [Paragraph("<b>Referral ID:</b>", body_style), Paragraph(f"REF-{uuid.uuid4().hex[:6].upper()}", body_style),
             Paragraph("<b>Date/Time (UTC):</b>", body_style), Paragraph(utc_now_iso()[:19].replace("T", " "), body_style)],
            [Paragraph("<b>Patient ID:</b>", body_style), Paragraph(str(case_dict.get("patientId", "N/A")), body_style),
             Paragraph("<b>Age / Gender:</b>", body_style), Paragraph(f"{case_dict.get('age', 'N/A')} yrs / {case_dict.get('gender', 'N/A')}", body_style)],
            [Paragraph("<b>Preferred Language:</b>", body_style), Paragraph(str(case_dict.get("preferredLanguage", "English")), body_style),
             Paragraph("<b>Destination:</b>", body_style), Paragraph(destination, body_style)]
        ]
        meta_table = Table(meta_data, colWidths=[90, 180, 90, 180])
        meta_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#F8F9F9")),
            ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7E9")),
            ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#BDC3C7")),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        story.append(meta_table)
        story.append(Spacer(1, 10))

        # Deterministic Safety Signals
        signals = case_dict.get("urgencySignals", [])
        if signals:
            story.append(Paragraph("DETERMINISTIC SAFETY SIGNALS (Auditable Rule Triggers)", section_heading))
            for s in signals:
                sig_text = f"<b>[{s.get('rule_id', 'RULE')}] {s.get('signal', '')}</b>: {s.get('reason', '')}"
                story.append(Paragraph(sig_text, alert_style))
                story.append(Spacer(1, 4))
            story.append(Spacer(1, 6))

        # Extracted Symptoms & Narrative
        story.append(Paragraph("PATIENT-REPORTED NARRATIVE & SYMPTOMS", section_heading))
        story.append(Paragraph(f"<b>Raw Symptoms Narrative:</b> {case_dict.get('rawSymptoms', 'N/A')}", body_style))
        story.append(Spacer(1, 4))
        
        extracted = case_dict.get("extractedSymptoms", [])
        if extracted:
            story.append(Paragraph(f"<b>Extracted Key Symptoms:</b> {', '.join(extracted)}", body_style))
            story.append(Spacer(1, 4))

        # Timeline
        timeline = case_dict.get("timeline", [])
        if timeline:
            story.append(Paragraph("CLINICAL TIMELINE / ONSET", section_heading))
            t_data = [["Symptom", "Duration / Onset", "Notes"]]
            for t in timeline:
                t_data.append([
                    Paragraph(str(t.get("symptom", "")), body_style),
                    Paragraph(str(t.get("durationOrOnset", "")), body_style),
                    Paragraph(str(t.get("notes", "")), body_style)
                ])
            t_table = Table(t_data, colWidths=[150, 140, 250])
            t_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#EAECEE")),
                ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7E9")),
                ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#BDC3C7")),
                ('TOPPADDING', (0, 0), (-1, -1), 3),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ]))
            story.append(t_table)
            story.append(Spacer(1, 8))

        # Multimodal Evidence
        voice_data = case_dict.get("voiceData")
        ocr_reports = case_dict.get("ocrReports", [])
        if voice_data or ocr_reports:
            story.append(Paragraph("MULTIMODAL EVIDENCE", section_heading))
            if voice_data and voice_data.get("transcript"):
                story.append(Paragraph(f"<b>Voice Audio Transcript:</b> {voice_data['transcript']}", body_style))
                story.append(Spacer(1, 4))
            for ocr in ocr_reports:
                story.append(Paragraph(f"<b>Document Extract ({ocr.get('fileName')}):</b> {ocr.get('extractedText')[:200]}...", body_style))
                story.append(Spacer(1, 4))
            story.append(Spacer(1, 6))

        # Human Clinician Disposition
        story.append(Paragraph("HUMAN CLINICIAN DECISION & OBSERVATIONS", section_heading))
        reviewer_name = case_dict.get("reviewerName") or "Dr. Clinical Reviewer"
        decision = case_dict.get("reviewerDecision") or "Refer"
        notes = clinician_notes or case_dict.get("reviewerNotes") or "Referred for specialist evaluation and urgent inpatient triage."
        
        clin_data = [
            [Paragraph("<b>Reviewing Clinician:</b>", body_style), Paragraph(reviewer_name, body_style)],
            [Paragraph("<b>Triage Decision:</b>", body_style), Paragraph(f"<b>{decision.upper()}</b>", body_style)],
            [Paragraph("<b>Clinician Notes:</b>", body_style), Paragraph(notes, body_style)],
            [Paragraph("<b>Sign-off Timestamp:</b>", body_style), Paragraph(utc_now_iso()[:19].replace("T", " "), body_style)]
        ]
        clin_table = Table(clin_data, colWidths=[140, 400])
        clin_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#E8F8F5")),
            ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#A2D9CE")),
            ('BOX', (0, 0), (-1, -1), 1, colors.HexColor("#16A085")),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        story.append(clin_table)
        story.append(Spacer(1, 14))

        # Non-diagnostic Safety Disclaimer Footer
        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#95A5A6"), spaceBefore=4, spaceAfter=6))
        story.append(Paragraph(
            "<b>STATUTORY SAFETY NOTICE:</b> Swasthya Triage is an AI-assisted clinical decision support system. "
            "AI outputs are informational and non-diagnostic. The reviewing clinician retains sole responsibility "
            "for patient evaluation, diagnosis, and medical disposition.",
            ParagraphStyle("Disclaimer", parent=styles["Normal"], fontSize=7, leading=10, textColor=colors.HexColor("#7F8C8D"), alignment=1)
        ))

        doc.build(story)
        buffer.seek(0)
        return buffer.getvalue()
