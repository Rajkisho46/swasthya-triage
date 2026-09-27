from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status
from ...schemas.multimodal import STTRequest, STTResponse, OCRResponse, TranslationRequest, TranslationResponse
from ...services.stt_service import SpeechToTextService
from ...services.ocr_service import OCRService
from ...services.translation_service import TranslationService

router = APIRouter(prefix="/multimodal", tags=["Multimodal Input Services"])

@router.post("/stt", response_model=STTResponse)
async def process_voice_stt(
    audio_file: Optional[UploadFile] = File(None),
    language: str = Form("Hindi"),
    is_demo: bool = Form(True)
):
    audio_bytes = await audio_file.read() if audio_file else None
    return await SpeechToTextService.transcribe_audio(
        audio_bytes=audio_bytes,
        language=language,
        is_demo=is_demo
    )

@router.post("/ocr", response_model=OCRResponse)
async def process_document_ocr(
    file: Optional[UploadFile] = File(None),
    file_type: str = Form("pdf"),
    is_demo: bool = Form(True)
):
    file_bytes = await file.read() if file else None
    file_name = file.filename if file else ("lab_report.pdf" if file_type == "pdf" else "ecg_strip.png")
    
    return await OCRService.process_document(
        file_bytes=file_bytes,
        file_name=file_name,
        file_type=file_type,
        is_demo=is_demo
    )

@router.post("/translate", response_model=TranslationResponse)
async def process_translation(req: TranslationRequest):
    return await TranslationService.translate_text(
        text=req.text,
        source_language=req.sourceLanguage,
        target_language=req.targetLanguage
    )
