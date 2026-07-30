import GifticonCard from './GifticonCard';

export default function GifticonList({ gifticons, onViewCode, onToggleUsed, onEdit, onDelete }) {
  if (gifticons.length === 0) {
    return (
      <div className="empty-state">
        <p>등록된 기프티콘이 없어요.</p>
        <p className="empty-state__hint">오른쪽 아래 + 버튼으로 첫 기프티콘을 추가해보세요.</p>
      </div>
    );
  }

  return (
    <ul className="gcard-list">
      {gifticons.map((g) => (
        <GifticonCard
          key={g.id}
          gifticon={g}
          onViewCode={onViewCode}
          onToggleUsed={onToggleUsed}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}
