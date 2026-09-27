import pytest
from server.app.services.rules_engine import DeterministicSafetyRulesEngine

def test_rules_engine_chest_pain_breathlessness():
    text = "Patient reports severe chest pain radiating to arm and difficulty in breathing."
    signals = DeterministicSafetyRulesEngine.evaluate(text)
    assert len(signals) >= 1
    assert any(s.rule_id == "RULE-001" for s in signals)
    assert any(s.level == "immediate_attention" for s in signals)
    urgency = DeterministicSafetyRulesEngine.compute_overall_urgency(signals)
    assert urgency == "HIGH_URGENCY"

def test_rules_engine_hindi_cardiorespiratory():
    text = "मुझे पिछले तीन दिनों से सीने में दर्द और सांस लेने में बहुत तकलीफ हो रही है।"
    signals = DeterministicSafetyRulesEngine.evaluate(text)
    assert len(signals) >= 1
    assert any(s.rule_id == "RULE-001" for s in signals)

def test_rules_engine_high_fever_stiff_neck():
    text = "Child has very high fever and stiff neck with confusion."
    signals = DeterministicSafetyRulesEngine.evaluate(text)
    assert any(s.rule_id == "RULE-002" for s in signals)
    assert any(s.level == "immediate_attention" for s in signals)

def test_rules_engine_pregnancy_bleeding():
    text = "Patient is 6 months pregnant and experiencing active heavy bleeding."
    signals = DeterministicSafetyRulesEngine.evaluate(text)
    assert any(s.rule_id == "RULE-003" for s in signals)
    assert any(s.level == "immediate_attention" for s in signals)

def test_rules_engine_routine_symptoms_no_red_flags():
    text = "Mild runny nose and sneezing for one day."
    signals = DeterministicSafetyRulesEngine.evaluate(text)
    assert len(signals) == 0
    urgency = DeterministicSafetyRulesEngine.compute_overall_urgency(signals)
    assert urgency == "ROUTINE"
