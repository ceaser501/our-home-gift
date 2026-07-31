import GifticonCard from './GifticonCard';

export default function GifticonList({ gifticons, onViewCode, onViewImage, onToggleUsed, onEdit, onDelete }) {
  if (gifticons.length === 0) {
    return (
      <div className="px-5 py-15 text-center text-muted-foreground">
        <p>등록된 기프티콘이 없어요.</p>
        <p className="mt-1.5 text-[13px]">오른쪽 아래 + 버튼으로 첫 기프티콘을 추가해보세요.</p>
      </div>
    );
  }

  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {gifticons.map((g) => (
        <GifticonCard
          key={g.id}
          gifticon={g}
          onViewCode={onViewCode}
          onViewImage={onViewImage}
          onToggleUsed={onToggleUsed}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}
