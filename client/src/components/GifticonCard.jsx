import { CATEGORIES } from '../constants';
import { formatDday, formatDate, ddayUrgency } from '../utils/date';

function categoryLabel(key) {
  return CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

export default function GifticonCard({ gifticon, onViewCode, onToggleUsed, onEdit, onDelete }) {
  const isUsed = gifticon.status === 'used';
  const urgency = isUsed ? 'none' : ddayUrgency(gifticon.expires_at);

  return (
    <li className={`gcard ${isUsed ? 'gcard--used' : ''}`}>
      <button type="button" className="gcard__thumb" onClick={() => onViewCode(gifticon)} aria-label="바코드/QR 보기">
        {gifticon.image_url ? (
          <img src={gifticon.image_url} alt={gifticon.name} />
        ) : (
          <span className="gcard__thumb-placeholder">🎫</span>
        )}
        {isUsed && <span className="gcard__used-badge">사용완료</span>}
        {gifticon.image_urls?.length > 1 && <span className="gcard__count-badge">{gifticon.image_urls.length}</span>}
      </button>

      <div className="gcard__body">
        <div className="gcard__top">
          <span className="gcard__category">{categoryLabel(gifticon.category)}</span>
          {gifticon.owner && <span className="gcard__owner">{gifticon.owner}</span>}
        </div>
        <p className="gcard__name">{gifticon.name}</p>
        {gifticon.amount ? <p className="gcard__amount">{Number(gifticon.amount).toLocaleString()}원</p> : null}

        {!isUsed && gifticon.expires_at && (
          <p className={`gcard__dday gcard__dday--${urgency}`}>
            {formatDday(gifticon.expires_at)} · {formatDate(gifticon.expires_at)}까지
          </p>
        )}
        {isUsed && gifticon.used_at && <p className="gcard__used-date">{formatDate(gifticon.used_at)} 사용</p>}

        <div className="gcard__actions">
          <button type="button" className="btn btn--primary" onClick={() => onViewCode(gifticon)}>
            바코드 보기
          </button>
          <button type="button" className="btn" onClick={() => onToggleUsed(gifticon)}>
            {isUsed ? '사용취소' : '사용완료'}
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => onEdit(gifticon)}>
            수정
          </button>
          <button type="button" className="btn btn--ghost btn--danger" onClick={() => onDelete(gifticon)}>
            삭제
          </button>
        </div>
      </div>
    </li>
  );
}
