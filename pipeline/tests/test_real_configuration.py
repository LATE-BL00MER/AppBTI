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


def test_calendar_day_variant_differs_only_in_time_basis_and_choices():
    base_q=yaml.safe_load((ROOT/'config/survey_questions.yaml').read_text(encoding='utf-8'))
    cal_q=yaml.safe_load((ROOT/'config/survey_questions.calendar_days.yaml').read_text(encoding='utf-8'))
    base_s=yaml.safe_load((ROOT/'config/similarity.yaml').read_text(encoding='utf-8'))
    cal_s=yaml.safe_load((ROOT/'config/similarity.calendar_days.yaml').read_text(encoding='utf-8'))
    assert cal_q['questions']==base_q['questions'] and cal_q['period']==base_q['period']
    assert len(cal_q['time_choices'])==len(cal_s['time_choice_minutes'])==5
    time_keys={'time_choice_minutes','time_choice_edges'}
    assert {k:v for k,v in cal_s.items() if k not in time_keys}=={k:v for k,v in base_s.items() if k not in time_keys}
    # 선택지 구간 경계는 선택지 수보다 하나 적고, 대표 분은 각 구간 안에 있어야 한다.
    for s in (base_s, cal_s):
        edges, reps = s['time_choice_edges'], s['time_choice_minutes']
        assert len(edges)==len(reps)-1 and edges==sorted(edges)
        assert all((i==0 or reps[i]>=edges[i-1]) and (i==len(edges) or reps[i]<edges[i]) for i in range(len(reps)))
    assert cal_s['time_choice_edges'] == [15, 30, 45, 90]
    assert cal_s['time_choice_minutes']==sorted(cal_s['time_choice_minutes']) and cal_s['time_choice_minutes'][0]>base_s['time_choice_minutes'][0]
    assert load_codebook(ROOT/'config/codebook.calendar_days.yaml')['metrics']['daily_time']['day_basis']=='calendar_days'
    assert load_codebook(ROOT/'config/codebook.yaml')['metrics']['daily_time']['day_basis']=='used_days'


def test_v2_similarity_settings_match_java_clr_contract():
    similarity=yaml.safe_load((ROOT/'config/similarity.yaml').read_text(encoding='utf-8'))
    assert similarity['enabled'] is True and similarity['method']=='clr_nearest'
    assert similarity['clr_scope']=='answered_items' and similarity['clr_blocks']=='joint'
    minutes=similarity['time_choice_minutes']
    assert all(math.isfinite(m) and m>0 for m in minutes) and minutes==sorted(minutes)
    assert similarity['days_scale']==7 and similarity['minimum_items']==6
    assert 0<=similarity['near_tie_ratio']<1 and similarity['similar_difference']>=0
    assert similarity['types']==[]


def test_real_codebook_has_only_v2_blocks_and_weighted_reference_on():
    b=load_codebook(ROOT/'config/codebook.yaml')
    for old in ('real_analysis','survey_selection','survey_contract','method_sources'):
        assert old not in b  # 이전 초안(접속 횟수·코사인) 계약은 쓰지 않는다
    assert b['metrics']['weighted_reference_days_enabled'] is True and b['metrics']['avg_days_denominator']=='users'
    assert b['monthly_signals']['enabled'] is False


def test_real_daily_time_is_fixed_to_lgu_minutes_definition():
    time=load_codebook(ROOT/'config/codebook.yaml')['metrics']['daily_time']
    assert time['enabled'] is True
    assert time['source_unit']=='minutes' and time['target_unit']=='minutes'
    assert time['definition']=='per_user_daily_average_minutes' and time['denominator']=='users'
    assert not time.get('survey_definition_matches')  # 하루 기준 확인 전에는 설문 정의 일치를 주장하지 않는다


def test_mock_categories_still_use_their_own_major_and_metric_contract():
    b=load_codebook(ROOT/'config/codebook.mock.yaml')
    assert b['is_mock'] is True
    assert {c['major'] for c in b['minor_categories']}==set(b['major_categories'])
    assert {a['id'] for a in b['age_groups']}==set('ABCDEF')
    assert b['metrics']['weighted_reference_days_enabled'] is True
    assert b['metrics']['daily_time']['enabled'] is True


def test_mock_survey_uses_v2_with_mock_categories():
    import yaml
    similarity=yaml.safe_load(open(ROOT/'config/similarity.mock.yaml',encoding='utf-8'))
    real=yaml.safe_load(open(ROOT/'config/similarity.yaml',encoding='utf-8'))
    assert similarity['method']=='clr_nearest'
    for key in ('minimum_items','clr_scope','clr_blocks','time_choice_minutes','days_scale','near_tie_ratio','similar_difference'):
        assert similarity[key]==real[key]
    questions=yaml.safe_load(open(ROOT/'config/survey_questions.mock.yaml',encoding='utf-8'))
    codes={c['code'] for c in load_codebook(ROOT/'config/codebook.mock.yaml')['minor_categories']}
    enabled=[q for q in questions['questions'] if q['enabled']]
    assert all(q['minor_code'] in codes and q['metric'] in ('days','time') for q in enabled)
    assert len({q['id'] for q in enabled})==len(enabled)
    # 시간 지표가 없는 basic 목업도 최소 문항 수만큼 일수 문항이 있어야 비교할 수 있다.
    assert sum(q['metric']=='days' for q in enabled)>=similarity['minimum_items']
    assert len(questions['time_choices'])==len(similarity['time_choice_minutes'])


def test_peer_message_templates_do_not_attach_particles_to_names():
    import re
    import yaml
    templates=yaml.safe_load(open(ROOT/'config/peer_messages.yaml',encoding='utf-8'))['templates']
    # {age}·{name}·{match} 바로 뒤 조사는 이름 끝 받침에 따라 틀린다(예: "60대 이상예요", "날씨은").
    for text in templates.values():
        assert not re.search(r'\}(은|는|이|가|을|를|과|와|예요|이에요|으로|로)', text), text
