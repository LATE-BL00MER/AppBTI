"""측정값 없이 실제 설정의 코드 연결·비활성 계약·목업 상속을 검사한다."""
from pathlib import Path
import math

import yaml

from appbti_pipeline.adapter import load_codebook

ROOT=Path(__file__).resolve().parents[2]


def test_v2_survey_questions_link_to_codebook_and_similarity_settings():
    book=load_codebook(ROOT/'config/codebook.yaml')
    survey=yaml.safe_load((ROOT/'config/survey_questions.yaml').read_text(encoding='utf-8'))
    similarity=yaml.safe_load((ROOT/'config/similarity.yaml').read_text(encoding='utf-8'))
    excluded={c['code'] for c in book['minor_categories'] if c['name'] in book['exclude_minor_names']}
    codes={c['code'] for c in book['minor_categories']}-excluded
    questions=[q for q in survey['questions'] if q['enabled']]
    assert [q['id'] for q in questions]==[f'q{i:02d}' for i in range(1,15)]
    assert all(q['minor_code'] in codes and q['metric'] in ('days','time') for q in questions)
    assert sum(q['metric']=='days' for q in questions)==4 and len({(q['minor_code'],q['metric']) for q in questions})==14
    assert len(survey['time_choices'])==len(similarity['time_choice_minutes'])==5


def test_v2_similarity_settings_match_java_clr_contract():
    similarity=yaml.safe_load((ROOT/'config/similarity.yaml').read_text(encoding='utf-8'))
    assert similarity['enabled'] is True and similarity['method']=='clr_nearest'
    assert similarity['clr_scope']=='answered_items' and similarity['clr_blocks']=='joint'
    minutes=similarity['time_choice_minutes']
    assert all(math.isfinite(m) and m>0 for m in minutes) and minutes==sorted(minutes)
    assert similarity['days_scale']==7 and similarity['minimum_items']==6
    assert 0<=similarity['near_tie_ratio']<1 and similarity['similar_difference']>=0
    assert similarity['types']==[]


def test_real_count_units_do_not_silently_enable_day_time_or_weekly_paths():
    b=load_codebook(ROOT/'config/codebook.yaml')
    contract=b['survey_contract'];analysis=b['real_analysis']
    assert contract['response_unit']=='count' and contract['response_maximum'] is None
    assert contract['reference_month']==analysis['exploration']['display_month']
    assert b['period']['start']<=contract['reference_month']<=b['period']['end']
    assert contract['response_period']=='previous_calendar_month'
    assert contract['clip'] is False and contract['refit_with_user_answer'] is False
    assert contract['daily_metric_enabled'] is False and contract['weekly_comparison_enabled'] is False
    assert contract['zero_count_policy']=='exclude_pending_denominator'
    assert b['metrics']['weighted_reference_days_enabled'] is False
    assert analysis['runtime_ready'] is False and analysis['apply_only_when_is_mock_false'] is True


def test_real_daily_time_is_fixed_to_lgu_minutes_definition():
    time=load_codebook(ROOT/'config/codebook.yaml')['metrics']['daily_time']
    assert time['enabled'] is True
    assert time['source_unit']=='minutes' and time['target_unit']=='minutes'
    assert time['definition']=='per_user_daily_average_minutes' and time['denominator']=='users'
    assert not time.get('survey_definition_matches')  # 하루 기준 확인 전에는 설문 정의 일치를 주장하지 않는다


def test_fisher_uses_raw_months_and_fcq_does_not_automatically_finalize():
    b=load_codebook(ROOT/'config/codebook.yaml')
    review=b['real_analysis']['candidate_review']
    assert review['input_scale']=='raw'
    assert review['start_month']==b['period']['start'] and review['end_month']==b['period']['end']
    assert review['metric']==b['survey_contract']['reference_metric']
    assert review['fisher']['within_scatter']=='temporal_variation_within_age_group'
    assert review['leave_one_month_out']['enabled'] is True
    assert review['fcq']['automatic_finalization'] is False


def test_mock_categories_still_use_their_own_major_and_metric_contract():
    b=load_codebook(ROOT/'config/codebook.mock.yaml')
    assert b['is_mock'] is True
    assert {c['major'] for c in b['minor_categories']}==set(b['major_categories'])
    assert {a['id'] for a in b['age_groups']}==set('ABCDEF')
    assert b['metrics']['weighted_reference_days_enabled'] is True
    assert b['metrics']['daily_time']['enabled'] is True
