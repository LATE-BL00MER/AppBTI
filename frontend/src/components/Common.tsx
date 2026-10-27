import { Link } from 'react-router-dom';
import { useApp } from '../state';

export function Source({ month }: { month?: string }) {
  const { meta } = useApp();
  return <p className="source">{meta?.source}{month ? ` · 기준월 ${month}` : ''}</p>;
}
export function Loading() {
  return <div className="loading" role="status"><span className="loading-line" />통계를 불러오고 있어요.</div>;
}
export function ErrorNotice({ message, retry }: { message: string; retry: () => void }) {
  return <div className="notice error" role="alert"><h2>잠시 연결을 확인해 주세요.</h2><p>{message}</p><button className="button secondary" onClick={retry}>다시 불러오기</button></div>;
}
export function EmptyResult() {
  return <div className="empty-result"><span className="context-label">나의 패턴 리포트</span><h1>아직 작성한 응답이 없어요.</h1><p>평소의 디지털 이용습관을 알려주시면, 닮은 집단과 그 근거를 보여드려요.</p><Link className="button primary" to="/survey">설문 시작하기</Link><Link className="text-link" to="/">소개로 돌아가기</Link></div>;
}
export const formatNumber = (value: number | null, suffix = '') => value === null ? '데이터 없음' : `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 }).format(value)}${suffix}`;
export const monthLabel = (month: string) => `${month.slice(0, 4)}년 ${Number(month.slice(5))}월`;
