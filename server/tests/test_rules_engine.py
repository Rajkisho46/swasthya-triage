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

def test_rules_engine_hemoptysis_isolated():
    text = "Patient has cough with blood for two days."
    signals = DeterministicSafetyRulesEngine.evaluate(text)
    assert any(s.rule_id == "RULE-007" for s in signals)
    assert any(s.level == "immediate_attention" for s in signals)
    assert DeterministicSafetyRulesEngine.compute_overall_urgency(signals) == "HIGH_URGENCY"

def test_rules_engine_breathlessness_at_rest_isolated():
    text = "Patient reports breathlessness at rest, unable to lie flat."
    signals = DeterministicSafetyRulesEngine.evaluate(text)
    assert any(s.rule_id == "RULE-004" for s in signals)
    assert any(s.level == "immediate_attention" for s in signals)
    assert DeterministicSafetyRulesEngine.compute_overall_urgency(signals) == "HIGH_URGENCY"

def test_rules_engine_high_fever_isolated():
    text = "High fever of 102.4 F recorded since yesterday."
    signals = DeterministicSafetyRulesEngine.evaluate(text)
    assert any(s.rule_id == "RULE-008" for s in signals)
    assert any(s.level == "attention_required" for s in signals)
    assert DeterministicSafetyRulesEngine.compute_overall_urgency(signals) == "ELEVATED"

def test_rules_engine_triple_red_flag_combination():
    # Exact scenario reported in audit: Severe cough with hemoptysis, fever of 102F for 4 days, breathlessness at rest
    text = "Severe cough with hemoptysis, fever of 102F for 4 days, breathlessness at rest"
    signals = DeterministicSafetyRulesEngine.evaluate(text)
    assert len(signals) >= 3
    rule_ids = {s.rule_id for s in signals}
    assert "RULE-007" in rule_ids  # Hemoptysis
    assert "RULE-004" in rule_ids  # Breathlessness at rest
    assert "RULE-008" in rule_ids  # High fever
    assert "RULE-009" in rule_ids  # Febrile respiratory compromise
    assert DeterministicSafetyRulesEngine.compute_overall_urgency(signals) == "HIGH_URGENCY"

def test_rules_engine_punctuation_and_capitalization_variations():
    variations = [
        "COUGHING BLOOD! High FEVER 102°F... SHORTNESS OF BREATH AT REST???",
        "hemoptysis; fever 102 f; dyspnea at rest",
        "Coughing up blood - temp 103F - breathless at rest."
    ]
    for v in variations:
        signals = DeterministicSafetyRulesEngine.evaluate(v)
        assert any(s.level == "immediate_attention" for s in signals), f"Failed for variation: {v}"
        assert DeterministicSafetyRulesEngine.compute_overall_urgency(signals) == "HIGH_URGENCY"

def test_rules_engine_multilingual_hemoptysis():
    # Hindi
    hindi_text = "मरीज को तीन दिनों से खांसी में खून आ रहा है।"
    signals_hi = DeterministicSafetyRulesEngine.evaluate(hindi_text)
    assert any(s.rule_id == "RULE-007" for s in signals_hi)

    # Odia
    odia_text = "ରୋଗୀଙ୍କ କାଶରେ ରକ୍ତ ପଡୁଛି ଏବଂ ନିଶ୍ୱାସ ନେବାରେ କଷ୍ଟ ହେଉଛି।"
    signals_or = DeterministicSafetyRulesEngine.evaluate(odia_text)
    assert any(s.rule_id == "RULE-007" for s in signals_or)

    # Bengali
    bengali_text = "কাশির সাথে রক্ত পড়ছে এবং খুব জ্বর।"
    signals_bn = DeterministicSafetyRulesEngine.evaluate(bengali_text)
    assert any(s.rule_id == "RULE-007" for s in signals_bn)

def test_rules_engine_reassuring_text_cannot_override_red_flag():
    # Reassuring phrase combined with severe red flag
    text = "Patient feels otherwise fine and has good appetite, but has active coughing blood and fever of 102°F."
    signals = DeterministicSafetyRulesEngine.evaluate(text)
    assert any(s.rule_id == "RULE-007" for s in signals)
    assert DeterministicSafetyRulesEngine.compute_overall_urgency(signals) == "HIGH_URGENCY"
