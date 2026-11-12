"""측정값 없이 실제 설정의 코드 연결·비활성 계약·목업 상속을 검사한다."""
from pathlib import Path
import math

import yaml

from appbti_pipeline.adapter import load_codebook

ROOT=Path(__file__).resolve().parents[2]


def test_real_weights_cannot_activate_unselected_or_unknown_categories():
    book=load_codebook(ROOT/'config/codebook.yaml')
    similarity=yaml.safe_load((ROOT/'config/similarity.yaml').read_text(encoding='utf-8'))
    categories={c['code']:c for c in book['minor_categories']}
    selection=book['survey_selection']
    weights=similarity['weights']
    assert set(weights)==set(categories)
    assert all(math.isfinite(w) and w>=0 for w in weights.values())
    assert {c for c,w in weights.items() if w>0}==set(selection['primary_codes'])
    assert len(selection['primary_codes'])==12
    assert len(selection['reserve_codes'])==2
    assert set(selection['conditional_primary_codes'])<=set(selection['primary_codes'])
    assert not set(selection['primary_codes'])&set(selection['reserve_codes'])
    assert all(weights[c]==0 for c in selection['reserve_codes'])
    assert all(weights[c]==0 for c,v in categories.items() if v['name'] in book['exclude_minor_names'])


def test_disabled_settings_keep_existing_java_loader_contract():
    similarity=yaml.safe_load((ROOT/'config/similarity.yaml').read_text(encoding='utf-8'))
    assert set(similarity)=={'enabled','method','normalization','weights','minimum_categories','tie_policy','zero_days_policy','types'}
    assert similarity['enabled'] is False
    assert similarity['method']=='cosine' and similarity['normalization']=='reference_max'
    assert similarity['tie_policy']=='joint' and similarity['zero_days_policy']=='exclude'
    assert similarity['types']==[]
    assert 1<=similarity['minimum_categories']<=sum(w>0 for w in similarity['weights'].values())


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
    assert b['metrics']['daily_time']['enabled'] is False
    assert b['metrics']['weighted_reference_days_enabled'] is False
    assert analysis['runtime_ready'] is False and analysis['apply_only_when_is_mock_false'] is True


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
