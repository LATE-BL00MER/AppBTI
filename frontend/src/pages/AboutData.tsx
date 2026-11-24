import { Link } from 'react-router-dom';
import { Source } from '../components/Common';
import CompositionIndexNote from '../components/CompositionIndexNote';
import { useData } from '../api/client';
import { useApp } from '../state';

export default function AboutData() {
  const { meta, draft, changeDataset } = useApp();
  const { data: findings } = useData<{ isMock: boolean; compositionIndexReference?: { name: string } }>('/findings', draft.dataset);
  if (!meta) return null;
  const reference = findings?.isMock === meta.isMock ? findings.compositionIndexReference : null;
  return <div className="container data-page"><div className="page-heading"><div><h1>데이터와 비교 기준</h1><p>무엇을 비교하고, 어디까지 해석할 수 있는지 알려드릴게요.</p></div></div>
    {meta.isMock && <section className="prototype-notice"><div className="outline-symbol" aria-hidden="true">i</div><div><h2>지금 보이는 숫자는 모두 가상입니다.</h2><p>팀 시연을 위해 만든 단순한 예시 수치입니다. A~F는 실제 연령 경계가 정해지지 않은 가상 6개 연령대이고, 카테고리 명칭도 시연용입니다. 실제 LG U+ 제공 통계가 아닙니다.</p><p>실제 데이터가 도착하면 제공처의 연령 구간과 분류 정의를 그대로 적용합니다.</p></div></section>}
    {meta.isMock && meta.availableDatasets.length > 1 && <section className="data-scenario"><div><h2>두 가지 데이터 조건으로 체험해 보세요.</h2><p>일평균 이용시간의 제공 여부에 따라 설문과 차트가 달라집니다.<br />데이터 조건을 바꾸면 작성한 응답은 초기화됩니다.</p></div><div className="scenario-options">{meta.availableDatasets.map(dataset => <button key={dataset} onClick={() => { if (dataset !== draft.dataset) changeDataset(dataset); }} className={draft.dataset === dataset ? 'selected' : ''} aria-pressed={draft.dataset === dataset}><span className="radio-mark" /><div><strong>{dataset === 'time' ? '시간 지표 포함' : '기본 데이터'}</strong><span>{dataset === 'time' ? '이용일수 + 하루 평균 시간' : '이용일수 중심 · 시간 문항 없음'}</span></div></button>)}</div></section>}
    <section className="data-section"><h2>데이터 범위</h2><dl className="definition-table"><div><dt>기간</dt><dd>{meta.months[0]} ~ {meta.months.at(-1)} · 기준월별 집계</dd></div><div><dt>지역·연령대</dt><dd>전국 설정 · {meta.ageGroups.length}개 연령대 {meta.isMock ? '(A~F 가상 구간)' : '(제공처 기준)'}</dd></div><div><dt>활동 범위</dt><dd>{meta.majorCategories.join(' · ')}<small>{meta.minorCategories.length}개 {meta.isMock ? '가상 ' : ''}카테고리</small></dd></div><div><dt>사용 가능한 지표</dt><dd>월평균 이용일수 · 이용자 연령 구성비{meta.metrics.dailyTime ? ' · 일평균 이용시간' : ''}<small>{!meta.metrics.dailyTime ? '시간 지표가 없어 시간 문항과 시간 차트는 표시하지 않습니다.' : meta.isMock ? '시연 데이터는 사용하는 날의 하루 평균 시간으로 정의했습니다.' : '이용자 1명당 하루 평균 시간(분)입니다. ‘하루’를 이용한 날로 세는지 그달 전체 일수로 세는지는 제공처에 확인하고 있습니다.'}</small></dd></div><div><dt>데이터 품질</dt><dd>공개된 값으로 비교했어요.<small>집계가 빠졌거나 비공개인 값은 화면에 ‘데이터 없음’으로 표시해요. 비교에 필요한 값이 없으면 해당 결과를 제공하지 않아요.</small></dd></div></dl><Source /></section>
    <section className="data-section"><h2>지표를 읽는 방법</h2><div className="definition-articles"><article><h3>월평균 이용일수</h3><p>해당 분류 이용자가 한 달에 이용한 평균 일수입니다. 서로 다른 활동의 일수를 더하거나 단순 평균하지 않습니다.</p></article><article><h3>이용자 연령 구성비</h3><p>같은 카테고리의 전체 이용자 중 해당 연령대의 비중입니다. 연령대의 가입자 규모 차이가 반영되며, 연령대 전체 인원을 분모로 사용하지 않습니다.</p></article><article><h3>설문과 통계를 맞추는 방법</h3><p>설문의 ‘최근 7일 중 며칠’은 7로 나누고, 연령대의 월평균 이용일수는 그달 일수로 나눠 같은 ‘이용한 날의 비율’로 맞춥니다. 시간 문항은 고른 구간의 대표 시간(분)을 연령대의 일평균 이용시간과 비교합니다.</p></article><article><h3>패턴 유사도</h3><p>답한 문항끼리 어느 쪽에 더 치우쳐 있는지(상대적인 비중)를 6개 연령대와 비교해 가까운 순서로 순위를 매깁니다. 어느 연령대의 통계와 이용 패턴이 가까운지 보여줍니다. 실제 연령을 추정하거나 개인의 이용 기록을 분석하지 않습니다.</p></article><article><h3>데이터 없음</h3><p>비공개·결측·누락 또는 분모 0 등으로 값을 제공할 수 없는 상태입니다. 임의의 0으로 바꾸지 않으며, 비교 조건이 부족하면 결과를 내지 않습니다.</p></article></div></section>
    <section className="data-section"><h2>자주 묻는 질문</h2><div className="faq-list">{meta.isMock && <details><summary>왜 실제 연령대 대신 가상 연령대 A~F으로 나오나요?</summary><p>제공처의 실제 연령 구간과 경계가 아직 확정되지 않았기 때문입니다. 임의로 연령을 나누는 대신, 시연용 가상 6연령대으로 기능을 보여줍니다.</p></details>}<details><summary>‘사용 안 함’·‘잘 모르겠음’은 어떻게 처리되나요?</summary><p>두 응답 모두 비교에서 뺍니다. 연령대 통계는 그 서비스를 이용한 사람만의 평균이라, 사용하지 않는 사람의 응답과는 같은 기준으로 비교할 수 없기 때문입니다. 비교할 수 있는 문항이 6개보다 적으면 결과 대신 분야별 탐색을 안내합니다.</p></details><details><summary>응답은 어디에 저장되나요?</summary><p>응답은 현재 브라우저 탭의 임시 저장소에만 보관합니다. 서버에서 응답을 저장하지 않으며, 실제 접속 이력도 수집하지 않습니다. 브라우저에서 탭을 닫으면 임시 응답은 사라집니다.</p></details><details><summary>결과를 얼마나 믿을 수 있나요?</summary><p>{meta.isMock ? '현재는 가상 데이터와 시연용 비교 설정을 사용합니다. 서비스의 역할과 흐름을 확인하는 용도로만 보세요. 실제 통계에 대한 해석과 비교 방식은 데이터 수령 후 검증합니다.' : '연령대 통계와 자기보고 응답의 유사성을 비교합니다. 응답 구간의 근사치와 연령대 통계의 한계를 고려해 해석해 주세요. 실제 연령이나 개인의 이용 기록을 분석한 결과가 아닙니다.'}</p></details></div></section>
    {reference && <section className="data-section"><h2>기준 서비스 대비 이용자 구성</h2>
      <CompositionIndexNote reference={reference.name} />
      <p>기준 서비스 자체에도 연령대별 이용 차이가 있을 수 있어요. 이 지수는 서비스 이용자 구성 사이의 상대적인 비교예요.</p>
    </section>}
    <section className="data-section">
      <h2>두 배수는 어떻게 다른가요?</h2>
      <div className="definition-articles">
        <article><h3>상대적 두드러짐</h3><p>각 연령대의 서비스별 값을 로그 중심화(CLR)한 뒤, 같은 서비스의 여섯 연령대 평균을 기준으로 비교합니다.</p></article>
        <article><h3>평균 대비 이용일수</h3><p>해당 연령대의 월평균 이용일수를 같은 서비스의 이용자 전체 평균 일수로 나눈 값입니다.</p></article>
      </div>
    </section>
    <div className="data-bottom"><p>이제 직접 패턴을 살펴볼까요?</p><Link to="/survey" className="button primary">내 위치 찍어보기</Link><Link to="/explore" className="button secondary">분야별 탐색</Link></div>
  </div>;
}
